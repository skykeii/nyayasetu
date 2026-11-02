"use client";
import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Clock, Paperclip, Upload } from "lucide-react";
import { useApi, useRole } from "@/components/role-provider";
import { Advisory, Badge, Button, Card, CardHeader, Label, Skeleton, Textarea, cn } from "@/components/ui";
import { CountUp, ErrorNote } from "@/components/bits";
import type { CollegeComplaint } from "@/lib/student";
import type { CollegeReminder, DocRef, StudentStatus } from "@/lib/types";
import { fmtDate, fmtDateTime } from "@/lib/util";

interface Desk {
  college: { id: string; name: string; nodalOfficer: string };
  items: CollegeComplaint[];
  sms: (CollegeReminder & { complaintId: string })[];
  stats: Record<string, number>;
}

const statusTone = (s: StudentStatus) => ({ "With College": "amber", "Resolved - Pending Verification": "sky", "Closed - Verified": "emerald", "Closed - Unverified": "slate", "Escalated to AICTE": "saffron", "Closed by AICTE": "emerald" } as const)[s];

function DocLink({ d }: { d: DocRef }) {
  return d.file ? (
    <a href={`/api/files/${d.file}`} className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[13px] text-slate-200 hover:border-saffron/50">
      <Paperclip className="h-3 w-3" /> {d.name}
    </a>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 text-[13px] text-slate-400">
      <Paperclip className="h-3 w-3" /> {d.name}
    </span>
  );
}

