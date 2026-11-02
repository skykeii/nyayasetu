import { withApi } from "@/lib/api";
import { getDb } from "@/lib/store";
import { json, slaInfo, viewerFrom, visibleIds } from "@/lib/server";
import { dashboard } from "@/lib/analytics";
import { detectOverlaps } from "@/lib/overlap";
import { BUREAUS } from "@/lib/types";
import { ROLES } from "@/lib/roles";

export const dynamic = "force-dynamic";

async function handleGET(req: Request) {
  const db = getDb();
  const v = viewerFrom(req, db);
  const vis = visibleIds(db, v);
  const def = ROLES[v.role];
  // dashboard scope: own bureau(s) for bureau officers; region for RO; all for CA
  const scoped = db.cases.filter((c) => vis.has(c.id) && (def.bureaus === "all" || def.bureaus.includes(c.bureau)));
  const d = dashboard(db, scoped, vis);
  const { clusters } = detectOverlaps(db);
  const caseById = new Map(db.cases.map((c) => [c.id, c]));
  const inScope = clusters.filter((cl) => cl.caseIds.some((id) => vis.has(id)) && cl.kind === "cross-bureau" && (def.bureaus === "all" || cl.bureaus.some((b) => (def.bureaus as string[]).includes(b))));
  // every cross-bureau link in scope, for the connection map
  const connections = inScope.slice(0, 16).map((cl) => {
    const inst = db.institutions.find((i) => i.id === cl.institutionId);
    return { clusterId: cl.id, institutionId: cl.institutionId, institution: inst?.name ?? cl.institutionId, shortName: inst?.shortName, status: cl.status, confidence: cl.confidence, cases: cl.caseIds.map((id) => ({ id, bureau: caseById.get(id)!.bureau })) };
  });
  const overlapFeed = inScope
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
      pairs: cl.pairs.map((p) => ({ a: p.a, b: p.b, confidence: p.confidence, reasons: p.reasons.slice(0, 3) })),
      newestAt: cl.newestAt,
    }));
  const scope =
    v.role === "ca" ? "All bureaus/cells · national" : v.role === "ro" ? `${v.region} region · all bureaus` : (def.bureaus as string[]).map((b) => BUREAUS.find((x) => x.code === b)?.name).join(", ");
  const toRow = (c: (typeof db.cases)[number]) => ({ id: c.id, category: c.category, bureau: c.bureau, status: c.status, institution: db.institutions.find((i) => i.id === c.institutionId)?.name, nextAction: c.nextAction, daysToDue: slaInfo(db, c).daysToDue, severity: c.severity });
  const openScoped = scoped.filter((c) => c.status !== "Disposed").sort((a, b) => slaInfo(db, a).daysToDue - slaInfo(db, b).daysToDue);
  const mine = openScoped.filter((c) => c.officerId === v.officerId).slice(0, 12).map(toRow);
  const dueSoon = openScoped.filter((c) => slaInfo(db, c).state !== "ok").slice(0, 10).map(toRow);
  return json({ ...d, mine, dueSoon, overlapFeed, connections, scope, version: db.version, generatedAt: new Date().toISOString() });
}

export const GET = withApi(handleGET);
