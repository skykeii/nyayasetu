import { NextResponse } from "next/server";
import { journeyOf } from "./journey";
import type { BureauCode, Case, Db, StudentComplaint } from "./types";
import { BUREAUS } from "./types";
import { ROLES, ROLE_KEYS, type Viewer } from "./roles";
import { detectBursts, detectOverlaps, type OverlapCluster } from "./overlap";
import { DAY } from "./util";
import { urgencyOf } from "./intake";
import { ApiError } from "./api";
import { VIEWER_HEADER } from "./session";

/** Identity comes only from middleware.ts, which verifies the signed cookie and drops client-sent headers. */
export function viewerFrom(req: Request, _db?: Db): Viewer {
  const raw = req.headers.get(VIEWER_HEADER);
  if (!raw) throw new ApiError(401, "Please sign in");
  const v = JSON.parse(decodeURIComponent(raw)) as Viewer;
  if (!ROLE_KEYS.includes(v.role)) throw new ApiError(401, "Please sign in");
  return v;
}

/** The unit an action is recorded under for this viewer. */
export function viewerUnit(db: Db, v: Viewer): BureauCode | "RO" | "CA" {
  if (v.role === "ca") return "CA";
  if (v.role === "ro") return "RO";
  const off = db.officers.find((o) => o.id === v.officerId);
  return (off?.bureau as BureauCode) ?? "RB";
}

export function officerName(db: Db, v: Viewer) {
  if (v.role === "student") return db.students.find((x) => x.id === v.studentId)?.pseudonym ?? "Student";
  if (v.role === "college") return db.signals.find((x) => x.institutionId === v.institutionId)?.nodalOfficer ?? "College Nodal Officer";
  return db.officers.find((o) => o.id === v.officerId)?.name ?? "Officer";
}

export const json = (data: unknown, init?: ResponseInit) => NextResponse.json(data, init);
export const forbidden = (msg = "Not permitted for your role") => NextResponse.json({ error: msg }, { status: 403 });

/** Returns ids of cases visible to the viewer (role-based access, enforced server-side). */
export function visibleIds(db: Db, v: Viewer): Set<string> {
  const def = ROLES[v.role];
  if (v.role === "ca") return new Set(db.cases.map((c) => c.id));
  if (v.role === "ro") {
    const insts = new Set(db.institutions.filter((i) => i.region === v.region).map((i) => i.id));
    return new Set(db.cases.filter((c) => insts.has(c.institutionId)).map((c) => c.id));
  }
  const bureaus = def.bureaus as BureauCode[];
  const own = new Set(db.cases.filter((c) => bureaus.includes(c.bureau) || c.actions.some((a) => bureaus.includes(a.bureau as BureauCode))).map((c) => c.id));
  // overlap partners are visible to enable coordination
  for (const cl of detectOverlaps(db).clusters) {
    if (cl.caseIds.some((id) => own.has(id))) cl.caseIds.forEach((id) => own.add(id));
  }
  return own;
}

// ---------------- student-portal complaints ----------------
const unitBureaus = (v: Viewer) => (ROLES[v.role].bureaus === "all" ? [] : (ROLES[v.role].bureaus as BureauCode[]));
const regionOf = (db: Db, institutionId: string) => db.institutions.find((i) => i.id === institutionId)?.region;

/** Student complaints in this viewer's lists and counts. Bureau officers get none here; they see them only on profiles and overlap panels. */
export function studentsInScope(db: Db, v: Viewer): StudentComplaint[] {
  switch (v.role) {
    case "ca":
      return db.studentComplaints;
    case "ro":
      return db.studentComplaints.filter((s) => regionOf(db, s.institutionId) === v.region);
    case "college":
      return db.studentComplaints.filter((s) => s.institutionId === v.institutionId);
    case "student":
      return db.studentComplaints.filter((s) => s.studentId === v.studentId);
    default:
      return [];
  }
}

/** A bureau officer sees an institution's student complaints only while their unit has an open case there. */
export function studentsOnProfile(db: Db, v: Viewer, institutionId: string): StudentComplaint[] {
  if (v.role === "ca" || v.role === "ro") return studentsInScope(db, v).filter((s) => s.institutionId === institutionId);
  const bureaus = unitBureaus(v);
  const active = bureaus.length > 0 && db.cases.some((c) => c.institutionId === institutionId && c.status !== "Disposed" && bureaus.includes(c.bureau));
  return active ? db.studentComplaints.filter((s) => s.institutionId === institutionId) : [];
}

