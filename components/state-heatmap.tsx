"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Tabs, cn } from "./ui";
import { INDIA_SHAPES, INSET_BOXES, MAP_HEIGHT, MAP_WIDTH, type IndiaShape } from "@/lib/india-paths";

export type Metric = "density" | "ageing" | "disposal";
export interface AreaRow {
  key: string;
  region: string;
  enrolment: number;
  institutions: number;
  total: number;
  open: number;
  overdue: number;
  density: number;
  ageing: number;
  disposal: number;
}

export const METRICS: { key: Metric; label: string; unit: string; higherIsBetter: boolean; hint: string }[] = [
  { key: "density", label: "Complaint density", unit: " per 1,000", higherIsBetter: false, hint: "Complaints per 1,000 enrolled students" },
  { key: "ageing", label: "Average ageing", unit: "d", higherIsBetter: false, hint: "Average days open, for pending complaints" },
  { key: "disposal", label: "Disposal rate", unit: "%", higherIsBetter: true, hint: "Share of complaints disposed" },
];

// small UTs get a labelled marker offset from their position, joined by a leader line
const CALLOUT_OFFSET: Record<string, [number, number]> = {
  Chandigarh: [-92, -26],
  Delhi: [62, -44],
  Goa: [-76, 8],
  Puducherry: [64, 6],
  "Dadra & Nagar Haveli and Daman & Diu": [-88, 26],
};

const LOW = [38, 46, 74];
const HUES: Record<Metric, number[]> = { density: [255, 153, 51], ageing: [255, 153, 51], disposal: [52, 211, 153] };

export function formatMetric(row: AreaRow, m: Metric) {
  return `${row[m]}${METRICS.find((x) => x.key === m)!.unit}`;
}

export function MetricToggle({ metric, onChange }: { metric: Metric; onChange: (m: Metric) => void }) {
  return <Tabs value={metric} onChange={onChange} items={METRICS.map((m) => ({ key: m.key, label: m.label }))} />;
}

