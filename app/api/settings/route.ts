import { audit, getDb, mutate, recomputeSla } from "@/lib/store";
import { forbidden, json, officerName, viewerFrom } from "@/lib/server";
import { CATEGORIES, type Settings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  return json({ settings: getDb().settings, defaults: DEFAULT_SETTINGS });
}

export async function PUT(req: Request) {
  const db = getDb();
  const v = viewerFrom(req, db);
  if (v.role !== "ca") return forbidden("Only the Competent Authority can change SLA settings");
  const body = (await req.json()) as Partial<Settings>;
  const clamp = (n: unknown, lo: number, hi: number, d: number) => {
    const x = Number(n);
    return Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : d;
  };
  const out = mutate((d) => {
    const before = JSON.stringify(d.settings);
    for (const c of CATEGORIES) d.settings.slaDays[c] = clamp(body.slaDays?.[c], 1, 365, d.settings.slaDays[c]);
    d.settings.reminderNoActionDays = clamp(body.reminderNoActionDays, 1, 90, d.settings.reminderNoActionDays);
    d.settings.warningWindowDays = clamp(body.warningWindowDays, 0, 30, d.settings.warningWindowDays);
    const mc = Number(body.overlapMinConfidence);
    if (Number.isFinite(mc)) d.settings.overlapMinConfidence = Math.min(0.95, Math.max(0.4, Math.round(mc * 100) / 100));
    recomputeSla(d);
    audit(d, { role: v.role, actor: officerName(d, v), action: "SETTINGS_UPDATE", target: "settings", detail: `before ${before} → after ${JSON.stringify(d.settings)}` });
    return d.settings;
  });
  return json({ settings: out });
}
