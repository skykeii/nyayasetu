"use client";
import * as React from "react";
import { Search } from "lucide-react";
import { useApi, useRole } from "@/components/role-provider";
import { Badge, Button, Card, Input, Skeleton } from "@/components/ui";
import { ErrorNote } from "@/components/bits";
import type { AuditEntry } from "@/lib/types";
import { fmtDateTime } from "@/lib/util";

const tone = (a: string) =>
  a.startsWith("OVERLAP") ? "violet" : a.includes("DISPOSE") ? "emerald" : a.includes("ESCALATE") || a.includes("TRANSFER") ? "saffron" : a.startsWith("VIEW") || a === "ROLE_SWITCH" ? "slate" : a.startsWith("SETTINGS") || a.startsWith("DEMO") ? "red" : "indigo";

function VerifyIntegrity() {
  const { api } = useRole();
  const [out, setOut] = React.useState<{ ok: boolean; checked: number; brokenAt: string | null } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const run = async () => {
    setBusy(true);
    try {
      setOut(await api("/api/audit", { method: "POST" }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" size="sm" onClick={run} loading={busy}>
        Verify integrity
      </Button>
      {out && (
        <span role="status" className={out.ok ? "text-[14px] text-emerald-200" : "text-[14px] font-semibold text-red-300"}>
          {out.ok ? `Hash chain intact: ${out.checked} entries checked.` : `Chain broken at ${out.brokenAt}. An entry was changed or removed.`}
        </span>
      )}
    </div>
  );
}

export default function AuditPage() {
  const [q, setQ] = React.useState("");
  const [dq, setDq] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setDq(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  const { data, error, loading } = useApi<{ items: AuditEntry[]; total: number }>(`/api/audit?q=${encodeURIComponent(dq)}`, { interval: 5000 });
  return (
    <div className="mx-auto max-w-[1280px] space-y-4">
      <div>
        <h1 className="text-[34px] leading-[1.1] tracking-tight text-white">Audit trail</h1>
        <p className="text-[14.5px] text-slate-400">Every sign-in, case view, action, link and settings change, with the officer and role that made it. Append-only.</p>
      <VerifyIntegrity />
        </div>
      <Card className="p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by case ID, officer, action or text" className="pl-9" aria-label="Filter audit" />
        </div>
      </Card>
      {error && <ErrorNote msg={error} />}
      <Card className="overflow-hidden">
        <div className="px-5 py-3 text-[14px] text-slate-400">
          <span className="num font-semibold text-white">{data?.total ?? "…"}</span> entries{data && data.total > 500 ? " (latest 500 shown)" : ""}
        </div>
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[900px] text-[14px]">
            <thead>
              <tr className="border-y border-white/[0.06] text-left text-[13px] text-slate-500">
                <th className="px-5 py-2.5 font-medium">When</th>
                <th className="px-2 py-2.5 font-medium">Officer</th>
                <th className="px-2 py-2.5 font-medium">Role</th>
                <th className="px-2 py-2.5 font-medium">Action</th>
                <th className="px-2 py-2.5 font-medium">Target</th>
                <th className="px-5 py-2.5 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="p-5">
                    <Skeleton className="h-64" />
                  </td>
                </tr>
              )}
              {data?.items.map((a) => (
                <tr key={a.id} className="border-b border-white/[0.04] align-top">
                  <td className="num whitespace-nowrap px-5 py-2 text-slate-400">{fmtDateTime(a.at)}</td>
                  <td className="px-2 py-2 text-slate-200">{a.actor}</td>
                  <td className="px-2 py-2 uppercase text-slate-500">{a.role}</td>
                  <td className="px-2 py-2">
                    <Badge tone={tone(a.action) as never}>{a.action.replace(/_/g, " ").toLowerCase()}</Badge>
                  </td>
                  <td className="num px-2 py-2 text-slate-300">{a.target}</td>
                  <td className="max-w-[460px] px-5 py-2 text-slate-400">
                    <span className="line-clamp-2">{a.detail}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
