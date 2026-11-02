import type { BureauCode, Case, Db } from "./types";
import { buildTfidf, cosine, nameSimilarity, normName, pidSimilarity, tokenizeText } from "./text";
import { DAY, hashStr } from "./util";

export interface PairMatch {
  a: string;
  b: string;
  confidence: number;
  instScore: number;
  textScore: number;
  sameCategory: boolean;
  reasons: string[];
  kind: "cross-bureau" | "duplicate";
}

export interface OverlapCluster {
  id: string;
  institutionId: string;
  caseIds: string[];
  bureaus: BureauCode[];
  kind: "cross-bureau" | "duplicate";
  confidence: number;
  pairs: PairMatch[];
  status: "Open" | "Linked" | "Coordinated";
  linkGroupId?: string;
  newestAt: string;
}

export interface Burst {
  institutionId: string;
  caseIds: string[];
  from: string;
  to: string;
  similarText: boolean;
}

let cache: { key: string; clusters: OverlapCluster[]; pairs: PairMatch[] } | null = null;

export function pairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function detectOverlaps(db: Db): { clusters: OverlapCluster[]; pairs: PairMatch[] } {
  const key = `${db.version}:${db.settings.overlapMinConfidence}:${db.cases.length}`;
  if (cache && cache.key === key) return { clusters: cache.clusters, pairs: cache.pairs };
  const { clusters, pairs } = computeOverlaps(db);
  cache = { key, clusters, pairs };
  return { clusters, pairs };
}

/** Scores a complaint not saved yet against all open cases. Scores from 50% are returned for a human to review. */
export function matchDraft(db: Db, draft: Case) {
  const { pairs } = computeOverlaps({ ...db, cases: [...db.cases, draft], settings: { ...db.settings, overlapMinConfidence: 0.5 } });
  return pairs.filter((p) => p.a === draft.id || p.b === draft.id);
}

