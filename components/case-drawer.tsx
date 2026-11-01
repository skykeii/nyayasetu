"use client";
import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRightLeft,
  CheckCircle2,
  CircleDot,
  FileText,
  Gavel,
  Inbox,
  Link2,
  Mail,
  MessageSquareText,
  Paperclip,
  Send,
  ShieldAlert,
  TriangleAlert,
  UserCheck,
  X,
  Handshake,
  CornerDownLeft,
} from "lucide-react";
import { useApi, useRole } from "./role-provider";
import { Advisory, Badge, Button, Input, Label, Select, Skeleton, Textarea, cn } from "./ui";
import { BureauChip, Confidence, ErrorNote, OverlapPulse, SeverityDot, SlaBadge, StatusBadge } from "./bits";
import type { CaseView } from "@/lib/server";
import type { CaseAction, Institution, LinkGroup } from "@/lib/types";
import type { OverlapCluster } from "@/lib/overlap";
import type { Resolution } from "@/lib/resolve";
import type { RoutingSuggestion } from "@/lib/student";
import { fmtDate, fmtDateTime } from "@/lib/util";

interface Detail {
  case: CaseView;
  institution: Institution;
  related: (OverlapCluster & { cases: { id: string; bureau: string; status: string; subject: string; reference: string; reportedName: string; dateReceived: string }[] })[];
  group?: LinkGroup;
  resolution: Resolution;
  permissions: { remark: boolean; act: boolean; accept: boolean; escalate: boolean; returnToBureau: boolean; transfer: boolean; dispose: boolean; link: boolean };
  history: { id: string; bureau: string; status: string; category: string; dateReceived: string; subject: string }[];
  routing?: RoutingSuggestion;
}

const ICON: Record<CaseAction["type"], React.ComponentType<{ className?: string }>> = {
  Received: Inbox,
  Assigned: UserCheck,
  Remark: MessageSquareText,
  "Notice Issued": Send,
  "Reply Received": Mail,
  "Hearing Scheduled": Gavel,
  "Status Change": CornerDownLeft,
  Transferred: ArrowRightLeft,
  Escalated: TriangleAlert,
  Linked: Link2,
  Coordinated: Handshake,
  Disposed: CheckCircle2,
};
const ICON_TONE: Partial<Record<CaseAction["type"], string>> = {
  Transferred: "text-indigo-300 border-indigo-400/40 bg-indigo-500/10",
  Escalated: "text-orange-300 border-orange-400/40 bg-orange-500/10",
  Linked: "text-violet-300 border-violet-400/40 bg-violet-500/10",
  Coordinated: "text-violet-300 border-violet-400/40 bg-violet-500/10",
  Disposed: "text-emerald-300 border-emerald-400/40 bg-emerald-500/10",
  Received: "text-sky-300 border-sky-400/40 bg-sky-500/10",
};

export function Fact({ k, v, className }: { k: string; v: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-[12px] text-slate-500">{k}</div>
      <div className="mt-0.5 text-[13.5px] text-slate-100">{v}</div>
    </div>
  );
}

