"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Tabs, cn } from "./ui";

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

// [state, code, column, row]: a geographic tile grid, no external map data
const TILES: [string, string, number, number][] = [
  ["Jammu & Kashmir", "JK", 2, 0], ["Ladakh", "LA", 3, 0],
  ["Punjab", "PB", 2, 1], ["Himachal Pradesh", "HP", 3, 1],
  ["Chandigarh", "CH", 1, 2], ["Haryana", "HR", 2, 2], ["Delhi", "DL", 3, 2], ["Uttarakhand", "UK", 4, 2], ["Arunachal Pradesh", "AR", 9, 2],
  ["Rajasthan", "RJ", 2, 3], ["Uttar Pradesh", "UP", 3, 3], ["Bihar", "BR", 4, 3], ["Sikkim", "SK", 6, 3], ["Assam", "AS", 8, 3], ["Nagaland", "NL", 9, 3],
  ["Gujarat", "GJ", 1, 4], ["Madhya Pradesh", "MP", 2, 4], ["Chhattisgarh", "CG", 3, 4], ["Jharkhand", "JH", 4, 4], ["West Bengal", "WB", 5, 4], ["Meghalaya", "ML", 8, 4], ["Manipur", "MN", 9, 4],
  ["Dadra & Nagar Haveli and Daman & Diu", "DD", 1, 5], ["Maharashtra", "MH", 2, 5], ["Telangana", "TS", 3, 5], ["Odisha", "OD", 4, 5], ["Tripura", "TR", 8, 5], ["Mizoram", "MZ", 9, 5],
  ["Goa", "GA", 1, 6], ["Karnataka", "KA", 2, 6], ["Andhra Pradesh", "AP", 3, 6],
  ["Lakshadweep", "LD", 0, 7], ["Kerala", "KL", 2, 7], ["Tamil Nadu", "TN", 3, 7], ["Puducherry", "PY", 4, 7], ["Andaman & Nicobar Islands", "AN", 6, 7],
];

const SIZE = 54;
const GAP = 4;
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
  const [hover, setHover] = React.useState<{ row: AreaRow | null; state: string; x: number; y: number } | null>(null);
  const byState = new Map(rows.map((r) => [r.key, r]));
  const values = rows.filter((r) => r.total > 0).map((r) => r[metric]);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const def = METRICS.find((m) => m.key === metric)!;
  const shade = (v: number) => {
    const t = max === min ? 0.6 : (v - min) / (max - min);
    const hue = HUES[metric];
    return { t, fill: `rgb(${LOW.map((l, i) => Math.round(l + (hue[i] - l) * t)).join(",")})` };
  };
  const cols = 10;
  const tileRows = 8;
  const w = cols * (SIZE + GAP);
  const h = tileRows * (SIZE + GAP);
  const pick = (row: AreaRow | undefined) => {
    if (!row) return;
    if (onSelect) onSelect(row);
    else router.push(`/cases?region=${encodeURIComponent(row.region)}`);
  };
  return (
    <div className={cn("relative", className)} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full max-w-[600px]" role="group" aria-label={`India state tile map coloured by ${def.label}`}>
        {TILES.map(([state, code, c, r]) => {
          const row = byState.get(state);
          const has = !!row && row.total > 0;
          const s = has ? shade(row![metric]) : null;
          const dark = !!s && s.t > 0.55;
          const x = c * (SIZE + GAP);
          const y = r * (SIZE + GAP);
          const show = (e: { currentTarget: SVGGElement }) => {
            const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
            const k = box.width / w;
            setHover({ row: row ?? null, state, x: (x + SIZE / 2) * k, y: y * k });
          };
          const label = has ? `${state}: ${formatMetric(row!, metric)}, ${row!.total} complaints, ${row!.region} region` : `${state}: no institutions in this demo`;
          return (
            <g
              key={state}
              tabIndex={has ? 0 : -1}
              role={has ? "button" : "img"}
              aria-label={label}
              aria-pressed={has ? selected === state : undefined}
              className={cn(has && "cursor-pointer focus:outline-none")}
              onMouseEnter={show}
              onFocus={show}
              onBlur={() => setHover(null)}
              onClick={() => pick(row)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  pick(row);
                }
              }}
            >
              <rect x={x} y={y} width={SIZE} height={SIZE} rx={7} fill={s ? s.fill : "rgba(255,255,255,0.03)"} stroke={selected === state ? "#ffffff" : hover?.state === state ? "rgba(255,255,255,0.7)" : has ? "transparent" : "rgba(255,255,255,0.08)"} strokeWidth={2} />
              <text x={x + SIZE / 2} y={y + (has ? 23 : 32)} textAnchor="middle" fontSize={13} fontWeight={700} fill={has ? (dark ? "#0A0F1E" : "#e7eaf3") : "#5b6480"}>
                {code}
              </text>
              {has && (
                <text x={x + SIZE / 2} y={y + 41} textAnchor="middle" fontSize={12} fill={dark ? "#0A0F1E" : "#aeb6cc"} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {row![metric]}
                  {metric === "disposal" ? "%" : metric === "ageing" ? "d" : ""}
                </text>
              )}
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
          {def.unit}
        </span>
        <span className="text-slate-500">{def.hint}. {def.higherIsBetter ? "Brighter is better." : "Brighter is worse."} Outlined tiles have no institutions in this demo.</span>
      </div>
      {hover && (
        <div className="glass-strong pointer-events-none absolute z-20 w-56 -translate-x-1/2 -translate-y-full rounded-lg px-3 py-2 text-[12.5px] shadow-xl" style={{ left: hover.x, top: hover.y - 6 }}>
          <div className="font-semibold text-white">{hover.state}</div>
          {hover.row && hover.row.total > 0 ? (
            <div className="num mt-0.5 space-y-0.5 text-slate-300">
              <div>{hover.row.region} region · {hover.row.institutions} institution{hover.row.institutions === 1 ? "" : "s"}</div>
              <div>{hover.row.total} complaints · {hover.row.open} open · {hover.row.overdue} overdue</div>
              <div>{hover.row.density} per 1,000 · {hover.row.ageing}d ageing · {hover.row.disposal}% disposed</div>
            </div>
          ) : (
            <div className="text-slate-400">No institutions in this demo</div>
          )}
        </div>
      )}
    </div>
  );
}
