import { getDb } from "@/lib/store";
import { decorate, json, slaInfo, viewerFrom, visibleIds } from "@/lib/server";
import { detectOverlaps } from "@/lib/overlap";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const db = getDb();
  const v = viewerFrom(req, db);
  const vis = visibleIds(db, v);
  const u = new URL(req.url);
  const p = (k: string) => u.searchParams.get(k) ?? "";
  const q = p("q").trim().toLowerCase();
  const instById = new Map(db.institutions.map((i) => [i.id, i]));
  const { clusters } = detectOverlaps(db);
  const inOverlap = new Set(clusters.filter((c) => c.status === "Open").flatMap((c) => c.caseIds));

  let list = db.cases.filter((c) => vis.has(c.id));
  if (q) {
    list = list.filter((c) => {
      const inst = instById.get(c.institutionId);
      return [c.id, c.reference, c.reportedName, c.reportedPid ?? "", c.institutionId, inst?.name ?? "", inst?.shortName ?? "", inst?.city ?? "", c.subject]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }
  if (p("institution")) list = list.filter((c) => c.institutionId === p("institution"));
  if (p("bureau")) list = list.filter((c) => c.bureau === p("bureau"));
  if (p("category")) list = list.filter((c) => c.category === p("category"));
  if (p("region")) list = list.filter((c) => instById.get(c.institutionId)?.region === p("region"));
  const st = p("status");
  if (st === "open") list = list.filter((c) => c.status !== "Disposed");
  else if (st === "overdue") list = list.filter((c) => c.status !== "Disposed" && slaInfo(db, c).state === "breached");
  else if (st === "due-soon") list = list.filter((c) => c.status !== "Disposed" && slaInfo(db, c).state === "due-soon");
  else if (st) list = list.filter((c) => c.status === st);
  if (p("from")) list = list.filter((c) => c.dateReceived >= p("from"));
  if (p("to")) list = list.filter((c) => c.dateReceived.slice(0, 10) <= p("to"));
  if (p("overlap") === "1") list = list.filter((c) => inOverlap.has(c.id));

  const sort = p("sort") || "received-desc";
  list = [...list].sort((a, b) => {
    switch (sort) {
      case "received-asc":
        return a.dateReceived.localeCompare(b.dateReceived);
      case "due-asc":
        return (a.status === "Disposed" ? 1 : 0) - (b.status === "Disposed" ? 1 : 0) || a.expectedDisposalDate.localeCompare(b.expectedDisposalDate);
      case "action-desc":
        return b.lastActionDate.localeCompare(a.lastActionDate);
      default:
        return b.dateReceived.localeCompare(a.dateReceived);
    }
  });
  const total = list.length;
  const pageSize = Math.min(200, Number(p("pageSize")) || 25);
  const page = Math.max(1, Number(p("page")) || 1);
  const items = list.slice((page - 1) * pageSize, page * pageSize).map((c) => decorate(db, c, clusters, { v }));
  return json({ items, total, page, pageSize });
}
