import { getDb } from "@/lib/store";
import { json, officerName, viewerFrom } from "@/lib/server";
import { BUREAUS, CATEGORIES, REGIONS, STATUSES } from "@/lib/types";
import { ROLES } from "@/lib/roles";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const db = getDb();
  const v = viewerFrom(req, db);
  const off = db.officers.find((o) => o.id === v.officerId);
  return json({
    viewer: { ...v, officerName: officerName(db, v), designation: off?.designation, role: ROLES[v.role] },
    officers: db.officers,
    bureaus: BUREAUS,
    regions: REGIONS,
    categories: CATEGORIES,
    statuses: STATUSES,
    settings: db.settings,
    seededAt: db.seededAt,
    llm: Boolean(process.env.ANTHROPIC_API_KEY),
  });
}