function computeOverlaps(db: Db): { clusters: OverlapCluster[]; pairs: PairMatch[] } {
  const instById = new Map(db.institutions.map((i) => [i.id, i]));
  const open = db.cases.filter((c) => c.status !== "Disposed");
  const excludeFor = (c: Case) => {
    const inst = instById.get(c.institutionId);
    const words = [...normName(c.reportedName), ...(inst ? [...normName(inst.name), ...normName(inst.city), ...normName(inst.shortName)] : [])];
    return new Set(words.flatMap((w) => [w, w.replace(/s$/, "")]));
  };
  const vecs = buildTfidf(open.map((c) => tokenizeText(`${c.subject} ${c.description}`, excludeFor(c))));
  const dismissed = new Set(db.dismissedPairs);
  const minConf = db.settings.overlapMinConfidence;
  const pairs: PairMatch[] = [];

  for (let i = 0; i < open.length; i++) {
    for (let j = i + 1; j < open.length; j++) {
      const A = open[i];
      const B = open[j];
      if (dismissed.has(pairKey(A.id, B.id))) continue;
      const instA = instById.get(A.institutionId);
      const reasons: string[] = [];
      const p = pidSimilarity(A.reportedPid, B.reportedPid);
      const sameResolved = A.institutionId === B.institutionId;
      let instScore = 0;
      if (p === 1) {
        instScore = 1;
        reasons.push(`Same AICTE Permanent ID quoted (${A.reportedPid})`);
      } else if (p > 0) {
        instScore = Math.max(instScore, p);
        reasons.push(`Permanent IDs differ by ${p >= 0.75 ? 1 : 2} digit(s): ${A.reportedPid} vs ${B.reportedPid} (likely typo)`);
      }
      const ns = nameSimilarity(A.reportedName, B.reportedName, instA ? [instA.city.toLowerCase(), instA.state.toLowerCase()] : []);
      if (!sameResolved && ns.score < 0.75 && p === 0) continue;
      if (ns.score >= 0.6 && A.reportedName !== B.reportedName) {
        reasons.push(`Institution names match ${Math.round(ns.score * 100)}% by ${ns.how}: “${A.reportedName}” ≈ “${B.reportedName}”`);
      } else if (A.reportedName === B.reportedName) {
        reasons.push(`Identical institution name: “${A.reportedName}”`);
      }
      instScore = Math.max(instScore, ns.score);
      if (sameResolved) {
        const rc = Math.min(A.matchConfidence, B.matchConfidence);
        if (rc > instScore) {
          instScore = rc;
          reasons.push(`Both mapped to ${A.institutionId} in institution master (resolution ${Math.round(rc * 100)}%)`);
        }
      }
      if (instScore < 0.75) continue;
      const cos = cosine(vecs[i], vecs[j]);
      const sameCategory = A.category === B.category;
      const conf = Math.min(0.99, 0.5 * instScore + 0.35 * Math.min(1, cos.score / 0.3) + 0.15 * (sameCategory ? 1 : 0));
      const cross = A.bureau !== B.bureau;
      const flagged = cross ? conf >= minConf : conf >= Math.max(minConf, 0.8) && cos.score >= 0.45;
      if (!flagged) continue;
      if (cos.score > 0.04) reasons.push(`Complaint text similarity ${Math.round(cos.score * 100)}% (TF-IDF cosine; shared terms: ${cos.shared.join(", ")})`);
      if (sameCategory) reasons.push(`Same category: ${A.category}`);
      if (cross) reasons.push(`Handled by different units: ${A.bureau} (${A.reference}) and ${B.bureau} (${B.reference})`);
      else reasons.push(`Both with ${A.bureau} — possible duplicate registration`);
      pairs.push({
        a: A.id,
        b: B.id,
        confidence: Math.round(conf * 100) / 100,
        instScore: Math.round(instScore * 100) / 100,
        textScore: Math.round(cos.score * 100) / 100,
        sameCategory,
        reasons,
        kind: cross ? "cross-bureau" : "duplicate",
      });
    }
  }

  // union-find clusters
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    const p = parent.get(x)!;
    if (p === x) return x;
    const r = find(p);
    parent.set(x, r);
    return r;
  };
  for (const p of pairs) parent.set(find(p.a), find(p.b));
  const groups = new Map<string, string[]>();
  for (const id of parent.keys()) {
    const r = find(id);
    groups.set(r, [...(groups.get(r) ?? []), id]);
  }
  const caseById = new Map(db.cases.map((c) => [c.id, c]));
  const clusters: OverlapCluster[] = [];
  for (const ids of groups.values()) {
    ids.sort();
    const cs = ids.map((id) => caseById.get(id)!);
    const bureaus = [...new Set(cs.map((c) => c.bureau))];
    const ps = pairs.filter((p) => ids.includes(p.a));
    const instCounts = new Map<string, number>();
    cs.forEach((c) => instCounts.set(c.institutionId, (instCounts.get(c.institutionId) ?? 0) + 1));
    const institutionId = [...instCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const gid = cs[0].linkGroupId;
    const group = gid && cs.every((c) => c.linkGroupId === gid) ? db.linkGroups.find((g) => g.id === gid) : undefined;
    clusters.push({
      id: `OVL-${hashStr(ids.join(",")).slice(0, 6).toUpperCase()}`,
      institutionId,
      caseIds: ids,
      bureaus,
      kind: bureaus.length > 1 ? "cross-bureau" : "duplicate",
      confidence: Math.max(...ps.map((p) => p.confidence)),
      pairs: ps,
      status: group ? group.status : "Open",
      linkGroupId: group?.id,
      newestAt: cs.map((c) => c.dateReceived).sort().at(-1)!,
    });
  }
  clusters.sort((a, b) => (a.status === "Open" ? 0 : 1) - (b.status === "Open" ? 0 : 1) || b.newestAt.localeCompare(a.newestAt));
  return { clusters, pairs };
}

/** Advisory: ≥5 complaints against one institution within 72h. */
export function detectBursts(db: Db): Burst[] {
  const byInst = new Map<string, Case[]>();
  for (const c of db.cases) byInst.set(c.institutionId, [...(byInst.get(c.institutionId) ?? []), c]);
  const out: Burst[] = [];
  for (const [instId, cs] of byInst) {
    const sorted = [...cs].sort((a, b) => a.dateReceived.localeCompare(b.dateReceived));
    let best: Case[] = [];
    let lo = 0;
    for (let hi = 0; hi < sorted.length; hi++) {
      while (new Date(sorted[hi].dateReceived).getTime() - new Date(sorted[lo].dateReceived).getTime() > 3 * DAY) lo++;
      if (hi - lo + 1 > best.length) best = sorted.slice(lo, hi + 1);
    }
    if (best.length >= 5) {
      const texts = new Set(best.map((c) => c.description.replace(/^.*?\s(is|was)\s/, "")));
      out.push({ institutionId: instId, caseIds: best.map((c) => c.id), from: best[0].dateReceived, to: best.at(-1)!.dateReceived, similarText: texts.size <= Math.ceil(best.length / 2) });
    }
  }
  return out;
}

export function clustersForCase(db: Db, caseId: string) {
  return detectOverlaps(db).clusters.filter((c) => c.caseIds.includes(caseId));
}
