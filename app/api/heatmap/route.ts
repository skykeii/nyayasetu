import { getDb } from "@/lib/store";
import { json, slaInfo, viewerFrom, visibleIds } from "@/lib/server";
import type { Case } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const db = getDb();
  const v = viewerFrom(req, db);
  const vis = visibleIds(db, v);
  const insts = v.role === "ro" ? db.institutions.filter((i) => i.region === v.region) : db.institutions;
  const measure = <T extends string>(group: (i: (typeof insts)[number]) => T) => {
    const map = new Map<T, { key: T; region: string; enrolment: number; institutions: number; cases: Case[] }>();
    for (const i of insts) {
      const key = group(i);
      const row = map.get(key) ?? { key, region: i.region, enrolment: 0, institutions: 0, cases: [] };
      row.enrolment += i.enrolment;
      row.institutions++;
      row.cases.push(...db.cases.filter((c) => c.institutionId === i.id && vis.has(c.id)));
      map.set(key, row);
    }
    return [...map.values()].map(({ cases, ...r }) => {
      const open = cases.filter((c) => c.status !== "Disposed");
      const disposed = cases.length - open.length;
      return {
        ...r,
        total: cases.length,
        open: open.length,
        overdue: open.filter((c) => slaInfo(db, c).state === "breached").length,
        density: r.enrolment ? Math.round((cases.length / r.enrolment) * 10000) / 10 : 0,
        ageing: open.length ? Math.round(open.reduce((s, c) => s + slaInfo(db, c).ageDays, 0) / open.length) : 0,
        disposal: cases.length ? Math.round((disposed / cases.length) * 100) : 0,
      };
    });
  };
  return json({ states: measure((i) => i.state), regions: measure((i) => i.region) });
}
