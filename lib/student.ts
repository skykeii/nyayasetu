import fs from "fs";
import path from "path";
import { UPLOAD_DIR, audit, getDb, mutate, nextActionId, nextCaseId } from "./store";
import { ROUTING, nextActionFor } from "./seed";
import { buildTfidf, cosine, tokenizeText } from "./text";
import { categoryOf, languageName, maskPii, severityOf, translateOffline, urgencyOf } from "./intake";
import { analyzeComplaint } from "./llm";
import type { Case, Category, Db, DocRef, Severity, StudentAccount, StudentComplaint, TranslationSource } from "./types";
import { DAY, addDays, iso } from "./util";

// ---------- session ----------
export function studentFrom(req: Request, db: Db): StudentAccount | null {
  const token = req.headers.get("x-student-session");
  if (!token) return null;
  const s = db.studentSessions.find((x) => x.token === token && x.expiresAt > new Date().toISOString());
  return s ? db.students.find((x) => x.id === s.studentId) ?? null : null;
}

/** Mock bot check. To plug in Turnstile or hCaptcha, verify the provider's token here and swap components/bot-check.tsx. */
export function verifyBotToken(token: unknown) {
  if (typeof token !== "string") return false;
  const m = /^mock-(\d+)$/.exec(token);
  return !!m && Date.now() - Number(m[1]) < 5 * 60000;
}

// ---------- uploads ----------
const ALLOWED = /\.(png|jpe?g|webp|pdf)$/i;

export async function saveUploads(files: FormDataEntryValue[]): Promise<{ docs: DocRef[]; error?: string }> {
  const docs: DocRef[] = [];
  for (const f of files) {
    if (typeof f === "string" || !f.size) continue;
    if (!ALLOWED.test(f.name)) return { docs: [], error: `${f.name}: only photos (PNG, JPG, WEBP) and PDF files are accepted` };
    if (f.size > 10 * 1024 * 1024) return { docs: [], error: `${f.name} exceeds 10 MB` };
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const safe = `${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80)}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, safe), Buffer.from(await f.arrayBuffer()));
    docs.push({ name: f.name, size: f.size, file: safe });
  }
  return { docs };
}

export const complaintDocs = (s: StudentComplaint) => [...(s.photo ? [s.photo] : []), ...(s.proof?.docs ?? [])];

export function sendFile(name: string, doc: DocRef) {
  const p = path.join(UPLOAD_DIR, path.basename(name));
  if (!fs.existsSync(p)) return new Response("Not found", { status: 404 });
  return new Response(fs.readFileSync(p), { headers: { "Content-Disposition": `attachment; filename="${doc.name.replace(/"/g, "")}"`, "Content-Type": "application/octet-stream" } });
}

// ---------- intake processing ----------
export interface Processed {
  translation: string;
  source: TranslationSource;
  category: Category;
  categoryReason: string;
  confidence: number;
  severity: Severity;
  severityReason: string;
}

export async function processText(text: string, code: string, sampleId?: string): Promise<Processed> {
  const offline = translateOffline(text, code, sampleId);
  // canned samples stay canned so the demo is identical with or without a key
  const llm = offline.source === "sample" ? null : await analyzeComplaint(text, languageName(code));
  if (llm) return { translation: llm.translation, source: code === "en-IN" ? "original" : "llm", category: llm.category, categoryReason: llm.reason, confidence: 0.9, severity: llm.severity, severityReason: llm.reason };
  const basis = offline.source === "unavailable" || offline.source === "glossary" ? `${text} ${offline.translation}` : offline.translation;
  const cat = categoryOf(basis);
  const sev = severityOf(basis, cat.category);
  return { translation: offline.translation, source: offline.source, category: cat.category, categoryReason: cat.reason, confidence: cat.confidence, severity: sev.severity, severityReason: sev.reason };
}

export function similarCount(db: Db, s: Pick<StudentComplaint, "id" | "institutionId" | "category">) {
  return db.studentComplaints.filter((x) => x.id !== s.id && x.institutionId === s.institutionId && x.category === s.category && x.status === "With College").length;
}

export const urgencyFor = (db: Db, s: StudentComplaint) => urgencyOf({ severity: s.severity, createdAt: s.createdAt, dueAt: s.dueAt, similar: similarCount(db, s) });

/** Best text similarity against this student's earlier complaints. */
export function nearestOwn(db: Db, studentId: string, text: string) {
  const own = db.studentComplaints.filter((x) => x.studentId === studentId);
  if (!own.length) return { score: 0, id: undefined as string | undefined };
  const vecs = buildTfidf([text, ...own.map((x) => x.translatedText)].map((t) => tokenizeText(t)));
  let best = { score: 0, id: undefined as string | undefined };
  own.forEach((x, i) => {
    const score = cosine(vecs[0], vecs[i + 1]).score;
    if (score > best.score) best = { score, id: x.id };
  });
  return best;
}

