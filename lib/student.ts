import { audit, getDb, mutate, nextActionId, nextCaseId } from "./store";
import { ROUTING, nextActionFor } from "./seed";
import { buildTfidf, cosine, tokenizeText } from "./text";
import { categoryOf, languageName, maskPii, severityOf, translateOffline, urgencyOf } from "./intake";
import { understandComplaint } from "./groq";
import { ApiError } from "./api";
import { VIEWER_HEADER } from "./session";
import { matchDraft } from "./overlap";
import type { BureauCode, Case, Category, Db, Severity, StudentAccount, StudentComplaint, TranslationSource } from "./types";
import { DAY, addDays, iso } from "./util";

// ---------- session ----------
export function studentFrom(req: Request, db: Db): StudentAccount {
  const raw = req.headers.get(VIEWER_HEADER);
  const id = raw ? (JSON.parse(decodeURIComponent(raw)) as { studentId?: string }).studentId : undefined;
  const s = db.students.find((x) => x.id === id);
  if (!s) throw new ApiError(401, "Please sign in");
  return s;
}

/** Mock bot check. To plug in Turnstile or hCaptcha, verify the provider's token here and swap components/bot-check.tsx. */
export function verifyBotToken(token: unknown) {
  if (typeof token !== "string") return false;
  const m = /^mock-(\d+)$/.exec(token);
  return !!m && Date.now() - Number(m[1]) < 5 * 60000;
}

export const complaintDocs = (s: StudentComplaint) => [...(s.photo ? [s.photo] : []), ...s.rounds.flatMap((r) => r.proof?.docs ?? [])];

// ---------- intake processing ----------
export interface Processed {
  translation: string;
  source: TranslationSource;
  category: Category;
  categoryReason: string;
  confidence: number;
  severity: Severity;
  severityReason: string;
  summary?: string;
  cues: string[];
  names: string[];
  maskLevel: "ai" | "basic";
  suggestedDesk?: string;
  institutionMentions: string[];
}

const RANK: Severity[] = ["Low", "Medium", "High", "Critical"];
const AI_SEVERITY: Record<number, Severity> = { 1: "Low", 2: "Medium", 3: "Medium", 4: "High", 5: "Critical" };

export async function processText(text: string, code: string, sampleId?: string): Promise<Processed> {
  const offline = translateOffline(text, code, sampleId);
  const basis = offline.source === "unavailable" || offline.source === "glossary" ? `${text} ${offline.translation}` : offline.translation;
  const cat = categoryOf(basis);
  const sev = severityOf(basis, cat.category);
  const base: Processed = { translation: offline.translation, source: offline.source, category: cat.category, categoryReason: cat.reason, confidence: cat.confidence, severity: sev.severity, severityReason: sev.reason, cues: [], names: [], maskLevel: "basic", institutionMentions: [] };
  // canned samples stay canned so the demo is identical with or without a key
  const ai = offline.source === "sample" ? null : await understandComplaint(text, languageName(code));
  if (!ai) return base;
  const aiSeverity = AI_SEVERITY[ai.severity];
  // AI can raise severity but never lower what the safety keywords found, and a safety report keeps its category
  const severity = RANK.indexOf(aiSeverity) > RANK.indexOf(sev.severity) ? aiSeverity : sev.severity;
  const category = cat.category === "Harassment / Ragging" && cat.confidence > 0.3 ? cat.category : ai.category;
  return {
    ...base,
    translation: ai.translation || base.translation,
    source: code === "en-IN" ? "original" : "llm",
    category,
    categoryReason: `AI: ${ai.severityReason}`,
    confidence: ai.confidence,
    severity,
    severityReason: ai.severityReason,
    summary: ai.summary,
    cues: ai.urgencyCues,
    names: ai.personNames,
    maskLevel: "ai",
    suggestedDesk: ai.suggestedDesk,
    institutionMentions: ai.institutionMentions,
  };
}

export function similarCount(db: Db, s: Pick<StudentComplaint, "id" | "institutionId" | "category">) {
  return db.studentComplaints.filter((x) => x.id !== s.id && x.institutionId === s.institutionId && x.category === s.category && x.status === "With College").length;
}

