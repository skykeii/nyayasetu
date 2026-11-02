import { withApi } from "@/lib/api";
import { audit, getDb, touch } from "@/lib/store";
import { decorate, forbidden, isOwnCase, json, officerName, viewerFrom, visibleIds } from "@/lib/server";
import { detectOverlaps } from "@/lib/overlap";
import { resolveInstitution } from "@/lib/resolve";
import { ROLES } from "@/lib/roles";
import { suggestRouting } from "@/lib/student";

export const dynamic = "force-dynamic";

async function handleGET(req: Request, { params }: { params: { id: string } }) {
  const db = getDb();
  const v = viewerFrom(req, db);
  const c = db.cases.find((x) => x.id === params.id);
  if (!c) return json({ error: "Case not found" }, { status: 404 });
  const vis = visibleIds(db, v);
  if (!vis.has(c.id)) return forbidden("This case is outside your role's visibility");
  const { clusters } = detectOverlaps(db);
  const mine = clusters.filter((cl) => cl.caseIds.includes(c.id));
  const caseById = new Map(db.cases.map((x) => [x.id, x]));
  const related = mine.map((cl) => ({
    ...cl,
    cases: cl.caseIds
      .filter((id) => vis.has(id))
      .map((id) => {
        const o = caseById.get(id)!;
        return { id, bureau: o.bureau, status: o.status, subject: o.subject, reference: o.reference, reportedName: o.reportedName, dateReceived: o.dateReceived };
      }),
  }));
  const group = c.linkGroupId ? db.linkGroups.find((g) => g.id === c.linkGroupId) : undefined;
  const inst = db.institutions.find((i) => i.id === c.institutionId);
  const resolution = resolveInstitution(db.institutions, c.reportedName, c.reportedPid);
  const def = ROLES[v.role];
  const own = isOwnCase(v, c);
  const permissions = {
    remark: true,
    act: own && c.status !== "Disposed",
    accept: own && c.status === "Transferred",
    escalate: own && c.status !== "Escalated" && c.status !== "Disposed" && v.role !== "ca",
    returnToBureau: v.role === "ca" && c.status === "Escalated",
    transfer: own && c.status !== "Disposed",
    dispose: own && c.status !== "Disposed",
    link: def.can.link,
  };
  // audit read access to the full record
  touch((d) => audit(d, { role: v.role, actor: officerName(d, v), action: "VIEW_CASE", target: c.id, detail: "Opened case detail" }));
  return json({
    case: decorate(db, c, clusters, { full: true, v }),
    institution: inst,
    related,
    group,
    resolution,
    permissions,
    routing: c.status === "New" && own ? suggestRouting(db, c.category, c.institutionId) : undefined,
    history: db.cases
      .filter((x) => x.institutionId === c.institutionId && x.id !== c.id && vis.has(x.id))
      .sort((a, b) => b.dateReceived.localeCompare(a.dateReceived))
      .slice(0, 8)
      .map((x) => ({ id: x.id, bureau: x.bureau, status: x.status, category: x.category, dateReceived: x.dateReceived, subject: x.subject })),
  });
}

export const GET = withApi(handleGET);
