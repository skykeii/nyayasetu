import { withApi } from "@/lib/api";
import { z } from "zod";
import { ApiError, parseForm, validate } from "@/lib/api";
import { saveUploads } from "@/lib/files";
import { audit, getDb, mutate, nextActionId } from "@/lib/store";
import { forbidden, isOwnCase, json, officerName, viewerFrom, viewerUnit, visibleIds } from "@/lib/server";
import { nextActionFor } from "@/lib/seed";
import type { ActionType, BureauCode, CaseAction } from "@/lib/types";
import { BUREAUS } from "@/lib/types";

export const dynamic = "force-dynamic";

const KINDS = ["Remark", "Notice Issued", "Reply Received", "Hearing Scheduled", "Accept", "Assign", "Transfer", "Escalate", "Return", "Dispose"] as const;
type Kind = (typeof KINDS)[number];

const Fields = z.object({
  kind: z.enum(KINDS, { error: "Unknown action" }),
  remarks: z.string({ error: "Remarks are mandatory" }).trim().min(5, "Remarks are mandatory (min 5 characters) — every action needs a recorded human decision.").max(2000),
  toBureau: z.string().max(10).optional(),
  officerId: z.string().max(20).optional(),
});

async function handlePOST(req: Request, { params }: { params: { id: string } }) {
  const db = getDb();
  const v = viewerFrom(req, db);
  const c = db.cases.find((x) => x.id === params.id);
  if (!c) return json({ error: "Case not found" }, { status: 404 });
  if (!visibleIds(db, v).has(c.id)) return forbidden();

  const form = await parseForm(req);
  const fields = validate(Fields, { kind: form.get("kind"), remarks: form.get("remarks"), toBureau: form.get("toBureau") ?? undefined, officerId: form.get("officerId") ?? undefined });
  const kind: Kind = fields.kind;
  const remarks = fields.remarks;
  const toBureau = (fields.toBureau ?? "") as BureauCode;
  const officerId = fields.officerId ?? "";

  const own = isOwnCase(v, c);
  if (kind !== "Remark" && !own) return forbidden("Only the handling bureau/cell (or Competent Authority) can take this action. You may add a coordination remark.");
  if (kind === "Return" && v.role !== "ca") return forbidden("Only the Competent Authority can return escalated cases with directions.");
  if (c.status === "Disposed" && kind !== "Remark") return json({ error: "Case already disposed" }, { status: 400 });
  if (kind === "Transfer" && (!BUREAUS.some((b) => b.code === toBureau) || toBureau === c.bureau)) return json({ error: "Choose a different destination bureau/cell" }, { status: 400 });

  if (kind === "Assign" && db.officers.find((o) => o.id === officerId)?.bureau !== c.bureau) return json({ error: "Choose an officer of the handling bureau/cell" }, { status: 400 });

  const { docs, error } = await saveUploads(form.getAll("files"));
  if (error) throw new ApiError(400, error);

  const result = mutate((d) => {
    const cs = d.cases.find((x) => x.id === c.id)!;
    const by = officerName(d, v);
    const unit: CaseAction["bureau"] = viewerUnit(d, v);
    const now = new Date().toISOString();
    const a: CaseAction = { id: nextActionId(d), at: now, type: "Remark", by, bureau: unit, remarks, docs: docs.length ? docs : undefined };
    const map: Record<Kind, ActionType> = {
      Remark: "Remark",
      "Notice Issued": "Notice Issued",
      "Reply Received": "Reply Received",
      "Hearing Scheduled": "Hearing Scheduled",
      Accept: "Assigned",
      Assign: "Assigned",
      Transfer: "Transferred",
      Escalate: "Escalated",
      Return: "Status Change",
      Dispose: "Disposed",
    };
    a.type = map[kind];
    if (v.role === "ca") a.by = `${by} (Competent Authority)`;
    switch (kind) {
      case "Notice Issued":
      case "Reply Received":
      case "Hearing Scheduled":
        if (cs.status === "New") cs.status = "Under Process";
        break;
      case "Accept": {
        const off = d.officers.find((o) => o.bureau === cs.bureau && o.id === v.officerId) ?? d.officers.find((o) => o.bureau === cs.bureau)!;
        cs.officerId = off.id;
        a.to = off.name;
        cs.status = "Under Process";
        break;
      }
      case "Assign": {
        const off = d.officers.find((o) => o.id === officerId)!;
        cs.officerId = off.id;
        a.to = off.name;
        cs.status = "Under Process";
        break;
      }
      case "Transfer": {
        a.from = cs.bureau;
        a.to = toBureau;
        cs.bureau = toBureau;
        cs.officerId = d.officers.find((o) => o.bureau === toBureau)!.id;
        cs.status = "Transferred";
        break;
      }
      case "Escalate":
        a.from = cs.bureau;
        a.to = "Competent Authority";
        cs.status = "Escalated";
        break;
      case "Return":
        a.remarks = `Directions issued: ${remarks}`;
        a.to = cs.bureau;
        cs.status = "Under Process";
        break;
      case "Dispose":
        cs.status = "Disposed";
        cs.disposedAt = now;
        const sc = d.studentComplaints.find((x) => x.caseId === cs.id);
        if (sc) {
          sc.status = "Closed by AICTE";
          sc.closedAt = now;
          sc.actions.push({ at: now, type: "Closed by AICTE", by: `${cs.bureau}, AICTE`, remarks });
        }
        break;
      default:
        break;
    }
    cs.actions.push(a);
    cs.lastAction = `${a.type}: ${a.remarks}`;
    cs.lastActionDate = now;
    cs.nextAction = nextActionFor(cs);
    audit(d, { role: v.role, actor: a.by, action: `CASE_${kind.toUpperCase().replace(/\s/g, "_")}`, target: cs.id, detail: `${remarks}${a.to ? ` → ${a.to}` : ""}${docs.length ? ` [${docs.length} doc(s)]` : ""}` });
    return { ok: true, action: a, status: cs.status };
  });
  return json(result);
}

export const POST = withApi(handlePOST);
