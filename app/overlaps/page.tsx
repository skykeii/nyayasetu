"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Handshake, Link2, Unlink, XCircle } from "lucide-react";
import { useApi, useRole } from "@/components/role-provider";
import { Advisory, Badge, Button, Card, Input, Select, Skeleton, Tabs, cn } from "@/components/ui";
import { BureauChip, Confidence, ErrorNote, OverlapPulse, SlaBadge, StatusBadge } from "@/components/bits";
import { OverlapBridge } from "@/components/overlap-bridge";
import { CaseDrawer } from "@/components/case-drawer";
import { AiExplain } from "@/components/ai-explain";
import type { OverlapCluster } from "@/lib/overlap";
import type { LinkGroup, Status } from "@/lib/types";
import { fmtDate, fmtDateTime } from "@/lib/util";

type Item = OverlapCluster & {
  institution: { id: string; name: string; region: string; city: string };
  group?: LinkGroup;
  canAct: boolean;
  cases: { id: string; bureau: string; status: Status; category: string; subject: string; description: string; reference: string; reportedName: string; reportedPid?: string; dateReceived: string; officer?: string; sla: { state: string; daysToDue: number; overdueDays: number; ageDays: number; withinSla?: boolean } }[];
};

export default function OverlapsPage() {
  return (
    <React.Suspense fallback={<Skeleton className="h-96" />}>
      <Overlaps />
    </React.Suspense>
  );
}

