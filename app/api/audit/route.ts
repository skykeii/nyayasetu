import { z } from "zod";
import { ApiError, parseQuery, withApi } from "@/lib/api";
import { getDb, verifyAudit } from "@/lib/store";
import { json, viewerFrom } from "@/lib/server";
import { ROLES } from "@/lib/roles";

export const dynamic = "force-dynamic";

export const GET = withApi(async (req) => {
  const db = getDb();
  const v = viewerFrom(req, db);
  if (!ROLES[v.role].can.audit) throw new ApiError(403, "Audit trail is restricted to the Competent Authority");
  const { q: raw } = parseQuery(req, z.object({ q: z.string().max(120).optional() }));
  const q = (raw ?? "").toLowerCase();
  let items = [...db.audit].reverse();
  if (q) items = items.filter((a) => `${a.action} ${a.target} ${a.actor} ${a.detail} ${a.role}`.toLowerCase().includes(q));
  return json({ items: items.slice(0, 500), total: items.length });
});

/** Re-walks the hash chain on request. */
export const POST = withApi(async (req) => {
  const db = getDb();
  const v = viewerFrom(req, db);
  if (!ROLES[v.role].can.audit) throw new ApiError(403, "Audit trail is restricted to the Competent Authority");
  return json(verifyAudit(db));
});
