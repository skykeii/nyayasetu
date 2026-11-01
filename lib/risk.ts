import type { Case, Db, Institution, StudentComplaint } from "./types";
import { detectBursts, detectOverlaps } from "./overlap";
import { slaInfo } from "./server";
import { PULSE_TERM } from "./intake";
import { DAY } from "./util";

/** College Risk Index: scores handling quality, not complaint volume. Advisory only; it never decides anything. */

export type Confidence = "High" | "Medium" | "Low";
export const INSUFFICIENT = "Insufficient data - low confidence";

export interface RiskFactor {
  key: string;
  label: string;
  group: "Handling" | "Student voice" | "Objective";
  weight: number;
  value: string; // the college's own number, or "No data"
  n: number;
  risk: number; // 0-100 after shrinkage towards peers
  peerRisk: number;
  contribution: number; // points added to the score
}

export interface RiskResult {
  institutionId: string;
  score: number;
  band: string;
  confidence: Confidence;
  confidenceReasons: string[];
  factors: RiskFactor[];
  why: string[];
  flags: string[];
  context: { complaintsPer1000: number; countedComplaints: number; enrolment: number };
  pulse: { term: string; invited: number; responded: number; responseRate: number; means: Record<string, number> | null; unablePct: number } | null;
  peer: { label: string; count: number; average: number; rank: number };
}

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const pctText = (x: number) => `${Math.round(x * 100)}%`;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

interface Spec {
  key: string;
  label: string;
  group: RiskFactor["group"];
  weight: number;
  prior: number; // pseudo-observations pulling small samples towards the peer mean; 0 for objective facts
}
const SPECS: Spec[] = [
  { key: "resolution", label: "Median resolution time vs SLA", group: "Handling", weight: 0.18, prior: 8 },
  { key: "sla", label: "SLA breaches", group: "Handling", weight: 0.15, prior: 8 },
  { key: "reopen", label: "Reopen rate (student said Not done)", group: "Handling", weight: 0.12, prior: 8 },
  { key: "verified", label: "Closures not verified by students", group: "Handling", weight: 0.14, prior: 8 },
  { key: "unverified", label: "Closed - Unverified (student silent)", group: "Handling", weight: 0.06, prior: 8 },
  { key: "pulse", label: "Pulse survey rating", group: "Student voice", weight: 0.13, prior: 30 },
  { key: "unable", label: "Felt unable to complain", group: "Student voice", weight: 0.07, prior: 30 },
  { key: "intake", label: "Actual vs approved intake", group: "Objective", weight: 0.05, prior: 0 },
  { key: "fee", label: "Fee vs AICTE norm", group: "Objective", weight: 0.05, prior: 0 },
  { key: "compliance", label: "Document and compliance validity", group: "Objective", weight: 0.05, prior: 0 },
];

interface Raw {
  risk: number | null;
  value: string;
  n: number;
}

function rawFactors(db: Db, inst: Institution, cases: Case[], students: StudentComplaint[]): Record<string, Raw> {
  const now = Date.now();
  const disposed = cases.filter((c) => c.status === "Disposed");
  const closedStudents = students.filter((s) => s.closedAt);
  const ratios = [
    ...disposed.map((c) => slaInfo(db, c).ageDays / db.settings.slaDays[c.category]),
    ...closedStudents.map((s) => (new Date(s.closedAt!).getTime() - new Date(s.createdAt).getTime()) / DAY / db.settings.slaDays[s.category]),
  ];
  const med = ratios.length ? median(ratios) : null;
  const breached = cases.filter((c) => (c.status === "Disposed" ? slaInfo(db, c).withinSla === false : slaInfo(db, c).state === "breached")).length + students.filter((s) => (s.closedAt ?? new Date(now).toISOString()) > s.dueAt).length;
  const breachN = cases.length + students.length;
  const proofed = students.filter((s) => s.proof);
  const reopened = students.filter((s) => s.reopened).length;
  const verified = students.filter((s) => s.status === "Closed - Verified").length;
  const unverified = students.filter((s) => s.status === "Closed - Unverified").length;
  const verifyN = verified + unverified + reopened;
  const p = db.pulse.find((x) => x.institutionId === inst.id && x.term === PULSE_TERM);
  const pulseMean = p && p.responded ? (p.sums.infrastructure + p.sums.faculty + p.sums.fees + p.sums.safety) / (4 * p.responded) : null;
  const sig = db.signals.find((x) => x.institutionId === inst.id);
  const none: Raw = { risk: null, value: "No data", n: 0 };
  const validDays = sig ? Math.floor((new Date(sig.complianceValidUntil).getTime() - now) / DAY) : 0;
  return {
    resolution: med === null ? none : { risk: clamp((med - 0.3) / 0.9), value: `${Math.round(med * 100)}% of SLA`, n: ratios.length },
    sla: breachN ? { risk: clamp(breached / breachN / 0.5), value: `${pctText(breached / breachN)} of ${breachN}`, n: breachN } : none,
    reopen: proofed.length ? { risk: clamp(reopened / proofed.length / 0.5), value: `${reopened} of ${proofed.length}`, n: proofed.length } : none,
    verified: verifyN ? { risk: 1 - verified / verifyN, value: `${pctText(verified / verifyN)} verified`, n: verifyN } : none,
    unverified: verifyN ? { risk: clamp(unverified / verifyN / 0.5), value: `${unverified} of ${verifyN}`, n: verifyN } : none,
    pulse: pulseMean === null ? none : { risk: clamp((5 - pulseMean) / 4), value: `${pulseMean.toFixed(1)} of 5`, n: p!.responded },
    unable: p && p.responded ? { risk: clamp(p.unable / p.responded / 0.5), value: `${pctText(p.unable / p.responded)} of ${p.responded}`, n: p.responded } : none,
    intake: sig ? { risk: clamp((sig.actualIntake / inst.approvedIntake - 1) / 0.25), value: `${sig.actualIntake} of ${inst.approvedIntake} approved`, n: 1 } : none,
    fee: sig ? { risk: clamp((sig.feeCharged / sig.feeNorm - 1) / 0.5), value: `Rs ${sig.feeCharged.toLocaleString("en-IN")} vs Rs ${sig.feeNorm.toLocaleString("en-IN")}`, n: 1 } : none,
    compliance: sig ? { risk: validDays < 0 ? 1 : validDays < 60 ? 0.5 : 0, value: validDays < 0 ? `Expired ${-validDays}d ago` : `Valid ${validDays}d more`, n: 1 } : none,
  };
}

