import { z } from "zod";
import { ApiError, parseJson, withApi } from "@/lib/api";
import { explainOverlap } from "@/lib/groq";
import { rateLimit } from "@/lib/ratelimit";
import { json, viewerFrom, visibleIds } from "@/lib/server";
import { getDb } from "@/lib/store";

export const dynamic = "force-dynamic";

const Body = z.object({
  a: z.string().max(40),
  b: z.string().max(40).optional(),
  draft: z.object({ subject: z.string().max(200), text: z.string().max(6000), bureau: z.string().max(10) }).optional(),
  score: z.number().min(0).max(1),
  reasons: z.array(z.string().max(400)).max(8).optional(),
});

/** Plain-language explanation of a match. Advisory: it never changes the score or links anything. */
export const POST = withApi(async (req) => {
  const db = getDb();
  const v = viewerFrom(req, db);
  rateLimit(`ai:${v.accountId}`, 30, 60000);
  const body = await parseJson(req, Body);
  const vis = visibleIds(db, v);
  const load = (id: string) => {
    const c = db.cases.find((x) => x.id === id);
    if (!c || !vis.has(c.id)) throw new ApiError(404, "Case not found in your scope");
    return { subject: c.subject, text: c.description, bureau: c.bureau };
  };
  const a = load(body.a);
  const b = body.b ? load(body.b) : body.draft;
  if (!b) throw new ApiError(400, "Two complaints are needed");
  const ai = await explainOverlap(a, b, body.score);
  if (ai) return json({ ...ai, source: "groq" });
  const reasons = (body.reasons ?? []).slice(0, 2);
  return json({ explanation: reasons.length ? reasons.join(" ") : "The match engine scored these as similar on institution and complaint text.", source: "offline" });
});
