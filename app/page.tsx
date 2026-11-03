"use client";
import * as React from "react";
import Link from "next/link";
import { useApi, useRole } from "@/components/role-provider";
import { Badge, Card, CardHeader, Skeleton, cn } from "@/components/ui";
import { BureauChip, Confidence, CountUp, ErrorNote, SeverityDot, Updated } from "@/components/bits";
import { BarsChart, LinesChart } from "@/components/charts";
import { MapLegend, OverlapBridge } from "@/components/overlap-bridge";
import { ConnectionMap, type Connection } from "@/components/connection-map";
import { MetricToggle, StateHeatmap, type AreaRow, type Metric } from "@/components/state-heatmap";
import { CaseDrawer } from "@/components/case-drawer";
import type { Severity, Status } from "@/lib/types";
import { fmtDateTime } from "@/lib/util";

interface Dash {
  kpi: Record<string, number>;
  studentPortal: { total: number; withCollege: number; awaiting: number; escalated: number; closed: number; newThisWeek: number } | null;
  bureauWorkload: Record<string, number | string>[];
  institutionStatus: Record<string, number | string>[];
  trend: { month: string; received: number; disposed: number }[];
  regions: { region: string; open: number; overdue: number; total: number }[];
  activity: { id: string; at: string; type: string; by: string; bureau: string; remarks: string; caseId: string; institution?: string }[];
  queue: { id: string; category: string; bureau: string; status: Status; institution?: string; nextAction: string; daysToDue: number; severity: Severity }[];
  overlapFeed: { id: string; status: string; confidence: number; bureaus: string[]; institutionId: string; institution?: string; cases: { id: string; bureau: string; subject: string; reference: string; reportedName: string }[]; topReason?: string; newestAt: string; pairs?: { a: string; b: string; confidence: number; reasons: string[] }[] }[];
  connections?: Connection[];
  connectionsTotal?: number;
  scope: string;
  generatedAt: string;
}

const TITLES: Record<string, string> = {
  ca: "National command center",
  rb: "Regulation Bureau desk",
  pgrc: "Grievance Redressal Cell desk",
  other: "Bureau / Cell desk",
  ro: "Regional dashboard",
};

