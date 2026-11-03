import { withApi } from "@/lib/api";
import { getDb } from "@/lib/store";
import { json, slaInfo, studentsInScope, viewerFrom, visibleIds } from "@/lib/server";
import { countOnce } from "@/lib/student";
import type { Case, StudentComplaint } from "@/lib/types";
import { DAY } from "@/lib/util";

export const dynamic = "force-dynamic";

async function handleGET(req: Request) {
  const db = getDb();
  const v = viewerFrom(req, db);
  const vis = visibleIds(db, v);
  const insts = v.role === "ro" ? db.institutions.filter((i) => i.region === v.region) : db.institutions;
  // student-portal complaints count too (once each), for the roles that may see them
  const students = countOnce(studentsInScope(db, v));
  const now = Date.now();
  const measure = <T extends string>(group: (i: (typeof insts)[number]) => T) => {
    const map = new Map<T, { key: T; region: string; enrolment: number; institutions: number; cases: Case[]; students: StudentComplaint[] }>();
    for (const i of insts) {
      const key = group(i);
      const row = map.get(key) ?? { key, region: i.region, enrolment: 0, institutions: 0, cases: [], students: [] };
      row.enrolment += i.enrolment;
      row.institutions++;
      row.cases.push(...db.cases.filter((c) => c.institutionId === i.id && vis.has(c.id)));
      row.students.push(...students.filter((s) => s.institutionId === i.id));
      map.set(key, row);
    }
    return [...map.values()].map(({ cases, students: stu, ...r }) => {
      const open = cases.filter((c) => c.status !== "Disposed");
      const stuOpen = stu.filter((s) => !s.status.startsWith("Closed"));
      const total = cases.length + stu.length;
      const openCount = open.length + stuOpen.length;
      const ages = [...open.map((c) => slaInfo(db, c).ageDays), ...stuOpen.map((s) => Math.floor((now - new Date(s.createdAt).getTime()) / DAY))];
      return {
        ...r,
        total,
        open: openCount,
        students: stu.length,
        overdue: open.filter((c) => slaInfo(db, c).state === "breached").length + stuOpen.filter((s) => s.status === "With College" && new Date(s.dueAt).getTime() < now).length,
        density: r.enrolment ? Math.round((total / r.enrolment) * 10000) / 10 : 0,
        ageing: ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : 0,
        disposal: total ? Math.round(((total - openCount) / total) * 100) : 0,
      };
    });
  };
  return json({ states: measure((i) => i.state), regions: measure((i) => i.region) });
}

export const GET = withApi(handleGET);
