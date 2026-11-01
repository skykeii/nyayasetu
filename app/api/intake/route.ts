import { audit, getDb, mutate, nextActionId, nextCaseId } from "@/lib/store";
import { forbidden, json, officerName, viewerFrom } from "@/lib/server";
import { processText, suggestRouting } from "@/lib/student";
import { resolveInstitution } from "@/lib/resolve";
import { nextActionFor } from "@/lib/seed";
import { ROLES } from "@/lib/roles";
import { VOICE_SAMPLES, languageName } from "@/lib/intake";
import type { BureauCode, Case, Category, Severity } from "@/lib/types";
import { BUREAUS, CATEGORIES } from "@/lib/types";
import { addDays } from "@/lib/util";

export const dynamic = "force-dynamic";

/** Finds an institution by name fragments in free text; the official confirms it. */
function detectInstitution(text: string, names: { id: string; name: string }[]) {
  const lower = text.toLowerCase();
  return names.find((i) => lower.includes(i.name.split(" ").slice(0, 2).join(" ").toLowerCase()));
}

export async function POST(req: Request) {
  const db = getDb();
  const v = viewerFrom(req, db);
  if (!ROLES[v.role].can.act) return forbidden("Your role cannot register new complaints");
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    text?: string;
    language?: string;
    sampleId?: string;
    institutionText?: string;
    translation?: string;
    translationSource?: Case["translationSource"];
    institutionId?: string;
    category?: Category;
    severity?: Severity;
    bureau?: BureauCode;
    officerId?: string;
    subject?: string;
    channel?: string;
  };
  const sample = VOICE_SAMPLES.find((s) => s.id === body.sampleId);
  const text = (body.text ?? sample?.original ?? "").trim();
  const code = sample?.code ?? body.language ?? "en-IN";
  if (text.length < 15) return json({ error: "The complaint needs at least 15 characters" }, { status: 400 });

  if (body.action === "preview") {
    const p = await processText(text, code, body.sampleId);
    const detected = detectInstitution(`${body.institutionText ?? ""} ${sample?.institutionHint ?? ""} ${p.translation} ${text}`, db.institutions);
    const res = body.institutionText?.trim() ? resolveInstitution(db.institutions, body.institutionText) : null;
    const institutionId = res?.institutionId ?? detected?.id ?? null;
    return json({
      ...p,
      subject: sample?.subject ?? p.translation.split(/[.!?]/)[0].slice(0, 80),
      original: text,
      language: languageName(code),
      institutionId,
      institutionReason: res?.institutionId ? res.reason : detected ? `Name found in the complaint: “${detected.name.split(" ").slice(0, 2).join(" ")}”` : "No institution recognised; choose one",
      routing: institutionId ? suggestRouting(db, p.category, institutionId) : null,
    });
  }

  if (body.action === "route") {
    if (!body.category || !CATEGORIES.includes(body.category) || !body.institutionId) return json({ error: "Category and institution are needed" }, { status: 400 });
    return json({ routing: suggestRouting(db, body.category, body.institutionId) });
  }

  if (body.action === "create") {
    const inst = db.institutions.find((i) => i.id === body.institutionId);
    const officer = db.officers.find((o) => o.id === body.officerId);
    const bureau = BUREAUS.find((b) => b.code === body.bureau)?.code;
    if (!inst) return json({ error: "Choose the institution" }, { status: 400 });
    if (!bureau || officer?.bureau !== bureau) return json({ error: "Choose a bureau/cell and one of its officers" }, { status: 400 });
    if (!body.category || !CATEGORIES.includes(body.category)) return json({ error: "Choose a category" }, { status: 400 });
    const translated = (body.translation ?? "").trim() || text;
    const out = mutate((d) => {
      const now = new Date().toISOString();
      const yy = String(new Date().getFullYear());
      const by = officerName(d, v);
      const c: Case = {
        id: nextCaseId(d),
        reference: `${bureau}/INT/${String(d.cases.length + 1).padStart(4, "0")}/${yy.slice(2)}`,
        dateReceived: now,
        category: body.category!,
        status: "New",
        severity: body.severity ?? "Medium",
        bureau,
        officerId: officer.id,
        institutionId: inst.id,
        reportedName: inst.name,
        reportedPid: inst.id,
        matchConfidence: 0.9,
        matchReason: "Institution confirmed by the official at intake",
        complainantType: "Public",
        complainantName: "Recorded at intake",
        channel: "Voice Intake",
        language: languageName(code),
        subject: (body.subject ?? "").trim() || translated.slice(0, 80),
        description: translated,
        originalText: code === "en-IN" ? undefined : text,
        translationSource: body.translationSource,
        lastAction: "",
        lastActionDate: now,
        nextAction: "",
        expectedDisposalDate: addDays(now, d.settings.slaDays[body.category!]),
        actions: [{ id: nextActionId(d), at: now, type: "Received", by, bureau: "SYSTEM", remarks: `Complaint recorded at intake (${languageName(code)}). Routing to ${bureau}, ${officer.name} confirmed by ${by}.` }],
      };
      c.lastAction = `Received: ${c.actions[0].remarks}`;
      c.nextAction = nextActionFor(c);
      d.cases.push(c);
      audit(d, { role: v.role, actor: by, action: "INTAKE_CASE", target: c.id, detail: `${bureau}, ${body.category}, ${languageName(code)}` });
      return c;
    });
    return json({ id: out.id, bureau: out.bureau, institution: inst.name });
  }
  return json({ error: "Unknown action" }, { status: 400 });
}
