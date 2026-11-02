import { z } from "zod";
import { ApiError, parseJson, parseQuery, withApi } from "@/lib/api";
import { audit, getDb, mutate } from "@/lib/store";
import { json, officerName, viewerFrom } from "@/lib/server";
import { deskView, escalateToAicte, returnToCollege, sweepStudentLayer } from "@/lib/student";
import { ROLES, type Viewer } from "@/lib/roles";
import { decryptField } from "@/lib/vault";
import type { Db, StudentComplaint } from "@/lib/types";

export const dynamic = "force-dynamic";

function inScope(db: Db, v: Viewer, s: StudentComplaint) {
  const def = ROLES[v.role];
  if (v.role === "ro") return db.institutions.find((i) => i.id === s.institutionId)?.region === v.region;
  return def.bureaus === "all" || def.bureaus.includes(s.routedBureau);
}

const Query = z.object({ q: z.string().max(120).optional(), filter: z.enum(["", "escalated", "flagged", "unverified", "college", "overlap", "critical"]).optional() });
const Body = z.object({
  action: z.enum(["reveal", "register", "return", "ack-deletion"]),
  id: z.string().max(40),
  reason: z.string().trim().max(1000).optional(),
  directions: z.string().trim().max(2000).optional(),
});

export const GET = withApi(async (req) => {
  sweepStudentLayer();
  const db = getDb();
  const v = viewerFrom(req, db);
  const isCa = v.role === "ca";
  const { q: rawQ, filter } = parseQuery(req, Query);
  const q = (rawQ ?? "").toLowerCase().trim();
  const scoped = db.studentComplaints.filter((s) => inScope(db, v, s));
  const items = scoped
    .filter((s) => {
      switch (filter) {
        case "escalated":
          return s.status === "Escalated to AICTE";
        case "flagged":
          return s.suspicious.length > 0;
        case "unverified":
          return s.status === "Closed - Unverified";
        case "college":
          return s.status === "With College" || s.status === "Resolved - Pending Verification";
        case "critical":
          return !!s.criticalFlag;
        case "overlap":
          return isCa && s.overlapFlags.length > 0;
        default:
          return true;
      }
    })
    .map((s) => deskView(db, s, isCa))
    .filter((s) => !q || `${s.id} ${s.pseudonym} ${s.institution} ${s.subject} ${s.category}`.toLowerCase().includes(q))
    .sort((a, b) => Number(!!b.criticalFlag) - Number(!!a.criticalFlag) || Number(b.status === "Escalated to AICTE") - Number(a.status === "Escalated to AICTE") || b.urgency.score - a.urgency.score)
    .slice(0, 150);
  return json({
    items,
    canReveal: isCa,
    canAct: ROLES[v.role].can.act,
    deletionRequests: isCa ? db.deletionRequests.map(({ studentId, ...r }) => r) : [],
    stats: {
      total: scoped.length,
      withCollege: scoped.filter((s) => s.status === "With College").length,
      pending: scoped.filter((s) => s.status === "Resolved - Pending Verification").length,
      escalated: scoped.filter((s) => s.status === "Escalated to AICTE").length,
      verified: scoped.filter((s) => s.status === "Closed - Verified").length,
      unverified: scoped.filter((s) => s.status === "Closed - Unverified").length,
      flagged: scoped.filter((s) => s.suspicious.length).length,
      critical: scoped.filter((s) => s.criticalFlag).length,
      overlap: isCa ? scoped.filter((s) => s.overlapFlags.length).length : 0,
    },
  });
});

export const POST = withApi(async (req) => {
  const db = getDb();
  const v = viewerFrom(req, db);
  const body = await parseJson(req, Body);

  if (body.action === "ack-deletion") {
    if (v.role !== "ca") throw new ApiError(403, "Only the Competent Authority handles deletion requests");
    mutate((d) => {
      const r = d.deletionRequests.find((x) => x.id === body.id);
      if (!r) throw new ApiError(404, "Request not found");
      r.status = "Acknowledged";
      audit(d, { role: v.role, actor: officerName(d, v), action: "DELETION_ACK", target: r.id, detail: `Deletion request from ${r.pseudonym} acknowledged` });
    });
    return json({ ok: true });
  }

  const s = db.studentComplaints.find((x) => x.id === body.id);
  if (!s || !inScope(db, v, s)) throw new ApiError(404, "Complaint not found in your scope");
  const reason = body.reason ?? "";

  if (body.action === "reveal") {
    if (v.role !== "ca") throw new ApiError(403, "Only the Competent Authority can reveal a student's identity");
    if (reason.length < 5) throw new ApiError(400, "A reason is mandatory; it is written to the audit trail");
    const student = db.students.find((x) => x.id === s.studentId)!;
    mutate((d) => audit(d, { role: v.role, actor: officerName(d, v), action: "IDENTITY_REVEAL", target: s.id, detail: `Revealed identity of ${s.pseudonym}. Reason: ${reason}` }));
    return json({ identity: { name: decryptField(student.name), mobile: decryptField(student.mobile), rollNo: decryptField(student.rollNo), apaarId: student.apaarId } });
  }

  if (!ROLES[v.role].can.act) throw new ApiError(403, "Your role cannot act on this complaint");
  if (s.status !== "Escalated to AICTE") throw new ApiError(400, "Only complaints escalated to AICTE can be handled here");

  if (body.action === "register") {
    const c = mutate((d) => {
      const x = d.studentComplaints.find((y) => y.id === s.id)!;
      const cs = escalateToAicte(d, x, x.reopened ? "student marked the college's resolution as Not done" : "overdue at the college");
      audit(d, { role: v.role, actor: officerName(d, v), action: "STUDENT_CASE_REGISTERED", target: x.id, detail: `Registered as ${cs.id}` });
      return cs;
    });
    return json({ caseId: c.id });
  }

  const directions = body.directions ?? "";
  if (directions.length < 5) throw new ApiError(400, "Directions to the college are mandatory");
  const c = mutate((d) => {
    const x = d.studentComplaints.find((y) => y.id === s.id)!;
    const by = officerName(d, v);
    const cs = returnToCollege(d, x, directions, by);
    audit(d, { role: v.role, actor: by, action: "STUDENT_RETURNED_TO_COLLEGE", target: x.id, detail: `Round ${x.round}, case ${cs.id}: ${directions}` });
    return cs;
  });
  return json({ caseId: c.id });
});
