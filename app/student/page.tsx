"use client";
import * as React from "react";
import { CheckCircle2, GraduationCap, KeyRound, LogOut, Paperclip, Send, ShieldCheck, XCircle } from "lucide-react";
import { Advisory, Badge, Button, Card, CardHeader, Input, Label, Select, Skeleton, Tabs, Textarea, cn } from "@/components/ui";
import { ErrorNote } from "@/components/bits";
import { BotCheck } from "@/components/bot-check";
import { VoiceIntake, type VoiceValue } from "@/components/voice-intake";
import { DEMO_OTP, DEMO_STUDENTS } from "@/lib/intake";
import type { EvidenceReport, DocRef, Severity, StudentStatus } from "@/lib/types";
import { fmtDate, fmtDateTime } from "@/lib/util";
import { PulseSurvey } from "./pulse";

const KEY = "nyayasetu.student";

interface MyComplaint {
  id: string;
  subject: string;
  category: string;
  status: StudentStatus;
  language: string;
  originalText: string;
  translatedText: string;
  translationSource: string;
  severity: Severity;
  severityReason: string;
  categoryReason: string;
  routedBureau: string;
  createdAt: string;
  dueAt: string;
  photo?: DocRef;
  proof?: { note: string; docs: DocRef[]; at: string };
  evidence?: EvidenceReport;
  verifyBy?: string;
  caseId?: string;
  actions: { at: string; type: string; by: string; remarks: string }[];
  urgency: { score: number; label: Severity; reason: string; daysLeft: number };
}
interface Me {
  student: { pseudonym: string; institution: string; institutionId: string };
  complaints: MyComplaint[];
  limits: { openComplaints: number; open: number };
  pulse: { term: string; invited: boolean; done: boolean };
}

const urgencyTone = (l: Severity) => ({ Critical: "red", High: "saffron", Medium: "amber", Low: "slate" } as const)[l];
const statusTone = (s: StudentStatus) =>
  ({ "With College": "amber", "Resolved - Pending Verification": "sky", "Closed - Verified": "emerald", "Closed - Unverified": "slate", "Escalated to AICTE": "saffron", "Closed by AICTE": "emerald" } as const)[s];

function Login({ onDone }: { onDone: (token: string) => void }) {
  const [step, setStep] = React.useState<"details" | "otp">("details");
  const [apaarId, setApaar] = React.useState("");
  const [mobile, setMobile] = React.useState("");
  const [institutionId, setInst] = React.useState("");
  const [bot, setBot] = React.useState<string | null>(null);
  const [botKey, setBotKey] = React.useState(0);
  const [otp, setOtp] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [colleges, setColleges] = React.useState<{ id: string; name: string }[]>([]);
  React.useEffect(() => {
    fetch("/api/student/auth").then((r) => r.json()).then((d) => setColleges(d.colleges ?? []));
  }, []);
  const known = DEMO_STUDENTS.some((d) => d.apaarId === apaarId);
  const send = async (action: "request" | "verify") => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/student/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, apaarId, mobile, institutionId, botToken: bot, otp }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      if (action === "request") setStep("otp");
      else onDone(d.token);
    } catch (e) {
      setErr((e as Error).message);
      if (action === "request") {
        setBot(null);
        setBotKey((k) => k + 1);
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="mx-auto w-full max-w-md p-5">
      <div className="mb-4 rounded-lg border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-[12.5px] text-amber-100">
        <b>Demo mode:</b> no SMS is sent. The OTP is always <span className="num font-bold">{DEMO_OTP}</span>.
      </div>
      {step === "details" ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            send("request");
          }}
        >
          <div>
            <Label>College or APAAR ID</Label>
            <Input value={apaarId} onChange={(e) => setApaar(e.target.value.toUpperCase())} placeholder="APAAR-2046-1001" autoComplete="off" />
          </div>
          <div>
            <Label>Mobile number</Label>
            <Input value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="numeric" maxLength={10} placeholder="10 digits" autoComplete="off" />
          </div>
          {!known && (
            <div>
              <Label>Your college (first sign-in only)</Label>
              <Select value={institutionId} onChange={(e) => setInst(e.target.value)}>
                <option value="">Choose</option>
                {colleges.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <BotCheck key={botKey} onVerify={setBot} />
          {err && <p role="alert" className="text-[13px] text-red-300">{err}</p>}
          <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={!bot}>
            <KeyRound className="h-4 w-4" /> Send OTP
          </Button>
          <div className="border-t border-white/[0.07] pt-3">
            <div className="mb-1.5 text-[12px] text-slate-500">Demo students</div>
            <div className="flex flex-wrap gap-1.5">
              {DEMO_STUDENTS.map((d) => (
                <button
                  key={d.apaarId}
                  type="button"
                  onClick={() => {
                    setApaar(d.apaarId);
                    setMobile(d.mobile);
                  }}
                  className="num rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[12px] text-slate-300 hover:border-saffron/50"
                >
                  {d.apaarId}
                </button>
              ))}
            </div>
          </div>
        </form>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            send("verify");
          }}
        >
          <div>
            <Label>Enter the 6-digit OTP</Label>
            <Input value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" maxLength={6} autoFocus className="num tracking-[0.3em]" autoComplete="one-time-code" />
          </div>
          {err && <p role="alert" className="text-[13px] text-red-300">{err}</p>}
          <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={otp.length !== 6}>
            <ShieldCheck className="h-4 w-4" /> Verify and sign in
          </Button>
          <button type="button" className="w-full text-center text-[13px] text-slate-400 hover:text-white" onClick={() => setStep("details")}>
            Change details
          </button>
        </form>
      )}
    </Card>
  );
}