export function urgencyFor(db: Db, s: StudentComplaint) {
  const u = urgencyOf({ severity: s.severity, createdAt: s.createdAt, dueAt: s.dueAt, similar: similarCount(db, s) });
  return s.aiCues?.length ? { ...u, reason: `${u.reason}; AI cues: ${s.aiCues.slice(0, 3).join(", ")}` } : u;
}

const isOpen = (x: StudentComplaint) => x.status === "With College" || x.status === "Resolved - Pending Verification" || x.status === "Escalated to AICTE";

/** Best text similarity against this student's own open complaints. The student's own words are compared too, because AI rewords a translation differently each time. */
export function nearestOwnOpen(db: Db, studentId: string, translation: string, original: string) {
  const own = db.studentComplaints.filter((x) => x.studentId === studentId && isOpen(x));
  if (!own.length) return null;
  const score = (text: string, others: string[]) => {
    const vecs = buildTfidf([text, ...others].map((t) => tokenizeText(t)));
    return others.map((_, i) => cosine(vecs[0], vecs[i + 1]).score);
  };
  const byTranslation = score(translation, own.map((x) => x.translatedText));
  const byOriginal = score(original, own.map((x) => x.originalText));
  let best: { score: number; complaint: StudentComplaint } | null = null;
  own.forEach((x, i) => {
    const s = Math.max(byTranslation[i], byOriginal[i]);
    if (!best || s > best.score) best = { score: s, complaint: x };
  });
  return best as { score: number; complaint: StudentComplaint } | null;
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

// ---------- overlap check for a complaint not saved yet ----------
export function draftCase(db: Db, o: { institutionId: string; category: Category; subject: string; description: string; bureau: BureauCode }): Case {
  const inst = db.institutions.find((i) => i.id === o.institutionId)!;
  const now = new Date().toISOString();
  return {
    id: "DRAFT",
    reference: "New complaint",
    dateReceived: now,
    category: o.category,
    status: "New",
    severity: "Medium",
    bureau: o.bureau,
    officerId: "",
    institutionId: inst.id,
    reportedName: inst.name,
    reportedPid: inst.id,
    matchConfidence: 1,
    matchReason: "",
    complainantType: "Public",
    complainantName: "",
    channel: "AICTE Portal",
    language: "English",
    subject: o.subject,
    description: o.description,
    lastAction: "",
    lastActionDate: now,
    nextAction: "",
    expectedDisposalDate: now,
    actions: [],
  };
}

export interface SimilarCase {
  caseId: string;
  bureau: BureauCode;
  subject: string;
  status: string;
  confidence: number;
  reasons: string[];
  kind: string;
  linkGroupId?: string;
}

export function similarOpenCases(db: Db, draft: Case): SimilarCase[] {
  return matchDraft(db, draft)
    .map((p) => {
      const c = db.cases.find((x) => x.id === (p.a === draft.id ? p.b : p.a))!;
      return { caseId: c.id, bureau: c.bureau, subject: c.subject, status: c.status, confidence: p.confidence, reasons: p.reasons, kind: p.kind, linkGroupId: c.linkGroupId };
    })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 8);
}

/** Puts cases into one link group, reusing a group they already belong to. Call inside mutate(). */
export function linkCases(d: Db, ids: string[], lead: BureauCode, note: string, by: string) {
  const now = new Date().toISOString();
  const list = ids.map((id) => d.cases.find((c) => c.id === id)!).filter(Boolean);
  const existing = list.map((c) => c.linkGroupId).find(Boolean);
  let group = existing ? d.linkGroups.find((g) => g.id === existing) : undefined;
  if (!group) {
    d.counters.group++;
    group = { id: `LG-${String(d.counters.group).padStart(4, "0")}`, caseIds: [], status: "Linked", leadBureau: lead, note, by, at: now };
    d.linkGroups.push(group);
  }
  group.caseIds = [...new Set([...group.caseIds, ...ids])];
  group.leadBureau = lead;
  for (const c of list) {
    c.linkGroupId = group.id;
    c.actions.push({ id: nextActionId(d), at: now, type: "Linked", by, bureau: "SYSTEM", remarks: `Linked as related cases in ${group.id} (${group.caseIds.join(", ")}). Lead unit: ${lead}. ${note}` });
  }
  return group;
}

