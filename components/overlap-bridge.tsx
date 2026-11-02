"use client";
import * as React from "react";
import { Building2 } from "lucide-react";
import { BUREAU_NAME, BureauChip, bureauHex } from "./bits";
import { cn } from "./ui";

export interface BridgeCase {
  id: string;
  bureau: string;
  subject: string;
  reference: string;
  reportedName: string;
}
export interface BridgePair {
  a: string;
  b: string;
  confidence: number;
  reasons?: string[];
}

const MULBERRY = "#9C4E7C";
const LEAF = "#4C8040";
const CHAKRA = "#53659A";

/** Width of the box the map is drawn in, so lines can be drawn in real pixels. */
function useWidth() {
  const [w, setW] = React.useState(0);
  const ro = React.useRef<ResizeObserver | null>(null);
  const ref = React.useCallback((el: HTMLDivElement | null) => {
    ro.current?.disconnect();
    if (!el) return;
    ro.current = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.current.observe(el);
  }, []);
  return [ref, w] as const;
}

function Station({ c, style, current, onOpen, compact }: { c: BridgeCase; style?: React.CSSProperties; current?: string; onOpen?: (id: string) => void; compact?: boolean }) {
  const here = c.id === current;
  const body = (
    <>
      <span className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: bureauHex[c.bureau] ?? "#74655A" }} aria-hidden />
        <span className="num whitespace-nowrap text-[14px] font-semibold text-white group-hover:text-saffron">{c.id}</span>
        <BureauChip code={c.bureau} className="ml-auto" />
      </span>
      <span className="mt-0.5 block truncate text-[13.5px] text-slate-300">{c.subject}</span>
      {!compact && <span className="block truncate text-[12.5px] text-slate-500">Written as “{c.reportedName}”</span>}
      {here && <span className="absolute -top-2.5 left-3 rounded-full bg-saffron px-2 text-[12px] font-semibold leading-5 text-paper">This case</span>}
    </>
  );
  const cls = cn(
    "group relative z-10 block rounded-2xl border bg-paper px-3 py-2 text-left shadow-[0_1px_2px_rgba(60,40,20,0.06),0_8px_20px_-14px_rgba(60,40,20,0.35)]",
    here ? "border-saffron/60 ring-2 ring-amber-400/25" : "border-[#E2D6C3]",
    onOpen && !here && "transition-[box-shadow,border-color,transform] hover:-translate-y-0.5 hover:border-[#CDBDA4] hover:shadow-[0_2px_4px_rgba(60,40,20,0.08),0_16px_30px_-16px_rgba(60,40,20,0.45)]"
  );
  return onOpen && !here ? (
    <button onClick={() => onOpen(c.id)} style={style} aria-label={`Open case ${c.id} at ${BUREAU_NAME[c.bureau] ?? c.bureau}: ${c.subject}`} className={cls}>
      {body}
    </button>
  ) : (
    <div style={style} className={cls}>
      {body}
    </div>
  );
}

function Hub({ style, institution, compact }: { style?: React.CSSProperties; institution?: string; compact?: boolean }) {
  return (
    <div style={style} className="z-10 flex items-center gap-2 rounded-full border border-[#D9CBB5] bg-[#F3EADB] px-3.5 py-2 shadow-[0_1px_0_rgba(255,255,255,0.8)_inset]" title={institution}>
      <Building2 className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
      <span className="min-w-0">
        {compact || !institution ? (
          <span className="block text-[13.5px] font-semibold leading-tight text-white">Same institution</span>
        ) : (
          <>
            <span className="block text-[12px] leading-tight text-slate-500">Same institution</span>
            <span className="block truncate text-[13.5px] font-semibold leading-tight text-white">{institution}</span>
          </>
        )}
      </span>
    </div>
  );
}

