"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { useApi } from "@/components/role-provider";
import { Advisory, Badge, Button, Card, CardHeader, Skeleton, cn } from "@/components/ui";
import { BureauChip, Confidence, CountUp, ErrorNote, SlaBadge, StatusBadge } from "@/components/bits";
import { BarsChart } from "@/components/charts";
import { OverlapBridge } from "@/components/overlap-bridge";
import { CaseDrawer, Fact } from "@/components/case-drawer";
import { OverlapGraph } from "@/components/overlap-graph";
import { RiskPanel } from "@/components/risk-panel";
import { StudentComplaintList } from "@/components/student-list";
import type { StudentSummary } from "@/lib/student";
import type { RiskResult } from "@/lib/risk";
import type { CaseView } from "@/lib/server";
import type { CaseAction, Institution } from "@/lib/types";
import type { OverlapCluster } from "@/lib/overlap";
import { fmtDate, fmtDateTime } from "@/lib/util";

interface Profile {
  institution: Institution;
  risk: RiskResult;
  cases: CaseView[];
  hiddenCount: number;
  clusters: OverlapCluster[];
  aliases: string[];
  pidVariants: string[];
  byBureau: { bureau: string; open: number; disposed: number }[];
  byCategory: { category: string; count: number }[];
  timeline: (CaseAction & { caseId: string; caseBureau: string })[];
  studentComplaints: StudentSummary[];
}

