"use client";
import * as React from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface Series {
  key: string;
  label: string;
  color: string;
}

const axis = { stroke: "#B8A994", fontSize: 13, tickLine: false, axisLine: false } as const;

function Tip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-strong rounded-lg px-3 py-2 text-[13.5px] shadow-xl">
      <div className="mb-1 font-medium text-white">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-6 text-slate-300">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="num font-semibold text-white">{p.value?.toLocaleString("en-IN")}</span>
        </div>
      ))}
    </div>
  );
}

export function BarsChart({ data, x, series, stacked, height = 260, horizontal }: { data: Record<string, unknown>[]; x: string; series: Series[]; stacked?: boolean; height?: number; horizontal?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 8, right: 12, left: horizontal ? 8 : -12, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid stroke="rgba(80,55,30,0.09)" vertical={!!horizontal} horizontal={!horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" {...axis} allowDecimals={false} />
            <YAxis type="category" dataKey={x} {...axis} width={110} tick={{ fill: "#4F4338", fontSize: 13 }} />
          </>
        ) : (
          <>
            <XAxis dataKey={x} {...axis} tick={{ fill: "#74655A", fontSize: 12.5 }} interval={0} angle={data.length > 8 ? -25 : 0} textAnchor={data.length > 8 ? "end" : "middle"} height={data.length > 8 ? 56 : 28} />
            <YAxis {...axis} allowDecimals={false} tick={{ fill: "#74655A", fontSize: 12.5 }} />
          </>
        )}
        <Tooltip content={<Tip />} cursor={{ fill: "rgba(166,85,11,0.06)" }} />
        {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 13, color: "#4F4338", paddingTop: 4 }} />}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} stackId={stacked ? "a" : undefined} radius={stacked ? (i === series.length - 1 ? (horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]) : 0) : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={38} isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LinesChart({ data, x, series, height = 260 }: { data: Record<string, unknown>[]; x: string; series: Series[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid stroke="rgba(80,55,30,0.09)" vertical={false} />
        <XAxis dataKey={x} {...axis} tick={{ fill: "#74655A", fontSize: 12.5 }} />
        <YAxis {...axis} allowDecimals={false} tick={{ fill: "#74655A", fontSize: 12.5 }} />
        <Tooltip content={<Tip />} cursor={{ stroke: "rgba(166,85,11,0.3)" }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 13, color: "#4F4338", paddingTop: 4 }} />
        {series.map((s) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2.4} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
