import { audit, getDb, mutate } from "@/lib/store";
import { forbidden, json, officerName, viewerFrom } from "@/lib/server";
import { seedDb } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const db = getDb();
  const v = viewerFrom(req, db);
  if (v.role !== "ca") return forbidden("Only the Competent Authority can reset demo data");
  const fresh = seedDb();
  mutate((d) => {
    const version = d.version;
    Object.assign(d, fresh, { version });
    audit(d, { role: v.role, actor: officerName(d, v), action: "DEMO_RESET", target: "database", detail: "Synthetic demo data regenerated" });
  });
  return json({ ok: true });
}
