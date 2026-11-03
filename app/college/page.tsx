"use client";
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Clock, MessageSquarePlus, Upload } from "lucide-react";
import { useApi, useRole } from "@/components/role-provider";
import { Advisory, Badge, Button, Card, CardHeader, Label, Skeleton, Textarea, cn } from "@/components/ui";
import { CountUp, ErrorNote, Updated } from "@/components/bits";
import { DocLink, FilePicker, Progress, checkFiles, postForm } from "@/components/upload";
import type { CollegeComplaint } from "@/lib/student";
import type { CollegeReminder, StudentStatus } from "@/lib/types";
import { fmtDate, fmtDateTime } from "@/lib/util";

interface Desk {
  college: { id: string; name: string; nodalOfficer: string };
  items: CollegeComplaint[];
  sms: (CollegeReminder & { complaintId: string })[];
  stats: Record<string, number>;
}

const statusTone = (s: StudentStatus) => ({ "With College": "amber", "Resolved - Pending Verification": "sky", "Closed - Verified": "emerald", "Closed - Unverified": "slate", "Escalated to AICTE": "saffron", "Closed by AICTE": "emerald" } as const)[s];

// KPI tiles double as filters; clicking one opens its most urgent complaint
const TILES = [
  { key: "open", l: "Open", t: "text-amber-200", match: (c: CollegeComplaint) => c.status === "With College" },
  { key: "overdue", l: "Overdue", t: "text-red-300", match: (c: CollegeComplaint) => c.status === "With College" && c.urgency.daysLeft < 0 },
  { key: "pending", l: "Waiting for student", t: "text-sky-200", match: (c: CollegeComplaint) => c.status === "Resolved - Pending Verification" },
  { key: "verified", l: "Closed, verified", t: "text-emerald-300", match: (c: CollegeComplaint) => c.status === "Closed - Verified" },
  { key: "unverified", l: "Closed, unverified", t: "text-slate-300", match: (c: CollegeComplaint) => c.status === "Closed - Unverified" },
  { key: "escalated", l: "Escalated to AICTE", t: "text-orange-300", match: (c: CollegeComplaint) => c.status === "Escalated to AICTE" },
] as const;

/** Uploads a progress note or proof of work with a progress bar and clear errors. */
function UploadForm({ c, kind, onDone }: { c: CollegeComplaint; kind: "proof" | "note"; onDone: () => void }) {
  const { toast, bump } = useRole();
  const [note, setNote] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [pct, setPct] = React.useState<number | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const proof = kind === "proof";
  const fileErr = checkFiles(files);
  const ready = (proof ? note.trim().length >= 10 && files.length > 0 : note.trim().length >= 5) && !fileErr;
  const submit = async () => {
    setErr(null);
    setPct(0);
    const form = new FormData();
    form.set("kind", kind);
    form.set("note", note);
    files.forEach((f) => form.append("files", f));
    try {
      await postForm(`/api/college/${c.id}`, form, setPct);
      toast(proof ? { title: "Proof sent to the student", body: "The student now gives a verdict. The college cannot close this itself.", tone: "emerald" } : { title: "Progress note added", body: files.length ? `${files.length} file(s) attached. The student and AICTE can see it.` : "The student and AICTE can see it.", tone: "emerald" });
      setNote("");
      setFiles([]);
      onDone();
      bump();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPct(null);
    }
  };
  return (
    <div className="rounded-lg border border-white/[0.08] p-3">
      <Label>{proof ? "Work done (mandatory) and proof of work" : "Progress note (files optional)"}</Label>
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={proof ? "What was done, by whom and when" : "What has happened so far, what is planned and by when"} className="min-h-[70px]" />
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <FilePicker files={files} onChange={setFiles} label={proof ? "Proof of work files" : "Progress note files"} disabled={pct !== null} />
        <Button variant={proof ? "primary" : "secondary"} onClick={submit} loading={pct !== null} disabled={!ready}>
          {proof ? <Upload className="h-4 w-4" /> : <MessageSquarePlus className="h-4 w-4" />} {proof ? "Mark resolved, send to student" : "Add progress note"}
        </Button>
      </div>
      <div className="mt-1.5 text-[12.5px] text-slate-500">PNG, JPG or PDF, 4 MB at most in total.{proof ? " A photo or PDF is required." : ""}</div>
      <Progress pct={pct} />
      {(fileErr || err) && (
        <div role="alert" className="mt-2 rounded-md border border-red-400/40 bg-red-500/10 px-3 py-1.5 text-[13.5px] text-red-200">
          {fileErr ?? err}
        </div>
      )}
    </div>
  );
}