export default function InstitutionProfile({ params }: { params: { id: string } }) {
  const { data, error, loading } = useApi<Profile>(`/api/institutions/${params.id}`, { interval: 5000 });
  const [open, setOpen] = React.useState<string | null>(null);
  if (error)
    return (
      <div className="mx-auto max-w-[1480px]">
        <ErrorNote msg={error} />
      </div>
    );
  if (loading || !data)
    return (
      <div className="mx-auto max-w-[1480px] space-y-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-24" />
        <Skeleton className="h-96" />
      </div>
    );
  const i = data.institution;
  const openCases = data.cases.filter((c) => c.status !== "Disposed");
  const overdue = openCases.filter((c) => c.sla.state === "breached").length;
  const caseById = new Map(data.cases.map((c) => [c.id, c]));
  return (
    <div className="mx-auto max-w-[1480px] space-y-5">
      <div className="flex items-center justify-between">
        <Link href="/institutions" className="no-print inline-flex items-center gap-1.5 text-[14px] text-slate-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Institutions
        </Link>
        <Button variant="secondary" size="sm" onClick={() => window.print()} className="no-print">
          <Printer className="h-4 w-4" /> Print report
        </Button>
      </div>

      <div className="hidden print:block">
        <div className="text-[14px] font-semibold">NyayaSetu institution report. Synthetic demo data.</div>
        <div className="text-[13px]">Printed {fmtDateTime(new Date().toISOString())}. Covers the cases this role can see. Machine scores are advisory; final decisions rest with the competent authority.</div>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[34px] leading-[1.1] leading-tight tracking-tight text-white">{i.name}</h1>
            <div className="num mt-1 text-[15px] text-saffron-300">AICTE Permanent ID {i.id}</div>
            <div className="mt-1 text-[14.5px] text-slate-400">{i.address}</div>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
            <Fact k="Region" v={i.region} />
            <Fact k="Type" v={i.type} />
            <Fact k="Established" v={i.established} />
            <Fact k="Approved intake" v={<span className="num">{i.approvedIntake.toLocaleString("en-IN")}</span>} />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/[0.06] pt-4 sm:grid-cols-5">
          {[
            { l: "Complaints on record", v: data.cases.length, t: "text-white" },
            { l: "Open", v: openCases.length, t: "text-amber-200" },
            { l: "Disposed", v: data.cases.length - openCases.length, t: "text-emerald-300" },
            { l: "Beyond timeline", v: overdue, t: "text-red-300" },
            { l: "Overlap clusters", v: data.clusters.filter((c) => c.status === "Open").length, t: "text-violet-300" },
          ].map((s) => (
            <div key={s.l}>
              <div className="text-[13.5px] text-slate-400">{s.l}</div>
              <CountUp value={s.v} className={cn("text-[28px] leading-tight", s.t)} />
            </div>
          ))}
        </div>
        {(data.aliases.length > 0 || data.pidVariants.length > 0) && (
          <div className="mt-4 rounded-lg border border-[#EADFCD] bg-[#FBF6EC] px-4 py-3">
            <div className="mb-2 flex items-center gap-2 text-[14px] text-slate-300">
              Complainants also referred to this institution as <Advisory>matched by fuzzy name / ID</Advisory>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {data.aliases.map((a) => (
                <span key={a} className="rounded-md border border-white/10 bg-[#FBF6EC] px-2 py-0.5 text-[13.5px] text-slate-300">
                  “{a}”
                </span>
              ))}
              {data.pidVariants.map((p) => (
                <span key={p} className="num rounded-md border border-amber-300/30 bg-amber-400/10 px-2 py-0.5 text-[13.5px] text-amber-200">
                  ID quoted as {p}
                </span>
              ))}
            </div>
          </div>
        )}
        {data.hiddenCount > 0 && <div className="mt-3 text-[13.5px] text-slate-500">{data.hiddenCount} further case(s) on this institution sit with units outside your role&apos;s visibility.</div>}
      </Card>

      <RiskPanel risk={data.risk} />

      <StudentComplaintList items={data.studentComplaints} title={`Student-portal complaints (${data.studentComplaints.length})`} sub="Pseudonyms only, read-only. Complaints registered as AICTE cases also appear in the case list and are counted once." />

      {data.clusters.length > 0 && (
        <Card>
          <CardHeader title="Overlapping cases on this institution" sub="Complaints about the same issue sitting with more than one unit" />
          <div className="space-y-3 px-5 pb-5">
            <div className="rounded-2xl border border-[#EADFCD] bg-[#FBF6EC] p-3">
              <OverlapGraph clusters={data.clusters} cases={caseById} onOpen={setOpen} />
            </div>
            {data.clusters.map((cl) => (
              <div key={cl.id} className="border-t border-[#EADFCD] pt-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[14px] font-medium text-violet-200">{cl.kind === "cross-bureau" ? "Potential Overlapping Cases – Coordination Required" : "Possible duplicate registration"}</span>
                  <span className="flex items-center gap-2">
                    <Badge tone={cl.status === "Open" ? "violet" : "emerald"}>{cl.status}</Badge>
                    <Confidence value={cl.confidence} />
                  </span>
                </div>
                <OverlapBridge
                  pairs={cl.pairs}
                  status={cl.status}
                  onOpen={setOpen}
                  cases={cl.caseIds.map((id) => {
                    const c = caseById.get(id);
                    return { id, bureau: c?.bureau ?? "", subject: c?.subject ?? "", reference: c?.reference ?? "", reportedName: c?.reportedName ?? "" };
                  })}
                />
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="By bureau / cell" sub="Where this institution's complaints are handled" />
          <div className="px-3 pb-3">
            <BarsChart
              data={data.byBureau}
              x="bureau"
              stacked
              height={220}
              series={[
                { key: "open", label: "Open", color: "#C2831A" },
                { key: "disposed", label: "Disposed", color: "#4C8040" },
              ]}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="By category" sub="Nature of complaints received" />
          <div className="px-3 pb-3">
            <BarsChart data={data.byCategory} x="category" horizontal height={Math.max(160, data.byCategory.length * 34 + 40)} series={[{ key: "count", label: "Complaints", color: "#53659A" }]} />
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader title="Consolidated complaint history" sub="All bureaus and cells, newest first" />
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[840px] text-[14px]">
              <thead>
                <tr className="border-y border-white/[0.06] text-left text-[13px] text-slate-500">
                  <th className="px-5 py-2 font-medium">Case</th>
                  <th className="px-2 py-2 font-medium">Received</th>
                  <th className="px-2 py-2 font-medium">Subject</th>
                  <th className="px-2 py-2 font-medium">Unit</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-5 py-2 font-medium">SLA</th>
                </tr>
              </thead>
              <tbody>
                {data.cases.map((c) => (
                  <tr key={c.id} onClick={() => setOpen(c.id)} className="cursor-pointer border-b border-white/[0.04] hover:bg-white/[0.03]">
                    <td className="num whitespace-nowrap px-5 py-2 font-semibold text-white">{c.id}</td>
                    <td className="num whitespace-nowrap px-2 py-2 text-slate-400">{fmtDate(c.dateReceived)}</td>
                    <td className="max-w-[280px] px-2 py-2">
                      <div className="truncate text-slate-200">{c.subject}</div>
                      <div className="text-[12.5px] text-slate-500">{c.category}</div>
                    </td>
                    <td className="px-2 py-2">
                      <BureauChip code={c.bureau} />
                    </td>
                    <td className="px-2 py-2">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-2">
                      <SlaBadge sla={c.sla} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <CardHeader title="Cross-unit timeline" sub="Latest actions on any case of this institution" />
          <ol className="relative mx-5 mb-5 border-l border-white/10">
            {data.timeline.slice(0, 18).map((a) => (
              <li key={`${a.caseId}-${a.id}`} className="mb-3 ml-4">
                <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border border-white/20 bg-[#FFFCF5]" />
                <div className="flex flex-wrap items-center gap-1.5 text-[13.5px]">
                  <BureauChip code={a.bureau === "SYSTEM" ? a.caseBureau : a.bureau} />
                  <span className="font-medium text-white">{a.type}</span>
                  <button onClick={() => setOpen(a.caseId)} className="num text-slate-400 hover:text-saffron">
                    {a.caseId}
                  </button>
                </div>
                <div className="line-clamp-2 text-[13.5px] text-slate-400">{a.remarks}</div>
                <div className="text-[12.5px] text-slate-500">
                  {fmtDateTime(a.at)} · {a.by}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>
      <CaseDrawer id={open} onClose={() => setOpen(null)} />
    </div>
  );
}
