"use client";
import * as React from "react";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { BUREAU_NAME, bureauHex } from "./bits";
import { cn } from "./ui";

export interface Connection {
  clusterId: string;
  institutionId: string;
  institution: string;
  shortName?: string;
  status: string;
  confidence: number;
  cases: { id: string; bureau: string }[];
}

const SMALL = new Set(["of", "and", "&", "for", "the", "in", "at"]);
const acronym = (name: string) =>
  name
    .split(/[\s,]+/)
    .filter((w) => w && !SMALL.has(w.toLowerCase()))
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 6);
const ORDER = ["RB", "PGRC", "AB", "PAPB", "ARC"];

function useBox() {
  const [box, setBox] = React.useState({ w: 0, top: 0 });
  const ro = React.useRef<ResizeObserver | null>(null);
  const ref = React.useCallback((el: HTMLDivElement | null) => {
    ro.current?.disconnect();
    if (!el) return;
    ro.current = new ResizeObserver(([e]) => setBox({ w: Math.round(e.contentRect.width), top: 0 }));
    ro.current.observe(el);
  }, []);
  return [ref, box.w] as const;
}

/**
 * Who is connected to whom: units on the left, institutions on the right, one line for every
 * complaint. An institution reached from two or more units is a cross-bureau overlap.
 * Hover or focus either side to trace its links; select an institution to open its overlap.
 */