/** Student complaints the overlap engine flagged against a case the viewer can already see. */
export function studentsFlaggedOn(db: Db, v: Viewer, caseId: string): StudentComplaint[] {
  if (v.role === "college" || v.role === "student") return [];
  return db.studentComplaints.filter((s) => s.overlapFlags.some((f) => f.caseId === caseId) || s.caseId === caseId);
}

export function canSeeStudent(db: Db, v: Viewer, s: StudentComplaint, vis?: Set<string>) {
  if (studentsInScope(db, v).includes(s) || studentsOnProfile(db, v, s.institutionId).includes(s)) return true;
  if (v.role === "college" || v.role === "student") return false;
  const visible = vis ?? visibleIds(db, v);
  return s.overlapFlags.some((f) => visible.has(f.caseId)) || (!!s.caseId && visible.has(s.caseId));
}

export function isOwnCase(v: Viewer, c: Case) {
  const def = ROLES[v.role];
  if (v.role === "ca") return true;
  if (def.bureaus === "all") return false;
  return def.bureaus.includes(c.bureau);
}

export type SlaState = "ok" | "due-soon" | "breached" | "closed";

export function slaInfo(db: Db, c: Case, now = Date.now()) {
  const due = new Date(c.expectedDisposalDate).getTime();
  const recv = new Date(c.dateReceived).getTime();
  if (c.status === "Disposed") {
    const done = new Date(c.disposedAt ?? c.lastActionDate).getTime();
    return { state: "closed" as SlaState, ageDays: Math.floor((done - recv) / DAY), daysToDue: 0, overdueDays: 0, withinSla: done <= due };
  }
  const daysToDue = Math.ceil((due - now) / DAY);
  const state: SlaState = daysToDue < 0 ? "breached" : daysToDue <= db.settings.warningWindowDays ? "due-soon" : "ok";
  return { state, ageDays: Math.floor((now - recv) / DAY), daysToDue, overdueDays: Math.max(0, -daysToDue), withinSla: undefined };
}

export function decorate(db: Db, c: Case, clusters: OverlapCluster[], opts: { full?: boolean; v?: Viewer } = {}) {
  const inst = db.institutions.find((i) => i.id === c.institutionId);
  const off = db.officers.find((o) => o.id === c.officerId);
  const sla = slaInfo(db, c);
  const cl = clusters.filter((x) => x.caseIds.includes(c.id));
  const base = {
    ...c,
    actions: opts.full ? c.actions : undefined,
    description: opts.full ? c.description : c.description.slice(0, 180),
    institutionName: inst?.name ?? c.reportedName,
    region: inst?.region,
    state: inst?.state,
    officerName: off?.name,
    officerDesignation: off?.designation,
    bureauName: BUREAUS.find((b) => b.code === c.bureau)?.name,
    sla,
    journey: journeyOf(c.actions, c.status),
    overlapClusters: cl.map((x) => ({ id: x.id, kind: x.kind, status: x.status, confidence: x.confidence })),
    readOnly: opts.v ? !isOwnCase(opts.v, c) : false,
  };
  if (opts.v && opts.v.role !== "ca" && opts.v.role !== "ro" && !isOwnCase(opts.v, c)) {
    // partner bureau view: hide complainant identity
    return { ...base, complainantName: "(visible to handling unit)", complainantContact: undefined, partnerView: true };
  }
  return { ...base, partnerView: false };
}
export type CaseView = ReturnType<typeof decorate>;

// ---------------- alerts ----------------
export interface Alert {
  id: string;
  type: "overlap" | "duplicate" | "sla_breach" | "sla_due" | "no_action" | "escalation" | "transfer" | "burst" | "student";
  severity: "critical" | "high" | "medium" | "info";
  title: string;
  message: string;
  caseIds: string[];
  institutionId?: string;
  at: string;
  href: string;
  read: boolean;
}

const EVENT_DAYS = 30;
const VERDICT = /^Student (confirmed|responded)/;

