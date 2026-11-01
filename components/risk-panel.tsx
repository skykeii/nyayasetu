"use client";
import * as React from "react";
import { ShieldAlert, TriangleAlert } from "lucide-react";
import { Advisory, Badge, Card, CardHeader, cn } from "./ui";
import type { Confidence, RiskResult } from "@/lib/risk";

export function ConfidenceBadge({ c }: { c: Confidence }) {
  const tone = { High: "emerald", Medium: "amber", Low: "slate" } as const;
  return <Badge tone={tone[c]}>{c} confidence</Badge>;
}

export function RiskPanel({ risk }: { risk: RiskResult }) {
  const low = risk.confidence === "Low";
  const groups = ["Handling", "Student voice", "Objective"] as const;
  return (
    <Card>
      <CardHeader title="College Risk Index" sub="Scores how complaints are handled, not how many there are." right={<Advisory />} />
      <div className="mx-5 mb-4 flex items-start gap-2 rounded-lg border border-amber-300/35 bg-amber-400/10 px-3 py-2 text-[13px] font-medium text-amber-100">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> Decision support only; final decisions rest with the competent authority.
      </div>
      <div className="grid gap-6 px-5 pb-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-end gap-x-4 gap-y-2">
            <div className={cn("num text-[44px] font-bold leading-none tracking-tight", low ? "text-slate-500" : "text-white")}>
              {risk.score}
              <span className="text-[16px] font-medium text-slate-500"> / 100</span>
            </div>
            <div>
              <div className={cn("text-[15px] font-semibold", low ? "text-slate-300" : "text-white")}>{risk.band}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <ConfidenceBadge c={risk.confidence} />
                {low && <span className="text-[12px] text-slate-500">Score is provisional</span>}
              </div>
            </div>
          </div>
          {groups.map((g) => (
            <div key={g} className="mb-3">
              <div className="mb-1 text-[12px] font-medium text-slate-500">{g}</div>
              <ul className="space-y-1.5">
                {risk.factors
                  .filter((f) => f.group === g)
                  .map((f) => (
                    <li key={f.key}>
                      <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
                        <span className="min-w-0 truncate text-slate-200">{f.label}</span>
                        <span className="num shrink-0 text-slate-400">{f.value}</span>
                      </div>
                      <div className="relative mt-0.5 h-2 rounded-sm bg-white/[0.06]" role="img" aria-label={`${f.label}: risk ${f.risk} of 100, peer average ${f.peerRisk}, adds ${f.contribution} points`} title={`Risk ${f.risk}/100 · peer average ${f.peerRisk} · adds ${f.contribution} points (weight ${Math.round(f.weight * 100)}%)`}>
                        <div className="h-full rounded-r bg-indigo-400" style={{ width: `${f.risk}%` }} />
                        <div className="absolute -bottom-0.5 -top-0.5 w-0.5 bg-slate-200" style={{ left: `${f.peerRisk}%` }} />
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
          <div className="flex items-center gap-4 text-[11.5px] text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-sm bg-indigo-400" /> This college (longer is worse)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-0.5 bg-slate-200" /> Peer average
            </span>
          </div>
        </div>
        <div className="min-w-0 space-y-4">
          <section>
            <h4 className="mb-1.5 text-[13.5px] font-semibold text-white">Why this score</h4>
            <ul className="list-disc space-y-1 pl-4 text-[13px] leading-snug text-slate-300">
              {risk.why.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </section>
          {risk.flags.length > 0 && (
            <section className="rounded-lg border border-violet-300/30 bg-violet-500/10 px-3 py-2">
              <h4 className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-violet-100">
                <ShieldAlert className="h-4 w-4" /> Data quality flags
              </h4>
              <ul className="list-disc space-y-1 pl-4 text-[12.5px] leading-snug text-violet-100/90">
                {risk.flags.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <h4 className="mb-1 text-[13.5px] font-semibold text-white">Peer comparison</h4>
            <p className="text-[13px] text-slate-300">
              {risk.peer.label}: average <span className="num font-semibold">{risk.peer.average}</span>. This college ranks <span className="num font-semibold">{risk.peer.rank}</span> of <span className="num">{risk.peer.count}</span>, where 1 is the highest concern.
            </p>
          </section>
          <section>
            <h4 className="mb-1 text-[13.5px] font-semibold text-white">Confidence is based on</h4>
            <ul className="list-disc space-y-0.5 pl-4 text-[12.5px] text-slate-400">
              {risk.confidenceReasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </section>
          {risk.pulse?.means && (
            <section>
              <h4 className="mb-1 text-[13.5px] font-semibold text-white">Pulse survey, term {risk.pulse.term}</h4>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-slate-300">
                {Object.entries(risk.pulse.means).map(([k, v]) => (
                  <span key={k}>
                    {k} <span className="num font-semibold text-white">{v.toFixed(1)}</span>
                  </span>
                ))}
                <span>
                  Unable to complain <span className="num font-semibold text-white">{risk.pulse.unablePct}%</span>
                </span>
              </div>
            </section>
          )}
        </div>
      </div>
    </Card>
  );
}
