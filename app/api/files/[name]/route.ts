import path from "path";
import { ApiError, withApi } from "@/lib/api";
import { getDb } from "@/lib/store";
import { sendFile } from "@/lib/files";
import { canSeeStudent, viewerFrom, visibleIds } from "@/lib/server";
import { complaintDocs } from "@/lib/student";

export const dynamic = "force-dynamic";

export const GET = withApi<{ name: string }>(async (req, { params }) => {
  const db = getDb();
  const v = viewerFrom(req, db);
  const name = path.basename(params.name);
  const sc = db.studentComplaints.find((s) => complaintDocs(s).some((d) => d.file === name));
  if (sc) {
    if (!canSeeStudent(db, v, sc)) throw new ApiError(403, "Not permitted for your role");
    return sendFile(name, complaintDocs(sc).find((d) => d.file === name)!);
  }
  const owner = db.cases.find((c) => c.actions.some((a) => a.docs?.some((d) => d.file === name)));
  if (!owner) return new Response("Not found", { status: 404 });
  if (!visibleIds(db, v).has(owner.id)) throw new ApiError(403, "Not permitted for your role");
  return sendFile(name, owner.actions.flatMap((a) => a.docs ?? []).find((d) => d.file === name)!);
});
