"use client";
import * as React from "react";
import Link from "next/link";
import { useApi } from "@/components/role-provider";
import { Card, CardHeader, Skeleton, cn } from "@/components/ui";
import { ErrorNote } from "@/components/bits";
import { METRICS, MetricToggle, StateHeatmap, formatMetric, type AreaRow, type Metric } from "@/components/state-heatmap";

// fewer cases than this would make a ranking misleading
const MIN_CASES = 5;

export default function HeatmapPage() {
  const { data, error, loading } = useApi<{ states: AreaRow[]; regions: AreaRow[] }>("/api/heatmap", { interval: 5000 });
  const [metric, setMetric] = React.useState<Metric>("density");
  const [selected, setSelected] = React.useState<string | null>(null);
  const [by, setBy] = React.useState<"states" | "regions">("states");
  if (error) return <ErrorNote msg={error} />;
  const def = METRICS.find((m) => m.key === metric)!;
  const rows = data?.[by] ?? [];
  const ranked = rows.filter((r) => r.total >= MIN_CASES).sort((a, b) => (def.higherIsBetter ? b[metric] - a[metric] : a[metric] - b[metric]));
  const few = rows.filter((r) => r.total < MIN_CASES).length;
  const sel = data?.states.find((s) => s.key === selected);
  // select once the state is known to have data; a click on an empty shape does nothing
  return (
    <div className="mx-auto max-w-[1280px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-white">Regional heatmap</h1>
          <p className="text-[13.5px] text-slate-400">Where complaints concentrate and where they are handled well, for the cases your role can see. Select a state to filter.</p>
        </div>
        <MetricToggle metric={metric} onChange={setMetric} />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Card className="min-w-0 p-5">
          {loading ? <Skeleton className="h-[440px]" /> : <StateHeatmap rows={data?.states ?? []} metric={metric} selected={selected} onSelect={(r) => setSelected(r.key === selected ? null : r.key)} />}
          {sel && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[13px] text-slate-300">
              <span>
                <span className="font-semibold text-white">{sel.key}</span> · {sel.region} region · <span className="num">{sel.total}</span> complaints · <span className="num">{sel.open}</span> open · <span className="num">{sel.overdue}</span> overdue
              </span>
              <span className="flex gap-3">
                <Link href={`/cases?state=${encodeURIComponent(sel.key)}`} className="font-medium text-saffron hover:underline">
                  Cases in {sel.key}
                </Link>
                <Link href={`/institutions?region=${encodeURIComponent(sel.region)}`} className="font-medium text-saffron hover:underline">
                  Institutions
                </Link>
              </span>
            </div>
          )}
        </Card>
        <Card className="min-w-0">
          <CardHeader
            title="Where it's good vs bad"
            sub={`${def.label}, best first`}
            right={
              <div className="flex gap-1 text-[12px]">
                {(["states", "regions"] as const).map((k) => (
                  <button key={k} onClick={() => setBy(k)} aria-pressed={by === k} className={cn("rounded-md px-2 py-1 capitalize", by === k ? "bg-white/10 text-white" : "text-slate-400 hover:text-white")}>
                    {k}
                  </button>
                ))}
              </div>
            }
          />
          <ol className="divide-y divide-white/[0.05] pb-2">
            {ranked.map((r, i) => (
              <li key={r.key}>
                <button onClick={() => setSelected(by === "states" ? r.key : null)} className={cn("flex w-full items-center gap-3 px-5 py-2 text-left text-[13px] hover:bg-white/[0.03]", selected === r.key && "bg-white/[0.06]")}>
                  <span className="num w-5 shrink-0 text-right text-slate-500">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-200">{r.key}</span>
                  <span className="num shrink-0 text-[12px] text-slate-500">{r.total} cases</span>
                  <span className="num w-24 shrink-0 text-right font-semibold text-white">{formatMetric(r, metric)}</span>
                </button>
              </li>
            ))}
          </ol>
          {few > 0 && <p className="px-5 pb-3 text-[12px] text-slate-500">{few} {by === "states" ? "state(s)" : "region(s)"} with fewer than {MIN_CASES} cases are not ranked.</p>}
        </Card>
      </div>
    </div>
  );
}
