import fs from "fs";
import path from "path";
import { UPLOAD_DIR, getDb } from "@/lib/store";
import { forbidden, viewerFrom, visibleIds } from "@/lib/server";
import { complaintDocs, sendFile } from "@/lib/student";
import { ROLES } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { name: string } }) {
  const db = getDb();
  const v = viewerFrom(req, db);
  const name = path.basename(params.name);
  const sc = db.studentComplaints.find((s) => complaintDocs(s).some((d) => d.file === name));
  if (sc) {
    const def = ROLES[v.role];
    const allowed = v.role === "college" ? sc.institutionId === v.institutionId : v.role === "ro" ? db.institutions.find((i) => i.id === sc.institutionId)?.region === v.region : def.bureaus === "all" || def.bureaus.includes(sc.routedBureau);
    if (!allowed) return forbidden();
    return sendFile(name, complaintDocs(sc).find((d) => d.file === name)!);
  }
  const owner = db.cases.find((c) => c.actions.some((a) => a.docs?.some((d) => d.file === name)));
  if (!owner) return new Response("Not found", { status: 404 });
  if (!visibleIds(db, v).has(owner.id)) return forbidden();
  const p = path.join(UPLOAD_DIR, name);
  if (!fs.existsSync(p)) return new Response("Not found", { status: 404 });
  const doc = owner.actions.flatMap((a) => a.docs ?? []).find((d) => d.file === name)!;
  return new Response(fs.readFileSync(p), {
    headers: { "Content-Disposition": `attachment; filename="${doc.name.replace(/"/g, "")}"`, "Content-Type": "application/octet-stream" },
  });
}
