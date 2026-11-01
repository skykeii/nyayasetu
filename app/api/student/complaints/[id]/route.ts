import { audit, getDb, mutate } from "@/lib/store";
import { json } from "@/lib/server";
import { escalateToAicte, studentFrom, studentView } from "@/lib/student";

export const dynamic = "force-dynamic";

/** The student's Done / Not done decision on the college's proof. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const db = getDb();
  const s = studentFrom(req, db);
  if (!s) return json({ error: "Please sign in" }, { status: 401 });
  const c = db.studentComplaints.find((x) => x.id === params.id && x.studentId === s.id);
  if (!c) return json({ error: "Complaint not found" }, { status: 404 });
  if (c.status !== "Resolved - Pending Verification") return json({ error: "This complaint is not waiting for your verification" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { decision?: string; note?: string };
  if (body.decision !== "done" && body.decision !== "not_done") return json({ error: "Choose Done or Not done" }, { status: 400 });
  const note = (body.note ?? "").trim();
  const out = mutate((d) => {
    const x = d.studentComplaints.find((y) => y.id === c.id)!;
    const now = new Date().toISOString();
    if (body.decision === "done") {
      x.status = "Closed - Verified";
      x.closedAt = now;
      x.actions.push({ at: now, type: "Student confirmed: Done", by: s.pseudonym, remarks: note || "Closed as verified by the student." });
    } else {
      x.reopened = true;
      const cs = escalateToAicte(d, x, `student marked the college's resolution as Not done${note ? `: ${note}` : ""}`);
      x.actions.push({ at: now, type: "Student responded: Not done", by: s.pseudonym, remarks: `Reopened and escalated to ${x.routedBureau} at AICTE as ${cs.id}, not returned to the college.${note ? ` Student note: ${note}` : ""}` });
    }
    audit(d, { role: "student", actor: s.pseudonym, action: body.decision === "done" ? "STUDENT_VERIFIED" : "STUDENT_NOT_DONE", target: x.id, detail: x.caseId ? `Escalated as ${x.caseId}` : "Closed as verified" });
    return studentView(d, x);
  });
  return json({ complaint: out });
}
