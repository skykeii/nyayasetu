"use client";
import * as React from "react";
import { RotateCcw, Save } from "lucide-react";
import { useApi, useRole } from "@/components/role-provider";
import { Button, Card, CardHeader, Input, Label, Skeleton } from "@/components/ui";
import { ErrorNote } from "@/components/bits";
import type { Settings } from "@/lib/types";

export default function SettingsPage() {
  const { api, toast, bump, role } = useRole();
  const { data, error } = useApi<{ settings: Settings; defaults: Settings }>("/api/settings");
  const [s, setS] = React.useState<Settings | null>(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (data) setS(JSON.parse(JSON.stringify(data.settings)));
  }, [data]);
  if (error) return <ErrorNote msg={error} />;
  if (!s || !data) return <Skeleton className="mx-auto h-[600px] max-w-[980px]" />;
  const save = async () => {
    setBusy(true);
    try {
      await api("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) });
      toast({ title: "SLA settings saved", body: "Expected disposal dates and alerts recalculated.", tone: "emerald" });
      bump();
    } catch (e) {
      toast({ title: "Not saved", body: (e as Error).message, tone: "red" });
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    if (!confirm("Regenerate the synthetic demo dataset? All demo actions will be lost.")) return;
    try {
      await api("/api/reset", { method: "POST" });
      toast({ title: "Demo data regenerated", tone: "emerald" });
      bump();
    } catch (e) {
      toast({ title: "Reset failed", body: (e as Error).message, tone: "red" });
    }
  };
  return (
    <div className="mx-auto max-w-[980px] space-y-5">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight text-white">SLA settings</h1>
        <p className="text-[13.5px] text-slate-400">Disposal timelines per complaint category drive due dates, reminders, escalation alerts and every SLA report.</p>
      </div>
      <Card>
        <CardHeader title="Disposal timeline by category" sub="Days from receipt to expected disposal" />
        <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
          {(Object.keys(s.slaDays) as (keyof Settings["slaDays"])[]).map((cat) => (
            <div key={cat}>
              <Label>
                {cat} <span className="text-slate-600">(default {data.defaults.slaDays[cat]})</span>
              </Label>
              <div className="flex items-center gap-2">
                <Input type="number" min={1} max={365} value={s.slaDays[cat]} onChange={(e) => setS({ ...s, slaDays: { ...s.slaDays, [cat]: Number(e.target.value) } })} className="w-28" disabled={role !== "ca"} />
                <span className="text-[13px] text-slate-400">days</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <CardHeader title="Reminders and detection" />
        <div className="grid gap-5 px-5 pb-5 sm:grid-cols-3">
          <div>
            <Label>Pending reminder after no action for</Label>
            <div className="flex items-center gap-2">
              <Input type="number" min={1} max={90} value={s.reminderNoActionDays} onChange={(e) => setS({ ...s, reminderNoActionDays: Number(e.target.value) })} className="w-24" disabled={role !== "ca"} />
              <span className="text-[13px] text-slate-400">days</span>
            </div>
          </div>
          <div>
            <Label>Due-soon warning starts</Label>
            <div className="flex items-center gap-2">
              <Input type="number" min={0} max={30} value={s.warningWindowDays} onChange={(e) => setS({ ...s, warningWindowDays: Number(e.target.value) })} className="w-24" disabled={role !== "ca"} />
              <span className="text-[13px] text-slate-400">days before</span>
            </div>
          </div>
          <div>
            <Label>Overlap alert threshold</Label>
            <input type="range" min={0.4} max={0.95} step={0.01} value={s.overlapMinConfidence} onChange={(e) => setS({ ...s, overlapMinConfidence: Number(e.target.value) })} className="w-full accent-violet-400" disabled={role !== "ca"} />
            <div className="num text-[13px] text-violet-200">{Math.round(s.overlapMinConfidence * 100)}% minimum confidence</div>
          </div>
        </div>
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="danger" onClick={reset} disabled={role !== "ca"}>
          <RotateCcw className="h-4 w-4" /> Regenerate demo data
        </Button>
        <Button variant="primary" onClick={save} loading={busy} disabled={role !== "ca"}>
          <Save className="h-4 w-4" /> Save settings
        </Button>
      </div>
      {role !== "ca" && <p className="text-[13px] text-slate-500">Only the Competent Authority can change these settings.</p>}
    </div>
  );
}
