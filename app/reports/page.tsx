"use client";
import * as React from "react";
import Link from "next/link";
import { Download, Printer } from "lucide-react";
import { useApi } from "@/components/role-provider";
import { Badge, Button, Card, CardHeader, Input, Label, Skeleton, Tabs } from "@/components/ui";
import { ErrorNote } from "@/components/bits";
import { BarsChart, LinesChart } from "@/components/charts";
import type { Report } from "@/lib/analytics";
import { toCsv } from "@/lib/util";

export default function ReportsPage() {
  const [type, setType] = React.useState("bureau");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [sort, setSort] = React.useState<{ key: string; dir: 1 | -1 } | null>(null);
  const { data, error, loading } = useApi<{ report: Report; types: { key: string; label: string }[] }>(`/api/reports?type=${type}&from=${from}&to=${to}`);
  const r = data?.report;
  const rows = React.useMemo(() => {
    if (!r) return [];
    if (!sort) return r.rows;
    return [...r.rows].sort((a, b) => {
      const x = a[sort.key] as number | string;
      const y = b[sort.key] as number | string;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir;
    });
  }, [r, sort]);
  React.useEffect(() => setSort(null), [type]);

  const exportCsv = () => {
    if (!r) return;
    const blob = new Blob([toCsv(r.columns, rows)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `nyayasetu-${r.key}-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="mx-auto max-w-[1480px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-white">Reports and analytics</h1>
          <p className="text-[13.5px] text-slate-400">Every report covers the cases your role can see. Export the table as CSV for MIS returns.</p>
        </div>
        <div className="no-print flex gap-2">
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </Button>
          <Button variant="primary" onClick={exportCsv} disabled={!r}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>
      <div className="no-print flex flex-wrap items-end gap-3">
        <Tabs value={type} onChange={setType} items={(data?.types ?? [{ key: "bureau", label: "Bureau / Cell-wise" }]).map((t) => ({ key: t.key, label: t.label }))} />
        <div className="flex gap-2">
          <div>
            <Label>Received from</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </div>
          <div>
            <Label>to</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
        </div>
      </div>
      {error && <ErrorNote msg={error} />}
      {loading || !r ? (
        <Skeleton className="h-[520px]" />
      ) : (
        <>
          <Card>
            <CardHeader title={r.title} sub={r.description} right={type === "overlap" ? <Badge tone="sky">Detection is advisory</Badge> : undefined} />
            <div className="px-3 pb-4">
              {r.chart.data.length === 0 ? (
                <div className="py-16 text-center text-sm text-slate-400">No data for this period.</div>
              ) : r.chart.kind === "line" ? (
                <LinesChart data={r.chart.data} x={r.chart.x} series={r.chart.series} height={300} />
              ) : (
                <BarsChart data={r.chart.data} x={r.chart.x} series={r.chart.series} stacked={r.chart.kind === "stacked"} height={300} />
              )}
            </div>
          </Card>
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 text-[13px] text-slate-400">
              <span>
                <span className="num font-semibold text-white">{rows.length}</span> rows
              </span>
              <span>Click a column to sort</span>
            </div>
            <div className="scroll-thin max-h-[560px] overflow-auto">
              <table className="w-full min-w-[900px] text-[13px]">
                <thead className="sticky top-0 bg-[#10162b]">
                  <tr className="border-y border-white/[0.06] text-left text-[12px] text-slate-500">
                    {r.columns.map((c) => (
                      <th key={c.key} className={`cursor-pointer select-none px-4 py-2.5 font-medium hover:text-slate-200 ${c.numeric ? "text-right" : ""}`} onClick={() => setSort((s) => ({ key: c.key, dir: s?.key === c.key ? (-s.dir as 1 | -1) : -1 }))}>
                        {c.label}
                        {sort?.key === c.key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                      {r.columns.map((c) => {
                        const v = row[c.key];
                        const content =
                          c.key === "name" && r.key === "institution" ? (
                            <Link href={`/institutions/${row.id}`} className="hover:text-saffron">
                              {String(v)}
                            </Link>
                          ) : c.key === "id" && r.key === "overlap" ? (
                            <Link href={`/overlaps?focus=${v}`} className="hover:text-saffron">
                              {String(v)}
                            </Link>
                          ) : typeof v === "number" ? (
                            v.toLocaleString("en-IN")
                          ) : (
                            String(v ?? "")
                          );
                        return (
                          <td key={c.key} className={`px-4 py-2 ${c.numeric ? "num text-right" : "text-slate-200"} ${c.key === "cases" ? "max-w-[260px] truncate text-slate-400" : ""}`}>
                            {content}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
