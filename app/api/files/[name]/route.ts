import fs from "fs";
import path from "path";
import { UPLOAD_DIR, getDb } from "@/lib/store";
import { forbidden, viewerFrom, visibleIds } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { name: string } }) {
  const db = getDb();
  const v = viewerFrom(req, db);
  const name = path.basename(params.name);
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