// ---------- smart routing (advisory; the official confirms) ----------
export function suggestRouting(db: Db, category: Category, institutionId: string, aiDesk?: string) {
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
    aiDesk && aiDesk !== bureau ? `AI suggests ${aiDesk} instead; check before confirming.` : "",
  ].filter(Boolean);
  return { bureau, officerId: best.id, officers, why, caution: elsewhere.length > 0 };
}
export type RoutingSuggestion = ReturnType<typeof suggestRouting>;

// ---------- escalation and the resolution loop ----------
/** Hands a complaint to AICTE. The first time this creates a real case, carrying only the pseudonym. Call inside mutate(). */
export function escalateToAicte(d: Db, s: StudentComplaint, reason: string) {
  s.status = "Escalated to AICTE";
  s.escalationLevel = 2;
  const now = new Date().toISOString();
  if (s.caseId) {
    const c = d.cases.find((x) => x.id === s.caseId)!;
    if (c.status !== "Disposed") c.status = "Under Process";
    c.actions.push({ id: nextActionId(d), at: now, type: "Escalated", by: "System", bureau: "SYSTEM", remarks: `Back with AICTE: ${maskFor(s, reason)}`, to: c.bureau });
    c.lastAction = `Escalated: ${maskFor(s, reason)}`;
    c.lastActionDate = now;
    c.nextAction = nextActionFor(c);
    return c;
  }
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
    subject: maskFor(s, s.subject),
    description: maskFor(s, s.translatedText),
    originalText: s.language === "English" ? undefined : maskFor(s, s.originalText),
    translationSource: s.translationSource,
    studentComplaintId: s.id,
    lastAction: "",
    lastActionDate: now,
    nextAction: "",
    expectedDisposalDate: addDays(now, d.settings.slaDays[s.category]),
    actions: [{ id: nextActionId(d), at: now, type: "Received", by: "System", bureau: "SYSTEM", remarks: `Student complaint ${s.id} escalated to AICTE: ${maskFor(s, reason)}` }],
  };
  c.lastAction = `Received: ${c.actions[0].remarks}`;
  c.nextAction = nextActionFor(c);
  d.cases.push(c);
  s.caseId = c.id;
  // auto-link to the open AICTE cases found when the student filed
  const related = s.overlapFlags.map((f) => f.caseId).filter((id) => d.cases.some((x) => x.id === id && x.status !== "Disposed"));
  if (related.length) {
    const leadCase = d.cases.find((x) => x.id === related[0])!;
    const g = linkCases(d, [c.id, ...related], leadCase.bureau, `Auto-linked on escalation of student complaint ${s.id}. Advisory: an official should confirm.`, "System");
    audit(d, { role: "system", actor: "System", action: "OVERLAP_AUTO_LINK", target: g.id, detail: `${c.id} linked to ${related.join(", ")} on escalation` });
  }
  return c;
}

const notDoneCount = (s: StudentComplaint) => s.rounds.filter((r) => r.verdict === "not_done").length;

/** Applies the student's verdict on the current round's proof. Call inside mutate(). */
export function applyVerdict(d: Db, s: StudentComplaint, decision: "done" | "not_done", reason: string) {
  const now = new Date().toISOString();
  const round = s.rounds.find((r) => r.round === s.round);
  if (round) {
    round.verdict = decision;
    round.reason = reason || undefined;
    round.decidedAt = now;
  }
  if (decision === "done") {
    s.status = "Closed - Verified";
    s.closedAt = now;
    s.verifyBy = undefined;
    s.actions.push({ at: now, type: "Student confirmed: Done", by: s.pseudonym, remarks: reason || "Closed as verified by the student." });
    return;
  }
  s.reopened = true;
  s.verifyBy = undefined;
  const c = escalateToAicte(d, s, `student marked round ${s.round} Not done: ${reason}`);
  s.actions.push({ at: now, type: `Student responded: Not done (round ${s.round})`, by: s.pseudonym, remarks: `Sent to ${s.routedBureau} at AICTE as ${c.id}, not returned to the college. Reason: ${reason}` });
  if (notDoneCount(s) >= 2) {
    s.criticalFlag = true;
    c.severity = "Critical";
    s.actions.push({ at: now, type: "Flagged Critical", by: "System", remarks: "Two Not done verdicts. Flagged Critical on the AICTE desk." });
  }
}