let cache: { key: string; results: Map<string, RiskResult> } | null = null;

export function allRisk(db: Db): Map<string, RiskResult> {
  const key = `${db.version}:${Math.floor(Date.now() / (6 * 3600000))}`;
  if (cache?.key === key) return cache.results;

  // anti-gaming: suspicious bursts are excluded, overlap clusters count once, and one student counts at most 3 times
  const bursts = detectBursts(db);
  const burstIds = new Set(bursts.flatMap((b) => b.caseIds));
  const { clusters } = detectOverlaps(db);
  const stats = new Map<string, Record<string, Raw>>();
  const context = new Map<string, { counted: number; excluded: number; merged: number; capped: number; students: number; handled: number }>();
  for (const inst of db.institutions) {
    const all = db.cases.filter((c) => c.institutionId === inst.id);
    const cases = all.filter((c) => !burstIds.has(c.id));
    const perStudent = new Map<string, number>();
    let capped = 0;
    const students = db.studentComplaints.filter((s) => {
      if (s.institutionId !== inst.id) return false;
      const n = (perStudent.get(s.studentId) ?? 0) + 1;
      perStudent.set(s.studentId, n);
      if (n > 3) capped++;
      return n <= 3;
    });
    const merged = clusters.filter((cl) => cl.institutionId === inst.id).reduce((sum, cl) => sum + cl.caseIds.filter((id) => cases.some((c) => c.id === id)).length - 1, 0);
    stats.set(inst.id, rawFactors(db, inst, cases, students));
    context.set(inst.id, {
      counted: Math.max(0, cases.length - Math.max(0, merged)) + students.length,
      excluded: all.length - cases.length,
      merged: Math.max(0, merged),
      capped,
      students: students.length,
      handled: cases.filter((c) => c.status === "Disposed").length + students.filter((s) => s.closedAt).length,
    });
  }

  const peersOf = (inst: Institution) => {
    const same = db.institutions.filter((i) => i.region === inst.region && i.type === inst.type);
    if (same.length >= 3) return { label: `${inst.type}, ${inst.region} region`, list: same };
    const type = db.institutions.filter((i) => i.type === inst.type);
    if (type.length >= 3) return { label: `${inst.type} institutions nationally`, list: type };
    return { label: "All institutions", list: db.institutions };
  };
  const peerMean = (list: Institution[], k: string) => {
    let sum = 0;
    let n = 0;
    for (const i of list) {
      const r = stats.get(i.id)![k];
      if (r.risk !== null) {
        sum += r.risk * r.n;
        n += r.n;
      }
    }
    return n ? sum / n : 0.4;
  };

  const results = new Map<string, RiskResult>();
  for (const inst of db.institutions) {
    const peers = peersOf(inst);
    const raw = stats.get(inst.id)!;
    const factors: RiskFactor[] = SPECS.map((sp) => {
      const r = raw[sp.key];
      const peer = peerMean(peers.list, sp.key);
      // Bayesian smoothing: a small sample stays near the peer mean; no data sits at the peer mean, never at zero
      const shrunk = r.risk === null ? peer : sp.prior === 0 ? r.risk : (r.n * r.risk + sp.prior * peer) / (r.n + sp.prior);
      return { key: sp.key, label: sp.label, group: sp.group, weight: sp.weight, value: r.value, n: r.n, risk: Math.round(shrunk * 100), peerRisk: Math.round(peer * 100), contribution: Math.round(shrunk * sp.weight * 1000) / 10 };
    });
    const score = Math.round(factors.reduce((s, f) => s + f.contribution, 0));
    const ctx = context.get(inst.id)!;
    const p = db.pulse.find((x) => x.institutionId === inst.id && x.term === PULSE_TERM);
    const rate = p && p.invited ? p.responded / p.invited : 0;
    const unablePct = p && p.responded ? p.unable / p.responded : 0;
    const silent = !!p && rate < 0.1 && unablePct >= 0.4;
    const confidenceReasons: string[] = [
      `${ctx.handled} closed complaint${ctx.handled === 1 ? "" : "s"} to judge handling from`,
      `${ctx.students} complaint${ctx.students === 1 ? "" : "s"} through the student portal`,
      p ? `${p.responded} pulse responses (${pctText(rate)} of ${p.invited} invited)` : "no pulse survey this term",
    ];
    let confidence: Confidence = "Low";
    if (!silent) {
      if (ctx.handled >= 8 && ctx.students >= 3 && (p?.responded ?? 0) >= 30 && rate >= 0.15) confidence = "High";
      else if (ctx.handled >= 4 && (ctx.students >= 2 || (p?.responded ?? 0) >= 15)) confidence = "Medium";
    }
    const flags: string[] = [];
    if (silent) flags.push(`Silence warning: only ${pctText(rate)} of invited students responded and ${pctText(unablePct)} of them felt unable to complain. Few complaints here is not evidence of good handling.`);
    if (ctx.excluded) flags.push(`${ctx.excluded} complaint(s) from a suspicious 72-hour burst were excluded from the score; verify their genuineness.`);
    if (ctx.merged) flags.push(`${ctx.merged} overlapping case(s) merged so the same issue counts once.`);
    if (ctx.capped) flags.push(`${ctx.capped} complaint(s) ignored by the cap of 3 per student.`);

    results.set(inst.id, {
      institutionId: inst.id,
      score,
      band: confidence === "Low" ? INSUFFICIENT : score >= 42 ? "Elevated concern" : score >= 28 ? "Moderate concern" : "Lower concern",
      confidence,
      confidenceReasons,
      factors,
      why: [],
      flags,
      context: { complaintsPer1000: Math.round((ctx.counted / inst.enrolment) * 10000) / 10, countedComplaints: ctx.counted, enrolment: inst.enrolment },
      pulse: p
        ? {
            term: p.term,
            invited: p.invited,
            responded: p.responded,
            responseRate: Math.round(rate * 100),
            means: p.responded ? { Infrastructure: p.sums.infrastructure / p.responded, Faculty: p.sums.faculty / p.responded, Fees: p.sums.fees / p.responded, Safety: p.sums.safety / p.responded } : null,
            unablePct: Math.round(unablePct * 100),
          }
        : null,
      peer: { label: peers.label, count: peers.list.length, average: 0, rank: 0 },
    });
  }

  for (const inst of db.institutions) {
    const r = results.get(inst.id)!;
    const peers = peersOf(inst).list.map((i) => results.get(i.id)!.score);
    r.peer.average = Math.round(peers.reduce((a, b) => a + b, 0) / peers.length);
    r.peer.rank = peers.filter((s) => s > r.score).length + 1;
    const gaps = r.factors.map((f) => ({ f, gap: (f.risk - f.peerRisk) * f.weight })).sort((a, b) => b.gap - a.gap);
    const worse = gaps.filter((g) => g.gap > 0.3).slice(0, 3);
    const better = gaps.filter((g) => g.gap < -0.3).slice(-1);
    r.why = [
      ...worse.map((g) => `Worse than peers: ${g.f.label}, ${g.f.value} (adds ${g.f.contribution} points).`),
      ...better.map((g) => `Better than peers: ${g.f.label}, ${g.f.value}.`),
      `Complaint volume is not scored: ${r.context.complaintsPer1000} per 1,000 students is shown for context only, so few complaints cannot raise a college's standing.`,
      r.confidence === "Low" ? "Too little evidence to rate this college. Missing factors sit at the peer average, so treat the number as provisional." : `Small samples are pulled towards the ${r.peer.label} average, so a few cases cannot swing the score.`,
    ];
  }
  cache = { key, results };
  return results;
}

export const riskFor = (db: Db, id: string) => allRisk(db).get(id);
