"use client";
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, FilterX, Search } from "lucide-react";
import { useApi, useRole } from "@/components/role-provider";
import { Badge, Button, Card, Input, Label, Select, Skeleton, Tabs, cn } from "@/components/ui";
import { BureauChip, ErrorNote, OverlapPulse, SeverityDot, SlaBadge, StatusBadge } from "@/components/bits";
import { CaseDrawer } from "@/components/case-drawer";
import { JourneyLegend, JourneyLine } from "@/components/journey";
import type { CaseView } from "@/lib/server";
import { fmtDate, toCsv } from "@/lib/util";

const KEYS = ["q", "bureau", "region", "state", "category", "status", "from", "to", "overlap", "sort"] as const;
type F = Record<(typeof KEYS)[number], string>;

export default function CasesPage() {
  return (
    <React.Suspense fallback={<Skeleton className="h-96" />}>
      <Cases />
    </React.Suspense>
  );
}

function Cases() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { meta, api, toast } = useRole();
  const fkey = KEYS.map((k) => sp.get(k) ?? "").join("\u0001");
  const init = React.useMemo(() => Object.fromEntries(KEYS.map((k, i) => [k, fkey.split("\u0001")[i]])) as F, [fkey]);
  const [f, setF] = React.useState<F>(init);
  const [qDraft, setQDraft] = React.useState(init.q);
  const [page, setPage] = React.useState(1);
  const openId = sp.get("open");
  const view = sp.get("view") === "table" ? "table" : "map";

  React.useEffect(() => {
    setF(init);
    setQDraft(init.q);
    setPage(1);
  }, [init]);

  const setParam = (patch: Partial<F> & { open?: string | null }) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), page: String(page), pageSize: "25" }).toString();
  const { data, error, loading } = useApi<{ items: CaseView[]; total: number; page: number; pageSize: number }>(`/api/cases?${qs}`, { interval: 5000 });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const active = KEYS.filter((k) => k !== "sort" && f[k]).length;

  const exportCsv = async () => {
    try {
      const all: CaseView[] = [];
      for (let p = 1; p <= 10; p++) {
        const r = await api<{ items: CaseView[]; total: number }>(`/api/cases?${new URLSearchParams({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), page: String(p), pageSize: "200" })}`);
        all.push(...r.items);
        if (all.length >= r.total) break;
      }
      const cols = [
        { key: "id", label: "Case ID" },
        { key: "reference", label: "Reference" },
        { key: "dateReceived", label: "Date received" },
        { key: "category", label: "Category" },
        { key: "status", label: "Status" },
        { key: "bureau", label: "Bureau/Cell" },
        { key: "officerName", label: "Assigned officer" },
        { key: "institutionId", label: "Permanent ID" },
        { key: "institutionName", label: "Institution" },
        { key: "region", label: "Region" },
        { key: "lastAction", label: "Last action" },
        { key: "lastActionDate", label: "Date of last action" },
        { key: "nextAction", label: "Next action required" },
        { key: "expectedDisposalDate", label: "Expected disposal date" },
      ];
      const rows = all.map((c) => ({ ...c, dateReceived: c.dateReceived.slice(0, 10), lastActionDate: c.lastActionDate.slice(0, 10), expectedDisposalDate: c.expectedDisposalDate.slice(0, 10) }));
      const blob = new Blob([toCsv(cols, rows as unknown as Record<string, unknown>[])], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `nyayasetu-cases-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
    } catch (e) {
      toast({ title: "Export failed", body: (e as Error).message, tone: "red" });
    }
  };

  return (
    <div className="mx-auto max-w-[1480px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[34px] leading-[1.1] tracking-tight text-white">Cases</h1>
          <p className="text-[14.5px] text-slate-400">Every complaint case visible to your role, across bureaus and cells.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            value={view}
            onChange={(v) => setParam({ view: v === "table" ? "table" : "" } as Partial<F>)}
            items={[
              { key: "map", label: "Journey map" },
              { key: "table", label: "Table" },
            ]}
          />
          <Button variant="secondary" onClick={exportCsv}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-[2fr_repeat(4,1fr)]"
          onSubmit={(e) => {
            e.preventDefault();
            setParam({ q: qDraft.trim() });
          }}
        >
          <div className="sm:col-span-2 lg:col-span-2 xl:col-span-1">
            <Label>Institution name, Permanent ID, Case ID or reference</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input value={qDraft} onChange={(e) => setQDraft(e.target.value)} onBlur={() => qDraft !== f.q && setParam({ q: qDraft.trim() })} placeholder="e.g. Sahyadri, 1-4…, NS-2026-00012" className="pl-9" />
            </div>
          </div>
          <div>
            <Label>Bureau / Cell</Label>
            <Select value={f.bureau} onChange={(e) => setParam({ bureau: e.target.value })}>
              <option value="">All</option>
              {meta?.bureaus.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.code} — {b.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Region</Label>
            <Select value={f.region} onChange={(e) => setParam({ region: e.target.value })}>
              <option value="">All</option>
              {meta?.regions.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Category</Label>
            <Select value={f.category} onChange={(e) => setParam({ category: e.target.value })}>
              <option value="">All</option>
              {meta?.categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={f.status} onChange={(e) => setParam({ status: e.target.value })}>
              <option value="">All</option>
              <option value="open">All open (not disposed)</option>
              <option value="overdue">Pending beyond timeline</option>
              <option value="due-soon">Due soon</option>
              <option value="New">Pending (unassigned)</option>
              <option value="Under Process">Under process</option>
              <option value="Transferred">Transferred</option>
              <option value="Escalated">Escalated</option>
              <option value="Disposed">Disposed</option>
            </Select>
          </div>
          <div>
            <Label>Received from</Label>
            <Input type="date" value={f.from} onChange={(e) => setParam({ from: e.target.value })} />
          </div>
          <div>
            <Label>Received to</Label>
            <Input type="date" value={f.to} onChange={(e) => setParam({ to: e.target.value })} />
          </div>
          <div>
            <Label>Sort by</Label>
            <Select value={f.sort} onChange={(e) => setParam({ sort: e.target.value })}>
              <option value="">Newest received</option>
              <option value="received-asc">Oldest received</option>
              <option value="due-asc">Disposal date (soonest)</option>
              <option value="action-desc">Latest action</option>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <label className="flex h-10 flex-1 cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-[14px] text-slate-300">
              <input type="checkbox" checked={f.overlap === "1"} onChange={(e) => setParam({ overlap: e.target.checked ? "1" : "" })} className="accent-violet-400" />
              Only in open overlaps
            </label>
          </div>
          <div className="flex items-end">
            <Button type="button" variant="ghost" disabled={!active} onClick={() => router.replace(view === "table" ? `${pathname}?view=table` : pathname)} className="w-full">
              <FilterX className="h-4 w-4" /> Clear filters
            </Button>
          </div>
        </form>
      </Card>

      {error && <ErrorNote msg={error} />}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 text-[14px] text-slate-400">
          <span>
            <span className="num font-semibold text-white">{data?.total ?? "…"}</span> cases{active ? " match your filters" : ""}
          </span>
          <span className="num">
            Page {page} of {pages}
          </span>
        </div>
        {view === "map" ? (
          <>
            <JourneyLegend className="border-t border-[#EADFCD] px-6 py-3" />
            <ul className="divide-y divide-[#EADFCD] border-t border-[#EADFCD]">
              {loading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <li key={i} className="px-6 py-4">
                    <Skeleton className="h-14" />
                  </li>
                ))}
              {data?.items.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setParam({ open: c.id })}
                    aria-label={`Open case ${c.id}, ${c.institutionName}`}
                    className={cn(
                      "grid w-full gap-x-8 gap-y-3 px-6 py-4 text-left transition-colors hover:bg-[#FBF4E8] lg:grid-cols-[minmax(230px,1.05fr)_minmax(260px,1.25fr)_minmax(200px,0.9fr)] lg:items-center",
                      openId === c.id && "bg-[#FBF4E8]"
                    )}
                  >
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="num font-semibold text-white">{c.id}</span>
                        <BureauChip code={c.bureau} />
                        {c.overlapClusters.some((o) => o.status === "Open") && (
                          <Badge tone="violet">
                            <OverlapPulse className="h-1.5 w-1.5" /> Overlap
                          </Badge>
                        )}
                        {c.partnerView && <Badge tone="slate">Partner unit</Badge>}
                      </span>
                      <span className="mt-1 block truncate text-[15px] text-slate-100">{c.institutionName}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[13.5px] text-slate-400">
                        <span>{c.category}</span>
                        <SeverityDot s={c.severity} />
                        <span>{c.region}</span>
                      </span>
                    </span>
                    <JourneyLine journey={c.journey} sla={c.sla} />
                    <span className="min-w-0">
                      <span className="block text-[13px] text-slate-500">Next step</span>
                      <span className="line-clamp-2 text-[14px] text-slate-200">{c.nextAction}</span>
                      <span className="num mt-0.5 block text-[13px] text-slate-500">Decision due {fmtDate(c.expectedDisposalDate)}</span>
                    </span>
                  </button>
                </li>
              ))}
              {data && data.items.length === 0 && <li className="px-6 py-12 text-center text-slate-400">No cases match. Try clearing a filter or searching by Permanent ID.</li>}
            </ul>
          </>
        ) : (
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[1100px] text-[14px]">
            <thead>
              <tr className="border-y border-white/[0.06] text-left text-[13px] text-slate-500">
                <th className="px-5 py-2.5 font-medium">Case</th>
                <th className="px-2 py-2.5 font-medium">Received</th>
                <th className="px-2 py-2.5 font-medium">Institution</th>
                <th className="px-2 py-2.5 font-medium">Category</th>
                <th className="px-2 py-2.5 font-medium">Unit and officer</th>
                <th className="px-2 py-2.5 font-medium">Status</th>
                <th className="px-2 py-2.5 font-medium">Next action required</th>
                <th className="px-5 py-2.5 font-medium">Disposal by</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={8} className="px-5 py-2">
                      <Skeleton className="h-9" />
                    </td>
                  </tr>
                ))}
              {data?.items.map((c) => (
                <tr key={c.id} onClick={() => setParam({ open: c.id })} className={cn("cursor-pointer border-b border-white/[0.04] align-top hover:bg-white/[0.03]", openId === c.id && "bg-white/[0.04]")}>
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="num whitespace-nowrap font-semibold text-white">{c.id}</span>
                      {c.overlapClusters.some((o) => o.status === "Open") && <OverlapPulse className="h-2 w-2" />}
                    </div>
                    <div className="num max-w-[160px] truncate text-[12.5px] text-slate-500">{c.reference}</div>
                  </td>
                  <td className="num whitespace-nowrap px-2 py-2.5 text-slate-300">{fmtDate(c.dateReceived)}</td>
                  <td className="max-w-[240px] px-2 py-2.5">
                    <div className="truncate text-slate-100">{c.institutionName}</div>
                    <div className="num text-[12.5px] text-slate-500">
                      {c.institutionId} · {c.region}
                    </div>
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="text-slate-200">{c.category}</div>
                    <SeverityDot s={c.severity} />
                  </td>
                  <td className="px-2 py-2.5">
                    <BureauChip code={c.bureau} />
                    <div className="mt-0.5 max-w-[150px] truncate text-[13px] text-slate-400">{c.officerName}</div>
                  </td>
                  <td className="px-2 py-2.5">
                    <StatusBadge status={c.status} />
                    {c.partnerView && (
                      <div className="mt-1">
                        <Badge tone="violet">Partner unit</Badge>
                      </div>
                    )}
                  </td>
                  <td className="max-w-[260px] px-2 py-2.5">
                    <div className="line-clamp-2 text-slate-300">{c.nextAction}</div>
                    <div className="text-[12.5px] text-slate-500">Last action {fmtDate(c.lastActionDate)}</div>
                  </td>
                  <td className="whitespace-nowrap px-5 py-2.5">
                    <div className="num text-slate-300">{fmtDate(c.expectedDisposalDate)}</div>
                    <SlaBadge sla={c.sla} />
                  </td>
                </tr>
              ))}
              {data && data.items.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-slate-400">
                    No cases match. Try clearing a filter or searching by Permanent ID.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        )}
        <div className="flex items-center justify-end gap-2 px-5 py-3">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      </Card>
      <CaseDrawer id={openId} onClose={() => setParam({ open: null })} />
    </div>
  );
}