function Overlaps() {
  const sp = useSearchParams();
  const focus = sp.get("focus");
  const { data, error, loading, reload } = useApi<{ items: Item[]; minConfidence: number }>("/api/overlaps", { interval: 5000 });
  const [tab, setTab] = React.useState<"Open" | "Linked" | "Coordinated" | "all">("Open");
  const [kind, setKind] = React.useState<"" | "cross-bureau" | "duplicate">("");
  const [open, setOpen] = React.useState<string | null>(null);
  const items = (data?.items ?? []).filter((i) => (tab === "all" || i.status === tab) && (!kind || i.kind === kind));
  const count = (s: string) => (data?.items ?? []).filter((i) => i.status === s && (!kind || i.kind === kind)).length;

  React.useEffect(() => {
    if (!focus || !data) return;
    const it = data.items.find((i) => i.id === focus);
    if (it && it.status !== tab && tab !== "all") setTab(it.status);
    setTimeout(() => document.getElementById(focus)?.scrollIntoView({ behavior: "smooth", block: "center" }), 200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, !!data]);

  return (
    <div className="mx-auto max-w-[1480px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-white">Cross-bureau overlaps</h1>
          <p className="max-w-[80ch] text-[13.5px] text-slate-400">
            The engine compares every open case pair on Permanent ID (exact or one-digit typo), fuzzy institution name (normalised tokens, Levenshtein, acronyms) and complaint text (TF-IDF cosine). Matches at or above {Math.round((data?.minConfidence ?? 0.62) * 100)}% are shown. An official decides whether cases are related.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { key: "Open", label: <>Needs coordination <span className="num ml-1 text-violet-300">{count("Open")}</span></> },
            { key: "Linked", label: <>Linked <span className="num ml-1 text-slate-400">{count("Linked")}</span></> },
            { key: "Coordinated", label: <>Coordinated <span className="num ml-1 text-emerald-300">{count("Coordinated")}</span></> },
            { key: "all", label: "All" },
          ]}
        />
        <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="w-56" aria-label="Type">
          <option value="">Overlaps and duplicates</option>
          <option value="cross-bureau">Cross-bureau overlaps only</option>
          <option value="duplicate">Same-unit duplicates only</option>
        </Select>
      </div>
      {error && <ErrorNote msg={error} />}
      {loading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-64" />)}
      {data && items.length === 0 && (
        <Card className="px-6 py-12 text-center text-sm text-slate-400">
          Nothing here. {tab === "Open" ? "Every detected overlap in your scope has been linked or coordinated." : "Switch tabs to see other clusters."}
        </Card>
      )}
      <div className="space-y-4">
        {items.map((it) => (
          <ClusterCard key={it.id} it={it} focused={focus === it.id} onOpen={setOpen} onDone={reload} />
        ))}
      </div>
      <CaseDrawer id={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function ClusterCard({ it, focused, onOpen, onDone }: { it: Item; focused: boolean; onOpen: (id: string) => void; onDone: () => void }) {
  const { api, toast, bump, meta } = useRole();
  const [note, setNote] = React.useState("");
  const [lead, setLead] = React.useState(it.group?.leadBureau ?? (it.bureaus.includes("RB") ? "RB" : it.bureaus[0]));
  const [busy, setBusy] = React.useState<string | null>(null);
  const best = [...it.pairs].sort((a, b) => b.confidence - a.confidence)[0];
  const act = async (action: "link" | "coordinate" | "dismiss" | "unlink", done: string) => {
    setBusy(action);
    try {
      await api("/api/overlaps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, caseIds: it.caseIds, note, leadBureau: lead, clusterId: it.id }) });
      toast({ title: done, body: `${it.institution.name}: ${it.caseIds.join(", ")}`, tone: action === "dismiss" || action === "unlink" ? "default" : action === "coordinate" ? "emerald" : "violet" });
      setNote("");
      onDone();
      bump();
    } catch (e) {
      toast({ title: "Not saved", body: (e as Error).message, tone: "red" });
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card id={it.id} className={cn("overflow-hidden scroll-mt-24", it.status === "Open" && "border-violet-400/30", focused && "ring-2 ring-violet-400/60")}>
      <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4", it.status === "Open" && "bg-violet-500/[0.06]")}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {it.status === "Open" && <OverlapPulse />}
            <span className="text-[14px] font-semibold text-violet-100">{it.kind === "cross-bureau" ? "Potential Overlapping Cases – Coordination Required" : "Possible duplicate registration"}</span>
          </div>
          <Link href={`/institutions/${it.institution.id}`} className="mt-1 block text-[16px] font-semibold text-white hover:text-saffron">
            {it.institution.name}
          </Link>
          <div className="num text-[12.5px] text-slate-400">
            {it.institution.id} · {it.institution.city} · {it.institution.region} · cluster {it.id}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone={it.status === "Open" ? "violet" : it.status === "Coordinated" ? "emerald" : "indigo"}>{it.status}</Badge>
          <Confidence value={it.confidence} />
          <Advisory />
        </div>
      </div>

      <div className="space-y-4 px-5 py-4">
        <OverlapBridge status={it.status} onOpen={onOpen} cases={it.cases} />

        <div className="grid gap-3 lg:grid-cols-2">
          {it.cases.map((c) => (
            <div key={c.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <BureauChip code={c.bureau} />
                <button onClick={() => onOpen(c.id)} className="num text-[13.5px] font-semibold text-white hover:text-saffron">
                  {c.id}
                </button>
                <StatusBadge status={c.status} />
                <SlaBadge sla={c.sla} />
              </div>
              <div className="mt-1 text-[12.5px] text-slate-400">
                <span className="num">{c.reference}</span> · received {fmtDate(c.dateReceived)} · {c.officer}
              </div>
              <div className="mt-2 text-[13px] font-medium text-slate-100">{c.subject}</div>
              <p className="mt-1 line-clamp-4 max-w-[70ch] text-[13px] leading-relaxed text-slate-300">{c.description}</p>
              <div className="mt-2 text-[12px] text-slate-500">
                Institution as written: <span className="text-slate-300">“{c.reportedName}”</span>
                {c.reportedPid ? (
                  <>
                    {" "}
                    · ID quoted <span className="num text-slate-300">{c.reportedPid}</span>
                  </>
                ) : (
                  " · no ID quoted"
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3.5">
          <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12.5px] text-slate-400">
            <span>Match reasons</span>
            {best && (
              <>
                <span>
                  Institution match <span className="num font-semibold text-slate-200">{Math.round(best.instScore * 100)}%</span>
                </span>
                <span>
                  Text similarity <span className="num font-semibold text-slate-200">{Math.round(best.textScore * 100)}%</span>
                </span>
                <span>{best.sameCategory ? "Same category" : "Different categories"}</span>
              </>
            )}
          </div>
                {best && <AiExplain a={best.a} b={best.b} score={best.confidence} reasons={best.reasons} />}
          <ul className="space-y-1">
            {[...new Set(it.pairs.flatMap((p) => p.reasons))].slice(0, 8).map((r) => (
              <li key={r} className="flex gap-2 text-[13px] text-slate-300">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-violet-300" />
                {r}
              </li>
            ))}
          </ul>
        </div>

        {it.group && (
          <div className="text-[12.5px] text-slate-400">
            {it.group.status} as <span className="num text-slate-200">{it.group.id}</span> by {it.group.by} on {fmtDateTime(it.group.at)}. Lead unit <BureauChip code={it.group.leadBureau} />. Note: {it.group.note}
          </div>
        )}

        {it.canAct ? (
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <Select value={lead} onChange={(e) => setLead(e.target.value as typeof lead)} className="lg:w-56" aria-label="Lead unit">
              {(meta?.bureaus ?? [])
                .filter((b) => it.bureaus.includes(b.code))
                .map((b) => (
                  <option key={b.code} value={b.code}>
                    Lead: {b.code} — {b.name}
                  </option>
                ))}
            </Select>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Coordination note (mandatory): who leads, what the other unit holds" className="flex-1" />
            <div className="flex flex-wrap gap-2">
              {it.status === "Open" && (
                <Button variant="violet" loading={busy === "link"} onClick={() => act("link", "Cases linked")}>
                  <Link2 className="h-4 w-4" /> Link cases
                </Button>
              )}
              {it.status !== "Coordinated" && (
                <Button variant="emerald" loading={busy === "coordinate"} onClick={() => act("coordinate", "Marked coordinated")}>
                  <Handshake className="h-4 w-4" /> Mark coordinated
                </Button>
              )}
              {it.status === "Open" && (
                <Button variant="ghost" loading={busy === "dismiss"} onClick={() => act("dismiss", "Marked not related")}>
                  <XCircle className="h-4 w-4" /> Not related
                </Button>
              )}
              {it.status !== "Open" && (
                <Button variant="ghost" loading={busy === "unlink"} onClick={() => act("unlink", "Link removed")}>
                  <Unlink className="h-4 w-4" /> Unlink
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="text-[12.5px] text-slate-500">View only. Linking is done by the units handling these cases or the Competent Authority.</div>
        )}
      </div>
    </Card>
  );
}
