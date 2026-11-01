import type { Institution } from "./types";
import { nameSimilarity, pidSimilarity } from "./text";

export interface Resolution {
  institutionId: string | null;
  confidence: number;
  reason: string;
  candidates: { id: string; name: string; score: number }[];
}

/** Resolve a complainant-supplied institution reference to the master institution list. Advisory. */
export function resolveInstitution(insts: Institution[], name: string, pid?: string): Resolution {
  const scored = insts.map((i) => {
    const p = pidSimilarity(pid, i.id);
    const n = nameSimilarity(name, i.name, [i.city.toLowerCase(), i.state.toLowerCase()]);
    const nShort = nameSimilarity(name, `${i.shortName} ${i.city}`);
    const ns = Math.max(n.score, nShort.score);
    const cityHit = name.toLowerCase().includes(i.city.toLowerCase()) ? 0.05 : 0;
    let score = Math.max(p === 1 ? 0.97 : p * 0.85, ns + cityHit);
    if (p >= 0.75 && ns >= 0.6) score = Math.max(score, 0.95);
    let reason =
      p === 1
        ? "Permanent ID exact match"
        : p > 0 && ns >= 0.6
        ? `Permanent ID near-match (likely typo) + name ${n.how}`
        : `Name ${ns === nShort.score && nShort.score > n.score ? "acronym/short-name" : n.how} (${Math.round(ns * 100)}%)`;
    if (cityHit && p !== 1) reason += ", city matches";
    return { id: i.id, name: i.name, score: Math.min(1, score), reason };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const ok = best && best.score >= 0.6;
  return {
    institutionId: ok ? best.id : null,
    confidence: ok ? Math.round(best.score * 100) / 100 : 0,
    reason: ok ? best.reason : "No confident match — manual mapping required",
    candidates: scored.slice(0, 3).map(({ id, name, score }) => ({ id, name, score: Math.round(score * 100) / 100 })),
  };
}
