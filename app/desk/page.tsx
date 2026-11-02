"use client";
import * as React from "react";
import Link from "next/link";
import { useApi, useRole } from "@/components/role-provider";
import { Badge, Card, CardHeader, Skeleton, cn } from "@/components/ui";
import { BureauChip, Confidence, CountUp, ErrorNote, SeverityDot } from "@/components/bits";
import { CaseDrawer } from "@/components/case-drawer";
import { OverlapBridge } from "@/components/overlap-bridge";
import type { Severity } from "@/lib/types";

interface Row {
  id: string;
  bureau: string;
  category: string;
  institution?: string;
  nextAction: string;
  daysToDue: number;
  severity: Severity;
}
interface Desk {
  kpi: Record<string, number>;
  scope: string;
  mine: Row[];
  dueSoon: Row[];
  overlapFeed: { id: string; status: string; confidence: number; institutionId: string; institution?: string; cases: { id: string; bureau: string; subject: string; reference: string; reportedName: string }[] }[];
}

function Queue({ rows, onOpen, empty }: { rows?: Row[]; onOpen: (id: string) => void; empty: string }) {
  if (!rows) return <Skeleton className="mx-5 mb-4 h-40" />;
  if (!rows.length) return <div className="px-5 py-8 text-center text-sm text-slate-400">{empty}</div>;
  return (
    <div className="divide-y divide-white/[0.05] pb-2">
      {rows.map((q) => (
        <button key={q.id} onClick={() => onOpen(q.id)} className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-white/[0.03]">
          <span className={cn("num w-14 shrink-0 text-right text-[13px] font-semibold", q.daysToDue < 0 ? "text-red-300" : q.daysToDue <= 5 ? "text-amber-200" : "text-slate-300")}>{q.daysToDue < 0 ? `${-q.daysToDue}d late` : `${q.daysToDue}d`}</span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="num text-[13px] font-medium text-white">{q.id}</span>
              <BureauChip code={q.bureau} />
              <SeverityDot s={q.severity} />
            </span>
            <span className="block truncate text-[12px] text-slate-400">
              {q.institution} · {q.nextAction}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

export default function MyDesk() {
  const { meta } = useRole();
  const { data, error } = useApi<Desk>("/api/dashboard", { interval: 5000 });
  const [open, setOpen] = React.useState<string | null>(null);
  if (error) return <ErrorNote msg={error} />;
  const k = data?.kpi;
  return (
    <div className="mx-auto max-w-[1280px] space-y-5">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight text-white">My desk</h1>
        <p className="text-[13.5px] text-slate-400">
          {meta.viewer.officerName}, {meta.viewer.designation} · {data?.scope ?? ""}
        </p>
      </div>
      <Card className="grid grid-cols-2 overflow-hidden sm:grid-cols-4">
        {[
          { l: "Assigned to me", v: data?.mine.length, t: "text-white" },
          { l: "Unit pending", v: k?.pending, t: "text-amber-200" },
          { l: "Unit beyond timeline", v: k?.beyondTimeline, t: "text-red-300" },
          { l: "Open overlaps with my unit", v: data?.overlapFeed.filter((o) => o.status === "Open").length, t: "text-violet-300" },
        ].map((x) => (
          <div key={x.l} className="border-b border-r border-white/[0.06] px-4 py-3">
            <div className="text-[12.5px] text-slate-400">{x.l}</div>
            {x.v === undefined ? <Skeleton className="mt-1 h-7 w-12" /> : <CountUp value={x.v} className={cn("text-[26px] font-bold", x.t)} />}
          </div>
        ))}
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader title="My queue" sub="Open cases assigned to you, soonest disposal date first" />
          <Queue rows={data?.mine} onOpen={setOpen} empty="Nothing is assigned to you right now." />
        </Card>
        <Card className="min-w-0">
          <CardHeader title="Due soon in my unit" sub="Overdue or inside the warning window" />
          <Queue rows={data?.dueSoon} onOpen={setOpen} empty="Nothing in your unit is close to its date." />
        </Card>
      </div>
      <Card className="min-w-0">
        <CardHeader
          title="Overlaps involving my unit"
          right={
            <Link href="/overlaps" className="text-[13px] font-medium text-saffron hover:underline">
              All overlaps
            </Link>
          }
        />
        <div className="space-y-3 px-5 pb-5">
          {data?.overlapFeed.map((o) => (
            <div key={o.id} className={cn("rounded-xl border p-3.5", o.status === "Open" ? "border-violet-400/30 bg-violet-500/[0.05]" : "border-white/[0.07]")}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <Link href={`/institutions/${o.institutionId}`} className="truncate text-[14px] font-semibold text-white hover:text-saffron">
                  {o.institution}
                </Link>
                <span className="flex items-center gap-2">
                  <Badge tone={o.status === "Open" ? "violet" : "emerald"}>{o.status}</Badge>
                  <Confidence value={o.confidence} />
                </span>
              </div>
              <OverlapBridge cases={o.cases} status={o.status} onOpen={setOpen} compact />
            </div>
          ))}
          {data && !data.overlapFeed.length && <div className="py-6 text-center text-sm text-slate-400">No overlaps involve your unit.</div>}
        </div>
      </Card>
      <CaseDrawer id={open} onClose={() => setOpen(null)} />
    </div>
  );
}
