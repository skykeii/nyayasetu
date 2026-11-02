import { z } from "zod";
import { ApiError, parseJson, withApi } from "@/lib/api";
import { audit, getDb, mutate } from "@/lib/store";
import { json } from "@/lib/server";
import { studentFrom } from "@/lib/student";

export const dynamic = "force-dynamic";

const Body = z.object({ note: z.string().trim().max(500).optional() });

/** Logs a deletion request for the AICTE desk. Nothing is deleted automatically. */
export const POST = withApi(async (req) => {
  const db = getDb();
  const s = studentFrom(req, db);
  if (s.deletionRequestedAt) throw new ApiError(409, "You have already requested deletion");
  const { note } = await parseJson(req, Body);
  const at = new Date().toISOString();
  mutate((d) => {
    d.students.find((x) => x.id === s.id)!.deletionRequestedAt = at;
    d.deletionRequests.push({ id: `DEL-${d.deletionRequests.length + 1}`, pseudonym: s.pseudonym, studentId: s.id, at, note: note ?? "", status: "Open" });
    audit(d, { role: "student", actor: s.pseudonym, action: "DELETION_REQUEST", target: s.pseudonym, detail: "Student requested deletion of their data" });
  });
  return json({ ok: true, at });
});
