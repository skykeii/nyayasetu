import { withApi } from "@/lib/api";
import { getDb } from "@/lib/store";
import { json } from "@/lib/server";
import { studentFrom, studentView, sweepStudentLayer } from "@/lib/student";
import { CONSENT_VERSION, LIMITS, PULSE_TERM } from "@/lib/intake";
import { decryptField } from "@/lib/vault";

export const dynamic = "force-dynamic";

export const GET = withApi(async (req) => {
  sweepStudentLayer();
  const db = getDb();
  const s = studentFrom(req, db);
  const inst = db.institutions.find((i) => i.id === s.institutionId);
  const complaints = db.studentComplaints
    .filter((c) => c.studentId === s.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((c) => studentView(db, c));
  const notifications = complaints
    .flatMap((c) => c.actions.filter((a) => a.by !== s.pseudonym).map((a) => ({ at: a.at, title: a.type, complaintId: c.id, subject: c.subject, href: `/student?complaint=${c.id}` })))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 12);
  return json({
    student: { pseudonym: s.pseudonym, institution: inst?.name, institutionId: s.institutionId, name: decryptField(s.name), mobile: decryptField(s.mobile), rollNo: decryptField(s.rollNo), apaarId: s.apaarId },
    complaints,
    notifications,
    limits: { openComplaints: LIMITS.openComplaints, open: complaints.filter((c) => c.status === "With College" || c.status === "Resolved - Pending Verification").length },
    pulse: { term: PULSE_TERM, invited: s.pulseInvited, done: s.pulseTermsDone.includes(PULSE_TERM) },
    consent: { current: CONSENT_VERSION, records: s.consents, deletionRequestedAt: s.deletionRequestedAt },
  });
});
