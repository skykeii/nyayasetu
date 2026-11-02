import { z } from "zod";
import { ApiError, parseJson, withApi } from "@/lib/api";
import { audit, getDb, mutate } from "@/lib/store";
import { json } from "@/lib/server";
import { applyVerdict, studentFrom, studentView } from "@/lib/student";

export const dynamic = "force-dynamic";

const Body = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("done"), reason: z.string().trim().max(1000).optional() }),
  z.object({ decision: z.literal("not_done"), reason: z.string({ error: "Say why the problem is not fixed" }).trim().min(5, "Say why the problem is not fixed").max(1000) }),
]);

/** The student's verdict on the college's proof. It is asked again every round. */
export const POST = withApi<{ id: string }>(async (req, { params }) => {
  const db = getDb();
  const s = studentFrom(req, db);
  const c = db.studentComplaints.find((x) => x.id === params.id && x.studentId === s.id);
  if (!c) throw new ApiError(404, "Complaint not found");
  if (c.status !== "Resolved - Pending Verification") throw new ApiError(400, "This complaint is not waiting for your verdict");
  const body = await parseJson(req, Body);
  const out = mutate((d) => {
    const x = d.studentComplaints.find((y) => y.id === c.id)!;
    applyVerdict(d, x, body.decision, body.reason ?? "");
    audit(d, { role: "student", actor: s.pseudonym, action: body.decision === "done" ? "STUDENT_VERIFIED" : "STUDENT_NOT_DONE", target: x.id, detail: `Round ${x.round}${x.caseId ? `, AICTE case ${x.caseId}` : ""}${x.criticalFlag ? ", flagged Critical" : ""}` });
    return studentView(d, x);
  });
  return json({ complaint: out });
});
