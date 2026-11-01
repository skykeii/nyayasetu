import { audit, getDb, mutate } from "@/lib/store";
import { forbidden, json, officerName, viewerFrom } from "@/lib/server";
import { collegeView, saveUploads } from "@/lib/student";
import { checkEvidence } from "@/lib/llm";
import { mockEvidence } from "@/lib/intake";
import { addDays } from "@/lib/util";

export const dynamic = "force-dynamic";

/** College uploads proof of work; the case then waits for the student, never closes here. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const db = getDb();
  const v = viewerFrom(req, db);
  if (v.role !== "college") return forbidden("This desk is for college nodal officers");
  const c = db.studentComplaints.find((x) => x.id === params.id && x.institutionId === v.institutionId);
  if (!c) return json({ error: "Complaint not found" }, { status: 404 });
  if (c.status !== "With College") return json({ error: "This complaint is no longer with the college" }, { status: 400 });
  const form = await req.formData();
  const note = String(form.get("note") ?? "").trim();
  if (note.length < 10) return json({ error: "Describe the work done in at least 10 characters" }, { status: 400 });
  const { docs, error } = await saveUploads(form.getAll("files"));
  if (error) return json({ error }, { status: 400 });
  if (!docs.length) return json({ error: "Attach proof of work: a photo or a PDF" }, { status: 400 });
  const at = new Date().toISOString();
  const evidence = (await checkEvidence({ complaint: c.translatedText, category: c.category, note, docs, at })) ?? mockEvidence({ category: c.category, note, docs, at });
  const out = mutate((d) => {
    const x = d.studentComplaints.find((y) => y.id === c.id)!;
    const by = officerName(d, v);
    x.proof = { note, docs, at, by };
    x.evidence = evidence;
    x.status = "Resolved - Pending Verification";
    x.verifyBy = addDays(at, d.settings.verifyWindowDays);
    x.actions.push({ at, type: "Proof uploaded", by, remarks: `Marked resolved, pending student verification. ${note}` });
    audit(d, { role: v.role, actor: by, action: "COLLEGE_PROOF", target: x.id, detail: `${docs.length} file(s); advisory evidence score ${evidence.score} (${evidence.source})` });
    return collegeView(d, x);
  });
  return json({ complaint: out });
}
