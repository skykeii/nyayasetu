import { getDb } from "@/lib/store";
import { json, viewerFrom, visibleIds } from "@/lib/server";
import { dashboard } from "@/lib/analytics";
import { detectOverlaps } from "@/lib/overlap";
import { BUREAUS } from "@/lib/types";
import { ROLES } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const db = getDb();
  const v = viewerFrom(req, db);
  const vis = visibleIds(db, v);
  const def = ROLES[v.role];
  // dashboard scope: own bureau(s) for bureau officers; region for RO; all for CA
  const scoped = db.cases.filter((c) => vis.has(c.id) && (def.bureaus === "all" || def.bureaus.includes(c.bureau)));
  const d = dashboard(db, scoped, vis);
  const { clusters } = detectOverlaps(db);
  const caseById = new Map(db.cases.map((c) => [c.id, c]));
  const overlapFeed = clusters
    .filter((cl) => cl.caseIds.some((id) => vis.has(id)) && cl.kind === "cross-bureau")
    .slice(0, 6)
    .map((cl) => ({
      id: cl.id,
      status: cl.status,
      confidence: cl.confidence,
      bureaus: cl.bureaus,
      institutionId: cl.institutionId,
      institution: db.institutions.find((i) => i.id === cl.institutionId)?.name,
      cases: cl.caseIds.map((id) => {
        const c = caseById.get(id)!;
        return { id, bureau: c.bureau, subject: c.subject, reference: c.reference, reportedName: c.reportedName };
      }),
      topReason: cl.pairs[0]?.reasons[0],
      newestAt: cl.newestAt,
    }));
  const scope =
    v.role === "ca" ? "All bureaus/cells · national" : v.role === "ro" ? `${v.region} region · all bureaus` : (def.bureaus as string[]).map((b) => BUREAUS.find((x) => x.code === b)?.name).join(", ");
  return json({ ...d, overlapFeed, scope, version: db.version, generatedAt: new Date().toISOString() });
}
