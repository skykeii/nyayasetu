import path from "path";
import { getDb } from "@/lib/store";
import { json } from "@/lib/server";
import { complaintDocs, sendFile, studentFrom } from "@/lib/student";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { name: string } }) {
  const db = getDb();
  const s = studentFrom(req, db);
  if (!s) return json({ error: "Please sign in" }, { status: 401 });
  const name = path.basename(params.name);
  const doc = db.studentComplaints.filter((c) => c.studentId === s.id).flatMap(complaintDocs).find((d) => d.file === name);
  if (!doc) return new Response("Not found", { status: 404 });
  return sendFile(name, doc);
}
