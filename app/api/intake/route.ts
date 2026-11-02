import { z } from "zod";
import { ApiError, parseForm, parseJson, validate, withApi } from "@/lib/api";
import { audit, getDb, mutate, nextActionId, nextCaseId } from "@/lib/store";
import { json, officerName, viewerFrom } from "@/lib/server";
import { saveUploads } from "@/lib/files";
import { draftCase, linkCases, processText, similarOpenCases, suggestRouting } from "@/lib/student";
import { resolveInstitution } from "@/lib/resolve";
import { nextActionFor } from "@/lib/seed";
import { ROLES } from "@/lib/roles";
import { LANGUAGES, VOICE_SAMPLES, languageName } from "@/lib/intake";
import type { Case, Category, Db } from "@/lib/types";
import { BUREAUS, CATEGORIES } from "@/lib/types";
import { addDays } from "@/lib/util";

export const dynamic = "force-dynamic";

const CategoryZ = z.enum(CATEGORIES as [Category, ...Category[]]);
const BureauZ = z.enum(BUREAUS.map((b) => b.code) as [Case["bureau"], ...Case["bureau"][]]);
const Common = { text: z.string().trim().max(6000).optional(), language: z.enum(LANGUAGES.map((l) => l.code) as [string, ...string[]]).optional(), sampleId: z.string().max(20).optional() };

const Preview = z.object({ action: z.literal("preview"), ...Common, institutionText: z.string().max(200).optional() });
const Recheck = z.object({ action: z.literal("route"), ...Common, category: CategoryZ, institutionId: z.string().max(40), translation: z.string().max(6000).optional(), subject: z.string().max(200).optional() });
const Create = z.object({
  ...Common,
  translation: z.string().max(6000).optional(),
  translationSource: z.enum(["original", "sample", "llm", "glossary", "unavailable"]).optional(),
  subject: z.string().trim().max(200).optional(),
  summary: z.string().max(240).optional(),
  institutionId: z.string({ error: "Choose the institution" }).max(40),
  category: CategoryZ,
  severity: z.enum(["Low", "Medium", "High", "Critical"]),
  bureau: BureauZ,
  officerId: z.string().max(20),
  channel: z.enum(["Letter", "Email", "CPGRAMS", "Phone", "Walk-in", "AICTE Portal"], { error: "Choose how the complaint arrived" }),
  complainantType: z.enum(["Student", "Parent", "Faculty", "Staff", "Other", "Anonymous"], { error: "Choose the complainant type" }),
  complainantName: z.string().trim().max(120).optional(),
  contact: z.string().trim().max(120).optional(),
  decision: z.object({ type: z.enum(["new", "link", "duplicate"]), targetId: z.string().max(40).optional(), leadBureau: BureauZ.optional(), remarks: z.string().trim().max(1000) }).optional(),
});

/** Finds an institution by name fragments in free text; the official confirms it. */
function detectInstitution(text: string, names: { id: string; name: string }[]) {
  const lower = text.toLowerCase();
  return names.find((i) => lower.includes(i.name.split(" ").slice(0, 2).join(" ").toLowerCase()));
}

const similarFor = (db: Db, o: { institutionId: string; category: Category; subject: string; description: string; bureau: Case["bureau"] }) => similarOpenCases(db, draftCase(db, o));