export function burstCount(db: Db, institutionId: string, now = Date.now()) {
  return db.studentComplaints.filter((x) => x.institutionId === institutionId && now - new Date(x.createdAt).getTime() < 3 * DAY).length;
}

export function nextComplaintId(db: Db) {
  const prefix = `SC-${new Date().getFullYear()}-`;
  let max = 0;
  for (const c of db.studentComplaints) max = Math.max(max, Number(c.id.split("-")[2]) || 0);
  return `${prefix}${String(max + 1).padStart(5, "0")}`;
}

// ---------- smart routing (advisory; the official confirms) ----------
export function suggestRouting(db: Db, category: Category, institutionId: string) {
  const inst = db.institutions.find((i) => i.id === institutionId);
  const bureau = ROUTING[category];
  const load = (id: string) => db.cases.filter((c) => c.officerId === id && c.status !== "Disposed").length;
  const officers = db.officers
    .filter((o) => o.bureau === bureau)
    .map((o, i) => ({ id: o.id, name: o.name, designation: o.designation, open: load(o.id), head: i === 0 }))
    .sort((a, b) => Number(a.head) - Number(b.head) || a.open - b.open);
  const best = officers[0];
  const elsewhere = db.cases.filter((c) => c.institutionId === institutionId && c.status !== "Disposed" && c.category === category && c.bureau !== bureau);
  const regional = db.officers.find((o) => o.bureau === "RO" && o.region === inst?.region);
  const why = [
    `${category} complaints go to ${bureau} under the routing table.`,
    `${best.name} has the lightest load among ${bureau} dealing officers (${best.open} open).`,
    regional ? `${inst?.region} region: ${regional.name} can verify on site.` : "",
    elsewhere.length ? `Caution: ${elsewhere.length} open ${category} case(s) on this institution already sit with ${[...new Set(elsewhere.map((c) => c.bureau))].join(", ")}. Check for overlap before confirming.` : "",
  ].filter(Boolean);
  return { bureau, officerId: best.id, officers, why, caution: elsewhere.length > 0 };
}
export type RoutingSuggestion = ReturnType<typeof suggestRouting>;

// ---------- escalation and sweeps ----------
/** Hands a complaint to AICTE as a real case. The case carries only the pseudonym. Call inside mutate(). */
export function escalateToAicte(d: Db, s: StudentComplaint, reason: string) {
  s.status = "Escalated to AICTE";
  s.escalationLevel = 2;
  if (s.caseId) return d.cases.find((c) => c.id === s.caseId)!;
  const now = new Date().toISOString();
  const yy = String(new Date().getFullYear());
  const inst = d.institutions.find((i) => i.id === s.institutionId)!;
  const c: Case = {
    id: nextCaseId(d),
    reference: `${s.routedBureau}/STU/${s.id}/${yy.slice(2)}`,
    dateReceived: now,
    category: s.category,
    status: "New",
    severity: s.severity,
    bureau: s.routedBureau,
    officerId: d.officers.find((o) => o.bureau === s.routedBureau)!.id,
    institutionId: inst.id,
    reportedName: inst.name,
    reportedPid: inst.id,
    matchConfidence: 1,
    matchReason: "Student account is registered at this institution",
    complainantType: "Student",
    complainantName: s.pseudonym,
    channel: "Student Portal",
    language: s.language,
    subject: maskPii(s.subject),
    description: maskPii(s.translatedText),
    originalText: s.language === "English" ? undefined : maskPii(s.originalText),
    translationSource: s.translationSource,
    studentComplaintId: s.id,
    lastAction: "",
    lastActionDate: now,
    nextAction: "",
    expectedDisposalDate: addDays(now, d.settings.slaDays[s.category]),
    actions: [{ id: nextActionId(d), at: now, type: "Received", by: "System", bureau: "SYSTEM", remarks: `Student complaint ${s.id} escalated to AICTE: ${reason}` }],
  };
  c.lastAction = `Received: ${c.actions[0].remarks}`;
  c.nextAction = nextActionFor(c);
  d.cases.push(c);
  s.caseId = c.id;
  return c;
}

