const STOP = new Set(
  `a an the and or of to in on at for from by with is are was were be been has have had it its this that these those as
  not no but if then than so such very can will would shall should may might must also only even over under about into
  i me my we our us you your he she his her they them their who whom which what when where why how all any each both
  some more most other same per via please kindly sir madam respected regarding matter issue complaint college institute
  institution student students received reference ref dated said being done did does do up out new one two etc
  rs inr lakh lakhs year years month months day days`.split(/\s+/)
);

const NAME_STOP = new Set(
  `institute institution college of and the technology technological engineering engg school management studies pharmacy
  polytechnic architecture planning computer applications sciences science research group institutions pvt ltd private
  limited university business inst coll tech mgmt dept campus`.split(/\s+/)
);

const ABBR: Record<string, string> = {
  inst: "institute",
  instt: "institute",
  "inst.": "institute",
  tech: "technology",
  engg: "engineering",
  eng: "engineering",
  coll: "college",
  clg: "college",
  mgmt: "management",
  "&": "and",
};

export function normName(s: string) {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => ABBR[t] ?? t);
}

export function distinctiveTokens(s: string, extraStop: string[] = []) {
  const ex = new Set(extraStop.map((x) => x.toLowerCase()));
  return normName(s).filter((t) => !NAME_STOP.has(t) && !ex.has(t) && t.length > 1);
}

export function acronym(s: string) {
  return normName(s)
    .filter((t) => !["of", "and", "the"].includes(t))
    .map((t) => t[0])
    .join("");
}

export function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export const levRatio = (a: string, b: string) => {
  const m = Math.max(a.length, b.length);
  return m === 0 ? 1 : 1 - levenshtein(a, b) / m;
};

/** Fuzzy institution-name similarity: normalized tokens + Levenshtein + acronym check. Returns 0..1 */
export function nameSimilarity(a: string, b: string, cityTokens: string[] = []): { score: number; how: string } {
  const ta = distinctiveTokens(a, cityTokens);
  const tb = distinctiveTokens(b, cityTokens);
  const fullA = normName(a).join(" ");
  const fullB = normName(b).join(" ");
  if (fullA === fullB) return { score: 1, how: "exact name" };

  // acronym: one side is a short all-caps-like token equal to the other's initials
  const acrA = acronym(a);
  const acrB = acronym(b);
  const rawA = normName(a);
  const rawB = normName(b);
  if (rawA.some((t) => t.length >= 3 && t === acrB) || rawB.some((t) => t.length >= 3 && t === acrA)) {
    return { score: 0.88, how: "acronym match" };
  }

  if (!ta.length || !tb.length) return { score: levRatio(fullA, fullB) * 0.8, how: "string distance" };
  let matched = 0;
  for (const x of ta) {
    let best = 0;
    for (const y of tb) best = Math.max(best, levRatio(x, y));
    if (best >= 0.78) matched += best;
  }
  const tokenScore = matched / Math.max(ta.length, tb.length);
  const strScore = levRatio(ta.join(" "), tb.join(" "));
  const score = Math.max(tokenScore, strScore);
  return { score, how: tokenScore >= strScore ? "token match" : "edit distance" };
}

export function pidSimilarity(a?: string, b?: string): number {
  if (!a || !b) return 0;
  const x = a.replace(/\D/g, "");
  const y = b.replace(/\D/g, "");
  if (x === y) return 1;
  const d = levenshtein(x, y);
  if (d === 1) return 0.75;
  if (d === 2) return 0.45;
  return 0;
}

const SURFACE = new Map<string, string>();
export const surface = (stemmed: string) => SURFACE.get(stemmed) ?? stemmed;

function stem(t: string) {
  if (t.length > 5 && t.endsWith("ing")) return t.slice(0, -3);
  if (t.length > 4 && t.endsWith("ed")) return t.slice(0, -2);
  if (t.length > 4 && t.endsWith("es")) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith("s")) return t.slice(0, -1);
  return t;
}

export function tokenizeText(s: string, exclude: Set<string> = new Set()) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t) && !/^\d+$/.test(t) && !exclude.has(t))
    .map((t) => {
      const s = stem(t);
      if (!SURFACE.has(s)) SURFACE.set(s, t);
      return s;
    });
}

export type Vec = Map<string, number>;

export function buildTfidf(docs: string[][]) {
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const N = docs.length;
  const idf = (t: string) => Math.log((N + 1) / ((df.get(t) ?? 0) + 1)) + 1;
  const vecs: Vec[] = docs.map((d) => {
    const tf = new Map<string, number>();
    for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);
    const v: Vec = new Map();
    let norm = 0;
    for (const [t, c] of tf) {
      const w = (1 + Math.log(c)) * idf(t);
      v.set(t, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [t, w] of v) v.set(t, w / norm);
    return v;
  });
  return vecs;
}

export function cosine(a: Vec, b: Vec): { score: number; shared: string[] } {
  let s = 0;
  const contrib: [string, number][] = [];
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  for (const [t, w] of small) {
    const w2 = big.get(t);
    if (w2) {
      s += w * w2;
      contrib.push([t, w * w2]);
    }
  }
  contrib.sort((x, y) => y[1] - x[1]);
  return { score: s, shared: contrib.slice(0, 5).map((c) => surface(c[0])) };
}
