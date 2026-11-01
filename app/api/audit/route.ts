import { audit, getDb, touch } from "@/lib/store";
import { forbidden, json, officerName, viewerFrom } from "@/lib/server";
import { ROLES } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const db = getDb();
  const v = viewerFrom(req, db);
  if (!ROLES[v.role].can.audit) return forbidden("Audit trail is restricted to the Competent Authority");
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") ?? "").toLowerCase();
  let items = [...db.audit].reverse();
  if (q) items = items.filter((a) => `${a.action} ${a.target} ${a.actor} ${a.detail} ${a.role}`.toLowerCase().includes(q));
  return json({ items: items.slice(0, 500), total: items.length });
}

/** Client logs role switches (demo login) so they appear in the audit trail. */
export async function POST(req: Request) {
  const db = getDb();
  const v = viewerFrom(req, db);
  const body = (await req.json().catch(() => ({}))) as { event?: string };
  touch((d) => audit(d, { role: v.role, actor: officerName(d, v), action: "ROLE_SWITCH", target: v.role, detail: body.event ?? `Signed in (demo) as ${ROLES[v.role].label}${v.role === "ro" ? ` – ${v.region}` : ""}` }));
  return json({ ok: true });
}