export default function CommandCenter() {
  const { role } = useRole();
  const { data, error, loading, updatedAt } = useApi<Dash>("/api/dashboard", { interval: 5000 });
  const [open, setOpen] = React.useState<string | null>(null);
  const { data: map } = useApi<{ states: AreaRow[] }>("/api/heatmap", { interval: 30000 });
  const [metric, setMetric] = React.useState<Metric>("density");
  if (error) return <ErrorNote msg={error} />;

  const k = data?.kpi;
  const tiles: { label: string; value?: number; href: string; tone?: string; hint?: string }[] = [
    { label: "Total received", value: k?.total, href: "/cases", hint: k ? `${k.receivedLast30} in last 30 days` : undefined },
    { label: "Pending", value: k?.pending, href: "/cases?status=open", tone: "text-amber-200", hint: k ? `${k.newCases} not yet assigned` : undefined },
    { label: "Under process", value: k?.underProcess, href: "/cases?status=Under%20Process" },
    { label: "Disposed", value: k?.disposed, href: "/cases?status=Disposed", tone: "text-emerald-300" },
    { label: "Transferred", value: k?.transferred, href: "/cases?status=Transferred", hint: k ? `${k.transferredOpen} awaiting acceptance` : undefined },
    { label: "Escalated", value: k?.escalated, href: "/cases?status=Escalated", tone: "text-orange-300" },
    { label: "Pending beyond timeline", value: k?.beyondTimeline, href: "/cases?status=overdue", tone: "text-red-300", hint: k ? `${k.dueSoon} due within the warning window` : undefined },
    { label: "Open overlaps", value: k?.overlapsOpen, href: "/overlaps", tone: "text-violet-300", hint: k ? `${k.duplicatesOpen} possible duplicates` : undefined },
  ];
  const sp = data?.studentPortal;
  if (sp) tiles.push({ label: "Student-portal complaints", value: sp.total, href: role === "ca" ? "/grievances" : "/heatmap", tone: "text-sky-200", hint: `${sp.withCollege} with colleges · ${sp.escalated} escalated · ${sp.newThisWeek} new this week` });

  return (
    <div className="mx-auto max-w-[1480px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[34px] leading-[1.1] tracking-tight text-white">{TITLES[role]}</h1>
          <p className="text-[14.5px] text-slate-400">{data?.scope ?? "Loading scope"}</p>
        </div>
        <div className="flex items-center gap-2 text-[13.5px] text-slate-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          Live, refreshes every 5 s <Updated at={updatedAt} />
        </div>
      </div>

      <Card className={cn("grid grid-cols-2 divide-white/[0.06] overflow-hidden sm:grid-cols-4 [&>*]:border-white/[0.06]", tiles.length > 8 ? "sm:grid-cols-3 xl:grid-cols-9" : "xl:grid-cols-8")}>
        {tiles.map((t, i) => (
          <Link key={t.label} href={t.href} className={cn("group border-b px-4 py-4 transition-colors hover:bg-white/[0.03] xl:border-b-0", i % 4 !== 3 && "sm:border-r", "xl:border-r last:border-r-0")}>
            <div className="text-[13.5px] text-slate-400 group-hover:text-slate-200">{t.label}</div>
            {t.value === undefined ? <Skeleton className="mt-2 h-8 w-16" /> : <CountUp value={t.value} className={cn("mt-1 block text-[28px] font-bold leading-tight tracking-tight text-white", t.tone)} />}
            {t.hint && <div className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-slate-500">{t.hint}</div>}
          </Link>
        ))}
      </Card>


      <div className="grid items-start gap-5 xl:grid-cols-[1.15fr_1fr]">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader
            title="Cross-bureau overlap alerts"
            sub="Same institution, same issue, handled by different units. Detected from Permanent ID, fuzzy name and complaint text."
            right={
              <Link href="/overlaps" className="text-[14px] font-medium text-saffron hover:underline">
                All overlaps
              </Link>
            }
          />
          <div className="space-y-4 px-6 pb-6">
            {loading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}
            <MapLegend className="pb-1" />
            {data?.overlapFeed.map((o) => (
              <div key={o.id} className="border-t border-[#EADFCD] pt-4 first:border-t-0 first:pt-1">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/institutions/${o.institutionId}`} className="block truncate font-display text-[17px] font-semibold text-white hover:text-saffron">
                      {o.institution}
                    </Link>
                    {o.status === "Open" && <div className="text-[13.5px] font-medium text-violet-300">Potential Overlapping Cases – Coordination Required</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={o.status === "Open" ? "violet" : o.status === "Coordinated" ? "emerald" : "indigo"}>{o.status === "Open" ? "Needs coordination" : o.status}</Badge>
                    <Confidence value={o.confidence} />
                  </div>
                </div>
                <OverlapBridge cases={o.cases} pairs={o.pairs} institution={o.institution} status={o.status} onOpen={setOpen} compact />
                {o.topReason && <div className="mt-2 truncate text-[13.5px] text-slate-500">Why: {o.topReason}</div>}
              </div>
            ))}
            {data && data.overlapFeed.length === 0 && <div className="py-8 text-center text-sm text-slate-400">No cross-bureau overlaps in your scope. Use “Simulate incoming case” to generate one.</div>}
          </div>
        </Card>
        <Card className="min-w-0 xl:sticky xl:top-20">
          <CardHeader
            title="Connection map"
            sub="Which units are working on the same institution. Select an institution to coordinate."
            right={
              <Link href="/overlaps" className="text-[14px] font-medium text-saffron hover:underline">
                All overlaps
              </Link>
            }
          />
          <div className="px-6 pb-6">{data ? <ConnectionMap links={data.connections ?? []} total={data.connectionsTotal} /> : <Skeleton className="h-96" />}</div>
        </Card>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader title="Bureau / Cell workload" sub="Open cases by status, with SLA breaches" />
          <div className="px-3 pb-3">
            {data ? (
              <BarsChart
                horizontal
                stacked
                height={Math.max(150, data.bureauWorkload.length * 44 + 50)}
                data={data.bureauWorkload}
                x="bureau"
                series={[
                  { key: "New", label: "Pending", color: "#357D7A" },
                  { key: "Under Process", label: "Under process", color: "#C2831A" },
                  { key: "Transferred", label: "Transferred", color: "#53659A" },
                  { key: "Escalated", label: "Escalated", color: "#CC6A22" },
                ]}
              />
            ) : (
              <Skeleton className="m-2 h-48" />
            )}
            {data && (
              <div className="flex flex-wrap gap-2 px-2 pb-1">
                {data.bureauWorkload.map((b) => (
                  <span key={String(b.bureau)} className="inline-flex items-center gap-1.5 text-[13px] text-slate-400">
                    <BureauChip code={String(b.bureau)} /> <span className="num text-red-300">{b.overdue}</span> overdue
                  </span>
                ))}
              </div>
            )}
          </div>
        </Card>
        <Card className="min-w-0">
          <CardHeader title={role === "ca" || role === "ro" ? "Next actions due" : "My queue"} sub="Open cases closest to their disposal date" />
          <div className="divide-y divide-white/[0.05] pb-2">
            {loading && <Skeleton className="mx-5 mb-4 h-40" />}
            {data?.queue.map((q) => (
              <button key={q.id} onClick={() => setOpen(q.id)} className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-white/[0.03]">
                <span className={cn("num w-14 shrink-0 text-right text-[14px] font-semibold", q.daysToDue < 0 ? "text-red-300" : q.daysToDue <= 5 ? "text-amber-200" : "text-slate-300")}>{q.daysToDue < 0 ? `${-q.daysToDue}d late` : `${q.daysToDue}d`}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="num text-[14px] font-medium text-white">{q.id}</span>
                    <BureauChip code={q.bureau} />
                    <SeverityDot s={q.severity} />
                  </span>
                  <span className="block truncate text-[13px] text-slate-400">{q.nextAction}</span>
                </span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader title="Institution-wise status" sub="Institutions with the most open complaints in your scope" />
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[640px] text-[14px]">
              <thead>
                <tr className="border-y border-white/[0.06] text-left text-[13px] text-slate-500">
                  <th className="px-5 py-2 font-medium">Institution</th>
                  <th className="px-2 py-2 font-medium">Region</th>
                  <th className="px-2 py-2 text-right font-medium">Pending</th>
                  <th className="px-2 py-2 text-right font-medium">Under process</th>
                  <th className="px-2 py-2 text-right font-medium">Escalated</th>
                  <th className="px-2 py-2 text-right font-medium">Disposed</th>
                  <th className="px-2 py-2 text-right font-medium">Overdue</th>
                  <th className="px-5 py-2 text-right font-medium">Overlaps</th>
                </tr>
              </thead>
              <tbody>
                {data?.institutionStatus.map((r) => (
                  <tr key={String(r.id)} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="max-w-[280px] px-5 py-2">
                      <Link href={`/institutions/${r.id}`} className="block truncate text-slate-100 hover:text-saffron">
                        {r.name}
                      </Link>
                      <span className="num text-[12.5px] text-slate-500">{r.id}</span>
                    </td>
                    <td className="px-2 py-2 text-slate-400">{r.region}</td>
                    <td className="num px-2 py-2 text-right">{r.New}</td>
                    <td className="num px-2 py-2 text-right">{r["Under Process"]}</td>
                    <td className="num px-2 py-2 text-right">{r.Escalated}</td>
                    <td className="num px-2 py-2 text-right text-emerald-300/80">{r.Disposed}</td>
                    <td className={cn("num px-2 py-2 text-right", Number(r.overdue) > 0 && "font-semibold text-red-300")}>{r.overdue}</td>
                    <td className="px-5 py-2 text-right">{Number(r.overlaps) > 0 ? <Badge tone="violet">{r.overlaps}</Badge> : <span className="text-slate-500">0</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loading && <Skeleton className="m-5 h-48" />}
          </div>
        </Card>
        <Card className="min-w-0">
          <CardHeader title="Received vs disposed" sub="Last 12 months" />
          <div className="px-3 pb-3">
            {data ? (
              <LinesChart
                data={data.trend}
                x="month"
                series={[
                  { key: "received", label: "Received", color: "#CC6A22" },
                  { key: "disposed", label: "Disposed", color: "#4C8040" },
                ]}
              />
            ) : (
              <Skeleton className="m-2 h-60" />
            )}
          </div>
        </Card>
      </div>

      <Card className="min-w-0">
        <CardHeader
          title="Regional heatmap"
          sub="Select a state to open its cases."
          right={
            <Link href="/heatmap" className="text-[14px] font-medium text-saffron hover:underline">
              Full heatmap
            </Link>
          }
        />
        <div className="px-6 pb-6">
          <MetricToggle metric={metric} onChange={setMetric} />
          <div className="mt-3">{map ? <StateHeatmap rows={map.states} metric={metric} /> : <Skeleton className="h-96" />}</div>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1fr_1.55fr]">
        <Card className="min-w-0">
          <CardHeader title="Region snapshot" sub="Open complaints and SLA breaches by AICTE region" />
          <div className="px-3 pb-3">
            {data ? (
              <BarsChart
                data={data.regions}
                x="region"
                height={250}
                series={[
                  { key: "open", label: "Open", color: "#C2831A" },
                  { key: "overdue", label: "Beyond timeline", color: "#BE4A32" },
                ]}
              />
            ) : (
              <Skeleton className="m-2 h-56" />
            )}
          </div>
        </Card>
        <Card className="min-w-0">
          <CardHeader title="Latest activity" sub="Actions recorded across your scope" />
          <div className="divide-y divide-white/[0.05] pb-2">
            {data?.activity.map((a) => (
              <button key={a.id} onClick={() => setOpen(a.caseId)} className="flex w-full items-start gap-3 px-5 py-2.5 text-left hover:bg-white/[0.03]">
                <BureauChip code={a.bureau} className="mt-0.5" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] text-slate-100">
                    <span className="font-medium">{a.type}</span> <span className="num text-slate-400">on {a.caseId}</span>
                    {a.institution && <span className="text-slate-500"> ({a.institution})</span>}
                  </span>
                  <span className="block truncate text-[13px] text-slate-400">{a.remarks}</span>
                </span>
                <span className="shrink-0 text-[12.5px] text-slate-500">{fmtDateTime(a.at)}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>
      <CaseDrawer id={open} onClose={() => setOpen(null)} />
    </div>
  );
}

