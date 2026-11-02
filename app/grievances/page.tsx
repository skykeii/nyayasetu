"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CornerDownLeft, Eye, FilePlus2, ShieldAlert, Siren } from "lucide-react";
import { useApi, useRole } from "@/components/role-provider";
import { Advisory, Badge, Button, Card, CardHeader, Input, Label, Skeleton, Tabs, Textarea, cn } from "@/components/ui";
import { BureauChip, CountUp, ErrorNote } from "@/components/bits";
import { CaseDrawer } from "@/components/case-drawer";
import type { DeskComplaint } from "@/lib/student";
import type { StudentStatus } from "@/lib/types";
import { fmtDate, fmtDateTime } from "@/lib/util";

interface Desk {
  items: DeskComplaint[];
  canReveal: boolean;
  canAct: boolean;
  deletionRequests: { id: string; pseudonym: string; at: string; note: string; status: string }[];
  stats: Record<string, number>;
}
const statusTone = (s: StudentStatus) => ({ "With College": "amber", "Resolved - Pending Verification": "sky", "Closed - Verified": "emerald", "Closed - Unverified": "slate", "Escalated to AICTE": "saffron", "Closed by AICTE": "emerald" } as const)[s];

const post = (api: <T>(p: string, i?: RequestInit) => Promise<T>, body: object) => api<{ caseId?: string; identity?: Record<string, string> }>("/api/grievances", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

function Reveal({ id }: { id: string }) {
  const { api, toast } = useRole();
  const [reason, setReason] = React.useState("");
  const [identity, setIdentity] = React.useState<Record<string, string> | null>(null);
  const [busy, setBusy] = React.useState(false);
  const go = async () => {
    setBusy(true);
    try {
      setIdentity((await post(api, { action: "reveal", id, reason })).identity ?? null);
    } catch (e) {
      toast({ title: "Not revealed", body: (e as Error).message, tone: "red" });
    } finally {
      setBusy(false);
    }
  };
  if (identity)
    return (
      <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-[14px] text-red-100">
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

function ReturnToCollege({ id, onDone }: { id: string; onDone: () => void }) {
  const { api, toast, bump } = useRole();
  const [directions, setDirections] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const go = async () => {
    setBusy(true);
    try {
      await post(api, { action: "return", id, directions });
      toast({ title: "Returned to the college", body: "A new round starts. The student gives a verdict on the new proof.", tone: "emerald" });
      onDone();
      bump();
    } catch (e) {
      toast({ title: "Not returned", body: (e as Error).message, tone: "red" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-lg border border-white/[0.08] p-3">
      <Label>Return to the college with directions (starts a new round)</Label>
      <Textarea value={directions} onChange={(e) => setDirections(e.target.value)} placeholder="What the college must do and prove" className="min-h-[60px]" />
      <Button variant="secondary" size="sm" className="mt-2" onClick={go} loading={busy} disabled={directions.trim().length < 5}>
        <CornerDownLeft className="h-4 w-4" /> Return with directions
      </Button>
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
  const { api, toast, bump, role } = useRole();
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
      const r = await post(api, { action: "register", id });
      toast({ title: `Registered as ${r.caseId}`, body: "The case carries only the pseudonym.", tone: "emerald", href: `/cases?open=${r.caseId}` });
      reload();
      bump();
    } catch (e) {
      toast({ title: "Not registered", body: (e as Error).message, tone: "red" });
    }
  };
  const ack = async (id: string) => {
    try {
      await post(api, { action: "ack-deletion", id });
      reload();
    } catch (e) {
      toast({ title: "Not saved", body: (e as Error).message, tone: "red" });
    }
  };
  const isCa = role === "ca";
  return (
    <div className="mx-auto max-w-[1280px] space-y-4">
      <div>
        <h1 className="text-[34px] leading-[1.1] tracking-tight text-white">Student grievances</h1>
        <p className="text-[14.5px] text-slate-400">Complaints from the student portal. Escalations come here when a student marks a resolution Not done or a college misses its date. AICTE closes the case or returns it with directions.</p>
      </div>
      <Card className="grid grid-cols-2 overflow-hidden sm:grid-cols-3 xl:grid-cols-6">
        {[
          { l: "Total", v: s?.total, t: "text-white" },
          { l: "With colleges", v: s?.withCollege, t: "text-amber-200" },
          { l: "Escalated to AICTE", v: s?.escalated, t: "text-orange-300" },
          { l: "Critical (2 Not done)", v: s?.critical, t: "text-red-300" },
          { l: "Closed, unverified", v: s?.unverified, t: "text-slate-300" },
          { l: "Flagged", v: s?.flagged, t: "text-violet-300" },
        ].map((x) => (
          <div key={x.l} className="border-b border-r border-white/[0.06] px-4 py-3">
            <div className="text-[13.5px] text-slate-400">{x.l}</div>
            {x.v === undefined ? <Skeleton className="mt-1 h-7 w-12" /> : <CountUp value={x.v} className={cn("text-[28px] leading-tight", x.t)} />}
          </div>
        ))}
      </Card>
      {isCa && !!data?.deletionRequests.length && (
        <Card>
          <CardHeader title="Deletion requests" sub="Logged by students from their privacy page. Nothing is deleted automatically." />
          <ul className="divide-y divide-white/[0.05] pb-2 text-[14px]">
            {data.deletionRequests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2">
                <span className="text-slate-200">
                  {r.pseudonym} · {fmtDateTime(r.at)} {r.note && `· ${r.note}`}
                </span>
                {r.status === "Open" ? (
                  <Button size="sm" variant="secondary" onClick={() => ack(r.id)}>
                    Acknowledge
                  </Button>
                ) : (
                  <Badge tone="emerald">{r.status}</Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={filter}
          onChange={setFilter}
          items={[
            { key: "escalated", label: "Escalated" },
            { key: "critical", label: "Critical" },
            { key: "college", label: "With colleges" },
            { key: "unverified", label: "Unverified closures" },
            { key: "flagged", label: "Flagged" },
            ...(isCa ? [{ key: "overlap", label: `Student complaints with possible overlap (${s?.overlap ?? 0})` }] : []),
            { key: "", label: "All" },
          ]}
        />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ID, pseudonym, institution" aria-label="Search student grievances" className="max-w-xs" />
      </div>
      <Card className="overflow-hidden">
        <CardHeader title="Complaints" sub={<>Critical first, then by urgency. <Advisory>scores and flags are machine-generated</Advisory></>} />
        {loading && <Skeleton className="m-4 h-64" />}
        <div className="divide-y divide-white/[0.06]">
          {data?.items.map((c) => (
            <div key={c.id}>
              <button onClick={() => setOpen(open === c.id ? null : c.id)} aria-expanded={open === c.id} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-white/[0.03]">
                <span className="num w-9 shrink-0 text-center text-[15px] font-bold text-white">{c.urgency.score}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium text-white">{c.subject}</span>
                  <span className="block truncate text-[13.5px] text-slate-400">
                    <span className="num">{c.id}</span> · {c.pseudonym} · {c.institution} · {c.category}
                  </span>
                </span>
                {c.criticalFlag && (
                  <Badge tone="red">
                    <Siren className="h-3 w-3" /> Critical
                  </Badge>
                )}
                {c.round > 1 && <Badge tone="saffron">Round {c.round}</Badge>}
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
                  <p className="max-w-[80ch] text-[15px] leading-relaxed text-slate-200">{c.translatedText}</p>
                  {c.language !== "English" && (
                    <p dir="auto" className="max-w-[80ch] text-[14px] text-slate-400">
                      Original ({c.language}): {c.originalText}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13.5px] text-slate-400">
                    <span>Filed {fmtDate(c.createdAt)}</span>
                    <span>College date {fmtDate(c.dueAt)}</span>
                    <span>{c.urgency.reason}</span>
                    <span>Region {c.region}</span>
                    {c.maskLevel === "basic" && <span>Masking: basic</span>}
                  </div>
                  {c.suspicious.length > 0 && (
                    <div className="rounded-lg border border-violet-300/30 bg-violet-500/10 px-3 py-2 text-[14px] text-violet-100">
                      <div className="mb-1 font-medium">AICTE only: genuineness flags <Advisory /></div>
                      <ul className="list-disc pl-5">
                        {c.suspicious.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {c.overlapFlags.length > 0 && (
                    <div className="rounded-lg border border-violet-300/30 bg-violet-500/10 px-3 py-2 text-[14px] text-violet-100">
                      <div className="mb-1 font-medium">Competent Authority only: possible overlap with open AICTE cases <Advisory>auto-links if this escalates</Advisory></div>
                      <ul className="space-y-1">
                        {c.overlapFlags.map((f) => (
                          <li key={f.caseId}>
                            <button onClick={() => setCaseId(f.caseId)} className="num font-semibold underline">
                              {f.caseId}
                            </button>{" "}
                            {Math.round(f.confidence * 100)}% · {f.reasons.slice(0, 2).join(" · ")}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {c.rounds.map((r) => (
                    <div key={r.round} className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3 text-[14px] text-slate-300">
                      <div className="text-[13.5px] font-medium text-slate-400">
                        Round {r.round}
                        {r.proof ? ` · college's proof, ${fmtDateTime(r.proof.at)}` : ""}
                        {r.verdict ? ` · student: ${r.verdict === "done" ? "Done" : "Not done"}` : " · awaiting the student's verdict"}
                      </div>
                      {r.directions && <div className="text-orange-200">AICTE directions: {r.directions}</div>}
                      {r.proof?.note}
                      {r.reason && <div className="mt-1 text-red-200">Student&apos;s reason: {r.reason}</div>}
                      {r.evidence && (
                        <div className="mt-1 text-[13.5px] text-slate-400">
                          <Advisory>evidence check{r.evidence.source === "mock" ? " (offline mock)" : ""}, not proof</Advisory> <span className="num text-white">{r.evidence.score}/100</span> {r.evidence.verdict}
                        </div>
                      )}
                    </div>
                  ))}
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
                    <Link href={`/institutions/${c.institutionId}`} className="text-[14px] text-saffron hover:underline">
                      Institution profile
                    </Link>
                  </div>
                  {c.status === "Escalated to AICTE" && data.canAct && <ReturnToCollege id={c.id} onDone={reload} />}
                  {data.canReveal && <Reveal id={c.id} />}
                  <ul className="space-y-1 text-[13.5px] text-slate-400">
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
