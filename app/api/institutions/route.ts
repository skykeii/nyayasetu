import { getDb } from "@/lib/store";
import { json, slaInfo, viewerFrom, visibleIds } from "@/lib/server";
import { detectOverlaps } from "@/lib/overlap";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const db = getDb();
  const v = viewerFrom(req, db);
  const vis = visibleIds(db, v);
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") ?? "").toLowerCase().trim();
  const region = u.searchParams.get("region") ?? "";
  const { clusters } = detectOverlaps(db);
  let insts = db.institutions;
  if (v.role === "ro") insts = insts.filter((i) => i.region === v.region);
  if (region) insts = insts.filter((i) => i.region === region);
  if (q) insts = insts.filter((i) => `${i.id} ${i.name} ${i.shortName} ${i.city} ${i.state}`.toLowerCase().includes(q));
  const items = insts
    .map((i) => {
      const cs = db.cases.filter((c) => c.institutionId === i.id && vis.has(c.id));
      const open = cs.filter((c) => c.status !== "Disposed");
      return {
        ...i,
        total: cs.length,
        open: open.length,
        disposed: cs.length - open.length,
        overdue: open.filter((c) => slaInfo(db, c).state === "breached").length,
        bureaus: [...new Set(open.map((c) => c.bureau))],
        overlaps: clusters.filter((cl) => cl.institutionId === i.id && cl.status === "Open" && cl.caseIds.some((x) => vis.has(x))).length,
        lastComplaint: cs.map((c) => c.dateReceived).sort().at(-1),
      };
    })
    .sort((a, b) => b.overlaps - a.overlaps || b.open - a.open || b.total - a.total);
  return json({ items, total: items.length });
}