function ComplaintCard({ c, api, token, onDone }: { c: MyComplaint; api: <T>(p: string, i?: RequestInit) => Promise<T>; token: string; onDone: () => void }) {
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const decide = async (decision: "done" | "not_done") => {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/student/complaints/${c.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, note }) });
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const download = async (d: DocRef) => {
    const res = await fetch(`/api/student/files/${d.file}`, { headers: { "x-student-session": token } });
    if (!res.ok) return setErr("Could not download the file");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await res.blob());
    a.download = d.name;
    a.click();
  };
  const pending = c.status === "Resolved - Pending Verification";
  return (
    <Card className={cn("p-4", pending && "border-sky-300/40")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[14.5px] font-semibold text-white">{c.subject}</div>
          <div className="num text-[12px] text-slate-500">
            {c.id} · {c.category} · filed {fmtDate(c.createdAt)}
          </div>
        </div>
        <Badge tone={statusTone(c.status)}>{c.status}</Badge>
      </div>
      <p dir="auto" className="mt-2 text-[13.5px] leading-relaxed text-slate-300">{c.originalText}</p>
      {c.language !== "English" && (
        <p className="mt-1 text-[12.5px] leading-relaxed text-slate-400">
          <Advisory>English translation</Advisory> {c.translatedText}
        </p>
      )}
      {(c.status === "With College" || pending) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-slate-400">
          <Badge tone={urgencyTone(c.urgency.label)}>Urgency {c.urgency.score} · {c.urgency.label}</Badge>
          <span>{c.urgency.reason}</span>
          <Advisory />
        </div>
      )}
      {c.status === "Escalated to AICTE" && <p className="mt-2 text-[13px] text-orange-200">With {c.routedBureau} at AICTE{c.caseId ? ` as case ${c.caseId}` : ""}, not with your college. Your identity stays masked.</p>}
      {c.proof && (
        <div className="mt-3 rounded-lg border border-white/[0.08] bg-white/[0.03] p-3">
          <div className="text-[12.5px] font-medium text-slate-300">College&apos;s proof of work, {fmtDateTime(c.proof.at)}</div>
          <p className="mt-1 text-[13px] text-slate-300">{c.proof.note}</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {c.proof.docs.map((d) =>
              d.file ? (
                <button key={d.name} onClick={() => download(d)} className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[12px] text-slate-200 hover:border-saffron/50">
                  <Paperclip className="h-3 w-3" /> {d.name}
                </button>
              ) : (
                <span key={d.name} className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 text-[12px] text-slate-400">
                  <Paperclip className="h-3 w-3" /> {d.name}
                </span>
              )
            )}
          </div>
          {c.evidence && (
            <div className="mt-2 text-[12.5px] text-slate-400">
              <Advisory>evidence check{c.evidence.source === "mock" ? " (offline mock)" : ""}, not proof</Advisory> <span className="num font-semibold text-white">{c.evidence.score}/100</span> {c.evidence.verdict}. {c.evidence.explanation}
            </div>
          )}
        </div>
      )}
      {pending && (
        <div className="mt-3 space-y-2">
          <div className="text-[13.5px] font-medium text-white">Was your problem actually fixed?</div>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note. Details stay with AICTE." className="min-h-[60px]" />
          {err && <p role="alert" className="text-[13px] text-red-300">{err}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="emerald" onClick={() => decide("done")} loading={busy}>
              <CheckCircle2 className="h-4 w-4" /> Done
            </Button>
            <Button variant="danger" onClick={() => decide("not_done")} loading={busy}>
              <XCircle className="h-4 w-4" /> Not done
            </Button>
            <span className="text-[12px] text-slate-500">Not done goes to an AICTE officer, not your college. No response by {fmtDate(c.verifyBy)} closes this as unverified.</span>
          </div>
        </div>
      )}
    </Card>
  );
}

