"use client";
import * as React from "react";
import { ArrowRightLeft, TriangleAlert } from "lucide-react";
import { STOPS, type Journey } from "@/lib/journey";
import { fmtDate } from "@/lib/util";
import { cn } from "./ui";

type Sla = { state: string; daysToDue: number; overdueDays: number };

/** Line colour says how the complaint is doing against its deadline. */
function tone(sla: Sla) {
  if (sla.state === "closed") return { line: "#4C8040", soft: "rgba(76,128,64,0.16)", word: "Closed" };
  if (sla.state === "breached") return { line: "#BE4A32", soft: "rgba(190,74,50,0.16)", word: `${sla.overdueDays}d overdue` };
  if (sla.state === "due-soon") return { line: "#C2831A", soft: "rgba(194,131,26,0.18)", word: `Due in ${sla.daysToDue}d` };
  return { line: "#53659A", soft: "rgba(83,101,154,0.16)", word: `${sla.daysToDue}d left` };
}

function Detours({ j, className }: { j: Journey; className?: string }) {
  if (!j.transfers && !j.escalations) return null;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]", className)}>
      {j.transfers > 0 && (
        <span className="inline-flex items-center gap-1 text-indigo-300">
          <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden />
          Transferred{j.transfers > 1 ? ` ${j.transfers}×` : ""}
        </span>
      )}
      {j.escalations > 0 && (
        <span className="inline-flex items-center gap-1 text-orange-300">
          <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
          Escalated{j.escalations > 1 ? ` ${j.escalations}×` : ""}
        </span>
      )}
    </span>
  );
}

/**
 * A complaint drawn as a metro line: five stops from received to decision.
 * Stops already passed are filled, the current stop is ringed, the rest are hollow.
 */
export function JourneyLine({ journey, sla, size = "sm", className }: { journey: Journey; sla: Sla; size?: "sm" | "lg"; className?: string }) {
  const t = tone(sla);
  const lg = size === "lg";
  const done = journey.at === STOPS.length - 1;
  const pct = (journey.at / (STOPS.length - 1)) * 100;
  const label = `Stage ${journey.at + 1} of ${STOPS.length}: ${STOPS[journey.at].label}. ${t.word}.`;
  return (
    <div className={cn("min-w-0", className)} role="img" aria-label={label}>
      <div className={cn("relative", lg ? "mx-6 h-6" : "mx-2 h-4")}>
        {/* track still to travel */}
        <div className="journey-line absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2" />
        {/* track travelled */}
        <div className="absolute left-0 top-1/2 h-[4px] -translate-y-1/2 rounded-full" style={{ width: `${pct}%`, background: t.line }} />
        {STOPS.map((s, i) => {
          const passed = i < journey.at || (done && i === journey.at);
          const here = i === journey.at && !done;
          return (
            <span
              key={s.key}
              title={`${s.label}${journey.dates[i] ? `, ${fmtDate(journey.dates[i]!)}` : ""}`}
              className={cn("absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2", lg ? "h-4 w-4" : "h-3 w-3", here && (lg ? "h-6 w-6 border-[3px]" : "h-[18px] w-[18px] border-[3px]"))}
              style={{
                left: `${(i / (STOPS.length - 1)) * 100}%`,
                background: passed ? t.line : "#FFFCF5",
                borderColor: passed || here ? t.line : "#CDBDA4",
                boxShadow: here ? `0 0 0 4px ${t.soft}` : undefined,
              }}
            />
          );
        })}
      </div>
      {lg ? (
        <ol className="mt-2 grid grid-cols-5 gap-1 text-center">
          {STOPS.map((s, i) => (
            <li key={s.key} className={cn("min-w-0", i > journey.at ? "text-slate-500" : "text-slate-200")}>
              <span className={cn("block text-[13.5px] leading-tight", i === journey.at && "font-semibold text-white")}>{s.label}</span>
              <span className="num block text-[12.5px] text-slate-500">{journey.dates[i] ? fmtDate(journey.dates[i]!) : i > journey.at ? "Ahead" : "—"}</span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className="text-[13.5px] font-semibold text-white">{STOPS[journey.at].label}</span>
          <span className="text-[13px] font-medium" style={{ color: t.line }}>
            {t.word}
          </span>
        </div>
      )}
      <Detours j={journey} className={lg ? "mt-3" : "mt-0.5"} />
    </div>
  );
}

/** Key for the journey map. */
export function JourneyLegend({ className }: { className?: string }) {
  const dot = (c: string) => <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} aria-hidden />;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-slate-400", className)}>
      <span>Each line runs Received, Assigned, Notice sent, Response, Decision. The ringed stop is where the complaint is now.</span>
      <span className="inline-flex items-center gap-1.5">{dot("#53659A")} On time</span>
      <span className="inline-flex items-center gap-1.5">{dot("#C2831A")} Due soon</span>
      <span className="inline-flex items-center gap-1.5">{dot("#BE4A32")} Overdue</span>
      <span className="inline-flex items-center gap-1.5">{dot("#4C8040")} Closed</span>
    </div>
  );
}
