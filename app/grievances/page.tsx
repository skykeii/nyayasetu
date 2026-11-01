"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Eye, FilePlus2, ShieldAlert } from "lucide-react";
import { useApi, useRole } from "@/components/role-provider";
import { Advisory, Badge, Button, Card, CardHeader, Input, Label, Skeleton, Tabs, cn } from "@/components/ui";
import { BureauChip, CountUp, ErrorNote } from "@/components/bits";
import { CaseDrawer } from "@/components/case-drawer";
import type { DeskComplaint } from "@/lib/student";
import type { StudentStatus } from "@/lib/types";
import { fmtDate, fmtDateTime } from "@/lib/util";

interface Desk {
  items: DeskComplaint[];
  canReveal: boolean;
  canAct: boolean;
  stats: Record<string, number>;
}
const statusTone = (s: StudentStatus) => ({ "With College": "amber", "Resolved - Pending Verification": "sky", "Closed - Verified": "emerald", "Closed - Unverified": "slate", "Escalated to AICTE": "saffron", "Closed by AICTE": "emerald" } as const)[s];

function Reveal({ id }: { id: string }) {
  const { api, toast } = useRole();
  const [reason, setReason] = React.useState("");
  const [identity, setIdentity] = React.useState<Record<string, string> | null>(null);
  const [busy, setBusy] = React.useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const r = await api<{ identity: Record<string, string> }>("/api/grievances", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reveal", id, reason }) });
      setIdentity(r.identity);
    } catch (e) {
      toast({ title: "Not revealed", body: (e as Error).message, tone: "red" });
    } finally {
      setBusy(false);
    }
  };
  if (identity)
    return (
      <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-100">
        <div className="mb-1 font-semibold">Identity revealed. This view is recorded in the audit trail.</div>
        {identity.name} · {identity.mobile} · Roll {identity.rollNo} · {identity.apaarId}
      </div>
    );
  return (
    <div className="rounded-lg border border-white/[0.08] p-3">
      <Label>Reveal student identity (Competent Authority only; recorded in the audit trail)</Label>
      <div className="flex flex-wrap gap-2">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason, e.g. abuse investigation" className="min-w-[220px] flex-1" />
        <Button variant="danger" onClick={go} loading={busy} disabled={reason.trim().length < 5}>
          <Eye className="h-4 w-4" /> Reveal
        </Button>
      </div>
    </div>
  );
}

export default function GrievancesPageWrap() {
  return (
    <React.Suspense fallback={<Skeleton className="h-96" />}>
      <GrievancesPage />
    </React.Suspense>
  );
}

