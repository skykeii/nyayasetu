import { z } from "zod";
import { parseJson, withApi } from "@/lib/api";
import { audit, getDb, mutate, nextActionId } from "@/lib/store";
import { forbidden, isOwnCase, json, officerName, slaInfo, viewerFrom, viewerUnit, visibleIds } from "@/lib/server";
import { detectOverlaps, pairKey } from "@/lib/overlap";
import { ROLES } from "@/lib/roles";
import type { CaseAction } from "@/lib/types";

export const dynamic = "force-dynamic";

const Body = z.object({
  action: z.enum(["link", "coordinate", "unlink", "dismiss"]),
  caseIds: z.array(z.string().max(40)).max(30),
  note: z.string().max(1000).optional(),
  leadBureau: z.enum(["RB", "PGRC", "AB", "PAPB", "ARC"]).optional(),
  clusterId: z.string().max(40).optional(),
});

async function handleGET(req: Request) {
  const db = getDb();
  const v = viewerFrom(req, db);
  const vis = visibleIds(db, v);
  const { clusters } = detectOverlaps(db);
  const caseById = new Map(db.cases.map((c) => [c.id, c]));
  const items = clusters
    .filter((cl) => cl.caseIds.some((id) => vis.has(id)))
    .map((cl) => {
      const inst = db.institutions.find((i) => i.id === cl.institutionId)!;
      const group = cl.linkGroupId ? db.linkGroups.find((g) => g.id === cl.linkGroupId) : undefined;
      return {
        ...cl,
        institution: { id: inst.id, name: inst.name, region: inst.region, city: inst.city },
        group,
        canAct: ROLES[v.role].can.link && (v.role === "ca" || cl.caseIds.some((id) => isOwnCase(v, caseById.get(id)!))),
        cases: cl.caseIds.map((id) => {
          const c = caseById.get(id)!;
          const off = db.officers.find((o) => o.id === c.officerId);
          return {
            id,
            bureau: c.bureau,
            status: c.status,
            category: c.category,
            subject: c.subject,
            description: c.description,
            reference: c.reference,
            reportedName: c.reportedName,
            reportedPid: c.reportedPid,
            dateReceived: c.dateReceived,
            officer: off?.name,
            sla: slaInfo(db, c),
          };
        }),
      };
    });
  return json({ items, minConfidence: db.settings.overlapMinConfidence });
}

async function handlePOST(req: Request) {
  const db = getDb();
  const v = viewerFrom(req, db);
  const body = await parseJson(req, Body);
  const note = (body.note ?? "").trim();
  if (!ROLES[v.role].can.link) return forbidden("Your role cannot link or coordinate cases");
  if (note.length < 5) return json({ error: "A coordination note is mandatory (min 5 characters)." }, { status: 400 });
  const vis = visibleIds(db, v);
  const ids = [...new Set(body.caseIds ?? [])];
  if (ids.length < 2 && body.action !== "unlink") return json({ error: "Select at least two cases" }, { status: 400 });
  const cases = ids.map((id) => db.cases.find((c) => c.id === id));
  if (cases.some((c) => !c)) return json({ error: "Unknown case id" }, { status: 400 });
  if (cases.some((c) => !vis.has(c!.id))) return forbidden("One or more cases are outside your visibility");
  if (v.role !== "ca" && !cases.some((c) => isOwnCase(v, c!))) return forbidden("You can only link clusters that include a case of your bureau/cell");

  const out = mutate((d) => {
    const by = officerName(d, v);
    const now = new Date().toISOString();
    const list = ids.map((id) => d.cases.find((c) => c.id === id)!);
    const addAct = (type: CaseAction["type"], remarks: string) =>
      list.forEach((c) => {
        const a: CaseAction = { id: nextActionId(d), at: now, type, by, bureau: viewerUnit(d, v), remarks };
        if (v.role === "ca") a.by = `${by} (Competent Authority)`;
        c.actions.push(a);
        if (type !== "Remark") {
          c.lastAction = `${type}: ${remarks}`;
          c.lastActionDate = now;
        }
      });
    if (body.action === "dismiss") {
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) d.dismissedPairs.push(pairKey(ids[i], ids[j]));
      addAct("Remark", `Overlap suggestion ${body.clusterId ?? ""} reviewed and marked NOT related by ${by}: ${note}`);
      audit(d, { role: v.role, actor: by, action: "OVERLAP_DISMISS", target: ids.join(","), detail: note });
      return { ok: true };
    }
    if (body.action === "unlink") {
      const gid = list[0]?.linkGroupId;
      if (gid) {
        d.linkGroups = d.linkGroups.filter((g) => g.id !== gid);
        d.cases.forEach((c) => c.linkGroupId === gid && delete c.linkGroupId);
      }
      addAct("Remark", `Link ${gid} removed: ${note}`);
      audit(d, { role: v.role, actor: by, action: "OVERLAP_UNLINK", target: ids.join(","), detail: note });
      return { ok: true };
    }
    // link or coordinate: ensure one group containing all ids (merge existing)
    const existing = [...new Set(list.map((c) => c.linkGroupId).filter(Boolean))] as string[];
    let group = existing.length ? d.linkGroups.find((g) => g.id === existing[0]) : undefined;
    const lead = body.leadBureau ?? group?.leadBureau ?? (list.find((c) => c.bureau === "RB")?.bureau ?? list[0].bureau);
    if (!group) {
      d.counters.group++;
      group = { id: `LG-${String(d.counters.group).padStart(4, "0")}`, caseIds: [], status: "Linked", leadBureau: lead, note, by, at: now };
      d.linkGroups.push(group);
    }
    for (const gid of existing.slice(1)) {
      const g = d.linkGroups.find((x) => x.id === gid);
      if (g) group.caseIds.push(...g.caseIds);
      d.linkGroups = d.linkGroups.filter((x) => x.id !== gid);
      d.cases.forEach((c) => c.linkGroupId === gid && (c.linkGroupId = group!.id));
    }
    group.caseIds = [...new Set([...group.caseIds, ...ids])];
    group.leadBureau = lead;
    group.by = by;
    group.at = now;
    group.note = note;
    d.cases.filter((c) => group!.caseIds.includes(c.id)).forEach((c) => (c.linkGroupId = group!.id));
    if (body.action === "coordinate") {
      group.status = "Coordinated";
      addAct("Coordinated", `Marked coordinated in ${group.id}. Lead unit: ${lead}. ${note}`);
    } else {
      addAct("Linked", `Linked as related cases in ${group.id} (${group.caseIds.join(", ")}). Lead unit: ${lead}. ${note}`);
    }
    audit(d, { role: v.role, actor: by, action: body.action === "coordinate" ? "OVERLAP_COORDINATE" : "OVERLAP_LINK", target: group.id, detail: `${group.caseIds.join(", ")} · lead ${lead} · ${note}` });
    return { ok: true, group };
  });
  return json(out);
}

export const GET = withApi(handleGET);
export const POST = withApi(handlePOST);