export function StateHeatmap({ rows, metric, selected, onSelect, className }: { rows: AreaRow[]; metric: Metric; selected?: string | null; onSelect?: (row: AreaRow) => void; className?: string }) {
  const router = useRouter();
  const [hover, setHover] = React.useState<{ shape: IndiaShape; x: number; y: number } | null>(null);
  const byState = new Map(rows.map((r) => [r.key, r]));
  const sorted = rows.filter((r) => r.total > 0).map((r) => r[metric]).sort((a, b) => a - b);
  const min = sorted.length ? sorted[0] : 0;
  // cap at the 90th percentile so one small outlier does not wash out every other state
  const max = sorted.length ? sorted[Math.floor((sorted.length - 1) * 0.9)] : 1;
  const capped = sorted.length > 0 && sorted[sorted.length - 1] > max;
  const def = METRICS.find((m) => m.key === metric)!;
  const shade = (v: number) => {
    const t = max === min ? 0.6 : Math.max(0, Math.min(1, (v - min) / (max - min)));
    return { t, fill: `rgb(${LOW.map((l, i) => Math.round(l + (HUES[metric][i] - l) * t)).join(",")})` };
  };
  const svg = React.useRef<SVGSVGElement>(null);
  const showAt = (shape: IndiaShape, sx: number, sy: number) => {
    const k = (svg.current?.getBoundingClientRect().width ?? MAP_WIDTH) / MAP_WIDTH;
    setHover({ shape, x: sx * k, y: sy * k });
  };
  const pick = (name: string) => {
    const row = byState.get(name);
    if (!row || !row.total) return;
    if (onSelect) onSelect(row);
    else router.push(`/cases?state=${encodeURIComponent(name)}`);
  };
  const interact = (s: IndiaShape, has: boolean, sx = s.cx, sy = s.cy) => ({
    tabIndex: has ? 0 : -1,
    role: has ? "button" : "img",
    "aria-label": has ? `${s.name}: ${formatMetric(byState.get(s.name)!, metric)}, ${byState.get(s.name)!.total} complaints` : `${s.name}: no institutions in this demo`,
    "aria-pressed": has ? selected === s.name : undefined,
    onMouseEnter: () => showAt(s, sx, sy),
    onFocus: () => showAt(s, sx, sy),
    onBlur: () => setHover(null),
    onClick: () => pick(s.name),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        pick(s.name);
      }
    },
  });
  const row = hover ? byState.get(hover.shape.name) : undefined;
  return (
    <div className={cn("relative", className)} onMouseLeave={() => setHover(null)}>
      <svg ref={svg} viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} className="h-auto w-full max-w-[640px]" role="group" aria-label={`Map of India by state, coloured by ${def.label}`}>
        {INSET_BOXES.map((b) => (
          <g key={b.label}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={8} fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4" />
            <text x={b.x + 6} y={b.y + 13} fontSize={11} fill="#8b93ab">
              {b.label}
            </text>
          </g>
        ))}
        {INDIA_SHAPES.map((s, i) => {
          const r = byState.get(s.name);
          const has = !!r && r.total > 0;
          const fill = has ? shade(r![metric]).fill : "rgba(255,255,255,0.04)";
          const active = selected === s.name || hover?.shape.name === s.name;
          return (
            <path
              key={s.name}
              {...interact(s, has)}
              d={s.d}
              className={cn("map-shape focus:outline-none", has && "cursor-pointer", active && "map-shape-active")}
              style={{ fill, animationDelay: `${i * 18}ms` }}
              stroke={selected === s.name ? "#ffffff" : "rgba(10,15,30,0.9)"}
              strokeWidth={selected === s.name ? 1.8 : 0.7}
            />
          );
        })}
        {INDIA_SHAPES.filter((s) => s.small).map((s) => {
          const r = byState.get(s.name);
          const has = !!r && r.total > 0;
          const [dx, dy] = CALLOUT_OFFSET[s.name] ?? [40, 0];
          const x = s.cx + dx;
          const y = s.cy + dy;
          const col = has ? shade(r![metric]) : null;
          return (
            <g key={`${s.name}-callout`} {...interact(s, has, x, y - 10)} className={cn("focus:outline-none", has && "cursor-pointer")}>
              <line x1={s.cx} y1={s.cy} x2={x} y2={y} stroke="rgba(255,255,255,0.45)" strokeWidth={1} />
              <circle cx={s.cx} cy={s.cy} r={2.5} fill="#fff" />
              <rect x={x - 20} y={y - 10} width={40} height={20} rx={6} fill={col ? col.fill : "#141B33"} stroke={selected === s.name ? "#fff" : "rgba(255,255,255,0.35)"} />
              <text x={x} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={col && col.t > 0.55 ? "#0A0F1E" : "#e7eaf3"}>
                {s.code}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-slate-400">
        <span className="num">
          {min}
          {def.unit}
        </span>
        <span className="h-2 w-28 rounded-sm" style={{ background: `linear-gradient(90deg, rgb(${LOW.join(",")}), rgb(${HUES[metric].join(",")}))` }} />
        <span className="num">
          {max}
          {capped ? "+" : ""}
          {def.unit}
        </span>
        <span className="text-slate-500">
          {def.hint}. {def.higherIsBetter ? "Brighter is better." : "Brighter is worse."} Unfilled shapes have no institutions in this demo.
        </span>
      </div>
      <p className="mt-1 text-[11px] text-slate-600">Boundaries: DataMeet India community, CC BY 4.0. Indicative only, not an official Survey of India map; the J&amp;K and Ladakh internal line is approximate.</p>
      {hover && (
        <div className="glass-strong pointer-events-none absolute z-20 w-56 -translate-x-1/2 -translate-y-full rounded-lg px-3 py-2 text-[12.5px] shadow-xl" style={{ left: hover.x, top: hover.y - 8 }}>
          <div className="font-semibold text-white">{hover.shape.name}</div>
          {row && row.total > 0 ? (
            <div className="num mt-0.5 space-y-0.5 text-slate-300">
              <div>
                {row.region} region · {row.institutions} institution{row.institutions === 1 ? "" : "s"}
              </div>
              <div>
                {row.total} complaints · {row.open} open · {row.overdue} overdue
              </div>
              <div>
                {row.density} per 1,000 · {row.ageing}d ageing · {row.disposal}% disposed
              </div>
            </div>
          ) : (
            <div className="text-slate-400">No institutions in this demo</div>
          )}
        </div>
      )}
    </div>
  );
}
