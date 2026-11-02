import { z } from "zod";
import { parseJson, parseQuery, withApi } from "@/lib/api";
import { getDb, touch } from "@/lib/store";
import { buildAlerts, json, viewerFrom } from "@/lib/server";

export const dynamic = "force-dynamic";

const Query = z.object({ limit: z.coerce.number().int().min(0).max(500).optional() });
const Body = z.object({ ids: z.array(z.string().max(120)).max(500).optional(), all: z.boolean().optional() });

export const GET = withApi(async (req) => {
  const db = getDb();
  const v = viewerFrom(req, db);
  const items = buildAlerts(db, v);
  const { limit } = parseQuery(req, Query);
  const counts = items.reduce<Record<string, number>>((m, a) => ((m[a.type] = (m[a.type] ?? 0) + 1), m), {});
  return json({ items: limit ? items.slice(0, limit) : items, unread: items.filter((a) => !a.read).length, total: items.length, counts });
});

export const POST = withApi(async (req) => {
  const db = getDb();
  const v = viewerFrom(req, db);
  const body = await parseJson(req, Body);
  const ids = body.all ? buildAlerts(db, v).map((a) => a.id) : body.ids ?? [];
  touch((d) => {
    const s = new Set(d.alertReads[v.role] ?? []);
    ids.forEach((i) => s.add(i));
    d.alertReads[v.role] = [...s];
  });
  return json({ ok: true, marked: ids.length });
});
