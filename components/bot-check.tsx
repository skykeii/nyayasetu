"use client";
import * as React from "react";
import { ShieldCheck } from "lucide-react";

/** Mock slide-to-verify. The onVerify(token) contract is the seam for Turnstile or hCaptcha; see verifyBotToken in lib/student.ts. */
export function BotCheck({ onVerify }: { onVerify: (token: string) => void }) {
  const [v, setV] = React.useState(0);
  const done = v >= 100;
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <div className="mb-1.5 flex items-center gap-2 text-[12.5px] text-slate-300">
        <ShieldCheck className={done ? "h-4 w-4 text-emerald-300" : "h-4 w-4 text-slate-500"} />
        {done ? "Verified (mock bot check)" : "Slide all the way to confirm you are not a bot"}
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={v}
        disabled={done}
        aria-label="Bot check slider"
        onChange={(e) => {
          const n = Number(e.target.value);
          setV(n);
          if (n >= 100) onVerify(`mock-${Date.now()}`);
        }}
        className="w-full accent-emerald-400"
      />
    </div>
  );
}
