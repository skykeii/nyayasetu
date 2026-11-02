"use client";
import * as React from "react";
import Link from "next/link";
import { Bell, CheckCircle2, Clock, GraduationCap, LogOut, Paperclip, Send, ShieldCheck, TriangleAlert, XCircle } from "lucide-react";
import { Advisory, Badge, Button, Card, CardHeader, Label, Skeleton, Tabs, Textarea, cn } from "@/components/ui";
import { ErrorNote } from "@/components/bits";
import { apiFetch, signOutNow } from "@/components/role-provider";
import { VoiceIntake, type VoiceValue } from "@/components/voice-intake";
import { CONSENT_VERSION } from "@/lib/intake";
import type { EvidenceReport, DocRef, ResolutionRound, Severity, StudentStatus } from "@/lib/types";
import { fmtDate, fmtDateTime } from "@/lib/util";
import { PulseSurvey } from "./pulse";

interface MyComplaint {
  id: string;
  subject: string;
  category: string;
  status: StudentStatus;
  language: string;
  originalText: string;
  translatedText: string;
  routedBureau: string;
  categoryReason: string;
  createdAt: string;
  dueAt: string;
  round: number;
  rounds: ResolutionRound[];
  directions?: string;
  photo?: DocRef;
  proof?: { note: string; docs: DocRef[]; at: string };
  evidence?: EvidenceReport;
  verifyBy?: string;
  caseId?: string;
  reminders: { at: string; message: string }[];
  actions: { at: string; type: string; by: string; remarks: string }[];
  urgency: { score: number; label: Severity; reason: string; daysLeft: number };
}
interface Me {
  student: { pseudonym: string; institution: string; institutionId: string; name: string; mobile: string; rollNo: string; apaarId: string };
  complaints: MyComplaint[];
  notifications: { at: string; title: string; complaintId: string; subject: string }[];
  limits: { openComplaints: number; open: number };
  pulse: { term: string; invited: boolean; done: boolean };
  consent: { current: string; records: { version: string; at: string }[]; deletionRequestedAt?: string };
}

const urgencyTone = (l: Severity) => ({ Critical: "red", High: "saffron", Medium: "amber", Low: "slate" } as const)[l];
const LABEL: Record<StudentStatus, string> = {
  "With College": "With college, awaiting response",
  "Resolved - Pending Verification": "Awaiting your verdict",
  "Closed - Verified": "Done (closed, verified)",
  "Closed - Unverified": "Closed, unverified",
  "Escalated to AICTE": "Escalated to AICTE",
  "Closed by AICTE": "Closed by AICTE",
};
const statusTone = (s: StudentStatus) => ({ "With College": "amber", "Resolved - Pending Verification": "sky", "Closed - Verified": "emerald", "Closed - Unverified": "slate", "Escalated to AICTE": "saffron", "Closed by AICTE": "emerald" } as const)[s];

function stageOf(c: MyComplaint) {
  switch (c.status) {
    case "With College":
      return 1;
    case "Resolved - Pending Verification":
      return 3;
    case "Escalated to AICTE":
      return 4;
    default:
      return 5;
  }
}

