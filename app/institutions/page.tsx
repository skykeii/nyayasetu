"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useApi, useRole } from "@/components/role-provider";
import { Badge, Card, Input, Select, Skeleton, cn } from "@/components/ui";
import { BureauChip, ErrorNote } from "@/components/bits";
import { ConfidenceBadge } from "@/components/risk-panel";
import type { Confidence } from "@/lib/risk";
import type { Institution } from "@/lib/types";
import { fmtDate } from "@/lib/util";

type Row = Institution & { total: number; open: number; disposed: number; overdue: number; bureaus: string[]; overlaps: number; lastComplaint?: string; risk: { score: number; confidence: Confidence; band: string } };

export default function InstitutionsPageWrap() {
  return (
    <React.Suspense fallback={<Skeleton className="h-96" />}>
      <InstitutionsPage />
    </React.Suspense>
  );
}

function InstitutionsPage() {
  const { meta, role, region: myRegion } = useRole();
  const params = useSearchParams();
  const [q, setQ] = React.useState("");
  const [region, setRegion] = React.useState(params.get("region") ?? "");
  const [dq, setDq] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setDq(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  const { data, error, loading } = useApi<{ items: Row[]; total: number }>(`/api/institutions?q=${encodeURIComponent(dq)}&region=${encodeURIComponent(region)}`);
  return (
    <div className="mx-auto max-w-[1480px] space-y-4">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight text-white">Institutions</h1>
        <p className="text-[13.5px] text-slate-400">
          One profile per AICTE Permanent ID, consolidating complaints from every bureau and cell{role === "ro" ? ` in the ${myRegion} region` : ""}.
        </p>
      </div>
      <Card className="flex flex-col gap-3 p-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, short name, Permanent ID, city or state" className="pl-9" aria-label="Search institutions" />
        </div>
        {role !== "ro" && (
          <Select value={region} onChange={(e) => setRegion(e.target.value)} className="sm:w-56" aria-label="Region">
            <option value="">All regions</option>
            {meta?.regions.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        )}
      </Card>
      {error && <ErrorNote msg={error} />}
      <Card className="overflow-hidden">
        <div className="px-5 py-3 text-[13px] text-slate-400">
          <span className="num font-semibold text-white">{data?.total ?? "…"}</span> institutions
        </div>
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[1140px] text-[13px]">
            <thead>
              <tr className="border-y border-white/[0.06] text-left text-[12px] text-slate-500">
                <th className="px-5 py-2.5 font-medium">Institution</th>
                <th className="px-2 py-2.5 font-medium">Location</th>
                <th className="px-2 py-2.5 font-medium">Type</th>
                <th className="px-2 py-2.5 text-right font-medium">Complaints</th>
                <th className="px-2 py-2.5 text-right font-medium">Open</th>
                <th className="px-2 py-2.5 text-right font-medium">Overdue</th>
                <th className="px-2 py-2.5 font-medium">Units handling now</th>
                <th className="px-2 py-2.5 font-medium">Overlaps</th>
                <th className="px-2 py-2.5 font-medium">Risk index (advisory)</th>
                <th className="px-5 py-2.5 font-medium">Last complaint</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={10} className="px-5 py-2">
                      <Skeleton className="h-9" />
                    </td>
                  </tr>
                ))}
              {data?.items.map((i) => (
                <tr key={i.id} className="border-b border-white/[0.04] hover:bg-white/[0.03]">
                  <td className="max-w-[340px] px-5 py-2.5">
                    <Link href={`/institutions/${i.id}`} className="block truncate font-medium text-slate-100 hover:text-saffron">
                      {i.name}
                    </Link>
                    <span className="num text-[11.5px] text-slate-500">
                      {i.id} · {i.shortName}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-slate-300">
                    {i.city}, {i.state}
                    <div className="text-[11.5px] text-slate-500">{i.region}</div>
                  </td>
                  <td className="px-2 py-2.5 text-slate-400">{i.type}</td>
                  <td className="num px-2 py-2.5 text-right">{i.total}</td>
                  <td className="num px-2 py-2.5 text-right text-amber-200">{i.open}</td>
                  <td className={cn("num px-2 py-2.5 text-right", i.overdue ? "font-semibold text-red-300" : "text-slate-600")}>{i.overdue}</td>
                  <td className="px-2 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {i.bureaus.length ? i.bureaus.map((b) => <BureauChip key={b} code={b} />) : <span className="text-slate-600">None</span>}
                    </div>
                  </td>
                  <td className="px-2 py-2.5">{i.overlaps ? <Badge tone="violet">{i.overlaps} open</Badge> : <span className="text-slate-600">0</span>}</td>
                  <td className="px-2 py-2.5" title={i.risk.band}>
                    <span className="flex items-center gap-2">
                      <span className={cn("num font-semibold", i.risk.confidence === "Low" ? "text-slate-500" : "text-white")}>{i.risk.score}</span>
                      <ConfidenceBadge c={i.risk.confidence} />
                    </span>
                  </td>
                  <td className="num px-5 py-2.5 text-slate-400">{fmtDate(i.lastComplaint)}</td>
                </tr>
              ))}
              {data && !data.items.length && (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    No institution matches “{dq}”. Try the Permanent ID or the city.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