/** Applies time-based rules: reminders, auto-escalation and 7-day silence. Safe to call on any read. */
export function sweepStudentLayer() {
  const db = getDb();
  const now = Date.now();
  const cfg = db.settings;
  const nodal = (id: string) => db.signals.find((x) => x.institutionId === id)?.nodalOfficer ?? "Nodal officer";
  const due = db.studentComplaints.filter((s) => {
    if (s.status === "Resolved - Pending Verification") return !!s.verifyBy && now > new Date(s.verifyBy).getTime();
    if (s.status !== "With College") return false;
    const dueMs = new Date(s.dueAt).getTime();
    if (now > dueMs && s.escalationLevel === 0) return true;
    if (now > dueMs + cfg.escalationGraceDays * DAY) return true;
    return now - new Date(s.lastReminderAt ?? s.createdAt).getTime() >= reminderGap(s, now, cfg.collegeReminders) * DAY;
  });
  if (!due.length) return;
  mutate((d) => {
    for (const s0 of due) {
      const s = d.studentComplaints.find((x) => x.id === s0.id)!;
      const at = iso(now);
      if (s.status === "Resolved - Pending Verification") {
        s.status = "Closed - Unverified";
        s.closedAt = at;
        s.actions.push({ at, type: "Closed - Unverified", by: "System", remarks: `No student response in ${d.settings.verifyWindowDays} days. Counts less than a verified closure.` });
        continue;
      }
      const dueMs = new Date(s.dueAt).getTime();
      const remind = (message: string) => {
        const to = nodal(s.institutionId);
        s.reminders.push({ at, channel: "In-app", to, message }, { at, channel: "SMS (simulated)", to, message });
        s.lastReminderAt = at;
      };
      if (now > dueMs + d.settings.escalationGraceDays * DAY) {
        const c = escalateToAicte(d, s, `not resolved ${d.settings.escalationGraceDays} days after the college disposal date`);
        s.actions.push({ at, type: "Auto-escalated", by: "System", remarks: `Overdue at the college. Escalated to ${s.routedBureau} at AICTE as ${c.id}.` });
        audit(d, { role: "system", actor: "System", action: "STUDENT_AUTO_ESCALATE", target: s.id, detail: `Escalated to AICTE as ${c.id}` });
      } else if (now > dueMs && s.escalationLevel === 0) {
        s.escalationLevel = 1;
        remind("Disposal date passed; escalated to the Principal.");
        s.actions.push({ at, type: "Auto-escalated", by: "System", remarks: "Disposal date passed. Escalated to the Principal." });
      } else {
        const left = Math.ceil((dueMs - now) / DAY);
        remind(left >= 0 ? `Action pending. ${left} day${left === 1 ? "" : "s"} to disposal date.` : "Overdue. AICTE escalation follows if unresolved.");
      }
    }
  });
}

/** Days between reminders: shorter as the disposal date nears. */
export function reminderGap(s: Pick<StudentComplaint, "createdAt" | "dueAt">, now: number, c: { farDays: number; nearDays: number; finalDays: number }) {
  const total = new Date(s.dueAt).getTime() - new Date(s.createdAt).getTime();
  const left = new Date(s.dueAt).getTime() - now;
  if (left <= total * 0.2) return c.finalDays;
  return left <= total * 0.5 ? c.nearDays : c.farDays;
}

// ---------- views ----------
export function studentView(db: Db, s: StudentComplaint) {
  const u = urgencyFor(db, s);
  const { studentId, suspicious, reminders, lastReminderAt, ...rest } = s;
  return { ...rest, urgency: u };
}

/** What a college may see: pseudonym and complaint text only. */
export function collegeView(db: Db, s: StudentComplaint) {
  return {
    id: s.id,
    pseudonym: s.pseudonym,
    category: s.category,
    subject: maskPii(s.subject),
    language: s.language,
    text: maskPii(s.translatedText),
    originalText: s.language === "English" ? undefined : maskPii(s.originalText),
    translationSource: s.translationSource,
    severity: s.severity,
    status: s.status,
    createdAt: s.createdAt,
    dueAt: s.dueAt,
    escalationLevel: s.escalationLevel,
    photo: s.photo,
    proof: s.proof,
    evidence: s.evidence,
    verifyBy: s.verifyBy,
    closedAt: s.closedAt,
    reopened: s.reopened,
    reminders: s.reminders,
    actions: s.actions.map((a) => ({ ...a, remarks: maskPii(a.remarks) })),
    urgency: urgencyFor(db, s),
  };
}
export type CollegeComplaint = ReturnType<typeof collegeView>;

export function deskView(db: Db, s: StudentComplaint) {
  const inst = db.institutions.find((i) => i.id === s.institutionId);
  const { studentId, reminders, lastReminderAt, ...rest } = s;
  return { ...rest, subject: maskPii(s.subject), translatedText: maskPii(s.translatedText), originalText: maskPii(s.originalText), actions: s.actions.map((a) => ({ ...a, remarks: maskPii(a.remarks) })), institution: inst?.name, region: inst?.region, urgency: urgencyFor(db, s) };
}
export type DeskComplaint = ReturnType<typeof deskView>;

