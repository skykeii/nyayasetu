import type { Case, Db } from "./types";
import { BUREAUS, CATEGORIES, REGIONS, STATUSES } from "./types";
import { detectOverlaps } from "./overlap";
import { slaInfo } from "./server";
import { DAY } from "./util";

const monthKey = (d: string) => d.slice(0, 7);
const monthLabel = (k: string) => {
  const [y, m] = k.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
};
const quarterKey = (d: string) => {
  const dt = new Date(d);
  return `${dt.getUTCFullYear()}-Q${Math.floor(dt.getUTCMonth() / 3) + 1}`;
};

function lastMonths(n: number) {
  const out: string[] = [];
  const d = new Date();
  d.setUTCDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push(x.toISOString().slice(0, 7));
  }
  return out;
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

function summarize(db: Db, cs: Case[]) {
  const open = cs.filter((c) => c.status !== "Disposed");
  const disposed = cs.filter((c) => c.status === "Disposed");
  const infos = disposed.map((c) => slaInfo(db, c));
  const within = infos.filter((i) => i.withinSla).length;
  const avgDays = infos.length ? Math.round(infos.reduce((s, i) => s + i.ageDays, 0) / infos.length) : 0;
  const overdue = open.filter((c) => slaInfo(db, c).state === "breached").length;
  return { received: cs.length, open: open.length, disposed: disposed.length, overdue, disposalRate: pct(disposed.length, cs.length), withinSla: pct(within, disposed.length), avgDisposalDays: avgDays };
}

export function dashboard(db: Db, cases: Case[], visible: Set<string>) {
  const { clusters } = detectOverlaps(db);
  const visClusters = clusters.filter((c) => c.caseIds.some((id) => visible.has(id)));
  const kpi = {
    total: cases.length,
    pending: cases.filter((c) => c.status !== "Disposed").length,
    newCases: cases.filter((c) => c.status === "New").length,
    underProcess: cases.filter((c) => c.status === "Under Process").length,
    disposed: cases.filter((c) => c.status === "Disposed").length,
    transferred: cases.filter((c) => c.status === "Transferred" || c.actions.some((a) => a.type === "Transferred")).length,
    transferredOpen: cases.filter((c) => c.status === "Transferred").length,
    escalated: cases.filter((c) => c.status === "Escalated").length,
    beyondTimeline: cases.filter((c) => c.status !== "Disposed" && slaInfo(db, c).state === "breached").length,
    dueSoon: cases.filter((c) => c.status !== "Disposed" && slaInfo(db, c).state === "due-soon").length,
    overlapsOpen: visClusters.filter((c) => c.status === "Open" && c.kind === "cross-bureau").length,
    duplicatesOpen: visClusters.filter((c) => c.status === "Open" && c.kind === "duplicate").length,
    receivedLast30: cases.filter((c) => Date.now() - new Date(c.dateReceived).getTime() < 30 * DAY).length,
  };
  const bureauWorkload = BUREAUS.map((b) => {
    const bc = cases.filter((c) => c.bureau === b.code);
    const open = bc.filter((c) => c.status !== "Disposed");
    return {
      bureau: b.code,
      name: b.name,
      New: open.filter((c) => c.status === "New").length,
      "Under Process": open.filter((c) => c.status === "Under Process").length,
      Transferred: open.filter((c) => c.status === "Transferred").length,
      Escalated: open.filter((c) => c.status === "Escalated").length,
      overdue: open.filter((c) => slaInfo(db, c).state === "breached").length,
      open: open.length,
      disposed30: bc.filter((c) => c.status === "Disposed" && Date.now() - new Date(c.disposedAt!).getTime() < 30 * DAY).length,
    };
  }).filter((b) => b.open + b.disposed30 > 0);

  const instMap = new Map<string, Case[]>();
  for (const c of cases) instMap.set(c.institutionId, [...(instMap.get(c.institutionId) ?? []), c]);
  const institutionStatus = [...instMap.entries()]
    .map(([id, cs]) => {
      const inst = db.institutions.find((i) => i.id === id)!;
      const row: Record<string, string | number> = { id, name: inst.name, short: inst.shortName, region: inst.region, total: cs.length };
      for (const s of STATUSES) row[s] = cs.filter((c) => c.status === s).length;
      row.overdue = cs.filter((c) => c.status !== "Disposed" && slaInfo(db, c).state === "breached").length;
      row.open = cs.filter((c) => c.status !== "Disposed").length;
      row.overlaps = visClusters.filter((cl) => cl.institutionId === id && cl.status === "Open").length;
      return row;
    })
    .sort((a, b) => (b.open as number) - (a.open as number) || (b.total as number) - (a.total as number))
    .slice(0, 10);

  const months = lastMonths(12);
  const trend = months.map((m) => ({
    month: monthLabel(m),
    received: cases.filter((c) => monthKey(c.dateReceived) === m).length,
    disposed: cases.filter((c) => c.disposedAt && monthKey(c.disposedAt) === m).length,
  }));

  const regions = REGIONS.map((r) => {
    const ids = new Set(db.institutions.filter((i) => i.region === r).map((i) => i.id));
    const rc = cases.filter((c) => ids.has(c.institutionId));
    return { region: r, open: rc.filter((c) => c.status !== "Disposed").length, overdue: rc.filter((c) => c.status !== "Disposed" && slaInfo(db, c).state === "breached").length, total: rc.length };
  }).filter((r) => r.total > 0);

  const activity = cases
    .flatMap((c) => c.actions.slice(-2).map((a) => ({ ...a, caseId: c.id, institution: db.institutions.find((i) => i.id === c.institutionId)?.shortName })))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 10);

  const queue = cases
    .filter((c) => c.status !== "Disposed")
    .map((c) => ({ c, s: slaInfo(db, c) }))
    .sort((a, b) => a.s.daysToDue - b.s.daysToDue)
    .slice(0, 8)
    .map(({ c, s }) => ({ id: c.id, category: c.category, bureau: c.bureau, status: c.status, institution: db.institutions.find((i) => i.id === c.institutionId)?.name, nextAction: c.nextAction, daysToDue: s.daysToDue, severity: c.severity }));

  return { kpi, bureauWorkload, institutionStatus, trend, regions, activity, queue, categoryMix: CATEGORIES.map((cat) => ({ category: cat, open: cases.filter((c) => c.category === cat && c.status !== "Disposed").length })) };
}

