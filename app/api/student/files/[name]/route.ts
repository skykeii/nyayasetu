import path from "path";
import { withApi } from "@/lib/api";
import { getDb } from "@/lib/store";
import { sendFile } from "@/lib/files";
import { complaintDocs, studentFrom } from "@/lib/student";

export const dynamic = "force-dynamic";

export const GET = withApi<{ name: string }>(async (req, { params }) => {
  const db = getDb();
  const s = studentFrom(req, db);
  const name = path.basename(params.name);
  const doc = db.studentComplaints.filter((c) => c.studentId === s.id).flatMap(complaintDocs).find((d) => d.file === name);
  if (!doc) return new Response("Not found", { status: 404 });
  return sendFile(name, doc);
});
