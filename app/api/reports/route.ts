import { z } from "zod";
import { parseQuery, withApi } from "@/lib/api";
import { getDb } from "@/lib/store";
import { json, studentsInScope, viewerFrom, visibleIds } from "@/lib/server";
import { countOnce } from "@/lib/student";
import { CATEGORIES } from "@/lib/types";
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
  // student-portal complaints counted once (registered ones are already in the case figures)
  let stu = countOnce(studentsInScope(db, v));
  if (from) stu = stu.filter((s) => s.createdAt >= from);
  if (to) stu = stu.filter((s) => s.createdAt.slice(0, 10) <= to);
  const students =
    v.role === "ca" || v.role === "ro"
      ? {
          counted: stu.length,
          withCollege: stu.filter((s) => s.status === "With College").length,
          awaiting: stu.filter((s) => s.status === "Resolved - Pending Verification").length,
          escalated: stu.filter((s) => s.status === "Escalated to AICTE").length,
          closed: stu.filter((s) => s.status.startsWith("Closed")).length,
          byCategory: CATEGORIES.map((category) => ({ category, count: stu.filter((s) => s.category === category).length })).filter((x) => x.count > 0),
        }
      : null;
  return json({ report: buildReport(db, cases, type, vis), students, types: REPORT_KEYS.map(([key, label]) => ({ key, label })) });
}

export const GET = withApi(handleGET);
