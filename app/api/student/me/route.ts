import { getDb } from "@/lib/store";
import { json } from "@/lib/server";
import { studentFrom, studentView, sweepStudentLayer } from "@/lib/student";
import { LIMITS, PULSE_TERM } from "@/lib/intake";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  sweepStudentLayer();
  const db = getDb();
  const s = studentFrom(req, db);
  if (!s) return json({ error: "Please sign in" }, { status: 401 });
  const inst = db.institutions.find((i) => i.id === s.institutionId);
  const complaints = db.studentComplaints
    .filter((c) => c.studentId === s.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((c) => studentView(db, c));
  return json({
    student: { pseudonym: s.pseudonym, institution: inst?.name, institutionId: s.institutionId },
    complaints,
    limits: { openComplaints: LIMITS.openComplaints, open: complaints.filter((c) => c.status === "With College" || c.status === "Resolved - Pending Verification").length },
    pulse: { term: PULSE_TERM, invited: s.pulseInvited, done: s.pulseTermsDone.includes(PULSE_TERM) },
  });
}
