import { getDb, touch } from "@/lib/store";
import { buildAlerts, json, viewerFrom } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const db = getDb();
  const v = viewerFrom(req, db);
  const items = buildAlerts(db, v);
  const u = new URL(req.url);
  const limit = Number(u.searchParams.get("limit")) || 0;
  const counts = items.reduce<Record<string, number>>((m, a) => ((m[a.type] = (m[a.type] ?? 0) + 1), m), {});
  return json({ items: limit ? items.slice(0, limit) : items, unread: items.filter((a) => !a.read).length, total: items.length, counts });
}

export async function POST(req: Request) {
  const db = getDb();
  const v = viewerFrom(req, db);
  const body = (await req.json()) as { ids?: string[]; all?: boolean };
  const ids = body.all ? buildAlerts(db, v).map((a) => a.id) : body.ids ?? [];
  touch((d) => {
    const s = new Set(d.alertReads[v.role] ?? []);
    ids.forEach((i) => s.add(i));
    d.alertReads[v.role] = [...s];
  });
  return json({ ok: true, marked: ids.length });
}
