import { getDb } from "@/lib/store";
import { json, viewerFrom, visibleIds } from "@/lib/server";
import { REPORT_KEYS, buildReport } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const db = getDb();
  const v = viewerFrom(req, db);
  const vis = visibleIds(db, v);
  const u = new URL(req.url);
  const type = u.searchParams.get("type") ?? "bureau";
  const from = u.searchParams.get("from");
  const to = u.searchParams.get("to");
  let cases = db.cases.filter((c) => vis.has(c.id));
  if (from) cases = cases.filter((c) => c.dateReceived >= from);
  if (to) cases = cases.filter((c) => c.dateReceived.slice(0, 10) <= to);
  return json({ report: buildReport(db, cases, type, vis), types: REPORT_KEYS.map(([key, label]) => ({ key, label })) });
}
