import { getDb } from "@/lib/store";
import { forbidden, json, officerName, viewerFrom } from "@/lib/server";
import { collegeView, sweepStudentLayer } from "@/lib/student";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  sweepStudentLayer();
  const db = getDb();
  const v = viewerFrom(req, db);
  if (v.role !== "college") return forbidden("This desk is for college nodal officers");
  const inst = db.institutions.find((i) => i.id === v.institutionId)!;
  const all = db.studentComplaints.filter((s) => s.institutionId === inst.id).map((s) => collegeView(db, s));
  const order = (s: string) => (s === "With College" ? 0 : s === "Resolved - Pending Verification" ? 1 : s === "Escalated to AICTE" ? 2 : 3);
  const items = all.sort((a, b) => order(a.status) - order(b.status) || b.urgency.score - a.urgency.score || b.createdAt.localeCompare(a.createdAt));
  const sms = all
    .flatMap((c) => c.reminders.filter((r) => r.channel !== "In-app").map((r) => ({ ...r, complaintId: c.id })))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 12);
  const count = (s: string) => all.filter((c) => c.status === s).length;
  return json({
    college: { id: inst.id, name: inst.name, nodalOfficer: officerName(db, v) },
    items,
    sms,
    stats: {
      open: count("With College"),
      overdue: all.filter((c) => c.status === "With College" && c.urgency.daysLeft < 0).length,
      pending: count("Resolved - Pending Verification"),
      verified: count("Closed - Verified"),
      unverified: count("Closed - Unverified"),
      escalated: count("Escalated to AICTE"),
    },
  });
}