/** Student-portal notifications. Every one links to that complaint. */
function studentAlerts(db: Db, v: Viewer): Alert[] {
  if (v.role !== "college" && v.role !== "ca") return [];
  const reads = new Set(db.alertReads[v.role] ?? []);
  const instName = (id: string) => db.institutions.find((i) => i.id === id)?.name ?? id;
  const recent = (at: string) => Date.now() - new Date(at).getTime() < EVENT_DAYS * DAY;
  const out: Alert[] = [];
  const push = (a: Omit<Alert, "read" | "type" | "caseIds"> & { caseIds?: string[] }) => out.push({ type: "student", caseIds: [], read: reads.has(a.id), ...a });
  for (const s of studentsInScope(db, v)) {
    if (v.role === "college") {
      const href = `/college?complaint=${s.id}`;
      const last = s.reminders.at(-1);
      if (s.status === "With College" && last) {
        const u = urgencyOf({ severity: s.severity, createdAt: s.createdAt, dueAt: s.dueAt, similar: 0 });
        push({ id: `col:${s.id}:${s.reminders.length}`, severity: s.escalationLevel > 0 ? "critical" : u.label === "Critical" ? "high" : "medium", title: s.reminders.length <= 2 ? `New student complaint: ${s.subject}` : s.escalationLevel > 0 ? "Overdue: escalated to the Principal" : `Reminder: ${s.subject}`, message: `${s.id} · ${s.pseudonym} · ${last.message}`, institutionId: s.institutionId, at: last.at, href });
      }
      s.actions.forEach((a, i) => {
        if (!recent(a.at)) return;
        if (VERDICT.test(a.type)) push({ id: `colv:${s.id}:${i}`, severity: a.type.includes("Not done") ? "high" : "info", title: a.type, message: `${s.id} · ${s.pseudonym} · ${a.remarks}`, institutionId: s.institutionId, at: a.at, href });
        else if (a.type.startsWith("AICTE returned")) push({ id: `colr:${s.id}:${i}`, severity: "high", title: `${a.type}: new proof needed`, message: `${s.id} · ${a.remarks}`, institutionId: s.institutionId, at: a.at, href });
      });
      continue;
    }
    const href = `/grievances?complaint=${s.id}`;
    const message = `${s.id} · ${s.pseudonym} · ${s.category} · ${instName(s.institutionId)}`;
    if (recent(s.createdAt) && s.round === 1 && s.status === "With College") push({ id: `new:${s.id}`, severity: s.severity === "Critical" ? "high" : "info", title: "New student-portal complaint", message, institutionId: s.institutionId, at: s.createdAt, href });
    if (s.status === "Escalated to AICTE")
      push({ id: `stu:${s.id}`, severity: s.criticalFlag ? "critical" : s.reopened ? "high" : "medium", title: s.criticalFlag ? "Critical: two Not done verdicts from the student" : s.reopened ? "Student marked Not done: reopened to AICTE" : "Student complaint overdue at college: escalated to AICTE", message, caseIds: s.caseId ? [s.caseId] : [], institutionId: s.institutionId, at: s.actions.at(-1)?.at ?? s.createdAt, href });
    // a verdict on a round AICTE sent back is AICTE's business too
    s.actions.forEach((a, i) => {
      if (recent(a.at) && s.round > 1 && a.type.startsWith("Student confirmed")) push({ id: `cav:${s.id}:${i}`, severity: "info", title: `${a.type} after the AICTE return`, message, institutionId: s.institutionId, at: a.at, href });
    });
  }
  return out;
}

