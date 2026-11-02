import { withApi } from "@/lib/api";
import { getDb, storageMode } from "@/lib/store";
import { json, officerName, viewerFrom } from "@/lib/server";
import { BUREAUS, CATEGORIES, REGIONS, STATUSES } from "@/lib/types";
import { ROLES } from "@/lib/roles";

export const dynamic = "force-dynamic";

export const GET = withApi(async (req) => {
  const db = getDb();
  const v = viewerFrom(req, db);
  const off = db.officers.find((o) => o.id === v.officerId);
  const internal = v.role !== "college" && v.role !== "student";
  return json({
    viewer: { role: ROLES[v.role], region: v.region, officerId: v.officerId, institutionId: v.institutionId, officerName: officerName(db, v), designation: off?.designation ?? (v.role === "college" ? "College Nodal Officer" : undefined) },
    officers: internal ? db.officers : [],
    bureaus: BUREAUS,
    regions: REGIONS,
    categories: CATEGORIES,
    statuses: STATUSES,
    settings: db.settings,
    colleges: internal ? db.institutions.map((i) => ({ id: i.id, name: i.name })) : [],
    seededAt: db.seededAt,
    storage: storageMode(),
  });
});
