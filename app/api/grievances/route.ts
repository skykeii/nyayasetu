import { audit, getDb, mutate } from "@/lib/store";
import { forbidden, json, officerName, viewerFrom } from "@/lib/server";
import { deskView, escalateToAicte, sweepStudentLayer } from "@/lib/student";
import { ROLES, type Viewer } from "@/lib/roles";
import type { Db, StudentComplaint } from "@/lib/types";

export const dynamic = "force-dynamic";

function inScope(db: Db, v: Viewer, s: StudentComplaint) {
  const def = ROLES[v.role];
  if (v.role === "ro") return db.institutions.find((i) => i.id === s.institutionId)?.region === v.region;
  return def.bureaus === "all" || def.bureaus.includes(s.routedBureau);
}

export async function GET(req: Request) {
  sweepStudentLayer();
  const db = getDb();
  const v = viewerFrom(req, db);
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") ?? "").toLowerCase().trim();
  const filter = u.searchParams.get("filter") ?? "";
  const scoped = db.studentComplaints.filter((s) => inScope(db, v, s));
  const items = scoped
    .filter((s) => (filter === "escalated" ? s.status === "Escalated to AICTE" : filter === "flagged" ? s.suspicious.length > 0 : filter === "unverified" ? s.status === "Closed - Unverified" : filter === "college" ? s.status === "With College" || s.status === "Resolved - Pending Verification" : true))
    .map((s) => deskView(db, s))
    .filter((s) => !q || `${s.id} ${s.pseudonym} ${s.institution} ${s.subject} ${s.category}`.toLowerCase().includes(q))
    .sort((a, b) => Number(b.status === "Escalated to AICTE") - Number(a.status === "Escalated to AICTE") || b.urgency.score - a.urgency.score)
    .slice(0, 150);
  return json({
    items,
    canReveal: v.role === "ca",
    canAct: ROLES[v.role].can.act,
    stats: {
      total: scoped.length,
      withCollege: scoped.filter((s) => s.status === "With College").length,
      pending: scoped.filter((s) => s.status === "Resolved - Pending Verification").length,
      escalated: scoped.filter((s) => s.status === "Escalated to AICTE").length,
      verified: scoped.filter((s) => s.status === "Closed - Verified").length,
      unverified: scoped.filter((s) => s.status === "Closed - Unverified").length,
      flagged: scoped.filter((s) => s.suspicious.length).length,
    },
  });
}

export async function POST(req: Request) {
  const db = getDb();
  const v = viewerFrom(req, db);
  const body = (await req.json().catch(() => ({}))) as { action?: string; id?: string; reason?: string };
  const s = db.studentComplaints.find((x) => x.id === body.id);
  if (!s || !inScope(db, v, s)) return json({ error: "Complaint not found in your scope" }, { status: 404 });
  const reason = (body.reason ?? "").trim();

  if (body.action === "reveal") {
    if (v.role !== "ca") return forbidden("Only the Competent Authority can reveal a student's identity");
    if (reason.length < 5) return json({ error: "A reason is mandatory; it is written to the audit trail" }, { status: 400 });
    const student = db.students.find((x) => x.id === s.studentId)!;
    mutate((d) => audit(d, { role: v.role, actor: officerName(d, v), action: "IDENTITY_REVEAL", target: s.id, detail: `Revealed identity of ${s.pseudonym}. Reason: ${reason}` }));
    return json({ identity: { name: student.name, mobile: student.mobile, rollNo: student.rollNo, apaarId: student.apaarId } });
  }

  if (body.action === "register") {
    if (!ROLES[v.role].can.act) return forbidden("Your role cannot register AICTE cases");
    if (s.status !== "Escalated to AICTE") return json({ error: "Only complaints escalated to AICTE can be registered" }, { status: 400 });
    const c = mutate((d) => {
      const x = d.studentComplaints.find((y) => y.id === s.id)!;
      const cs = escalateToAicte(d, x, x.reopened ? "student marked the college's resolution as Not done" : "overdue at the college");
      audit(d, { role: v.role, actor: officerName(d, v), action: "STUDENT_CASE_REGISTERED", target: x.id, detail: `Registered as ${cs.id}` });
      return cs;
    });
    return json({ caseId: c.id });
  }
  return json({ error: "Unknown action" }, { status: 400 });
}
