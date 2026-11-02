"use client";
import * as React from "react";
import { bureauHex } from "./bits";
import type { OverlapCluster } from "@/lib/overlap";

interface Node {
  id: string;
  bureau: string;
  subject: string;
  x: number;
  y: number;
}
const W = 640;
const H = 300;
const EDGE_LENGTH = 180;

/** Small deterministic force layout: nodes repel, edges pull, so the same data always draws the same way. */
function layout(nodes: Node[], edges: { a: string; b: string }[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  nodes.forEach((n, i) => {
    const t = (i / Math.max(1, nodes.length)) * Math.PI * 2;
    n.x = W / 2 + Math.cos(t) * 110;
    n.y = H / 2 + Math.sin(t) * 90;
  });
  for (let step = 0; step < 220; step++) {
    const heat = 1 - step / 220;
    const force = new Map(nodes.map((n) => [n.id, { x: 0, y: 0 }]));
    for (const a of nodes)
      for (const b of nodes) {
        if (a === b) continue;
        const dx = a.x - b.x || 0.1;
        const dy = a.y - b.y || 0.1;
        const d2 = dx * dx + dy * dy;
        const f = 9000 / d2;
        force.get(a.id)!.x += dx * f * 0.02;
        force.get(a.id)!.y += dy * f * 0.02;
      }
    for (const e of edges) {
      const a = byId.get(e.a)!;
      const b = byId.get(e.b)!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const pull = ((Math.hypot(dx, dy) || 1) - EDGE_LENGTH) / (Math.hypot(dx, dy) || 1) * 0.08;
      force.get(a.id)!.x += dx * pull;
      force.get(a.id)!.y += dy * pull;
      force.get(b.id)!.x -= dx * pull;
      force.get(b.id)!.y -= dy * pull;
    }
    for (const n of nodes) {
      const f = force.get(n.id)!;
      n.x = Math.max(60, Math.min(W - 60, n.x + f.x * heat + (W / 2 - n.x) * 0.01));
      n.y = Math.max(34, Math.min(H - 34, n.y + f.y * heat + (H / 2 - n.y) * 0.01));
    }
  }
  return nodes;
}

export function OverlapGraph({ clusters, cases, onOpen }: { clusters: OverlapCluster[]; cases: Map<string, { bureau: string; subject: string }>; onOpen: (id: string) => void }) {
  const { nodes, edges } = React.useMemo(() => {
    const ids = [...new Set(clusters.flatMap((c) => c.caseIds))].filter((id) => cases.has(id));
    const present = new Set(ids);
    const edges = clusters.flatMap((c) => c.pairs).filter((p) => present.has(p.a) && present.has(p.b));
    const nodes = layout(
      ids.map((id) => ({ id, bureau: cases.get(id)!.bureau, subject: cases.get(id)!.subject, x: 0, y: 0 })),
      edges
    );
    return { nodes, edges };
  }, [clusters, cases]);
  const [hover, setHover] = React.useState<string | null>(null);
  if (!nodes.length) return null;
  const at = new Map(nodes.map((n) => [n.id, n]));
  const bureaus = [...new Set(nodes.map((n) => n.bureau))];
  const hovered = nodes.find((n) => n.id === hover);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="group" aria-label={`Overlap graph: ${nodes.length} cases joined by ${edges.length} advisory matches`}>
        {edges.map((e) => {
          const a = at.get(e.a)!;
          const b = at.get(e.b)!;
          const lit = hover === e.a || hover === e.b;
          return (
            <g key={`${e.a}-${e.b}`}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={lit ? "#6A3254" : "rgba(156,78,124,0.45)"} strokeWidth={lit ? 2.5 : 1.5} />
              <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 5} textAnchor="middle" fontSize={11} fill="#74655A">
                {Math.round(e.confidence * 100)}%
              </text>
            </g>
          );
        })}
        {nodes.map((n) => (
          <g
            key={n.id}
            role="button"
            tabIndex={0}
            aria-label={`Open case ${n.id}, ${n.bureau}: ${n.subject}`}
            className="cursor-pointer focus:outline-none"
            onClick={() => onOpen(n.id)}
            onMouseEnter={() => setHover(n.id)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(n.id)}
            onBlur={() => setHover(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen(n.id);
              }
            }}
          >
            <circle cx={n.x} cy={n.y} r={hover === n.id ? 16 : 14} fill={bureauHex[n.bureau] ?? "#74655A"} stroke="#FFFCF5" strokeWidth={2} />
            <text x={n.x} y={n.y + 3.5} textAnchor="middle" fontSize={9.5} fontWeight={700} fill="#FFFCF5">
              {n.bureau}
            </text>
            <text x={n.x} y={n.y + 28} textAnchor="middle" fontSize={11} fill="#4F4338" style={{ fontVariantNumeric: "tabular-nums" }}>
              {n.id.slice(-5)}
            </text>
          </g>
        ))}
      </svg>
      <div className="flex min-h-[20px] flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-slate-400">
        {bureaus.map((b) => (
          <span key={b} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: bureauHex[b] }} /> {b}
          </span>
        ))}
        <span className="text-slate-500">{hovered ? `${hovered.id}: ${hovered.subject}` : "Lines show advisory match confidence. Select a case to open it."}</span>
      </div>
    </div>
  );
}
