import { z } from "zod";
import { ApiError, parseJson, withApi } from "@/lib/api";
import { caseBrief } from "@/lib/groq";
import { rateLimit } from "@/lib/ratelimit";
import { json, viewerFrom, visibleIds } from "@/lib/server";
import { getDb } from "@/lib/store";
import { fmtDate } from "@/lib/util";

export const dynamic = "force-dynamic";

export const POST = withApi(async (req) => {
  const db = getDb();
  const v = viewerFrom(req, db);
  rateLimit(`ai:${v.accountId}`, 30, 60000);
  const { id } = await parseJson(req, z.object({ id: z.string().max(40) }));
  const c = db.cases.find((x) => x.id === id);
  if (!c || !visibleIds(db, v).has(c.id)) throw new ApiError(404, "Case not found in your scope");
  const brief = await caseBrief({ subject: c.subject, category: c.category, status: c.status, description: c.description, history: c.actions.map((a) => `${fmtDate(a.at)} ${a.type}: ${a.remarks}`).join("\n") });
  if (brief) return json({ brief, source: "groq" });
  const counts = c.actions.filter((a) => a.type !== "Received").map((a) => a.type);
  const last = c.actions.at(-1);
  return json({
    brief: `${c.subject} (${c.category}), received ${fmtDate(c.dateReceived)}, now ${c.status} with ${c.bureau}. ${counts.length} recorded action${counts.length === 1 ? "" : "s"}${counts.length ? ` (${[...new Set(counts)].join(", ")})` : ""}. Latest on ${fmtDate(last?.at)}: ${last?.type}. Next: ${c.nextAction}`,
    source: "offline",
  });
});