export interface Report {
  key: string;
  title: string;
  description: string;
  chart: { kind: "bar" | "stacked" | "line"; x: string; series: { key: string; label: string; color: string }[]; data: Record<string, unknown>[] };
  columns: { key: string; label: string; numeric?: boolean }[];
  rows: Record<string, unknown>[];
}

const C = { saffron: "#CC6A22", indigo: "#53659A", emerald: "#4C8040", red: "#BE4A32", amber: "#C2831A", violet: "#9C4E7C", sky: "#357D7A" };

export const REPORT_KEYS = [
  ["bureau", "Bureau / Cell-wise"],
  ["region", "Region-wise"],
  ["institution", "Institution-wise history"],
  ["ageing", "Pending ageing"],
  ["disposal", "Disposal rate"],
  ["overlap", "Overlapping & duplicate"],
  ["monthly", "Monthly performance"],
  ["quarterly", "Quarterly performance"],
] as const;

export function buildReport(db: Db, cases: Case[], key: string, visible: Set<string>): Report {
  const summaryCols = [
    { key: "received", label: "Received", numeric: true },
    { key: "open", label: "Pending", numeric: true },
    { key: "disposed", label: "Disposed", numeric: true },
    { key: "overdue", label: "Beyond timeline", numeric: true },
    { key: "disposalRate", label: "Disposal rate %", numeric: true },
    { key: "withinSla", label: "Disposed within SLA %", numeric: true },
    { key: "avgDisposalDays", label: "Avg disposal days", numeric: true },
  ];
  const stackSeries = [
    { key: "open", label: "Pending", color: C.amber },
    { key: "disposed", label: "Disposed", color: C.emerald },
    { key: "overdue", label: "Beyond timeline", color: C.red },
  ];
  switch (key) {
    case "region": {
      const rows = REGIONS.map((r) => {
        const ids = new Set(db.institutions.filter((i) => i.region === r).map((i) => i.id));
        return { region: r, institutions: ids.size, ...summarize(db, cases.filter((c) => ids.has(c.institutionId))) };
      }).filter((r) => r.received > 0);
      return { key, title: "Region-wise report", description: "Complaints by AICTE region with disposal performance.", chart: { kind: "bar", x: "region", series: stackSeries, data: rows }, columns: [{ key: "region", label: "Region" }, { key: "institutions", label: "Institutions", numeric: true }, ...summaryCols], rows };
    }
    case "institution": {
      const { clusters } = detectOverlaps(db);
      const byInst = new Map<string, Case[]>();
      for (const c of cases) byInst.set(c.institutionId, [...(byInst.get(c.institutionId) ?? []), c]);
      const rows = [...byInst.entries()]
        .map(([id, cs]) => {
          const i = db.institutions.find((x) => x.id === id)!;
          const s = summarize(db, cs);
          return { id, name: i.name, short: i.shortName, region: i.region, ...s, bureaus: [...new Set(cs.map((c) => c.bureau))].join(", "), overlaps: clusters.filter((cl) => cl.institutionId === id && cl.caseIds.some((x) => visible.has(x))).length, lastComplaint: cs.map((c) => c.dateReceived).sort().at(-1)!.slice(0, 10) };
        })
        .sort((a, b) => b.received - a.received);
      return { key, title: "Institution-wise history", description: "Consolidated complaint history per institution across all bureaus/cells.", chart: { kind: "stacked", x: "short", series: [{ key: "open", label: "Pending", color: C.amber }, { key: "disposed", label: "Disposed", color: C.emerald }], data: rows.slice(0, 15) }, columns: [{ key: "id", label: "Permanent ID" }, { key: "name", label: "Institution" }, { key: "region", label: "Region" }, ...summaryCols.slice(0, 4), { key: "bureaus", label: "Bureaus/Cells" }, { key: "overlaps", label: "Overlap clusters", numeric: true }, { key: "lastComplaint", label: "Last complaint" }], rows };
    }
    case "ageing": {
      const buckets: [string, number, number][] = [["0–15 d", 0, 15], ["16–30 d", 16, 30], ["31–45 d", 31, 45], ["46–60 d", 46, 60], ["> 60 d", 61, 1e9]];
      const open = cases.filter((c) => c.status !== "Disposed").map((c) => ({ c, s: slaInfo(db, c) }));
      const data = buckets.map(([label, lo, hi]) => {
        const row: Record<string, string | number> = { bucket: label };
        for (const b of BUREAUS) row[b.code] = open.filter((o) => o.c.bureau === b.code && o.s.ageDays >= lo && o.s.ageDays <= hi).length;
        row.total = open.filter((o) => o.s.ageDays >= lo && o.s.ageDays <= hi).length;
        row.breached = open.filter((o) => o.s.ageDays >= lo && o.s.ageDays <= hi && o.s.state === "breached").length;
        return row;
      });
      const colors = [C.saffron, C.indigo, C.emerald, C.sky, C.violet];
      return { key, title: "Pending ageing analysis", description: "Age of pending cases (days since receipt) by bureau/cell.", chart: { kind: "stacked", x: "bucket", series: BUREAUS.map((b, i) => ({ key: b.code, label: b.code, color: colors[i] })), data }, columns: [{ key: "bucket", label: "Age bucket" }, ...BUREAUS.map((b) => ({ key: b.code, label: b.code, numeric: true })), { key: "total", label: "Total", numeric: true }, { key: "breached", label: "Beyond SLA", numeric: true }], rows: data };
    }
    case "disposal": {
      const rows = CATEGORIES.map((cat) => ({ category: cat, slaDays: db.settings.slaDays[cat], ...summarize(db, cases.filter((c) => c.category === cat)) }));
      return { key, title: "Disposal rate by category", description: "Share of complaints disposed, and disposed within the configured SLA.", chart: { kind: "bar", x: "category", series: [{ key: "disposalRate", label: "Disposal rate %", color: C.emerald }, { key: "withinSla", label: "Within SLA %", color: C.indigo }], data: rows }, columns: [{ key: "category", label: "Category" }, { key: "slaDays", label: "SLA days", numeric: true }, ...summaryCols], rows };
    }
    case "overlap": {
      const { clusters } = detectOverlaps(db);
      const rows = clusters
        .filter((cl) => cl.caseIds.some((x) => visible.has(x)))
        .map((cl) => ({ id: cl.id, kind: cl.kind, institution: db.institutions.find((i) => i.id === cl.institutionId)?.name, institutionId: cl.institutionId, bureaus: cl.bureaus.join(" + "), cases: cl.caseIds.join(" "), size: cl.caseIds.length, confidence: Math.round(cl.confidence * 100), status: cl.status }));
      const pairCounts = new Map<string, { pair: string; Open: number; Linked: number; Coordinated: number }>();
      for (const r of rows) {
        const e = pairCounts.get(r.bureaus) ?? { pair: r.bureaus, Open: 0, Linked: 0, Coordinated: 0 };
        e[r.status as "Open"]++;
        pairCounts.set(r.bureaus, e);
      }
      return { key, title: "Overlapping & duplicate cases", description: "Clusters detected by the overlap engine (advisory) and their coordination status.", chart: { kind: "stacked", x: "pair", series: [{ key: "Open", label: "Open", color: C.violet }, { key: "Linked", label: "Linked", color: C.indigo }, { key: "Coordinated", label: "Coordinated", color: C.emerald }], data: [...pairCounts.values()] }, columns: [{ key: "id", label: "Cluster" }, { key: "kind", label: "Type" }, { key: "institution", label: "Institution" }, { key: "institutionId", label: "Permanent ID" }, { key: "bureaus", label: "Bureaus/Cells" }, { key: "cases", label: "Case IDs" }, { key: "confidence", label: "Confidence %", numeric: true }, { key: "status", label: "Status" }], rows };
    }
    case "monthly":
    case "quarterly": {
      const keyFn = key === "monthly" ? monthKey : quarterKey;
      const keys = key === "monthly" ? lastMonths(18) : [...new Set(lastMonths(18).map((m) => quarterKey(`${m}-15T00:00:00Z`)))];
      const rows = keys.map((k) => {
        const recv = cases.filter((c) => keyFn(c.dateReceived) === k);
        const disp = cases.filter((c) => c.disposedAt && keyFn(c.disposedAt) === k);
        const within = disp.filter((c) => slaInfo(db, c).withinSla).length;
        return { period: key === "monthly" ? monthLabel(k) : k, received: recv.length, disposed: disp.length, withinSla: within, withinSlaPct: pct(within, disp.length), avgDisposalDays: disp.length ? Math.round(disp.reduce((s, c) => s + slaInfo(db, c).ageDays, 0) / disp.length) : 0 };
      });
      return { key, title: key === "monthly" ? "Monthly performance" : "Quarterly performance", description: "Complaints received vs disposed, and SLA adherence of disposals.", chart: { kind: "line", x: "period", series: [{ key: "received", label: "Received", color: C.saffron }, { key: "disposed", label: "Disposed", color: C.emerald }, { key: "withinSla", label: "Disposed within SLA", color: C.indigo }], data: rows }, columns: [{ key: "period", label: key === "monthly" ? "Month" : "Quarter" }, { key: "received", label: "Received", numeric: true }, { key: "disposed", label: "Disposed", numeric: true }, { key: "withinSla", label: "Within SLA", numeric: true }, { key: "withinSlaPct", label: "Within SLA %", numeric: true }, { key: "avgDisposalDays", label: "Avg disposal days", numeric: true }], rows };
    }
    case "bureau":
    default: {
      const rows = BUREAUS.map((b) => ({ bureau: b.code, name: b.name, ...summarize(db, cases.filter((c) => c.bureau === b.code)) })).filter((r) => r.received > 0);
      return { key: "bureau", title: "Bureau / Cell-wise report", description: "Workload and disposal performance by the unit currently handling each case.", chart: { kind: "bar", x: "bureau", series: stackSeries, data: rows }, columns: [{ key: "bureau", label: "Code" }, { key: "name", label: "Bureau / Cell" }, ...summaryCols], rows };
    }
  }
}