function Pill({ e, style, color }: { e: BridgePair; style?: React.CSSProperties; color: string }) {
  if (Number.isNaN(e.confidence)) return null;
  return (
    <span
      style={{ ...style, borderColor: color, color }}
      title={e.reasons?.join("\n") ?? "Advisory match"}
      className="z-20 inline-flex items-center gap-1 whitespace-nowrap rounded-full border bg-paper px-2 py-[1px] text-[12.5px] font-semibold shadow-sm"
    >
      <span className="num">{Math.round(e.confidence * 100)}%</span>
      <span className="font-medium opacity-80">match</span>
    </span>
  );
}

/**
 * Relationship map for one overlap: the institution sits at the centre, every complaint about it
 * is a station around it, and the advisory matches between complaints are drawn as labelled arcs.
 * On narrow screens it folds into a vertical line with the same information.
 */
export function OverlapBridge({
  cases,
  status,
  onOpen,
  compact,
  pairs,
  institution,
  current,
}: {
  cases: BridgeCase[];
  status: string;
  onOpen?: (id: string) => void;
  compact?: boolean;
  pairs?: BridgePair[];
  institution?: string;
  /** the case the viewer is looking at, marked on the map */
  current?: string;
}) {
  const [ref, w] = useWidth();
  const open = status === "Open";
  const linkColor = open ? MULBERRY : status === "Coordinated" ? LEAF : CHAKRA;
  const edges: BridgePair[] = React.useMemo(() => {
    if (pairs?.length) return pairs.filter((p) => cases.some((c) => c.id === p.a) && cases.some((c) => c.id === p.b));
    const out: BridgePair[] = [];
    cases.forEach((a, i) => cases.slice(i + 1).forEach((b) => a.bureau !== b.bureau && out.push({ a: a.id, b: b.id, confidence: NaN })));
    return out.length ? out : cases.slice(1).map((b) => ({ a: cases[0].id, b: b.id, confidence: NaN }));
  }, [pairs, cases]);

  if (cases.length < 2) return null;
  const n = cases.length;
  const GAP = 76; // room for the match pill between neighbours
  const nodeW = w ? Math.min(compact ? 220 : 248, Math.floor((w - (n - 1) * GAP) / n)) : 0;
  const narrow = w > 0 && nodeW < 176;
  const nodeH = compact ? 62 : 80;
  const hubH = compact ? 46 : 52;
  const drop = 34; // trunk from institution down to the complaints
  // matches between non-neighbours swing underneath the row
  const order = new Map(cases.map((c, i) => [c.id, i]));
  const far = edges.filter((e) => Math.abs(order.get(e.a)! - order.get(e.b)!) > 1);
  const below = far.length ? 30 + far.length * 16 : 6;
  const H = hubH + drop + nodeH + below;

  // ---------- positions ----------
  const pos = new Map<string, { x: number; y: number }>();
  const hub = { x: w / 2, y: hubH / 2 };
  const rowY = hubH + drop + nodeH / 2;
  if (!narrow && w) {
    const span = w - nodeW;
    cases.forEach((c, i) => pos.set(c.id, { x: nodeW / 2 + (n === 1 ? span / 2 : (i * span) / (n - 1)), y: rowY }));
  }

  // ---------- narrow: a vertical line ----------
  if (narrow) {
    return (
      <div ref={ref} className="relative" key="narrow">
        <Hub institution={institution} compact={compact} />
        <ol className="relative ml-[22px] mt-1 border-l-2 border-dashed pl-5" style={{ borderColor: linkColor }}>
          {cases.map((c) => {
            const e = edges.find((p) => p.a === c.id || p.b === c.id);
            return (
              <li key={c.id} className="relative py-1.5">
                <span className="absolute -left-[27px] top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-paper" style={{ background: bureauHex[c.bureau] ?? "#74655A" }} aria-hidden />
                <Station c={c} style={{ width: "100%" }} current={current} onOpen={onOpen} compact={compact} />
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  // ---------- wide: institution on top, complaints in a row, matches between them ----------
  const busY = hubH + drop / 2;
  const geo = edges.map((e) => {
    const a = pos.get(e.a);
    const b = pos.get(e.b);
    if (!a || !b) return null;
    const [l, r] = a.x < b.x ? [a, b] : [b, a];
    if (Math.abs(order.get(e.a)! - order.get(e.b)!) <= 1) {
      const x1 = l.x + nodeW / 2;
      const x2 = r.x - nodeW / 2;
      return { e, d: `M${x1} ${rowY} L${x2} ${rowY}`, lx: (x1 + x2) / 2, ly: rowY };
    }
    const k = far.indexOf(e);
    const y0 = rowY + nodeH / 2;
    const depth = 22 + k * 16;
    return { e, d: `M${l.x - 18} ${y0} C${l.x - 18} ${y0 + depth * 1.3} ${r.x + 18} ${y0 + depth * 1.3} ${r.x + 18} ${y0}`, lx: (l.x + r.x) / 2, ly: y0 + depth };
  });
  return (
    <div ref={ref} className="relative w-full" style={{ height: H }}>
      {w > 0 && (
        <>
          <svg width={w} height={H} className="absolute inset-0 overflow-visible" aria-hidden>
            {/* every complaint is filed against the same institution: a small tree from the hub */}
            <line x1={hub.x} y1={hubH} x2={hub.x} y2={busY} stroke="#CDBDA4" strokeWidth={1.5} />
            <line x1={Math.min(...[...pos.values()].map((p) => p.x))} y1={busY} x2={Math.max(...[...pos.values()].map((p) => p.x))} y2={busY} stroke="#CDBDA4" strokeWidth={1.5} />
            {cases.map((c) => {
              const p = pos.get(c.id)!;
              return <line key={c.id} x1={p.x} y1={busY} x2={p.x} y2={rowY - nodeH / 2} stroke={bureauHex[c.bureau] ?? "#B8A994"} strokeWidth={2} />;
            })}
            {geo.map((g) => g && <path key={`${g.e.a}-${g.e.b}`} d={g.d} fill="none" stroke={linkColor} strokeWidth={2.2} strokeLinecap="round" className={open ? "map-flow" : undefined} strokeDasharray={open ? "6 6" : undefined} />)}
          </svg>
          <Hub style={{ position: "absolute", left: hub.x, top: 0, transform: "translateX(-50%)", maxWidth: Math.min(360, w) }} institution={institution} compact={compact} />
          {cases.map((c) => {
            const p = pos.get(c.id)!;
            return <Station key={c.id} c={c} style={{ position: "absolute", left: p.x - nodeW / 2, top: p.y - nodeH / 2, width: nodeW, minHeight: nodeH }} current={current} onOpen={onOpen} compact={compact} />;
          })}
          {geo.map((g) => g && <Pill key={`${g.e.a}-${g.e.b}`} e={g.e} color={linkColor} style={{ position: "absolute", left: g.lx, top: g.ly, transform: "translate(-50%,-50%)" }} />)}
        </>
      )}
    </div>
  );
}

/** Small key that explains the relationship map. */
export function MapLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-slate-400", className)}>
      <span className="inline-flex items-center gap-1.5">
        <svg width="26" height="6" aria-hidden>
          <line x1="1" y1="3" x2="25" y2="3" stroke={MULBERRY} strokeWidth="2" strokeDasharray="5 4" />
        </svg>
        Needs coordination
      </span>
      <span className="inline-flex items-center gap-1.5">
        <svg width="26" height="6" aria-hidden>
          <line x1="1" y1="3" x2="25" y2="3" stroke={CHAKRA} strokeWidth="2" />
        </svg>
        Linked
      </span>
      <span className="inline-flex items-center gap-1.5">
        <svg width="26" height="6" aria-hidden>
          <line x1="1" y1="3" x2="25" y2="3" stroke={LEAF} strokeWidth="2" />
        </svg>
        Coordinated
      </span>
      <span>Percent shows how closely two complaints match. It is advisory; an official decides.</span>
    </div>
  );
}