function GrievancesPage() {
  const { api, toast, bump } = useRole();
  const params = useSearchParams();
  const [filter, setFilter] = React.useState("escalated");
  const [q, setQ] = React.useState(params.get("open") ?? "");
  const [open, setOpen] = React.useState<string | null>(params.get("open"));
  const [caseId, setCaseId] = React.useState<string | null>(null);
  const { data, error, loading, reload } = useApi<Desk>(`/api/grievances?filter=${params.get("open") ? "" : filter}&q=${encodeURIComponent(q)}`, { interval: 5000 });
  if (error) return <ErrorNote msg={error} />;
  const s = data?.stats;
  const register = async (id: string) => {
    try {
      const r = await api<{ caseId: string }>("/api/grievances", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "register", id }) });
      toast({ title: `Registered as ${r.caseId}`, body: "The case carries only the pseudonym.", tone: "emerald", href: `/cases?open=${r.caseId}` });
      reload();
      bump();
    } catch (e) {
      toast({ title: "Not registered", body: (e as Error).message, tone: "red" });
    }
  };
  return (
    <div className="mx-auto max-w-[1280px] space-y-4">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight text-white">Student grievances</h1>
        <p className="text-[13.5px] text-slate-400">Complaints from the student portal. Escalations come here when a student marks a resolution Not done or a college misses its date.</p>
      </div>
      <Card className="grid grid-cols-2 overflow-hidden sm:grid-cols-3 xl:grid-cols-6">
        {[
          { l: "Total", v: s?.total, t: "text-white" },
          { l: "With colleges", v: s?.withCollege, t: "text-amber-200" },
          { l: "Escalated to AICTE", v: s?.escalated, t: "text-orange-300" },
          { l: "Closed, verified", v: s?.verified, t: "text-emerald-300" },
          { l: "Closed, unverified", v: s?.unverified, t: "text-slate-300" },
          { l: "Flagged", v: s?.flagged, t: "text-violet-300" },
        ].map((x) => (
          <div key={x.l} className="border-b border-r border-white/[0.06] px-4 py-3">
            <div className="text-[12.5px] text-slate-400">{x.l}</div>
            {x.v === undefined ? <Skeleton className="mt-1 h-7 w-12" /> : <CountUp value={x.v} className={cn("text-[24px] font-bold", x.t)} />}
          </div>
        ))}
      </Card>
      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={filter}
          onChange={setFilter}
          items={[
            { key: "escalated", label: "Escalated" },
            { key: "college", label: "With colleges" },
            { key: "unverified", label: "Unverified closures" },
            { key: "flagged", label: "Flagged" },
            { key: "", label: "All" },
          ]}
        />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ID, pseudonym, institution" aria-label="Search student grievances" className="max-w-xs" />
      </div>
      <Card className="overflow-hidden">
        <CardHeader title="Complaints" sub={<>Sorted by urgency. <Advisory>scores and flags are machine-generated</Advisory></>} />
        {loading && <Skeleton className="m-4 h-64" />}
        <div className="divide-y divide-white/[0.06]">
          {data?.items.map((c) => (
            <div key={c.id}>
              <button onClick={() => setOpen(open === c.id ? null : c.id)} aria-expanded={open === c.id} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-white/[0.03]">
                <span className="num w-9 shrink-0 text-center text-[15px] font-bold text-white">{c.urgency.score}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-white">{c.subject}</span>
                  <span className="block truncate text-[12.5px] text-slate-400">
                    <span className="num">{c.id}</span> · {c.pseudonym} · {c.institution} · {c.category}
                  </span>
                </span>
                {c.suspicious.length > 0 && (
                  <Badge tone="violet">
                    <ShieldAlert className="h-3 w-3" /> Flagged
                  </Badge>
                )}
                <BureauChip code={c.routedBureau} />
                <Badge tone={statusTone(c.status)}>{c.status}</Badge>
              </button>
              {open === c.id && (
                <div className="space-y-3 border-t border-white/[0.06] px-5 py-4">
                  <p className="max-w-[80ch] text-[14px] leading-relaxed text-slate-200">{c.translatedText}</p>
                  {c.language !== "English" && (
                    <p dir="auto" className="max-w-[80ch] text-[13px] text-slate-400">
                      Original ({c.language}): {c.originalText}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12.5px] text-slate-400">
                    <span>Filed {fmtDate(c.createdAt)}</span>
                    <span>College date {fmtDate(c.dueAt)}</span>
                    <span>{c.urgency.reason}</span>
                    <span>Region {c.region}</span>
                  </div>
                  {c.suspicious.length > 0 && (
                    <div className="rounded-lg border border-violet-300/30 bg-violet-500/10 px-3 py-2 text-[13px] text-violet-100">
                      <div className="mb-1 font-medium">AICTE only: genuineness flags <Advisory /></div>
                      <ul className="list-disc pl-5">
                        {c.suspicious.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {c.proof && (
                    <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3 text-[13px] text-slate-300">
                      <div className="text-[12.5px] font-medium text-slate-400">College&apos;s proof, {fmtDateTime(c.proof.at)}</div>
                      {c.proof.note}
                      {c.evidence && (
                        <div className="mt-1 text-[12.5px] text-slate-400">
                          <Advisory>evidence check{c.evidence.source === "mock" ? " (offline mock)" : ""}, not proof</Advisory> <span className="num text-white">{c.evidence.score}/100</span> {c.evidence.verdict}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {c.caseId ? (
                      <Button variant="secondary" size="sm" onClick={() => setCaseId(c.caseId!)}>
                        Open case {c.caseId}
                      </Button>
                    ) : (
                      c.status === "Escalated to AICTE" &&
                      data.canAct && (
                        <Button variant="primary" size="sm" onClick={() => register(c.id)}>
                          <FilePlus2 className="h-4 w-4" /> Register as AICTE case
                        </Button>
                      )
                    )}
                    <Link href={`/institutions/${c.institutionId}`} className="text-[13px] text-saffron hover:underline">
                      Institution profile
                    </Link>
                  </div>
                  {data.canReveal && <Reveal id={c.id} />}
                  <ul className="space-y-1 text-[12.5px] text-slate-400">
                    {[...c.actions].reverse().map((a, i) => (
                      <li key={i}>
                        <span className="text-slate-200">{a.type}</span> · {fmtDateTime(a.at)} · {a.by} · {a.remarks}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
          {data && data.items.length === 0 && <div className="px-5 py-10 text-center text-sm text-slate-400">No complaints in this view.</div>}
        </div>
      </Card>
      <CaseDrawer id={caseId} onClose={() => setCaseId(null)} />
    </div>
  );
}