export const POST = withApi(async (req) => {
  const db = getDb();
  const v = viewerFrom(req, db);
  if (!ROLES[v.role].can.act) throw new ApiError(403, "Your role cannot register new complaints");

  if (req.headers.get("content-type")?.includes("application/json")) {
    const raw = await req.clone().json().catch(() => ({}));
    if ((raw as { action?: string }).action === "route") {
      const b = await parseJson(req, Recheck);
      if (!db.institutions.some((i) => i.id === b.institutionId)) throw new ApiError(400, "Choose the institution");
      const routing = suggestRouting(db, b.category, b.institutionId);
      return json({ routing, similar: similarFor(db, { institutionId: b.institutionId, category: b.category, subject: b.subject ?? "", description: b.translation ?? b.text ?? "", bureau: routing.bureau }) });
    }
    const b = await parseJson(req, Preview);
    const sample = VOICE_SAMPLES.find((s) => s.id === b.sampleId);
    const text = b.text || sample?.original || "";
    const code = sample?.code ?? b.language ?? "en-IN";
    if (text.length < 15) throw new ApiError(400, "The complaint needs at least 15 characters");
    const p = await processText(text, code, b.sampleId);
    const res = b.institutionText?.trim() ? resolveInstitution(db.institutions, b.institutionText) : null;
    const mention = p.institutionMentions.length ? resolveInstitution(db.institutions, p.institutionMentions[0]) : null;
    const detected = detectInstitution(`${sample?.institutionHint ?? ""} ${p.translation} ${text}`, db.institutions);
    const institutionId = res?.institutionId ?? (mention?.institutionId || null) ?? detected?.id ?? null;
    const subject = sample?.subject ?? (p.summary || p.translation.split(/[.!?]/)[0].slice(0, 80));
    const routing = institutionId ? suggestRouting(db, p.category, institutionId, p.suggestedDesk) : null;
    return json({
      ...p,
      subject,
      original: text,
      language: languageName(code),
      institutionId,
      institutionReason: res?.institutionId ? res.reason : mention?.institutionId ? "Named in the complaint (AI)" : detected ? `Name found in the complaint: “${detected.name.split(" ").slice(0, 2).join(" ")}”` : "No institution recognised; choose one",
      routing,
      similar: institutionId && routing ? similarFor(db, { institutionId, category: p.category, subject, description: p.translation, bureau: routing.bureau }) : [],
    });
  }

  const form = await parseForm(req);
  const b = validate(Create, JSON.parse(String(form.get("payload") ?? "{}")));
  const sample = VOICE_SAMPLES.find((s) => s.id === b.sampleId);
  const text = b.text || sample?.original || "";
  const code = sample?.code ?? b.language ?? "en-IN";
  if (text.length < 15) throw new ApiError(400, "The complaint needs at least 15 characters");
  const inst = db.institutions.find((i) => i.id === b.institutionId);
  const officer = db.officers.find((o) => o.id === b.officerId);
  if (!inst) throw new ApiError(400, "Choose the institution");
  if (officer?.bureau !== b.bureau) throw new ApiError(400, "Choose a bureau/cell and one of its officers");
  const translated = b.translation?.trim() || text;
  const subject = b.subject || translated.slice(0, 80);

  // the duplicate check runs on the server too, so it cannot be skipped
  const similar = similarFor(db, { institutionId: inst.id, category: b.category, subject, description: translated, bureau: b.bureau });
  if (similar.length && !b.decision) return json({ error: "Similar open cases found. Choose how to file this complaint.", similar }, { status: 409 });
  const d0 = b.decision;
  if (d0) {
    if (d0.remarks.length < 5) throw new ApiError(400, "Remarks are mandatory for this decision");
    if (d0.type !== "new" && !similar.some((s) => s.caseId === d0.targetId) && !db.cases.some((c) => c.id === d0.targetId && c.status !== "Disposed")) throw new ApiError(400, "Choose an open case");
    if (d0.type === "link" && !d0.leadBureau) throw new ApiError(400, "Choose the lead unit");
  }
  const { docs, error } = await saveUploads(form.getAll("files"));
  if (error) throw new ApiError(400, error);

  const out = mutate((d) => {
    const now = new Date().toISOString();
    const yy = String(new Date().getFullYear());
    const by = officerName(d, v);
    const c: Case = {
      id: nextCaseId(d),
      reference: `${b.bureau}/INT/${String(d.cases.length + 1).padStart(4, "0")}/${yy.slice(2)}`,
      dateReceived: now,
      category: b.category,
      status: "New",
      severity: b.severity,
      bureau: b.bureau,
      officerId: officer.id,
      institutionId: inst.id,
      reportedName: inst.name,
      reportedPid: inst.id,
      matchConfidence: 0.9,
      matchReason: "Institution confirmed by the official at intake",
      complainantType: b.complainantType,
      complainantName: b.complainantType === "Anonymous" ? "Anonymous" : b.complainantName || "Recorded at intake",
      complainantContact: b.contact || undefined,
      channel: b.channel,
      language: languageName(code),
      subject,
      description: translated,
      originalText: code === "en-IN" ? undefined : text,
      translationSource: b.translationSource,
      aiSummary: b.summary,
      lastAction: "",
      lastActionDate: now,
      nextAction: "",
      expectedDisposalDate: addDays(now, d.settings.slaDays[b.category]),
      actions: [{ id: nextActionId(d), at: now, type: "Received", by, bureau: "SYSTEM", remarks: `Logged at intake from ${b.channel} (${languageName(code)}). Routing to ${b.bureau}, ${officer.name} confirmed by ${by}.`, docs: docs.length ? docs : undefined }],
    };
    c.lastAction = `Received: ${c.actions[0].remarks}`;
    c.nextAction = nextActionFor(c);
    d.cases.push(c);
    let decided = "No similar open cases found";
    if (d0) {
      const target = d.cases.find((x) => x.id === d0.targetId);
      if (d0.type === "link") {
        linkCases(d, [c.id, target!.id], d0.leadBureau!, `Linked at intake. ${d0.remarks}`, by);
        decided = `Linked to ${target!.id}, lead ${d0.leadBureau}`;
      } else if (d0.type === "duplicate") {
        c.duplicateOf = target!.id;
        c.status = "Disposed";
        c.disposedAt = now;
        const remarks = `Marked duplicate of ${target!.id} at intake. ${d0.remarks}`;
        c.actions.push({ id: nextActionId(d), at: now, type: "Disposed", by, bureau: "SYSTEM", remarks });
        target!.actions.push({ id: nextActionId(d), at: now, type: "Remark", by, bureau: "SYSTEM", remarks: `Duplicate complaint ${c.id} logged against this case. ${d0.remarks}` });
        c.lastAction = `Disposed: ${remarks}`;
        c.nextAction = nextActionFor(c);
        decided = `Marked duplicate of ${target!.id}`;
      } else {
        c.actions.push({ id: nextActionId(d), at: now, type: "Remark", by, bureau: "SYSTEM", remarks: `Similar open cases reviewed (${similar.map((s) => s.caseId).join(", ")}); filed as new. ${d0.remarks}` });
        decided = `Filed as new despite ${similar.length} similar case(s)`;
      }
    }
    audit(d, { role: v.role, actor: by, action: "INTAKE_CASE", target: c.id, detail: `${b.bureau}, ${b.category}, ${languageName(code)}, ${b.channel}. ${decided}${d0 ? `. Remarks: ${d0.remarks}` : ""}` });
    return c;
  });
  return json({ id: out.id, bureau: out.bureau, institution: inst.name, status: out.status, duplicateOf: out.duplicateOf });
});