export function CaseDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <AnimatePresence>
      {id && (
        <>
          <motion.div key="bg" className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            key="panel"
            role="dialog"
            aria-label={`Case ${id}`}
            className="glass-strong scroll-thin fixed bottom-0 right-0 top-0 z-50 w-full max-w-[760px] overflow-y-auto border-y-0 border-r-0"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 34, stiffness: 320 }}
          >
            <DrawerBody id={id} onClose={onClose} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function RoutingCard({ caseId, bureau, routing, onDone }: { caseId: string; bureau: string; routing: RoutingSuggestion; onDone: () => void }) {
  const { api, toast, bump } = useRole();
  const [busy, setBusy] = React.useState(false);
  const officer = routing.officers.find((o) => o.id === routing.officerId);
  const elsewhere = routing.bureau !== bureau;
  const confirm = async () => {
    setBusy(true);
    const form = new FormData();
    form.set("kind", elsewhere ? "Transfer" : "Assign");
    form.set("remarks", `Routing suggestion reviewed and confirmed by the official: ${elsewhere ? routing.bureau : officer?.name}.`);
    if (elsewhere) form.set("toBureau", routing.bureau);
    else form.set("officerId", routing.officerId);
    try {
      await api(`/api/cases/${caseId}/actions`, { method: "POST", body: form });
      toast({ title: elsewhere ? `Transferred to ${routing.bureau}` : `Assigned to ${officer?.name}`, tone: "emerald" });
      onDone();
      bump();
    } catch (e) {
      toast({ title: "Not confirmed", body: (e as Error).message, tone: "red" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={cn("rounded-xl border p-4", routing.caution ? "border-violet-300/35 bg-violet-500/[0.07]" : "border-sky-300/25 bg-sky-400/[0.05]")}>
      <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[14px] font-semibold text-white">
        Routing suggestion: {elsewhere ? `transfer to ${routing.bureau}` : officer?.name} <Advisory />
      </div>
      <ul className="mb-3 list-disc space-y-0.5 pl-5 text-[13px] text-slate-300">
        {routing.why.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
      <Button size="sm" variant="secondary" onClick={confirm} loading={busy}>
        <UserCheck className="h-4 w-4" /> Confirm suggestion
      </Button>
    </section>
  );
}

function DrawerBody({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, error, loading, reload } = useApi<Detail>(`/api/cases/${id}`);
  const { headers } = useRole();
  const q = new URLSearchParams({ _role: headers["x-role"], _region: headers["x-region"], ...(headers["x-officer"] ? { _officer: headers["x-officer"] } : {}) }).toString();
  if (error)
    return (
      <div className="p-6">
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <ErrorNote msg={error} />
      </div>
    );
  if (loading || !data)
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-24" />
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  const c = data.case;
  const actions = [...(c.actions ?? [])].reverse();
  return (
    <div>
      <div className="sticky top-0 z-10 border-b border-white/10 bg-[#0E1427]/95 px-6 py-4 backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="num text-xl font-bold tracking-tight text-white">{c.id}</h2>
              <StatusBadge status={c.status} />
              <SlaBadge sla={c.sla} />
              {c.overlapClusters.some((o) => o.status === "Open") && (
                <Badge tone="violet">
                  <OverlapPulse className="h-1.5 w-1.5" /> Overlap
                </Badge>
              )}
            </div>
            <div className="mt-1 truncate text-[13.5px] text-slate-300">{c.subject}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-slate-500">
              <BureauChip code={c.bureau} /> <span className="num">{c.reference}</span>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close case">
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="space-y-5 px-6 py-5">
        {data.related.length > 0 && <OverlapCallout data={data} onDone={reload} />}

        <section className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 sm:grid-cols-3">
          <Fact k="Date received" v={fmtDate(c.dateReceived)} />
          <Fact k="Category" v={c.category} />
          <Fact k="Severity" v={<SeverityDot s={c.severity} />} />
          <Fact k="Assigned bureau / cell" v={c.bureauName} />
          <Fact k="Assigned officer" v={<span>{c.officerName}<span className="block text-[12px] text-slate-500">{c.officerDesignation}</span></span>} />
          <Fact k="Expected disposal" v={<span className={cn(c.sla.state === "breached" && "text-red-300")}>{fmtDate(c.expectedDisposalDate)}</span>} />
          <Fact k="Date of last action" v={fmtDateTime(c.lastActionDate)} />
          <Fact k="Last action" v={<span className="line-clamp-2">{c.lastAction}</span>} className="col-span-2" />
          <Fact k="Next action required" v={<span className="font-medium text-saffron-300">{c.nextAction}</span>} className="col-span-2 sm:col-span-3" />
        </section>

        <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[12px] text-slate-500">Institution (master record)</div>
              <Link href={`/institutions/${data.institution.id}`} className="text-[15px] font-semibold text-white hover:text-saffron">
                {data.institution.name}
              </Link>
              <div className="num text-[12.5px] text-slate-400">
                {data.institution.id} · {data.institution.city}, {data.institution.state} · {data.institution.region} region
              </div>
            </div>
            <Confidence value={c.matchConfidence} />
          </div>
          <div className="mt-3 rounded-lg bg-white/[0.03] px-3 py-2 text-[12.5px] text-slate-400">
            Complainant wrote <span className="text-slate-200">“{c.reportedName}”</span>
            {c.reportedPid ? (
              <>
                {" "}
                with Permanent ID <span className="num text-slate-200">{c.reportedPid}</span>
                {c.reportedPid !== data.institution.id && <Badge tone="amber" className="ml-1">differs from master</Badge>}
              </>
            ) : (
              " without a Permanent ID"
            )}
            . <Advisory>{c.matchReason}</Advisory>
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-[14px] font-semibold text-white">Complaint</h3>
          <p className="max-w-[72ch] text-[14px] leading-relaxed text-slate-200">{c.description}</p>
          {c.originalText && (
            <div className="mt-3 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
                Original ({c.language}) <Advisory>English above is machine-translated ({c.translationSource})</Advisory>
              </div>
              <p className="max-w-[72ch] text-[13.5px] leading-relaxed text-slate-300">{c.originalText}</p>
            </div>
          )}
          {c.studentComplaintId && (
            <div className="mt-2 text-[12.5px] text-slate-400">
              Escalated from student complaint{" "}
              <Link href={`/grievances?open=${c.studentComplaintId}`} className="num text-saffron hover:underline">
                {c.studentComplaintId}
              </Link>
              . Identity is masked; only the Competent Authority can reveal it.
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[12.5px] text-slate-400">
            <span>
              Complainant: <span className="text-slate-200">{c.complainantName}</span> ({c.complainantType})
            </span>
            <span>Channel: {c.channel}</span>
            <span>Language: {c.language}{c.language !== "English" ? " (shown in English translation)" : ""}</span>
          </div>
        </section>

        {data.routing && <RoutingCard caseId={c.id} bureau={c.bureau} routing={data.routing} onDone={reload} />}

        {(data.permissions.remark || data.permissions.act) && <ActionPanel data={data} onDone={reload} />}

        <section>
          <h3 className="mb-3 text-[14px] font-semibold text-white">Workflow and action history</h3>
          <ol className="relative ml-3 border-l border-white/10">
            {actions.map((a) => {
              const I = ICON[a.type] ?? CircleDot;
              return (
                <li key={a.id} className="mb-4 ml-6">
                  <span className={cn("absolute -left-[13px] flex h-[26px] w-[26px] items-center justify-center rounded-full border bg-[#0E1427]", ICON_TONE[a.type] ?? "border-white/15 text-slate-300")}>
                    <I className="h-3.5 w-3.5" />
                  </span>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[13.5px] font-semibold text-white">{a.type}</span>
                    {a.from && a.to && (
                      <span className="inline-flex items-center gap-1 text-[12px] text-slate-400">
                        <BureauChip code={a.from} /> <ArrowRightLeft className="h-3 w-3" /> {a.to.length <= 5 ? <BureauChip code={a.to} /> : a.to}
                      </span>
                    )}
                    <span className="text-[12px] text-slate-500">{fmtDateTime(a.at)}</span>
                  </div>
                  <div className="text-[12.5px] text-slate-400">
                    {a.by} · <BureauChip code={a.bureau} className="h-4 text-[10px]" />
                  </div>
                  <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-slate-300">{a.remarks}</p>
                  {a.docs && a.docs.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {a.docs.map((d) =>
                        d.file ? (
                          <a key={d.name} href={`/api/files/${d.file}?${q}`} className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[12px] text-slate-200 hover:border-saffron/50">
                            <Paperclip className="h-3 w-3" /> {d.name} <span className="text-slate-500">{Math.round(d.size / 1024)} KB</span>
                          </a>
                        ) : (
                          <span key={d.name} className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[12px] text-slate-400" title="Seeded record; file held in e-Office">
                            <FileText className="h-3 w-3" /> {d.name} <span className="text-slate-500">{Math.round(d.size / 1024)} KB</span>
                          </span>
                        )
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        {data.history.length > 0 && (
          <section>
            <h3 className="mb-2 text-[14px] font-semibold text-white">Other complaints on this institution</h3>
            <div className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.07]">
              {data.history.map((h) => (
                <div key={h.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                  <span className="num w-28 shrink-0 text-slate-300">{h.id}</span>
                  <BureauChip code={h.bureau} />
                  <span className="min-w-0 flex-1 truncate text-slate-400">{h.subject}</span>
                  <span className="hidden text-slate-500 sm:inline">{fmtDate(h.dateReceived)}</span>
                  <StatusBadge status={h.status as never} />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function OverlapCallout({ data, onDone }: { data: Detail; onDone: () => void }) {
  const { api, toast, bump } = useRole();
  const c = data.case;
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  return (
    <section className="space-y-3">
      {data.related.map((cl) => (
        <div key={cl.id} className={cn("rounded-xl border p-4", cl.status === "Open" ? "border-violet-400/40 bg-violet-500/[0.07]" : "border-white/10 bg-white/[0.02]")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {cl.status === "Open" ? <OverlapPulse /> : <Handshake className="h-4 w-4 text-emerald-300" />}
              <span className="text-[14px] font-semibold text-white">{cl.kind === "cross-bureau" ? "Potential Overlapping Cases – Coordination Required" : "Possible duplicate registration"}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={cl.status === "Open" ? "violet" : cl.status === "Coordinated" ? "emerald" : "indigo"}>{cl.status}</Badge>
              <Confidence value={cl.confidence} />
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {cl.cases
              .filter((x) => x.id !== c.id)
              .map((x) => (
                <div key={x.id} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <BureauChip code={x.bureau} />
                    <span className="num text-[13px] font-semibold text-white">{x.id}</span>
                    <StatusBadge status={x.status as never} />
                  </div>
                  <div className="mt-1 truncate text-[12.5px] text-slate-300">{x.subject}</div>
                  <div className="truncate text-[12px] text-slate-500">
                    {x.reference} · “{x.reportedName}”
                  </div>
                </div>
              ))}
          </div>
          <details className="mt-3 group">
            <summary className="cursor-pointer text-[12.5px] text-violet-200 hover:text-white">Why the engine flagged this</summary>
            <ul className="mt-2 space-y-1 text-[12.5px] text-slate-300">
              {[...new Set(cl.pairs.filter((p) => p.a === c.id || p.b === c.id).flatMap((p) => p.reasons))].map((r) => (
                <li key={r} className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-violet-300" />
                  {r}
                </li>
              ))}
            </ul>
          </details>
          {data.permissions.link && cl.status !== "Coordinated" && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Coordination note (who leads, what the other unit does)" className="h-9" />
              <div className="flex gap-2">
                {cl.status === "Open" && (
                  <Button
                    size="sm"
                    variant="violet"
                    loading={busy === `l${cl.id}`}
                    className="h-9"
                    onClick={async () => {
                      setBusy(`l${cl.id}`);
                      try {
                        await api("/api/overlaps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "link", caseIds: cl.caseIds, note, clusterId: cl.id }) });
                        toast({ title: "Cases linked", body: cl.caseIds.join(", "), tone: "violet" });
                        setNote("");
                        onDone();
                        bump();
                      } catch (e) {
                        toast({ title: "Not linked", body: (e as Error).message, tone: "red" });
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    <Link2 className="h-4 w-4" /> Link cases
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="emerald"
                  className="h-9"
                  loading={busy === `c${cl.id}`}
                  onClick={async () => {
                    setBusy(`c${cl.id}`);
                    try {
                      await api("/api/overlaps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "coordinate", caseIds: cl.caseIds, note, clusterId: cl.id }) });
                      toast({ title: "Marked coordinated", body: cl.caseIds.join(", "), tone: "emerald" });
                      setNote("");
                      onDone();
                      bump();
                    } catch (e) {
                      toast({ title: "Not updated", body: (e as Error).message, tone: "red" });
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  <Handshake className="h-4 w-4" /> Mark coordinated
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

type Kind = "Remark" | "Notice Issued" | "Reply Received" | "Hearing Scheduled" | "Accept" | "Transfer" | "Escalate" | "Return" | "Dispose" | "Link";

function ActionPanel({ data, onDone }: { data: Detail; onDone: () => void }) {
  const { api, toast, bump, meta } = useRole();
  const p = data.permissions;
  const c = data.case;
  const kinds: { k: Kind; label: string; show: boolean }[] = [
    { k: "Accept", label: "Accept transfer", show: p.accept },
    { k: "Return", label: "Return to bureau with directions", show: p.returnToBureau },
    { k: "Remark", label: c.readOnly ? "Add coordination remark" : "Add remark / note", show: p.remark },
    { k: "Notice Issued", label: "Record notice issued", show: p.act && c.status !== "Transferred" },
    { k: "Reply Received", label: "Record reply received", show: p.act && c.status !== "Transferred" },
    { k: "Hearing Scheduled", label: "Schedule hearing", show: p.act && c.status !== "Transferred" },
    { k: "Transfer", label: "Transfer to another bureau/cell", show: p.transfer },
    { k: "Escalate", label: "Escalate to Competent Authority", show: p.escalate },
    { k: "Dispose", label: "Dispose case", show: p.dispose && c.status !== "Transferred" },
    { k: "Link", label: "Link to another case (manual mapping)", show: p.link },
  ];
  const avail = kinds.filter((x) => x.show);
  const [kind, setKind] = React.useState<Kind>(avail[0]?.k ?? "Remark");
  const [remarks, setRemarks] = React.useState("");
  const [to, setTo] = React.useState("");
  const [other, setOther] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => setKind(avail[0]?.k ?? "Remark"), [c.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (kind === "Link") {
        await api("/api/overlaps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "link", caseIds: [c.id, other.trim().toUpperCase()], note: remarks }) });
        toast({ title: "Cases linked", body: `${c.id} ↔ ${other.toUpperCase()}`, tone: "violet" });
      } else {
        const fd = new FormData();
        fd.set("kind", kind);
        fd.set("remarks", remarks);
        if (kind === "Transfer") fd.set("toBureau", to);
        for (const f of Array.from(fileRef.current?.files ?? [])) fd.append("files", f);
        await api(`/api/cases/${c.id}/actions`, { method: "POST", body: fd });
        toast({ title: `${avail.find((x) => x.k === kind)?.label ?? kind} recorded`, body: c.id, tone: kind === "Dispose" ? "emerald" : "default" });
      }
      setRemarks("");
      setOther("");
      if (fileRef.current) fileRef.current.value = "";
      onDone();
      bump();
    } catch (err) {
      toast({ title: "Action not recorded", body: (err as Error).message, tone: "red" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-saffron/25 bg-saffron/[0.04] p-4">
      <div className="mb-3 flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-saffron" />
        <h3 className="text-[14px] font-semibold text-white">Record a decision</h3>
        <span className="text-[12px] text-slate-400">Logged to the case timeline and audit trail under your name.</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Action</Label>
          <Select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            {avail.map((x) => (
              <option key={x.k} value={x.k}>
                {x.label}
              </option>
            ))}
          </Select>
        </div>
        {kind === "Transfer" && (
          <div>
            <Label>Transfer to</Label>
            <Select value={to} onChange={(e) => setTo(e.target.value)} required>
              <option value="">Choose bureau / cell</option>
              {(meta?.bureaus ?? [])
                .filter((b) => b.code !== c.bureau)
                .map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.code} — {b.name}
                  </option>
                ))}
            </Select>
          </div>
        )}
        {kind === "Link" && (
          <div>
            <Label>Related case ID</Label>
            <Input value={other} onChange={(e) => setOther(e.target.value)} placeholder="NS-2026-00123" required />
          </div>
        )}
        {kind !== "Link" && (
          <div className={kind === "Transfer" ? "sm:col-span-2" : ""}>
            <Label>Supporting documents</Label>
            <input ref={fileRef} type="file" multiple className="block w-full text-[13px] text-slate-400 file:mr-3 file:h-10 file:rounded-lg file:border-0 file:bg-white/[0.08] file:px-3 file:text-slate-100 hover:file:bg-white/[0.12]" />
          </div>
        )}
        <div className="sm:col-span-2">
          <Label>Remarks (mandatory)</Label>
          <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder={kind === "Dispose" ? "Outcome and basis for disposal" : kind === "Link" ? "Why these cases are related and who leads" : "What was done and why"} required minLength={5} />
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <Button type="submit" variant={kind === "Dispose" ? "emerald" : "primary"} loading={busy}>
          {avail.find((x) => x.k === kind)?.label ?? "Save"}
        </Button>
      </div>
    </form>
  );
}