function Tracker({ c }: { c: MyComplaint }) {
  const stage = stageOf(c);
  const steps = ["Filed", "With college", "Proof submitted", "Your verdict", c.status === "Escalated to AICTE" ? "With AICTE" : "AICTE, if needed", "Closed"];
  return (
    <ol aria-label={`Progress: ${LABEL[c.status]}, round ${c.round}`} className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-1.5 text-[12.5px]">
      {steps.map((s, i) => {
        const skipped = i === 4 && (c.status === "Closed - Verified" || c.status === "Closed - Unverified");
        const done = i < stage || (stage === 5 && !skipped);
        const now = i === stage && stage < 5;
        return (
          <li key={s} className="flex items-center gap-1">
            <span className={cn("rounded-full border px-2 py-0.5", now ? "border-[var(--accent)] bg-[var(--accent)]/15 font-semibold text-white" : done ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-200" : "border-white/10 text-slate-500", skipped && "line-through opacity-50")}>{s}</span>
            {i < steps.length - 1 && <span className="text-slate-500">›</span>}
          </li>
        );
      })}
      {c.round > 1 && <li className="ml-1"><Badge tone="saffron">Round {c.round}</Badge></li>}
    </ol>
  );
}

function ComplaintCard({ c, onDone }: { c: MyComplaint; onDone: () => void }) {
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [notDone, setNotDone] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const decide = async (decision: "done" | "not_done") => {
    setBusy(true);
    setErr(null);
    try {
      await apiFetch(`/api/student/complaints/${c.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, reason: reason || undefined }) });
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const pending = c.status === "Resolved - Pending Verification";
  const withCollege = c.status === "With College";
  return (
    <Card className={cn("p-4", pending && "border-sky-300/40")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[14.5px] font-semibold text-white">{c.subject}</div>
          <div className="num text-[13px] text-slate-500">
            {c.id} · {c.category} · filed {fmtDate(c.createdAt)}
          </div>
        </div>
        <Badge tone={statusTone(c.status)}>{LABEL[c.status]}</Badge>
      </div>
      <Tracker c={c} />
      <p dir="auto" className="mt-3 text-[14.5px] leading-relaxed text-slate-300">{c.originalText}</p>
      {c.language !== "English" && (
        <p className="mt-1 text-[13.5px] leading-relaxed text-slate-400">
          <Advisory>English translation</Advisory> {c.translatedText}
        </p>
      )}
      {withCollege && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[13.5px] text-slate-400">
          <Badge tone={c.urgency.daysLeft < 0 ? "red" : "slate"}>
            <Clock className="h-3 w-3" /> {c.urgency.daysLeft < 0 ? `${-c.urgency.daysLeft}d overdue` : `${c.urgency.daysLeft}d left for the college`}
          </Badge>
          <Badge tone={urgencyTone(c.urgency.label)}>Urgency {c.urgency.score} · {c.urgency.label}</Badge>
          <span>{c.urgency.reason}</span>
          <Advisory />
        </div>
      )}
      {withCollege && c.directions && <p className="mt-2 text-[14px] text-orange-200">AICTE returned this to your college with directions (round {c.round}): {c.directions}</p>}
      {c.status === "Escalated to AICTE" && <p className="mt-2 text-[14px] text-orange-200">With {c.routedBureau} at AICTE{c.caseId ? ` as case ${c.caseId}` : ""}, not with your college. AICTE may close it or send it back with directions. Your identity stays masked.</p>}
      {pending && c.proof && (
        <div className="mt-3 rounded-lg border border-white/[0.08] bg-white/[0.03] p-3">
          <div className="text-[13.5px] font-medium text-slate-300">College&apos;s proof of work (round {c.round}), {fmtDateTime(c.proof.at)}</div>
          <p className="mt-1 text-[14px] text-slate-300">{c.proof.note}</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {c.proof.docs.map((d) =>
              d.file ? (
                <a key={d.name} href={`/api/student/files/${d.file}`} className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[13px] text-slate-200 hover:border-[var(--accent)]">
                  <Paperclip className="h-3 w-3" /> {d.name}
                </a>
              ) : (
                <span key={d.name} className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 text-[13px] text-slate-400">
                  <Paperclip className="h-3 w-3" /> {d.name}
                </span>
              )
            )}
          </div>
          {c.evidence && (
            <div className="mt-2 text-[13.5px] text-slate-400">
              <Advisory>evidence check{c.evidence.source === "mock" ? " (offline mock)" : ""}, not proof</Advisory> <span className="num font-semibold text-white">{c.evidence.score}/100</span> {c.evidence.verdict}. {c.evidence.explanation}
            </div>
          )}
        </div>
      )}
      {pending && c.proof && (
        <div className="mt-3 space-y-2">
          <div className="text-[14.5px] font-medium text-white">Was your problem actually fixed?</div>
          {notDone && <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Say what is still wrong (required). Details stay with AICTE." className="min-h-[60px]" autoFocus />}
          {err && <p role="alert" className="text-[14px] text-red-300">{err}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {!notDone && (
              <Button variant="emerald" onClick={() => decide("done")} loading={busy}>
                <CheckCircle2 className="h-4 w-4" /> Done
              </Button>
            )}
            <Button variant="danger" onClick={() => (notDone ? decide("not_done") : setNotDone(true))} loading={busy} disabled={notDone && reason.trim().length < 5}>
              <XCircle className="h-4 w-4" /> {notDone ? "Send Not done to AICTE" : "Not done"}
            </Button>
            {notDone && (
              <Button variant="ghost" onClick={() => setNotDone(false)}>
                Back
              </Button>
            )}
            <span className="text-[13px] text-slate-500">Not done goes to an AICTE officer, not your college. No response by {fmtDate(c.verifyBy)} closes this as unverified.</span>
          </div>
        </div>
      )}
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-3 text-[13.5px] text-slate-400 underline hover:text-white">
        {open ? "Hide" : "Show"} timeline{c.reminders.length ? " and reminder log" : ""}
      </button>
      {open && (
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <ol className="space-y-1 text-[13.5px] text-slate-400">
            {[...c.actions].reverse().map((a, i) => (
              <li key={i}>
                <span className="text-slate-200">{a.type}</span> · {fmtDateTime(a.at)}
                <div className="text-slate-500">{a.remarks}</div>
              </li>
            ))}
          </ol>
          {c.reminders.length > 0 && (
            <div>
              <div className="mb-1 text-[13.5px] font-medium text-slate-300">Reminders sent to your college</div>
              <ul className="space-y-1 text-[13.5px] text-slate-400">
                {[...c.reminders].reverse().map((r, i) => (
                  <li key={i}>
                    {fmtDateTime(r.at)}: {r.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function ConsentNotice({ accepted, onChange }: { accepted: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-[13.5px] leading-relaxed text-slate-300">
      <div className="mb-1 font-semibold text-white">Privacy notice (version {CONSENT_VERSION})</div>
      <ul className="list-disc space-y-0.5 pl-4">
        <li><b>What we collect:</b> your ID, mobile, name and roll number if held, your complaint text or voice transcript, and any photo.</li>
        <li><b>Who sees what:</b> your college and partner desks see a pseudonym and masked text. Only the Competent Authority can reveal your identity, and each reveal is logged.</li>
        <li><b>AI:</b> complaint text may be sent to Groq after phone numbers, emails, roll numbers and IDs are removed.</li>
        <li><b>Retention:</b> kept while your complaint is handled and for the record period AICTE sets.</li>
        <li><b>Withdrawal:</b> you can request deletion any time from your profile. It goes to the AICTE desk.</li>
      </ul>
      <label className="mt-2 flex items-center gap-2 font-medium text-white">
        <input type="checkbox" checked={accepted} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" /> I have read this and agree
      </label>
    </div>
  );
}

function NewComplaint({ onDone, me }: { onDone: () => void; me: Me }) {
  const empty: VoiceValue = { text: "", language: "en-IN", channel: "Text" };
  const [v, setV] = React.useState<VoiceValue>(empty);
  const [photo, setPhoto] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<MyComplaint | null>(null);
  const [similar, setSimilar] = React.useState<{ id: string; subject: string; status: StudentStatus } | null>(null);
  const [override, setOverride] = React.useState("");
  const already = me.consent.records.some((r) => r.version === me.consent.current);
  const [consent, setConsent] = React.useState(already);
  const submit = async () => {
    setBusy(true);
    setErr(null);
    const form = new FormData();
    form.set("text", v.text);
    form.set("language", v.language);
    form.set("channel", v.channel);
    if (consent) form.set("consent", CONSENT_VERSION);
    if (v.sampleId) form.set("sampleId", v.sampleId);
    if (similar) form.set("overrideReason", override);
    if (photo) form.set("photo", photo);
    try {
      const r = await apiFetch<{ complaint: MyComplaint }>("/api/student/complaints", { method: "POST", body: form });
      setDone(r.complaint);
      setV(empty);
      setPhoto(null);
      setSimilar(null);
      setOverride("");
      onDone();
    } catch (e) {
      const data = (e as { data?: { similar?: typeof similar } }).data;
      if (data?.similar) setSimilar(data.similar);
      else setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      {done && (
        <Card className="border-emerald-300/30 p-4">
          <div className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-white">
            <CheckCircle2 className="h-4 w-4 text-emerald-300" /> Filed as {done.id}. With your college now, awaiting a response.
            <Badge tone={urgencyTone(done.urgency.label)}>Urgency {done.urgency.score} · {done.urgency.label}</Badge>
          </div>
          <p className="mt-1 text-[14px] text-slate-300">{done.urgency.reason}. Category: {done.category} ({done.categoryReason}). Your college sees only your pseudonym. <Advisory /></p>
        </Card>
      )}
      <Card className="p-5">
        <VoiceIntake value={v} onChange={setV} />
        <div className="mt-3">
          <Label>Photo (optional; PNG or JPG, up to 4 MB)</Label>
          <input type="file" accept="image/png,image/jpeg" aria-label="Photo" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} className="text-[14px] text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-slate-100" />
        </div>
        {!already && <div className="mt-3"><ConsentNotice accepted={consent} onChange={setConsent} /></div>}
        {similar && (
          <div className="mt-3 rounded-lg border border-amber-300/35 bg-amber-400/10 p-3 text-[14px] text-amber-100">
            <div className="flex items-center gap-1.5 font-semibold">
              <TriangleAlert className="h-4 w-4" /> You already have a similar open complaint
            </div>
            <p className="mt-1">
              <span className="num">{similar.id}</span>: {similar.subject} ({LABEL[similar.status]}). If this is a different problem, say why and file it anyway.
            </p>
            <Textarea value={override} onChange={(e) => setOverride(e.target.value)} placeholder="Why this is a different complaint" className="mt-2 min-h-[56px]" />
          </div>
        )}
        {err && <p role="alert" className="mt-3 text-[14px] text-red-300">{err}</p>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[13.5px] text-slate-500">
            {me.limits.open} of {me.limits.openComplaints} open complaints used
          </span>
          <Button variant="primary" onClick={submit} loading={busy} disabled={v.text.trim().length < 15 || !consent || (!!similar && override.trim().length < 5)}>
            <Send className="h-4 w-4" /> {similar ? "File anyway" : "Submit complaint"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Profile({ me, onDone }: { me: Me; onDone: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const request = async () => {
    setBusy(true);
    setErr(null);
    try {
      await apiFetch("/api/student/deletion", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="text-[15px] font-semibold text-white">Your details</h2>
        <p className="text-[13.5px] text-slate-400">Encrypted at rest. Your college never sees these.</p>
        <dl className="mt-2 grid gap-x-6 gap-y-1 text-[14px] sm:grid-cols-2">
          {[["Name", me.student.name], ["Mobile", me.student.mobile], ["Roll number", me.student.rollNo], ["Student ID", me.student.apaarId], ["Pseudonym", me.student.pseudonym], ["College", me.student.institution]].map(([k, v]) => (
            <div key={k}>
              <dt className="inline text-slate-500">{k}: </dt>
              <dd className="inline text-slate-200">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div>
        <h2 className="text-[15px] font-semibold text-white">Consent record</h2>
        {me.consent.records.length ? (
          <ul className="mt-1 text-[14px] text-slate-300">
            {me.consent.records.map((r) => (
              <li key={r.version}>
                Version {r.version}, accepted {fmtDateTime(r.at)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[14px] text-slate-400">No consent recorded yet. You accept the notice when you file your first complaint.</p>
        )}
      </div>
      <div>
        <h2 className="text-[15px] font-semibold text-white">Request deletion</h2>
        <p className="mt-1 text-[14px] text-slate-400">This logs a request for the AICTE desk, which will review it. Open complaints may need to stay on record until they close.</p>
        {err && <p role="alert" className="mt-1 text-[14px] text-red-300">{err}</p>}
        {me.consent.deletionRequestedAt ? (
          <p className="mt-2 text-[14px] text-emerald-200">Requested {fmtDateTime(me.consent.deletionRequestedAt)}. The AICTE desk has it.</p>
        ) : (
          <Button variant="danger" size="sm" className="mt-2" onClick={request} loading={busy}>
            Request deletion
          </Button>
        )}
      </div>
    </Card>
  );
}

function NotificationBell({ me }: { me: Me }) {
  const [open, setOpen] = React.useState(false);
  const waiting = me.complaints.filter((c) => c.status === "Resolved - Pending Verification").length;
  return (
    <div className="relative">
      <button aria-label="Notifications" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.07]">
        <Bell className="h-4 w-4 text-slate-200" />
        {waiting > 0 && <span className="num absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-red-500 px-1 text-center text-[12px] font-bold leading-[18px] text-paper">{waiting}</span>}
      </button>
      {open && (
        <div className="glass-strong absolute right-0 top-11 z-50 w-[320px] max-w-[calc(100vw-2rem)] rounded-xl p-2 shadow-2xl">
          {me.notifications.length === 0 && <div className="p-3 text-[14px] text-slate-400">No updates yet.</div>}
          <ul className="scroll-thin max-h-80 overflow-y-auto">
            {me.notifications.map((n, i) => (
              <li key={i} className="rounded-lg px-2.5 py-2 text-[13.5px] hover:bg-white/[0.05]">
                <div className="font-medium text-white">{n.title}</div>
                <div className="truncate text-slate-400">{n.complaintId}: {n.subject}</div>
                <div className="text-[12.5px] text-slate-500">{fmtDateTime(n.at)}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function StudentPortal() {
  const [me, setMe] = React.useState<Me | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<"mine" | "new" | "pulse" | "profile">("mine");
  const load = React.useCallback(() => {
    apiFetch<Me>("/api/student/me").then(setMe).catch((e: Error) => setErr(e.message));
  }, []);
  React.useEffect(load, [load]);
  const waiting = me?.complaints.filter((c) => c.status === "Resolved - Pending Verification") ?? [];
  return (
    <div className="mx-auto min-h-screen max-w-[860px] px-4 pb-16 pt-6" style={{ "--accent": "#9A3D4A" } as React.CSSProperties}>
      <header className="mb-5 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05]">
            <GraduationCap className="h-5 w-5 text-[var(--accent)]" />
          </span>
          <div className="min-w-0">
            <h1 className="text-[20px] font-bold tracking-tight text-white">NyayaSetu student portal</h1>
            <p className="text-[13.5px] text-slate-400">Your college sees a pseudonym, never your name, phone or roll number.</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {me && <NotificationBell me={me} />}
          <Button variant="ghost" size="sm" onClick={signOutNow}>
            <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>
      {err && !me && <ErrorNote msg={err} />}
      {!me && !err && <Skeleton className="h-64" />}
      {me && (
        <div className="space-y-4">
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  {me.student.pseudonym} <span className="rounded border border-[var(--accent)] px-1.5 py-0.5 text-[12px] font-medium text-[var(--accent)]">Student</span>
                </span>
              }
              sub={me.student.institution}
            />
          </Card>
          {waiting.length > 0 && (
            <button onClick={() => setTab("mine")} className="flex w-full items-center gap-2 rounded-xl border border-sky-300/40 bg-sky-400/10 px-4 py-3 text-left text-[15px] font-medium text-sky-100">
              <ShieldCheck className="h-5 w-5 shrink-0" /> Needs your verdict: {waiting.length} complaint{waiting.length === 1 ? " has" : "s have"} new proof from your college.
            </button>
          )}
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { key: "mine", label: `My complaints (${me.complaints.length})` },
              { key: "new", label: "New complaint" },
              { key: "pulse", label: "Pulse survey" },
              { key: "profile", label: "Profile and privacy" },
            ]}
          />
          {tab === "mine" && (
            <div className="space-y-3">
              {[...me.complaints].sort((a, b) => Number(b.status === "Resolved - Pending Verification") - Number(a.status === "Resolved - Pending Verification")).map((c) => (
                <ComplaintCard key={c.id} c={c} onDone={load} />
              ))}
              {me.complaints.length === 0 && <Card className="p-8 text-center text-sm text-slate-400">No complaints yet. Use the New complaint tab when you need to raise something.</Card>}
            </div>
          )}
          {tab === "new" && <NewComplaint me={me} onDone={load} />}
          {tab === "pulse" && <PulseSurvey api={apiFetch} pulse={me.pulse} onDone={load} />}
          {tab === "profile" && <Profile me={me} onDone={load} />}
        </div>
      )}
      <footer className="mt-8 text-center text-[13px] text-slate-500">
        <span className="rounded border border-amber-300/40 bg-amber-400/10 px-1.5 py-0.5 font-semibold text-amber-200">Synthetic demo data</span> Not connected to any AICTE system. Machine output is advisory.{" "}
        <Link href="/security" className="underline hover:text-white">
          Security &amp; Privacy
        </Link>
      </footer>
    </div>
  );
}
