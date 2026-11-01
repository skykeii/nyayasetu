"use client";
import * as React from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";
import { Badge, cn } from "./ui";
import type { Severity, Status } from "@/lib/types";

export function CountUp({ value, className, suffix = "" }: { value: number; className?: string; suffix?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const prev = React.useRef(0);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  React.useEffect(() => {
    if (!ref.current || !inView) return;
    const el = ref.current;
    if (reduce) {
      el.textContent = value.toLocaleString("en-IN") + suffix;
      prev.current = value;
      return;
    }
    const c = animate(prev.current, value, {
      duration: prev.current === 0 ? 1.1 : 0.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => (el.textContent = Math.round(v).toLocaleString("en-IN") + suffix),
    });
    prev.current = value;
    return () => c.stop();
  }, [value, inView, reduce, suffix]);
  return (
    <span ref={ref} className={cn("num", className)}>
      0{suffix}
    </span>
  );
}

export function StatusBadge({ status }: { status: Status }) {
  const tone = { New: "sky", "Under Process": "amber", Transferred: "indigo", Escalated: "saffron", Disposed: "emerald" } as const;
  const label = status === "New" ? "Pending" : status;
  return <Badge tone={tone[status]}>{label}</Badge>;
}

export function SlaBadge({ sla }: { sla: { state: string; daysToDue: number; overdueDays: number; withinSla?: boolean; ageDays: number } }) {
  if (sla.state === "closed") return <Badge tone={sla.withinSla ? "emerald" : "slate"}>{sla.withinSla ? "Closed in SLA" : "Closed late"} ({sla.ageDays}d)</Badge>;
  if (sla.state === "breached") return <Badge tone="red">Overdue {sla.overdueDays}d</Badge>;
  if (sla.state === "due-soon") return <Badge tone="amber">Due in {sla.daysToDue}d</Badge>;
  return <Badge tone="slate">{sla.daysToDue}d left</Badge>;
}

export function SeverityDot({ s }: { s: Severity }) {
  const c = { Low: "bg-slate-400", Medium: "bg-amber-300", High: "bg-orange-400", Critical: "bg-red-400" }[s];
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-slate-300">
      <span className={cn("h-2 w-2 rounded-full", c)} />
      {s}
    </span>
  );
}

const BUREAU_COLOR: Record<string, string> = {
  RB: "text-orange-200 border-orange-300/40 bg-orange-400/10",
  PGRC: "text-indigo-200 border-indigo-300/40 bg-indigo-400/10",
  AB: "text-emerald-200 border-emerald-300/40 bg-emerald-400/10",
  PAPB: "text-sky-200 border-sky-300/40 bg-sky-400/10",
  ARC: "text-rose-200 border-rose-300/40 bg-rose-400/10",
  RO: "text-slate-200 border-white/20 bg-white/5",
  CA: "text-amber-100 border-amber-200/50 bg-amber-300/15",
  SYSTEM: "text-slate-300 border-white/15 bg-white/5",
};
export const bureauHex: Record<string, string> = { RB: "#FF9933", PGRC: "#818CF8", AB: "#34D399", PAPB: "#38BDF8", ARC: "#FB7185" };

export function BureauChip({ code, className }: { code: string; className?: string }) {
  return <span className={cn("inline-flex h-5 items-center rounded border px-1.5 text-[11px] font-semibold tracking-wide", BUREAU_COLOR[code] ?? BUREAU_COLOR.RO, className)}>{code}</span>;
}

export function OverlapPulse({ className }: { className?: string }) {
  return <span className={cn("inline-block h-2.5 w-2.5 rounded-full bg-violet-400 animate-pulseRing", className)} aria-hidden />;
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-10 text-center text-sm text-slate-400">{children}</div>;
}

export function ErrorNote({ msg }: { msg: string }) {
  return <div className="m-5 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{msg}</div>;
}

export function Confidence({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <span className="inline-flex items-center gap-2" title="Advisory match confidence">
      <span className="relative h-1.5 w-16 overflow-hidden rounded-full bg-white/10">
        <span className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400" style={{ width: `${pct}%` }} />
      </span>
      <span className="num text-[12.5px] font-semibold text-violet-200">{pct}%</span>
    </span>
  );
}
