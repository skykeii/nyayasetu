import { withApi } from "@/lib/api";
import { getDb } from "@/lib/store";
import { decorate, forbidden, json, viewerFrom, visibleIds } from "@/lib/server";
import { detectOverlaps } from "@/lib/overlap";
import { BUREAUS, CATEGORIES } from "@/lib/types";
import { riskFor } from "@/lib/risk";

export const dynamic = "force-dynamic";

async function handleGET(req: Request, { params }: { params: { id: string } }) {
  const db = getDb();
  const v = viewerFrom(req, db);
  const inst = db.institutions.find((i) => i.id === params.id);
  if (!inst) return json({ error: "Institution not found" }, { status: 404 });
  if (v.role === "ro" && inst.region !== v.region) return forbidden("Institution is outside your region");
  const vis = visibleIds(db, v);
  const { clusters } = detectOverlaps(db);
  const all = db.cases.filter((c) => c.institutionId === inst.id);
  const cases = all.filter((c) => vis.has(c.id)).sort((a, b) => b.dateReceived.localeCompare(a.dateReceived));
  const instClusters = clusters.filter((cl) => cl.institutionId === inst.id && cl.caseIds.some((x) => vis.has(x)));
  const aliases = [...new Set(all.map((c) => c.reportedName).filter((n) => n !== inst.name))];
  const pidVariants = [...new Set(all.map((c) => c.reportedPid).filter((p): p is string => !!p && p !== inst.id))];
  const byBureau = BUREAUS.map((b) => ({
    bureau: b.code,
    open: cases.filter((c) => c.bureau === b.code && c.status !== "Disposed").length,
    disposed: cases.filter((c) => c.bureau === b.code && c.status === "Disposed").length,
  })).filter((x) => x.open + x.disposed > 0);
  const byCategory = CATEGORIES.map((cat) => ({ category: cat, count: cases.filter((c) => c.category === cat).length })).filter((x) => x.count > 0);
  const timeline = cases
    .flatMap((c) => c.actions.map((a) => ({ ...a, caseId: c.id, caseBureau: c.bureau })))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 40);
  return json({
    institution: inst,
    risk: riskFor(db, inst.id),
    cases: cases.map((c) => decorate(db, c, clusters, { v })),
    hiddenCount: all.length - cases.length,
    clusters: instClusters,
    aliases,
    pidVariants,
    byBureau,
    byCategory,
    timeline,
  });
}

export const GET = withApi(handleGET);
