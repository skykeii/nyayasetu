"use client";
import * as React from "react";
import { BureauChip, OverlapPulse, bureauHex } from "./bits";
import { cn } from "./ui";

export interface BridgeCase {
  id: string;
  bureau: string;
  subject: string;
  reference: string;
  reportedName: string;
}

/** Two (or more) cases at different units joined by an arc: the visual signature of an overlap. */
export function OverlapBridge({ cases, status, onOpen, compact }: { cases: BridgeCase[]; status: string; onOpen?: (id: string) => void; compact?: boolean }) {
  const gid = React.useId().replace(/:/g, "");
  const [a, b, ...rest] = cases;
  if (!a || !b) return null;
  const open = status === "Open";
  const Side = ({ c, align }: { c: BridgeCase; align: "left" | "right" }) => (
    <button
      onClick={() => onOpen?.(c.id)}
      className={cn("group min-w-0 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-left transition-colors hover:border-white/25", align === "right" && "sm:text-right")}
    >
      <div className={cn("flex items-center gap-2", align === "right" && "sm:flex-row-reverse")}>
        <BureauChip code={c.bureau} />
        <span className="num text-[13px] font-semibold text-white group-hover:text-saffron">{c.id}</span>
      </div>
      <div className="mt-1 truncate text-[12.5px] text-slate-300">{c.subject}</div>
      {!compact && <div className="truncate text-[11.5px] text-slate-500">“{c.reportedName}”</div>}
    </button>
  );
  return (
    <div>
      <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_88px_1fr]">
        <Side c={a} align="left" />
        <div className="relative hidden h-12 sm:block" aria-hidden>
          <svg viewBox="0 0 88 48" className="absolute inset-0 h-full w-full overflow-visible">
            <defs>
              <linearGradient id={`g${gid}`} x1="0" x2="1">
                <stop offset="0" stopColor={bureauHex[a.bureau] ?? "#A78BFA"} />
                <stop offset="0.5" stopColor={open ? "#A78BFA" : "#34D399"} />
                <stop offset="1" stopColor={bureauHex[b.bureau] ?? "#A78BFA"} />
              </linearGradient>
            </defs>
            <path d="M0 34 Q44 -6 88 34" fill="none" stroke={`url(#g${gid})`} strokeWidth="2" strokeDasharray={open ? "4 4" : undefined}>
              {open && <animate attributeName="stroke-dashoffset" from="16" to="0" dur="1.2s" repeatCount="indefinite" />}
            </path>
            <line x1="0" y1="34" x2="88" y2="34" stroke="rgba(255,255,255,0.08)" />
          </svg>
          <div className="absolute left-1/2 top-[7px] -translate-x-1/2">{open ? <OverlapPulse /> : <span className="block h-2.5 w-2.5 rounded-full bg-emerald-400" />}</div>
        </div>
        <Side c={b} align="right" />
      </div>
      {rest.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {rest.map((c) => (
            <button key={c.id} onClick={() => onOpen?.(c.id)} className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[12px] text-slate-300 hover:border-white/25">
              + <BureauChip code={c.bureau} /> <span className="num">{c.id}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
