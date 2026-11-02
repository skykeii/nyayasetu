"use client";
import * as React from "react";
import { Sparkles } from "lucide-react";
import { useRole } from "./role-provider";
import { Advisory } from "./ui";

/** Plain-language explanation of a match. Shown separately; it never changes the score or links anything. */
export function AiExplain({ a, b, draft, score, reasons }: { a: string; b?: string; draft?: { subject: string; text: string; bureau: string }; score: number; reasons?: string[] }) {
  const { api, toast } = useRole();
  const [out, setOut] = React.useState<{ explanation: string; secondOpinion?: string; source: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const borderline = score >= 0.5 && score <= 0.75;
  const run = async () => {
    setBusy(true);
    try {
      setOut(await api("/api/ai/explain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a, b, draft, score, reasons: reasons?.slice(0, 8) }) }));
    } catch (e) {
      toast({ title: "No explanation", body: (e as Error).message, tone: "red" });
    } finally {
      setBusy(false);
    }
  };
  if (!out)
    return (
      <button onClick={run} disabled={busy} className="mt-1 inline-flex items-center gap-1 text-[13px] text-violet-200 underline hover:text-white disabled:opacity-50">
        <Sparkles className="h-3 w-3" /> {busy ? "Asking" : borderline ? "AI second opinion" : "Explain this match"}
      </button>
    );
  return (
    <div className="mt-1.5 rounded-md border border-sky-300/20 bg-sky-400/[0.06] px-2.5 py-1.5 text-[13.5px] text-slate-200">
      <Advisory>{out.source === "groq" ? "AI, does not change the score" : "offline, AI unavailable"}</Advisory> {out.explanation}
      {out.secondOpinion && <div className="mt-1 text-slate-300">Second opinion: {out.secondOpinion}</div>}
    </div>
  );
}
