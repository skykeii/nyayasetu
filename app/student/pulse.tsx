"use client";
import * as React from "react";
import { CheckCircle2, Send } from "lucide-react";
import { Button, Card, cn } from "@/components/ui";
import { PULSE_QUESTIONS, type PulseQuestion } from "@/lib/types";

const LABELS: Record<PulseQuestion, string> = {
  infrastructure: "Labs, classrooms, hostel and other facilities",
  faculty: "Teaching and availability of faculty",
  fees: "Fairness and transparency of fees",
  safety: "How safe you feel on campus",
};

export function PulseSurvey({ api, pulse, onDone }: { api: <T>(p: string, i?: RequestInit) => Promise<T>; pulse: { term: string; invited: boolean; done: boolean }; onDone: () => void }) {
  const [a, setA] = React.useState<Partial<Record<PulseQuestion, number>>>({});
  const [unable, setUnable] = React.useState<boolean | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  if (pulse.done)
    return (
      <Card className="flex items-center gap-3 p-6 text-[14px] text-slate-200">
        <CheckCircle2 className="h-5 w-5 text-emerald-300" /> Thank you. Your answers for term {pulse.term} were added to your college&apos;s totals, with nothing linking them to you.
      </Card>
    );
  if (!pulse.invited) return <Card className="p-6 text-[14px] text-slate-300">A random 5 to 10% of students are invited each term. You were not selected for term {pulse.term}.</Card>;
  const complete = PULSE_QUESTIONS.every((q) => a[q]) && unable !== null;
  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api("/api/student/pulse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers: a, unable }) });
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
        <h2 className="text-[15px] font-semibold text-white">Anonymous pulse survey, term {pulse.term}</h2>
        <p className="text-[13px] text-slate-400">You were randomly selected. Only your college&apos;s totals are stored, never your individual answers.</p>
      </div>
      {PULSE_QUESTIONS.map((q) => (
        <fieldset key={q}>
          <legend className="mb-1.5 text-[13.5px] text-slate-200">{LABELS[q]}</legend>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" aria-pressed={a[q] === n} aria-label={`${LABELS[q]}: ${n} of 5`} onClick={() => setA({ ...a, [q]: n })} className={cn("num h-10 w-10 rounded-lg border text-sm", a[q] === n ? "border-saffron bg-saffron/20 text-white" : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/30")}>
                {n}
              </button>
            ))}
            <span className="ml-2 self-center text-[12px] text-slate-500">1 poor, 5 very good</span>
          </div>
        </fieldset>
      ))}
      <fieldset>
        <legend className="mb-1.5 text-[13.5px] text-slate-200">Have you ever felt unable to complain at this college?</legend>
        <div className="flex gap-2">
          {[
            [true, "Yes"],
            [false, "No"],
          ].map(([val, label]) => (
            <button key={String(label)} type="button" aria-pressed={unable === val} onClick={() => setUnable(val as boolean)} className={cn("h-10 rounded-lg border px-5 text-sm", unable === val ? "border-saffron bg-saffron/20 text-white" : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/30")}>
              {label as string}
            </button>
          ))}
        </div>
      </fieldset>
      {err && <p role="alert" className="text-[13px] text-red-300">{err}</p>}
      <Button variant="primary" onClick={submit} loading={busy} disabled={!complete}>
        <Send className="h-4 w-4" /> Submit anonymously
      </Button>
    </Card>
  );
}