function NewComplaint({ api, onDone, limits }: { api: <T>(p: string, i?: RequestInit) => Promise<T>; onDone: () => void; limits: Me["limits"] }) {
  const empty: VoiceValue = { text: "", language: "en-IN", channel: "Text" };
  const [v, setV] = React.useState<VoiceValue>(empty);
  const [photo, setPhoto] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<MyComplaint | null>(null);
  const submit = async () => {
    setBusy(true);
    setErr(null);
    const form = new FormData();
    form.set("text", v.text);
    form.set("language", v.language);
    form.set("channel", v.channel);
    if (v.sampleId) form.set("sampleId", v.sampleId);
    if (photo) form.set("photo", photo);
    try {
      const r = await api<{ complaint: MyComplaint }>("/api/student/complaints", { method: "POST", body: form });
      setDone(r.complaint);
      setV(empty);
      setPhoto(null);
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      {done && (
        <Card className="border-emerald-300/30 p-4">
          <div className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-white">
            <CheckCircle2 className="h-4 w-4 text-emerald-300" /> Filed as {done.id}
            <Badge tone={urgencyTone(done.urgency.label)}>Urgency {done.urgency.score} · {done.urgency.label}</Badge>
          </div>
          <p className="mt-1 text-[13px] text-slate-300">{done.urgency.reason}. Category: {done.category} ({done.categoryReason}). Sent to your college&apos;s nodal officer, who sees only your pseudonym. <Advisory /></p>
        </Card>
      )}
      <Card className="p-5">
        <VoiceIntake value={v} onChange={setV} />
        <div className="mt-3">
          <Label>Photo (optional)</Label>
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} className="text-[13px] text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-slate-100" />
        </div>
        {err && <p role="alert" className="mt-3 text-[13px] text-red-300">{err}</p>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[12.5px] text-slate-500">
            {limits.open} of {limits.openComplaints} open complaints used
          </span>
          <Button variant="primary" onClick={submit} loading={busy} disabled={v.text.trim().length < 15}>
            <Send className="h-4 w-4" /> Submit complaint
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default function StudentPortal() {
  const [token, setToken] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);
  const [me, setMe] = React.useState<Me | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<"mine" | "new" | "pulse">("mine");
  React.useEffect(() => {
    try {
      setToken(sessionStorage.getItem(KEY));
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);
  const signOut = React.useCallback(() => {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    setToken(null);
    setMe(null);
  }, []);
  const api = React.useCallback(
    async <T,>(path: string, init: RequestInit = {}) => {
      const res = await fetch(path, { ...init, headers: { ...(init.headers as Record<string, string>), "x-student-session": token ?? "" }, cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) signOut();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
      return data as T;
    },
    [token, signOut]
  );
  const load = React.useCallback(() => {
    api<Me>("/api/student/me").then(setMe).catch((e: Error) => setErr(e.message));
  }, [api]);
  React.useEffect(() => {
    if (token) load();
  }, [token, load]);

  const waiting = me?.complaints.filter((c) => c.status === "Resolved - Pending Verification").length ?? 0;
  return (
    <div className="mx-auto min-h-screen max-w-[860px] px-4 pb-16 pt-6">
      <header className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05]">
            <GraduationCap className="h-5 w-5 text-saffron" />
          </span>
          <div>
            <h1 className="text-[20px] font-bold tracking-tight text-white">NyayaSetu student portal</h1>
            <p className="text-[12.5px] text-slate-400">Your college sees a pseudonym, never your name, phone or roll number.</p>
          </div>
        </div>
        {me && (
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        )}
      </header>
      {!ready ? (
        <Skeleton className="h-64" />
      ) : !token ? (
        <Login
          onDone={(t) => {
            try {
              sessionStorage.setItem(KEY, t);
            } catch {
              /* ignore */
            }
            setErr(null);
            setToken(t);
          }}
        />
      ) : !me ? (
        err ? <ErrorNote msg={err} /> : <Skeleton className="h-64" />
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader title={me.student.pseudonym} sub={me.student.institution} right={waiting > 0 ? <Badge tone="sky">{waiting} waiting for your answer</Badge> : undefined} />
          </Card>
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { key: "mine", label: `My complaints (${me.complaints.length})` },
              { key: "new", label: "New complaint" },
              { key: "pulse", label: "Pulse survey" },
            ]}
          />
          {tab === "mine" && (
            <div className="space-y-3">
              {me.complaints.map((c) => (
                <ComplaintCard key={c.id} c={c} api={api} token={token} onDone={load} />
              ))}
              {me.complaints.length === 0 && <Card className="p-8 text-center text-sm text-slate-400">No complaints yet. Use the New complaint tab when you need to raise something.</Card>}
            </div>
          )}
          {tab === "new" && <NewComplaint api={api} onDone={load} limits={me.limits} />}
          {tab === "pulse" && <PulseSurvey api={api} pulse={me.pulse} onDone={load} />}
        </div>
      )}
      <footer className="mt-8 text-center text-[12px] text-slate-500">
        <span className="rounded border border-amber-300/40 bg-amber-400/10 px-1.5 py-0.5 font-semibold text-amber-200">Synthetic demo data</span> Not connected to any AICTE system. Machine output is advisory.
      </footer>
    </div>
  );
}
