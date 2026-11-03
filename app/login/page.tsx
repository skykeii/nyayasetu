"use client";
import * as React from "react";
import Link from "next/link";
import { Building2, GraduationCap, KeyRound, Landmark, MapPinned, School, ShieldCheck, Users } from "lucide-react";
import { Button, Card, Input, Label, Select, cn } from "@/components/ui";
import { BotCheck } from "@/components/bot-check";
import { BridgeMark } from "@/components/bridge-mark";
import { DEMO_OFFICIALS, DEMO_PASSWORD } from "@/lib/demo-accounts";
import { DEMO_STUDENTS } from "@/lib/intake";
import { ROLES } from "@/lib/roles";
import type { RoleKey } from "@/lib/types";

const CARDS: { role: RoleKey; icon: React.ComponentType<{ className?: string }> }[] = [
  { role: "ca", icon: Landmark },
  { role: "rb", icon: Building2 },
  { role: "pgrc", icon: Users },
  { role: "other", icon: Building2 },
  { role: "ro", icon: MapPinned },
  { role: "college", icon: School },
  { role: "student", icon: GraduationCap },
];

async function post(path: string, body: object) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Sign-in failed");
  return data;
}

export default function LoginPage() {
  const [role, setRole] = React.useState<RoleKey>("ca");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [challenge, setChallenge] = React.useState<string | null>(null);
  const [code, setCode] = React.useState("");
  const [apaarId, setApaar] = React.useState("");
  const [mobile, setMobile] = React.useState("");
  const [institutionId, setInst] = React.useState("");
  const [colleges, setColleges] = React.useState<{ id: string; name: string }[]>([]);
  const [bot, setBot] = React.useState<string | null>(null);
  const [botKey, setBotKey] = React.useState(0);
  const [otpSent, setOtpSent] = React.useState(false);
  const [otp, setOtp] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const isStudent = role === "student";

  React.useEffect(() => {
    if (isStudent && !colleges.length) fetch("/api/auth/student").then((r) => r.json()).then((d) => setColleges(d.colleges ?? []));
  }, [isStudent, colleges.length]);

  const pickRole = (r: RoleKey) => {
    setRole(r);
    setErr(null);
    setChallenge(null);
    setOtpSent(false);
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const finish = (d: { landing?: string }) => {
    // the server sends a signed-in user on to the page they asked for, if their role may open it
    const next = new URLSearchParams(window.location.search).get("next");
    window.location.href = next ? `/login?next=${encodeURIComponent(next)}` : d.landing ?? "/";
  };
  const officialSubmit = () =>
    run(async () => {
      if (challenge) return finish(await post("/api/auth/login", { challenge, code }));
      const d = await post("/api/auth/login", { email, password, role });
      if (d.twoFactor) setChallenge(d.challenge);
      else finish(d);
    });
  const studentSubmit = () =>
    run(async () => {
      if (otpSent) return finish(await post("/api/auth/student", { action: "verify", apaarId, mobile, institutionId: institutionId || undefined, otp }));
      try {
        await post("/api/auth/student", { action: "request", apaarId, mobile, institutionId: institutionId || undefined, botToken: bot ?? undefined });
        setOtpSent(true);
      } catch (e) {
        setBot(null);
        setBotKey((k) => k + 1);
        throw e;
      }
    });
  const knownStudent = DEMO_STUDENTS.some((d) => d.apaarId === apaarId);

  return (
    <div className="mx-auto grid min-h-screen max-w-[1120px] items-start gap-5 px-4 py-8 lg:grid-cols-[1.25fr_1fr]">
      <div className="min-w-0 space-y-4">
        <div className="flex items-center gap-3">
          <BridgeMark className="h-11 w-11" />
          <div>
            <h1 className="text-[28px] leading-tight tracking-tight text-white">Sign in to NyayaSetu</h1>
            <p className="text-[14.5px] text-slate-400">One window for every institution complaint</p>
          </div>
        </div>
        <div role="radiogroup" aria-label="Sign in as" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CARDS.map(({ role: r, icon: I }) => (
            <button key={r} role="radio" aria-checked={role === r} onClick={() => pickRole(r)} className={cn("rounded-xl border p-3 text-left transition-colors", role === r ? "bg-white/[0.08]" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]")} style={role === r ? { borderColor: ROLES[r].accent } : undefined}>
              <span style={{ color: ROLES[r].accent }}>
                <I className="h-5 w-5" />
              </span>
              <span className="mt-1.5 block text-[13.5px] font-medium leading-tight text-white">{ROLES[r].short}</span>
            </button>
          ))}
        </div>
        <Card className="p-5">
          {isStudent ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                studentSubmit();
              }}
            >
              {!otpSent ? (
                <>
                  <div>
                    <Label>Student or APAAR ID</Label>
                    <Input value={apaarId} onChange={(e) => setApaar(e.target.value.toUpperCase())} placeholder="APAAR-2046-1001" autoComplete="off" />
                  </div>
                  <div>
                    <Label>Mobile number</Label>
                    <Input value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="numeric" maxLength={10} placeholder="10 digits" autoComplete="off" />
                  </div>
                  {!knownStudent && (
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
                </>
              ) : (
                <div>
                  <Label>Enter the 6-digit OTP (demo: always 123456, no SMS is sent)</Label>
                  <Input value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" maxLength={6} autoFocus className="num tracking-[0.3em]" autoComplete="one-time-code" />
                </div>
              )}
              {err && <p role="alert" className="text-[14px] text-red-300">{err}</p>}
              <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={otpSent ? otp.length !== 6 : !bot}>
                {otpSent ? <ShieldCheck className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
                {otpSent ? "Verify and sign in" : "Send OTP"}
              </Button>
            </form>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                officialSubmit();
              }}
            >
              {challenge ? (
                <div>
                  <Label>Two-factor code (demo: always 123456)</Label>
                  <Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} autoFocus className="num tracking-[0.3em]" autoComplete="one-time-code" />
                </div>
              ) : (
                <>
                  <div>
                    <Label>Official email</Label>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@nyayasetu.demo" autoComplete="username" />
                  </div>
                  <div>
                    <Label>Password</Label>
                    <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
                  </div>
                </>
              )}
              {err && <p role="alert" className="text-[14px] text-red-300">{err}</p>}
              <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={challenge ? code.length !== 6 : !email || !password}>
                <ShieldCheck className="h-4 w-4" /> {challenge ? "Verify" : `Sign in as ${ROLES[role].short}`}
              </Button>
            </form>
          )}
        </Card>
        <p className="text-[13.5px] text-slate-500">
          <span className="rounded border border-amber-300/40 bg-amber-400/10 px-1.5 py-0.5 font-semibold text-amber-200">Synthetic demo data</span> Not connected to any AICTE system.{" "}
          <Link href="/security" className="text-slate-300 underline hover:text-white">
            Security &amp; Privacy
          </Link>
        </p>
      </div>
      <Card className="p-5">
        <h2 className="text-[15px] font-semibold text-white">Demo accounts</h2>
        <p className="mb-3 text-[14px] text-slate-400">
          Select one to fill the form. Shared password for officials: <span className="num font-semibold text-white">{DEMO_PASSWORD}</span>
        </p>
        <ul className="space-y-1">
          {DEMO_OFFICIALS.map((d) => (
            <li key={d.email}>
              <button
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-white/[0.06]"
                onClick={() => {
                  pickRole(d.role);
                  setEmail(d.email);
                  setPassword(DEMO_PASSWORD);
                }}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ROLES[d.role].accent }} />
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium text-white">
                    {d.label}
                    {d.note && <span className="font-normal text-slate-500"> · {d.note}</span>}
                  </span>
                  <span className="block truncate text-[13px] text-slate-400">{d.email}</span>
                </span>
              </button>
            </li>
          ))}
          {DEMO_STUDENTS.map((d, i) => (
            <li key={d.apaarId}>
              <button
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-white/[0.06]"
                onClick={() => {
                  pickRole("student");
                  setApaar(d.apaarId);
                  setMobile(d.mobile);
                }}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ROLES.student.accent }} />
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium text-white">Student {i + 1} · OTP 123456</span>
                  <span className="num block text-[13px] text-slate-400">
                    {d.apaarId} · {d.mobile}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
