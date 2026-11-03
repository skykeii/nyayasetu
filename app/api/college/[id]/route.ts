import { z } from "zod";
import { ApiError, parseForm, validate, withApi } from "@/lib/api";
import { audit, getDb, mutate } from "@/lib/store";
import { json, officerName, viewerFrom } from "@/lib/server";
import { saveUploads } from "@/lib/files";
import { collegeView } from "@/lib/student";
import { checkEvidence } from "@/lib/groq";
import { mockEvidence } from "@/lib/intake";
import { addDays } from "@/lib/util";

export const dynamic = "force-dynamic";

const Note = z.string({ error: "Describe the work done in at least 10 characters" }).trim().min(10, "Describe the work done in at least 10 characters").max(2000);
const Progress = z.string({ error: "Write a progress note of at least 5 characters" }).trim().min(5, "Write a progress note of at least 5 characters").max(2000);
const Kind = z.enum(["proof", "note"]).catch("proof");

/**
 * kind=note: a progress note, with optional files, on any complaint not yet closed. It does not change the status.
 * kind=proof: proof of work; the complaint then waits for the student, never closes here.
 */
export const POST = withApi<{ id: string }>(async (req, { params }) => {
  const db = getDb();
  const v = viewerFrom(req, db);
  if (v.role !== "college") throw new ApiError(403, "This desk is for college nodal officers");
  const c = db.studentComplaints.find((x) => x.id === params.id && x.institutionId === v.institutionId);
  if (!c) throw new ApiError(404, "Complaint not found");
  const form = await parseForm(req);
  const kind = Kind.parse(form.get("kind"));
  if (kind === "note") {
    if (c.status.startsWith("Closed")) throw new ApiError(400, "This complaint is closed");
    const text = validate(Progress, form.get("note"));
    const uploaded = await saveUploads(form.getAll("files"));
    if (uploaded.error) throw new ApiError(400, uploaded.error);
    const out = mutate((d) => {
      const x = d.studentComplaints.find((y) => y.id === c.id)!;
      const by = officerName(d, v);
      x.actions.push({ at: new Date().toISOString(), type: "College progress note", by, remarks: text, docs: uploaded.docs.length ? uploaded.docs : undefined });
      audit(d, { role: v.role, actor: by, action: "COLLEGE_NOTE", target: x.id, detail: `Progress note with ${uploaded.docs.length} file(s)` });
      return collegeView(d, x);
    });
    return json({ complaint: out });
  }
  if (c.status !== "With College") throw new ApiError(400, "This complaint is no longer with the college");
  const note = validate(Note, form.get("note"));
  const { docs, error } = await saveUploads(form.getAll("files"));
  if (error) throw new ApiError(400, error);
  if (!docs.length) throw new ApiError(400, "Attach proof of work: a photo or a PDF");
  const at = new Date().toISOString();
  const evidence = (await checkEvidence({ complaint: c.translatedText, category: c.category, note, docs, at })) ?? mockEvidence({ category: c.category, note, docs, at });
  const out = mutate((d) => {
    const x = d.studentComplaints.find((y) => y.id === c.id)!;
    const by = officerName(d, v);
    x.proof = { note, docs, at, by };
    x.evidence = evidence;
    x.rounds = x.rounds.filter((r) => r.round !== x.round);
    x.rounds.push({ round: x.round, directions: x.directions, proof: x.proof, evidence });
    x.status = "Resolved - Pending Verification";
    x.verifyBy = addDays(at, d.settings.verifyWindowDays);
    x.actions.push({ at, type: `Proof submitted (round ${x.round})`, by, remarks: `Now awaiting the student's verdict. ${note}` });
    audit(d, { role: v.role, actor: by, action: "COLLEGE_PROOF", target: x.id, detail: `Round ${x.round}; ${docs.length} file(s); advisory evidence score ${evidence.score} (${evidence.source})` });
    return collegeView(d, x);
  });
  return json({ complaint: out });
});