/** AICTE sends a complaint back to the college with directions, opening a new round. Call inside mutate(). */
export function returnToCollege(d: Db, s: StudentComplaint, directions: string, by: string) {
  const now = new Date().toISOString();
  const c = escalateToAicte(d, s, "registered for return to the college");
  s.status = "With College";
  s.escalationLevel = 0;
  s.round += 1;
  s.directions = directions;
  s.proof = undefined;
  s.evidence = undefined;
  s.verifyBy = undefined;
  s.dueAt = addDays(now, Math.max(7, Math.ceil(d.settings.slaDays[s.category] / 2)));
  s.lastReminderAt = now;
  const nodal = d.signals.find((x) => x.institutionId === s.institutionId)?.nodalOfficer ?? "Nodal officer";
  const message = `AICTE returned this complaint with directions. Round ${s.round}: new proof is needed.`;
  s.reminders.push({ at: now, channel: "In-app", to: nodal, message }, { at: now, channel: "SMS (simulated)", to: nodal, message });
  s.actions.push({ at: now, type: `AICTE returned to college (round ${s.round})`, by, remarks: directions });
  c.actions.push({ id: nextActionId(d), at: now, type: "Status Change", by, bureau: c.bureau, remarks: `Returned to the college with directions (round ${s.round}): ${directions}` });
  c.lastAction = `Returned to college: ${directions}`;
  c.lastActionDate = now;
  c.nextAction = "Await the college's new proof and the student's verdict";
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
        s.verifyBy = undefined;
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
const maskFor = (s: StudentComplaint, text: string) => maskPii(text, s.maskNames);

/** The student's own view: no genuineness or overlap flags. */
export function studentView(db: Db, s: StudentComplaint) {
  const { studentId, suspicious, overlapFlags, criticalFlag, lastReminderAt, maskNames, ...rest } = s;
  return { ...rest, reminders: s.reminders.filter((r) => r.channel === "In-app").map((r) => ({ at: r.at, message: r.message })), urgency: urgencyFor(db, s) };
}

/** What a college may see: pseudonym and complaint text only. */
export function collegeView(db: Db, s: StudentComplaint) {
  return {
    id: s.id,
    pseudonym: s.pseudonym,
    category: s.category,
    subject: maskFor(s, s.subject),
    language: s.language,
    text: maskFor(s, s.translatedText),
    originalText: s.language === "English" ? undefined : maskFor(s, s.originalText),
    translationSource: s.translationSource,
    severity: s.severity,
    status: s.status,
    createdAt: s.createdAt,
    dueAt: s.dueAt,
    escalationLevel: s.escalationLevel,
    round: s.round,
    directions: s.directions,
    maskLevel: s.maskLevel,
    photo: s.photo,
    proof: s.proof,
    evidence: s.evidence,
    verifyBy: s.verifyBy,
    closedAt: s.closedAt,
    reopened: s.reopened,
    reminders: s.reminders,
    actions: s.actions.map((a) => ({ ...a, remarks: maskFor(s, a.remarks) })),
    urgency: urgencyFor(db, s),
  };
}
export type CollegeComplaint = ReturnType<typeof collegeView>;

/** AICTE desk view. Overlap flags are for the Competent Authority only. */
export function deskView(db: Db, s: StudentComplaint, isCa: boolean) {
  const inst = db.institutions.find((i) => i.id === s.institutionId);
  const { studentId, reminders, lastReminderAt, maskNames, overlapFlags, ...rest } = s;
  return {
    ...rest,
    overlapFlags: isCa ? overlapFlags : [],
    subject: maskFor(s, s.subject),
    translatedText: maskFor(s, s.translatedText),
    originalText: maskFor(s, s.originalText),
    rounds: s.rounds.map((r) => ({ ...r, reason: r.reason ? maskFor(s, r.reason) : r.reason })),
    actions: s.actions.map((a) => ({ ...a, remarks: maskFor(s, a.remarks) })),
    institution: inst?.name,
    region: inst?.region,
    urgency: urgencyFor(db, s),
  };
}
export type DeskComplaint = ReturnType<typeof deskView>;
