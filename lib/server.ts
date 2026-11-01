import { NextResponse } from "next/server";
import type { BureauCode, Case, Db, Region, RoleKey } from "./types";
import { BUREAUS, REGIONS } from "./types";
import { ROLES, type Viewer } from "./roles";
import { detectBursts, detectOverlaps, type OverlapCluster } from "./overlap";
import { DAY } from "./util";

export function viewerFrom(req: Request, db: Db): Viewer {
  const h = req.headers;
  const sp = new URL(req.url).searchParams;
  const roleRaw = (h.get("x-role") ?? sp.get("_role") ?? "ca") as RoleKey;
  const role: RoleKey = roleRaw in ROLES ? roleRaw : "ca";
  const regionRaw = (h.get("x-region") ?? sp.get("_region")) as Region | null;
  const region: Region = regionRaw && REGIONS.includes(regionRaw) ? regionRaw : "Southern";
  const def = ROLES[role];
  let officerId = h.get("x-officer") ?? sp.get("_officer") ?? def.defaultOfficer;
  const off = db.officers.find((o) => o.id === officerId);
  const okOfficer =
    off &&
    (role === "ca"
      ? off.id === "CA-1"
      : role === "ro"
      ? off.bureau === "RO" && off.region === region
      : def.bureaus !== "all" && def.bureaus.includes(off.bureau as BureauCode));
  if (!okOfficer) {
    officerId = role === "ro" ? db.officers.find((o) => o.bureau === "RO" && o.region === region)?.id ?? def.defaultOfficer : def.defaultOfficer;
  }
  return { role, region, officerId };
}

/** The unit an action is recorded under for this viewer. */
export function viewerUnit(db: Db, v: Viewer): BureauCode | "RO" | "CA" {
  if (v.role === "ca") return "CA";
  if (v.role === "ro") return "RO";
  const off = db.officers.find((o) => o.id === v.officerId);
  return (off?.bureau as BureauCode) ?? "RB";
}

export function officerName(db: Db, v: Viewer) {
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
    overlapClusters: cl.map((x) => ({ id: x.id, kind: x.kind, status: x.status, confidence: x.confidence })),
    readOnly: opts.v ? !isOwnCase(opts.v, c) : false,
  };
  if (opts.v && opts.v.role !== "ca" && opts.v.role !== "ro" && !isOwnCase(opts.v, c)) {
    // partner bureau view: hide complainant identity
    return { ...base, complainantName: "(visible to handling unit)", partnerView: true };
  }
  return { ...base, partnerView: false };
}
export type CaseView = ReturnType<typeof decorate>;

// ---------------- alerts ----------------
export interface Alert {
  id: string;
  type: "overlap" | "duplicate" | "sla_breach" | "sla_due" | "no_action" | "escalation" | "transfer" | "burst";
  severity: "critical" | "high" | "medium" | "info";
  title: string;
  message: string;
  caseIds: string[];
  institutionId?: string;
  at: string;
  href: string;
  read: boolean;
}

export function buildAlerts(db: Db, v: Viewer): Alert[] {
  const vis = visibleIds(db, v);
  const { clusters } = detectOverlaps(db);
  const instName = (id: string) => db.institutions.find((i) => i.id === id)?.name ?? id;
  const reads = new Set(db.alertReads);
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
  const rank = { critical: 0, high: 1, medium: 2, info: 3 };
  out.sort((a, b) => Number(a.read) - Number(b.read) || rank[a.severity] - rank[b.severity] || b.at.localeCompare(a.at));
  return out;
}