function Detail({ c, onDone }: { c: CollegeComplaint; onDone: () => void }) {
  const open = !c.status.startsWith("Closed");
  const roundDocs = new Map(c.roundDocs.map((r) => [r.round, r.docs]));
  const u = c.urgency;
  return (
    <div className="space-y-4 border-t border-white/[0.07] px-4 py-4">
      {c.directions && c.status === "With College" && (
        <div className="rounded-lg border border-orange-300/30 bg-orange-400/10 px-3 py-2 text-[14px] text-orange-100">
          <b>AICTE directions, round {c.round}:</b> {c.directions} New proof is needed.
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
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-white/[0.08] px-3 py-2 text-[14px]">
          <div className="text-[13px] text-slate-500">
            Urgency <Advisory />
          </div>
          <div className="text-slate-200">
            <span className="num font-semibold text-white">{u.score}</span> {u.label}: {u.reason}
          </div>
        </div>
        <div className="rounded-lg border border-white/[0.08] px-3 py-2 text-[14px]">
          <div className="text-[13px] text-slate-500">Disposal date (SLA)</div>
          <div className={cn("text-slate-200", open && u.daysLeft < 0 && "text-red-300")}>
            {fmtDate(c.dueAt)}
            {open ? (u.daysLeft < 0 ? ` · overdue by ${-u.daysLeft} day${u.daysLeft === -1 ? "" : "s"}` : ` · ${u.daysLeft} day${u.daysLeft === 1 ? "" : "s"} left`) : c.closedAt ? ` · closed ${fmtDate(c.closedAt)}` : ""}
          </div>
        </div>
      </div>
      {c.photo && (
        <div>
          <div className="mb-1 text-[13px] text-slate-500">Photo from the student</div>
          <DocLink d={c.photo} />
        </div>
      )}
      {c.proof && c.status !== "With College" && (
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3">
          <div className="text-[13.5px] font-medium text-slate-300">Proof submitted {fmtDateTime(c.proof.at)} (read-only)</div>
          <p className="mt-1 text-[14px] text-slate-300">{c.proof.note}</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {c.proof.docs.map((d) => (
              <DocLink key={d.file ?? d.name} d={d} />
            ))}
          </div>
          {c.evidence && (
            <div className="mt-2 text-[13.5px] text-slate-400">
              <Advisory>evidence check{c.evidence.source === "mock" ? " (offline mock)" : ""}, not proof</Advisory> <span className="num font-semibold text-white">{c.evidence.score}/100</span> {c.evidence.verdict}. {c.evidence.explanation}
            </div>
          )}
          {c.verifyBy && c.status === "Resolved - Pending Verification" && <div className="mt-1.5 text-[13.5px] text-sky-200">Awaiting the student&apos;s verdict. No answer by {fmtDate(c.verifyBy)} means Closed - Unverified, which counts less than a verified closure.</div>}
        </div>
      )}
      {c.status === "Escalated to AICTE" && <div className="rounded-lg border border-orange-300/30 bg-orange-400/10 px-3 py-2 text-[14px] text-orange-100">{c.reopened ? "The student marked this Not done." : "Overdue at the college."} It is now with AICTE, which may return it with directions. You can still add progress notes.</div>}
      {c.status === "With College" && <UploadForm c={c} kind="proof" onDone={onDone} />}
      {open && <UploadForm c={c} kind="note" onDone={onDone} />}
      <div>
        <div className="mb-1 text-[13.5px] font-medium text-slate-400">Timeline</div>
        <ol className="relative ml-1 border-l border-white/10">
          {[...c.actions].reverse().map((a, i) => {
            const round = /^Proof submitted \(round (\d+)\)/.exec(a.type);
            const docs = a.docs ?? (round ? roundDocs.get(Number(round[1])) : undefined) ?? [];
            return (
              <li key={i} className="mb-2.5 ml-3 text-[13.5px]">
                <span className="absolute -left-[4.5px] mt-1.5 h-2 w-2 rounded-full bg-slate-500" />
                <div>
                  <span className="font-medium text-slate-200">{a.type}</span> <span className="text-slate-500">· {fmtDateTime(a.at)} · {a.by}</span>
                </div>
                <div className="text-slate-400">{a.remarks}</div>
                {docs.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {docs.map((d) => (
                      <DocLink key={d.file ?? d.name} d={d} />
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
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
  const router = useRouter();
  const pathname = usePathname();
  const { data, error, loading, reload, updatedAt } = useApi<Desk>("/api/college", { interval: 5000 });
  // the URL holds the open complaint and the tile filter, so bell, reminder and shared links all land here
  const open = params.get("complaint") ?? params.get("open");
  const status = TILES.find((t) => t.key === params.get("status"));
  const go = (next: { complaint?: string | null; status?: string | null }) => {
    const q = new URLSearchParams();
    const st = next.status === undefined ? status?.key : next.status;
    const id = next.complaint === undefined ? open : next.complaint;
    if (st) q.set("status", st);
    if (id) q.set("complaint", id);
    router.replace(q.size ? `${pathname}?${q}` : pathname, { scroll: false });
  };
  React.useEffect(() => {
    if (open && data) document.getElementById(`complaint-${open}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    // only when the target changes or first arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, !!data]);
  if (error) return <ErrorNote msg={error} />;
  const s = data?.stats;
  const items = data ? data.items.filter((c) => !status || status.match(c) || c.id === open) : [];
  const missing = open && data && !data.items.some((c) => c.id === open);
  return (
    <div className="mx-auto max-w-[1280px] space-y-4">
      <div>
        <h1 className="text-[34px] leading-[1.1] tracking-tight text-white">{data?.college.name ?? "College desk"}</h1>
        <p className="flex flex-wrap items-center gap-x-3 text-[14.5px] text-slate-400">
          Student complaints by urgency. You see pseudonyms and complaint text only; names, phones and roll numbers are withheld. <Updated at={updatedAt} />
        </p>
      </div>
      <Card className="grid grid-cols-2 overflow-hidden sm:grid-cols-3 xl:grid-cols-6">
        {TILES.map((x) => {
          const v = s?.[x.key];
          const active = status?.key === x.key;
          return (
            <button
              key={x.key}
              aria-pressed={active}
              onClick={() => {
                if (active) return go({ status: null });
                const first = data?.items.find(x.match);
                go({ status: x.key, complaint: first?.id ?? null });
              }}
              className={cn("border-b border-r border-white/[0.06] px-4 py-3 text-left transition-colors hover:bg-white/[0.03]", active && "bg-white/[0.05] ring-1 ring-inset ring-saffron/50")}
            >
              <div className="text-[13.5px] text-slate-400">{x.l}</div>
              {v === undefined ? <Skeleton className="mt-1 h-7 w-12" /> : <CountUp value={v} className={cn("text-[28px] leading-tight", x.t)} />}
            </button>
          );
        })}
      </Card>
      {missing && <div className="rounded-lg border border-white/10 px-4 py-2 text-[14px] text-slate-400">Complaint {open} is not on this college&apos;s desk.</div>}
      <div className="grid gap-4 xl:grid-cols-[1.9fr_1fr]">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader
            title={status ? `${status.l} (${items.filter(status.match).length})` : "Complaints, most urgent first"}
            sub={<>Urgency = severity x ageing x closeness to disposal date x similar complaints. <Advisory /></>}
            right={status ? <Button size="sm" variant="ghost" onClick={() => go({ status: null })}>Show all</Button> : undefined}
          />
          {loading && <Skeleton className="m-4 h-64" />}
          <div className="divide-y divide-white/[0.06]">
            {items.map((c) => (
              <div key={c.id} id={`complaint-${c.id}`} className="scroll-mt-20">
                <button onClick={() => go({ complaint: open === c.id ? null : c.id })} aria-expanded={open === c.id} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03]">
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
            {data && items.length === 0 && <div className="px-5 py-10 text-center text-sm text-slate-400">{status ? "No complaints in this group." : "No student complaints for this college. That is not evidence of good handling; see the risk index confidence level."}</div>}
          </div>
        </Card>
        <Card className="min-w-0 self-start">
          <CardHeader title="Reminder log" sub="In-app alerts and simulated SMS. Reminders get more frequent near the disposal date; overdue complaints go to the Principal, then AICTE. Select one to open the complaint." />
          <ul className="divide-y divide-white/[0.05] pb-2">
            {data?.sms.map((m, i) => (
              <li key={i}>
                <button onClick={() => go({ complaint: m.complaintId, status: null })} className={cn("flex w-full gap-2.5 px-5 py-2.5 text-left text-[13.5px] hover:bg-white/[0.03]", open === m.complaintId && "bg-white/[0.04]")}>
                  <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                  <span className="min-w-0">
                    <span className="block text-slate-200">{m.message}</span>
                    <span className="num block text-slate-500">
                      {m.complaintId} · SMS to {m.to} · {fmtDateTime(m.at)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {data && data.sms.length === 0 && <li className="px-5 py-6 text-center text-[14px] text-slate-500">No reminders yet.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