function Detail({ c, onDone }: { c: CollegeComplaint; onDone: () => void }) {
  const { api, toast, bump } = useRole();
  const [note, setNote] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [busy, setBusy] = React.useState(false);
  const submit = async () => {
    setBusy(true);
    const form = new FormData();
    form.set("note", note);
    files.forEach((f) => form.append("files", f));
    try {
      await api(`/api/college/${c.id}`, { method: "POST", body: form });
      toast({ title: "Proof submitted", body: "The student now verifies it. The college cannot close this itself.", tone: "emerald" });
      setNote("");
      setFiles([]);
      onDone();
      bump();
    } catch (e) {
      toast({ title: "Not submitted", body: (e as Error).message, tone: "red" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4 border-t border-white/[0.07] px-4 py-4">
      {c.directions && c.status === "With College" && (
        <div className="rounded-lg border border-orange-300/30 bg-orange-400/10 px-3 py-2 text-[14px] text-orange-100">
          <b>AICTE directions, round {c.round}:</b> {c.directions}
        </div>
      )}
      <p className="text-[15px] leading-relaxed text-slate-200">{c.text}</p>
      {c.maskLevel === "basic" && <div className="text-[12.5px] text-slate-500">Masking: basic (regex only; AI name detection did not run)</div>}
      {c.originalText && (
        <div className="rounded-lg border border-[#EADFCD] bg-[#FBF6EC] px-3 py-2">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-[13px] text-slate-500">
            Original ({c.language}) <Advisory>English above is machine-translated</Advisory>
          </div>
          <p dir="auto" className="text-[14.5px] text-slate-300">{c.originalText}</p>
        </div>
      )}
      {c.photo && (
        <div>
          <div className="mb-1 text-[13px] text-slate-500">Photo from the student</div>
          <DocLink d={c.photo} />
        </div>
      )}
      {c.proof && (
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3">
          <div className="text-[13.5px] font-medium text-slate-300">Proof submitted {fmtDateTime(c.proof.at)}</div>
          <p className="mt-1 text-[14px] text-slate-300">{c.proof.note}</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {c.proof.docs.map((d) => (
              <DocLink key={d.name} d={d} />
            ))}
          </div>
          {c.evidence && (
            <div className="mt-2 text-[13.5px] text-slate-400">
              <Advisory>evidence check{c.evidence.source === "mock" ? " (offline mock)" : ""}, not proof</Advisory> <span className="num font-semibold text-white">{c.evidence.score}/100</span> {c.evidence.verdict}. {c.evidence.explanation}
            </div>
          )}
          {c.verifyBy && c.status === "Resolved - Pending Verification" && <div className="mt-1.5 text-[13.5px] text-sky-200">Waiting for the student. No answer by {fmtDate(c.verifyBy)} means Closed - Unverified, which counts less than a verified closure.</div>}
        </div>
      )}
      {c.status === "Escalated to AICTE" && <div className="rounded-lg border border-orange-300/30 bg-orange-400/10 px-3 py-2 text-[14px] text-orange-100">{c.reopened ? "The student marked this Not done." : "Overdue at the college."} It is now with AICTE and read-only here. AICTE may return it with directions.</div>}
      {c.status === "With College" && (
        <div className="rounded-lg border border-white/[0.08] p-3">
          <Label>Work done (mandatory)</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was done, by whom and when" />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <input type="file" multiple accept="image/png,image/jpeg,application/pdf" aria-label="Proof of work" onChange={(e) => setFiles([...(e.target.files ?? [])])} className="text-[14px] text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-slate-100" />
            <Button variant="primary" onClick={submit} loading={busy} disabled={note.trim().length < 10 || !files.length}>
              <Upload className="h-4 w-4" /> Mark resolved, pending verification
            </Button>
          </div>
        </div>
      )}
      <div>
        <div className="mb-1 text-[13.5px] font-medium text-slate-400">History</div>
        <ul className="space-y-1 text-[13.5px] text-slate-400">
          {[...c.actions].reverse().map((a, i) => (
            <li key={i}>
              <span className="text-slate-200">{a.type}</span> · {fmtDateTime(a.at)} · {a.remarks}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function CollegePageWrap() {
  return (
    <React.Suspense fallback={<Skeleton className="h-96" />}>
      <CollegePage />
    </React.Suspense>
  );
}

function CollegePage() {
  const params = useSearchParams();
  const { data, error, loading, reload } = useApi<Desk>("/api/college", { interval: 5000 });
  const [open, setOpen] = React.useState<string | null>(params.get("open"));
  if (error) return <ErrorNote msg={error} />;
  const s = data?.stats;
  return (
    <div className="mx-auto max-w-[1280px] space-y-4">
      <div>
        <h1 className="text-[34px] leading-[1.1] tracking-tight text-white">{data?.college.name ?? "College desk"}</h1>
        <p className="text-[14.5px] text-slate-400">Student complaints by urgency. You see pseudonyms and complaint text only; names, phones and roll numbers are withheld.</p>
      </div>
      <Card className="grid grid-cols-2 overflow-hidden sm:grid-cols-3 xl:grid-cols-6">
        {[
          { l: "Open", v: s?.open, t: "text-amber-200" },
          { l: "Overdue", v: s?.overdue, t: "text-red-300" },
          { l: "Waiting for student", v: s?.pending, t: "text-sky-200" },
          { l: "Closed, verified", v: s?.verified, t: "text-emerald-300" },
          { l: "Closed, unverified", v: s?.unverified, t: "text-slate-300" },
          { l: "Escalated to AICTE", v: s?.escalated, t: "text-orange-300" },
        ].map((x) => (
          <div key={x.l} className="border-b border-r border-white/[0.06] px-4 py-3">
            <div className="text-[13.5px] text-slate-400">{x.l}</div>
            {x.v === undefined ? <Skeleton className="mt-1 h-7 w-12" /> : <CountUp value={x.v} className={cn("text-[28px] leading-tight", x.t)} />}
          </div>
        ))}
      </Card>
      <div className="grid gap-4 xl:grid-cols-[1.9fr_1fr]">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader title="Complaints, most urgent first" sub={<>Urgency = severity x ageing x closeness to disposal date x similar complaints. <Advisory /></>} />
          {loading && <Skeleton className="m-4 h-64" />}
          <div className="divide-y divide-white/[0.06]">
            {data?.items.map((c) => (
              <div key={c.id}>
                <button onClick={() => setOpen(open === c.id ? null : c.id)} aria-expanded={open === c.id} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03]">
                  <span className={cn("num flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border text-[15px] font-bold", c.urgency.label === "Critical" ? "border-red-400/40 bg-red-500/15 text-red-200" : c.urgency.label === "High" ? "border-orange-300/40 bg-orange-400/10 text-orange-200" : c.urgency.label === "Medium" ? "border-amber-300/30 bg-amber-400/10 text-amber-200" : "border-white/15 bg-white/5 text-slate-300")}>{c.urgency.score}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-white">{c.subject}</span>
                    <span className="block truncate text-[13.5px] text-slate-400">
                      <span className="num">{c.id}</span> · {c.round > 1 ? `Round ${c.round} · ` : ""}{c.pseudonym} · {c.category} · {c.urgency.reason}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                    {c.escalationLevel === 1 && c.status === "With College" && <Badge tone="red">Escalated to Principal</Badge>}
                  </span>
                </button>
                {open === c.id && <Detail c={c} onDone={reload} />}
              </div>
            ))}
            {data && data.items.length === 0 && <div className="px-5 py-10 text-center text-sm text-slate-400">No student complaints for this college. That is not evidence of good handling; see the risk index confidence level.</div>}
          </div>
        </Card>
        <Card className="min-w-0 self-start">
          <CardHeader title="Reminder log" sub="In-app alerts and simulated SMS. Reminders get more frequent near the disposal date; overdue complaints go to the Principal, then AICTE." />
          <ul className="divide-y divide-white/[0.05] pb-2">
            {data?.sms.map((m, i) => (
              <li key={i} className="flex gap-2.5 px-5 py-2.5 text-[13.5px]">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                <span className="min-w-0">
                  <span className="block text-slate-200">{m.message}</span>
                  <span className="num block text-slate-500">
                    {m.complaintId} · SMS to {m.to} · {fmtDateTime(m.at)}
                  </span>
                </span>
              </li>
            ))}
            {data && data.sms.length === 0 && <li className="px-5 py-6 text-center text-[14px] text-slate-500">No reminders yet.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
