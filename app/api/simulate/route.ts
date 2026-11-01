import { audit, getDb, mutate, nextActionId, nextCaseId } from "@/lib/store";
import { forbidden, json, officerName, viewerFrom } from "@/lib/server";
import { ROUTING, SCENARIOS, SUBJECTS, TEMPLATES, fill, nextActionFor, variantName } from "@/lib/seed";
import { resolveInstitution } from "@/lib/resolve";
import { ROLES } from "@/lib/roles";
import type { BureauCode, Case, Category } from "@/lib/types";
import { CATEGORIES } from "@/lib/types";
import { addDays, pick } from "@/lib/util";

export const dynamic = "force-dynamic";

const FIRST = ["Akash", "Bhavya", "Chetan", "Deepika", "Eshan", "Gayatri", "Harsha", "Ira", "Jatin", "Kavya", "Lokesh", "Mansi"];
const LAST = ["Agarwal", "Bhatt", "Chowdhury", "Dutta", "Gowda", "Hegde", "Jain", "Kapoor", "Menon", "Reddy"];

export async function POST(req: Request) {
  const db = getDb();
  const v = viewerFrom(req, db);
  if (!ROLES[v.role].can.simulate) return forbidden("Regional officers cannot inject demo cases");
  const r = Math.random;
  const open = db.cases.filter((c) => c.status !== "Disposed" && (c.bureau === "RB" || c.bureau === "PGRC") && !c.linkGroupId && !c.planted?.startsWith("burst") && c.complainantType !== "Anonymous");
  const makeOverlap = open.length > 0 && r() < 0.55;

  let inst = db.institutions[Math.floor(r() * db.institutions.length)];
  let category: Category = pick(r, CATEGORIES);
  let bureau: BureauCode = ROUTING[category];
  let subject = "";
  let text = "";
  let type: Case["complainantType"] = "Student";
  let channel: Case["channel"] = "AICTE Portal";
  let overlapWith: string | undefined;

  if (makeOverlap) {
    const base = pick(r, open);
    inst = db.institutions.find((i) => i.id === base.institutionId)!;
    category = base.category;
    bureau = base.bureau === "RB" ? "PGRC" : "RB";
    overlapWith = base.id;
    const sc = SCENARIOS.find((s) => s.category === category && s.parts.some((p) => p.bureau === bureau) && s.parts.some((p) => p.subject === base.subject));
    const part = sc?.parts.find((p) => p.bureau === bureau);
    if (part) {
      subject = part.subject;
      text = part.text;
      type = part.type;
      channel = part.channel;
    } else {
      subject = bureau === "RB" ? `Reference: ${base.subject}` : base.subject;
      text =
        bureau === "RB"
          ? `Reference forwarded by the Ministry of Education on a representation against {inst}. ${base.description.replace(base.reportedName, "{inst}")} Examination under AICTE regulations requested.`
          : `I am writing again because no one has helped. ${base.description.replace(base.reportedName, "{inst}")}`;
      type = bureau === "RB" ? "Public" : "Student";
      channel = bureau === "RB" ? "Referred by Ministry" : "Email";
    }
  } else {
    const idx = Math.floor(r() * TEMPLATES[category].length);
    subject = SUBJECTS[category][idx];
    text = TEMPLATES[category][idx];
  }

  const reportedName = bureau === "RB" ? inst.name : variantName(r, inst);
  const reportedPid = bureau === "RB" || r() < 0.3 ? inst.id : undefined;
  const res = resolveInstitution(db.institutions, reportedName, reportedPid);
  const description = text.includes("{inst}") ? fill(text, r, reportedName) : text;

  const created = mutate((d) => {
    const id = nextCaseId(d);
    const now = new Date().toISOString();
    const yy = String(new Date().getFullYear());
    const reference =
      bureau === "RB" ? `RB/F.No.${1000 + Math.floor(r() * 9000)}/${yy.slice(2)}` : bureau === "PGRC" ? `PGRC/${yy}/${String(Math.floor(r() * 99999)).padStart(5, "0")}` : `${bureau}/${100 + Math.floor(r() * 900)}/${yy.slice(2)}`;
    const c: Case = {
      id,
      reference,
      dateReceived: now,
      category,
      status: "New",
      severity: category === "Harassment / Ragging" ? "Critical" : pick(r, ["Medium", "High", "Medium"] as const),
      bureau,
      officerId: d.officers.find((o) => o.bureau === bureau)!.id,
      institutionId: res.institutionId ?? inst.id,
      reportedName,
      reportedPid,
      matchConfidence: res.institutionId ? res.confidence : 0.6,
      matchReason: res.institutionId ? res.reason : "Unmatched — flagged for manual mapping",
      complainantType: type,
      complainantName: type === "Public" ? "Ministry of Education (referral)" : `${pick(r, FIRST)} ${pick(r, LAST)}`,
      channel,
      language: "English",
      subject,
      description,
      lastAction: "",
      lastActionDate: now,
      nextAction: "",
      expectedDisposalDate: addDays(now, d.settings.slaDays[category]),
      actions: [
        {
          id: nextActionId(d),
          at: now,
          type: "Received",
          by: "System",
          bureau: "SYSTEM",
          remarks: `Complaint received via ${channel}. Institution auto-mapped to ${res.institutionId ?? inst.id} (confidence ${Math.round((res.confidence || 0.6) * 100)}%, advisory; ${res.reason}).`,
        },
      ],
    };
    c.lastAction = `Received: ${c.actions[0].remarks}`;
    c.nextAction = nextActionFor(c);
    d.cases.push(c);
    audit(d, { role: v.role, actor: officerName(d, v), action: "SIMULATE_CASE", target: id, detail: `Demo case injected (${bureau}, ${category})${overlapWith ? `; designed to overlap with ${overlapWith}` : ""}` });
    return c;
  });
  return json({ id: created.id, bureau, category, institution: inst.name, overlapWith });
}
