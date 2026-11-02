import { z } from "zod";
import { parseQuery, withApi } from "@/lib/api";
import { getDb } from "@/lib/store";
import { json, viewerFrom, visibleIds } from "@/lib/server";
import { REPORT_KEYS, buildReport } from "@/lib/analytics";

export const dynamic = "force-dynamic";

async function handleGET(req: Request) {
  const db = getDb();
  const v = viewerFrom(req, db);
  const vis = visibleIds(db, v);
  const query = parseQuery(req, z.object({ type: z.string().max(20).optional(), from: z.string().max(10).optional(), to: z.string().max(10).optional() }));
  const type = query.type ?? "bureau";
  const { from, to } = query;
  let cases = db.cases.filter((c) => vis.has(c.id));
  if (from) cases = cases.filter((c) => c.dateReceived >= from);
  if (to) cases = cases.filter((c) => c.dateReceived.slice(0, 10) <= to);
  return json({ report: buildReport(db, cases, type, vis), types: REPORT_KEYS.map(([key, label]) => ({ key, label })) });
}

export const GET = withApi(handleGET);