export function ConnectionMap({ links, rowH = 54, className }: { links: Connection[]; rowH?: number; className?: string }) {
  const [ref, w] = useBox();
  const [focus, setFocus] = React.useState<{ kind: "unit" | "inst"; key: string } | null>(null);

  const units = React.useMemo(() => {
    const seen = new Set(links.flatMap((l) => l.cases.map((c) => c.bureau)));
    return [...ORDER.filter((b) => seen.has(b)), ...[...seen].filter((b) => !ORDER.includes(b))];
  }, [links]);

  // one edge per (unit, institution), weighted by how many complaints it carries
  const edges = React.useMemo(() => {
    const m = new Map<string, { unit: string; inst: string; cluster: Connection; n: number }>();
    for (const l of links)
      for (const c of l.cases) {
        const k = `${c.bureau}|${l.clusterId}`;
        const e = m.get(k) ?? { unit: c.bureau, inst: l.clusterId, cluster: l, n: 0 };
        e.n++;
        m.set(k, e);
      }
    return [...m.values()];
  }, [links]);

  if (!links.length) return <div className={cn("py-10 text-center text-[15px] text-slate-400", className)}>No cross-unit links in your scope right now.</div>;

  const pad = 8;
  const H = Math.max(units.length, links.length) * rowH + pad * 2;
  const unitW = Math.min(170, Math.max(92, w * 0.22));
  const instW = Math.min(320, Math.max(160, w * 0.5));
  const x1 = unitW;
  const x2 = w - instW;
  const uGap = Math.min((H - pad * 2) / units.length, 104);
  const uy = (i: number) => H / 2 + (i - (units.length - 1) / 2) * uGap;
  const iy = (i: number) => pad + rowH * (i + 0.5) + (H - pad * 2 - rowH * links.length) / 2;
  const unitIdx = new Map(units.map((u, i) => [u, i]));
  const instIdx = new Map(links.map((l, i) => [l.clusterId, i]));

  const lit = (e: { unit: string; inst: string }) => !focus || (focus.kind === "unit" ? e.unit === focus.key : e.inst === focus.key);
  const instLit = (l: Connection) => !focus || (focus.kind === "inst" ? focus.key === l.clusterId : l.cases.some((c) => c.bureau === focus.key));
  const unitLit = (u: string) => !focus || (focus.kind === "unit" ? focus.key === u : links.find((l) => l.clusterId === focus.key)?.cases.some((c) => c.bureau === u));

  return (
    <div className={className}>
      <div ref={ref} className="relative" style={{ height: H }} onMouseLeave={() => setFocus(null)}>
        {w > 0 && (
          <>
            <svg width={w} height={H} className="absolute inset-0" aria-hidden>
              {edges.map((e) => {
                const ya = uy(unitIdx.get(e.unit)!);
                const yb = iy(instIdx.get(e.inst)!);
                const mid = (x1 + x2) / 2;
                const on = lit(e);
                return (
                  <path
                    key={`${e.unit}-${e.inst}`}
                    d={`M${x1} ${ya} C${mid} ${ya} ${mid} ${yb} ${x2} ${yb}`}
                    fill="none"
                    stroke={bureauHex[e.unit] ?? "#B8A994"}
                    strokeWidth={1.6 + e.n * 1.2}
                    strokeOpacity={on ? (focus ? 0.95 : 0.55) : 0.08}
                    strokeLinecap="round"
                    style={{ transition: "stroke-opacity 200ms" }}
                  />
                );
              })}
            </svg>

            {units.map((u, i) => {
              const count = links.filter((l) => l.cases.some((c) => c.bureau === u)).length;
              return (
                <button
                  key={u}
                  onMouseEnter={() => setFocus({ kind: "unit", key: u })}
                  onFocus={() => setFocus({ kind: "unit", key: u })}
                  onBlur={() => setFocus(null)}
                  aria-label={`${BUREAU_NAME[u] ?? u}: linked to ${count} institution${count === 1 ? "" : "s"} that other units also handle`}
                  className={cn("absolute left-0 flex -translate-y-1/2 items-center gap-2 rounded-full border bg-paper py-1.5 pl-2 pr-3 text-left shadow-[0_1px_2px_rgba(60,40,20,0.06)] transition-opacity", unitLit(u) ? "opacity-100" : "opacity-40")}
                  style={{ top: uy(i), width: unitW - 10, borderColor: bureauHex[u] ?? "#DDD0BB" }}
                >
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: bureauHex[u] }} aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-[14px] font-bold leading-tight text-white">{u}</span>
                    <span className="block truncate text-[12px] leading-tight text-slate-500">{BUREAU_NAME[u]}</span>
                  </span>
                </button>
              );
            })}

            {links.map((l, i) => {
              const bs = [...new Set(l.cases.map((c) => c.bureau))];
              const open = l.status === "Open";
              return (
                <Link
                  key={l.clusterId}
                  href={`/overlaps?focus=${l.clusterId}`}
                  onMouseEnter={() => setFocus({ kind: "inst", key: l.clusterId })}
                  onFocus={() => setFocus({ kind: "inst", key: l.clusterId })}
                  onBlur={() => setFocus(null)}
                  aria-label={`${l.institution}: complaints at ${bs.join(", ")}. ${open ? "Needs coordination." : l.status}. Open overlap.`}
                  className={cn(
                    "absolute right-0 flex -translate-y-1/2 items-center gap-2 rounded-2xl border bg-paper py-1.5 pl-3 pr-2.5 shadow-[0_1px_2px_rgba(60,40,20,0.06)] transition-opacity hover:bg-[#FBF4E8]",
                    open ? "border-violet-500 ring-2 ring-violet-400/20" : "border-[#DDD0BB]",
                    instLit(l) ? "opacity-100" : "opacity-40"
                  )}
                  style={{ top: iy(i), width: instW }}
                >
                  <Building2 className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                  <span className="min-w-0 flex-1" title={l.institution}>
                    <span className="block truncate text-[14px] font-bold leading-tight text-white">{l.shortName || acronym(l.institution)}</span>
                    <span className="block truncate text-[12.5px] leading-tight text-slate-400">{l.institution}</span>
                  </span>
                  <span className="flex shrink-0 -space-x-1" aria-hidden>
                    {bs.map((b) => (
                      <span key={b} className="h-3.5 w-3.5 rounded-full border-2 border-paper" style={{ background: bureauHex[b] }} />
                    ))}
                  </span>
                </Link>
              );
            })}
          </>
        )}
      </div>
      <p className="mt-3 text-[13px] text-slate-400">
        Each line is a complaint, coloured by the unit handling it; a thicker line carries more than one. Every institution here has lines from two or more units, so it is being worked on in parallel. A purple outline means it still needs coordination. Point at a unit or an institution to trace its links.
      </p>
    </div>
  );
}
