"use client";
import * as React from "react";
import Link from "next/link";
import { AlarmClock, ArrowRightLeft, BellRing, CheckCheck, Clock, GitMerge, Copy, Siren, TriangleAlert } from "lucide-react";
import { useApi, useRole } from "@/components/role-provider";
import { Button, Card, Skeleton, Tabs, cn } from "@/components/ui";
import { ErrorNote } from "@/components/bits";
import type { Alert } from "@/lib/server";
import { fmtDateTime } from "@/lib/util";

const TYPES: { key: Alert["type"] | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "overlap", label: "Overlaps" },
  { key: "duplicate", label: "Duplicates" },
  { key: "sla_breach", label: "SLA breached" },
  { key: "sla_due", label: "Due soon" },
  { key: "no_action", label: "Pending reminders" },
  { key: "escalation", label: "Escalations" },
  { key: "transfer", label: "Transfers" },
  { key: "burst", label: "Complaint bursts" },
];

const ICON: Record<Alert["type"], React.ComponentType<{ className?: string }>> = {
  overlap: GitMerge,
  duplicate: Copy,
  sla_breach: Siren,
  sla_due: AlarmClock,
  no_action: Clock,
  escalation: TriangleAlert,
  transfer: ArrowRightLeft,
  burst: BellRing,
};

const TONE = (a: Alert) =>
  a.type === "overlap" || a.type === "duplicate"
    ? "text-violet-300 bg-violet-500/10 border-violet-400/30"
    : a.severity === "critical"
    ? "text-red-300 bg-red-500/15 border-red-400/40"
    : a.severity === "high"
    ? "text-red-300 bg-red-500/10 border-red-400/25"
    : a.severity === "medium"
    ? "text-amber-200 bg-amber-400/10 border-amber-300/25"
    : "text-sky-200 bg-sky-400/10 border-sky-300/25";

export default function AlertsPage() {
  const { api, bump, meta } = useRole();
  const { data, error, loading, reload } = useApi<{ items: Alert[]; unread: number; counts: Record<string, number> }>("/api/alerts", { interval: 5000 });
  const [tab, setTab] = React.useState<Alert["type"] | "all">("all");
  const [unreadOnly, setUnreadOnly] = React.useState(false);
  const items = (data?.items ?? []).filter((a) => (tab === "all" || a.type === tab) && (!unreadOnly || !a.read));
  const mark = async (body: object) => {
    await api("/api/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    reload();
    bump();
  };
  return (
    <div className="mx-auto max-w-[1180px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-white">Alerts and notifications</h1>
          <p className="text-[13.5px] text-slate-400">
            Generated continuously from case data. Reminders fire after {meta?.settings.reminderNoActionDays ?? 14} days without action; due-soon warnings start {meta?.settings.warningWindowDays ?? 5} days before disposal date.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-[13px] text-slate-300">
            <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} className="accent-saffron" /> Unread only
          </label>
          <Button variant="secondary" size="sm" onClick={() => mark({ all: true })}>
            <CheckCheck className="h-4 w-4" /> Mark all read
          </Button>
        </div>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        items={TYPES.map((t) => ({
          key: t.key,
          label: (
            <>
              {t.label} <span className="num ml-1 text-slate-500">{t.key === "all" ? data?.items.length ?? "" : data?.counts[t.key] ?? 0}</span>
            </>
          ),
        }))}
      />
      {error && <ErrorNote msg={error} />}
      <Card className="divide-y divide-white/[0.05] overflow-hidden">
        {loading && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="m-4 h-12" />)}
        {items.map((a) => {
          const I = ICON[a.type];
          return (
            <div key={a.id} className={cn("flex items-start gap-4 px-5 py-3.5", a.read && "opacity-55")}>
              <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border", TONE(a))}>
                <I className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-semibold text-white">{a.title}</span>
                  {!a.read && <span className="h-1.5 w-1.5 rounded-full bg-saffron" aria-label="unread" />}
                </div>
                <div className="text-[13px] text-slate-300">{a.message}</div>
                <div className="mt-0.5 text-[12px] text-slate-500">{fmtDateTime(a.at)}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Link href={a.href} onClick={() => !a.read && mark({ ids: [a.id] })} className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-saffron hover:bg-white/[0.05]">
                  Open
                </Link>
                {!a.read && (
                  <Button size="sm" variant="ghost" onClick={() => mark({ ids: [a.id] })}>
                    Mark read
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        {data && items.length === 0 && <div className="px-6 py-12 text-center text-sm text-slate-400">No alerts in this view.</div>}
      </Card>
    </div>
  );
}