export function buildAlerts(db: Db, v: Viewer): Alert[] {
  if (v.role === "college") return studentAlerts(db, v).sort((a, b) => Number(a.read) - Number(b.read) || b.at.localeCompare(a.at));
  const vis = visibleIds(db, v);
  const { clusters } = detectOverlaps(db);
  const instName = (id: string) => db.institutions.find((i) => i.id === id)?.name ?? id;
  const reads = new Set(db.alertReads[v.role] ?? []);
  const out: Alert[] = [];
  const now = Date.now();
  for (const cl of clusters) {
    if (cl.status !== "Open" || !cl.caseIds.some((id) => vis.has(id))) continue;
    out.push({
      id: `ovl:${cl.id}`,
      type: cl.kind === "cross-bureau" ? "overlap" : "duplicate",
      severity: cl.kind === "cross-bureau" ? "high" : "medium",
      title: cl.kind === "cross-bureau" ? "Potential Overlapping Cases – Coordination Required" : "Possible duplicate registration",
      message: `${cl.caseIds.length} cases on ${instName(cl.institutionId)} across ${cl.bureaus.join(" + ")} · confidence ${Math.round(cl.confidence * 100)}% (advisory)`,
      caseIds: cl.caseIds,
      institutionId: cl.institutionId,
      at: cl.newestAt,
      href: `/overlaps?focus=${cl.id}`,
      read: reads.has(`ovl:${cl.id}`),
    });
  }
  for (const c of db.cases) {
    if (!vis.has(c.id) || c.status === "Disposed") continue;
    const s = slaInfo(db, c, now);
    const name = instName(c.institutionId);
    const push = (a: Omit<Alert, "read" | "caseIds" | "institutionId" | "href"> & { href?: string }) =>
      out.push({ caseIds: [c.id], institutionId: c.institutionId, href: `/cases?open=${c.id}`, read: reads.has(a.id), ...a });
    if (s.state === "breached")
      push({ id: `sla:${c.id}`, type: "sla_breach", severity: s.overdueDays > 15 ? "critical" : "high", title: `SLA breached by ${s.overdueDays} day${s.overdueDays === 1 ? "" : "s"}`, message: `${c.id} · ${c.category} · ${name} · with ${c.bureau}`, at: c.expectedDisposalDate });
    else if (s.state === "due-soon")
      push({ id: `due:${c.id}`, type: "sla_due", severity: "medium", title: `Disposal due in ${s.daysToDue} day${s.daysToDue === 1 ? "" : "s"}`, message: `${c.id} · ${c.category} · ${name}`, at: new Date(new Date(c.expectedDisposalDate).getTime() - db.settings.warningWindowDays * DAY).toISOString() });
    const idle = Math.floor((now - new Date(c.lastActionDate).getTime()) / DAY);
    if (idle >= db.settings.reminderNoActionDays && s.state !== "breached")
      push({ id: `idle:${c.id}`, type: "no_action", severity: "medium", title: `Pending reminder: no action for ${idle} days`, message: `${c.id} · next: ${c.nextAction}`, at: new Date(new Date(c.lastActionDate).getTime() + db.settings.reminderNoActionDays * DAY).toISOString() });
    if (c.status === "Escalated") {
      const e = [...c.actions].reverse().find((a) => a.type === "Escalated");
      push({ id: `esc:${c.id}:${e?.id}`, type: "escalation", severity: "high", title: "Escalated to Competent Authority", message: `${c.id} · ${name} · ${e?.remarks ?? ""}`, at: e?.at ?? c.lastActionDate });
    }
    if (c.status === "Transferred") {
      const t = [...c.actions].reverse().find((a) => a.type === "Transferred");
      push({ id: `trf:${c.id}:${t?.id}`, type: "transfer", severity: "info", title: `Transfer to ${c.bureau} awaiting acceptance`, message: `${c.id} · from ${t?.from} · ${name}`, at: t?.at ?? c.lastActionDate });
    }
  }
  for (const b of detectBursts(db)) {
    if (!b.caseIds.some((id) => vis.has(id))) continue;
    const id = `burst:${b.institutionId}:${b.from.slice(0, 10)}`;
    out.push({
      id,
      type: "burst",
      severity: "medium",
      title: "Unusual complaint burst – verify genuineness",
      message: `${b.caseIds.length} complaints against ${instName(b.institutionId)} within 72h${b.similarText ? ", near-identical wording" : ""} (advisory; do not act on volume alone)`,
      caseIds: b.caseIds,
      institutionId: b.institutionId,
      at: b.to,
      href: `/cases?q=${encodeURIComponent(b.institutionId)}`,
      read: reads.has(id),
    });
  }
  out.push(...studentAlerts(db, v));
  const rank = { critical: 0, high: 1, medium: 2, info: 3 };
  out.sort((a, b) => Number(a.read) - Number(b.read) || rank[a.severity] - rank[b.severity] || b.at.localeCompare(a.at));
  return out;
}
