"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Wand2 } from "lucide-react";
import { useRole } from "@/components/role-provider";
import { Advisory, Badge, Button, Card, CardHeader, Input, Label, Select, cn } from "@/components/ui";
import { SeverityDot } from "@/components/bits";
import { VoiceIntake, type VoiceValue } from "@/components/voice-intake";
import type { Processed, RoutingSuggestion } from "@/lib/student";
import { CATEGORIES, type BureauCode, type Category } from "@/lib/types";

type Preview = Processed & { subject: string; original: string; language: string; institutionId: string | null; institutionReason: string; routing: RoutingSuggestion | null };

export default function IntakePage() {
  const { api, toast, meta, bump } = useRole();
  const router = useRouter();
  const [v, setV] = React.useState<VoiceValue>({ text: "", language: "hi-IN", channel: "Voice" });
  const [instText, setInstText] = React.useState("");
  const [p, setP] = React.useState<Preview | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [institutionId, setInst] = React.useState("");
  const [category, setCategory] = React.useState<Category>("Infrastructure");
  const [bureau, setBureau] = React.useState<BureauCode>("AB");
  const [officerId, setOfficer] = React.useState("");
  const [routing, setRouting] = React.useState<RoutingSuggestion | null>(null);
  const post = <T,>(body: object) => api<T>("/api/intake", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const applyRouting = (r: RoutingSuggestion | null) => {
    setRouting(r);
    if (r) {
      setBureau(r.bureau);
      setOfficer(r.officerId);
    }
  };
  const analyse = async () => {
    setBusy(true);
    try {
      const r = await post<Preview>({ action: "preview", text: v.text, language: v.language, sampleId: v.sampleId, institutionText: instText });
      setP(r);
      setInst(r.institutionId ?? "");
      setCategory(r.category);
      applyRouting(r.routing);
    } catch (e) {
      toast({ title: "Could not process", body: (e as Error).message, tone: "red" });
    } finally {
      setBusy(false);
    }
  };
  const reroute = async (cat: Category, inst: string) => {
    if (!inst) return applyRouting(null);
    try {
      applyRouting((await post<{ routing: RoutingSuggestion }>({ action: "route", text: v.text, language: v.language, sampleId: v.sampleId, category: cat, institutionId: inst })).routing);
    } catch (e) {
      toast({ title: "Could not refresh the suggestion", body: (e as Error).message, tone: "red" });
    }
  };
  const create = async () => {
    if (!p) return;
    setBusy(true);
    try {
      const r = await post<{ id: string; bureau: string; institution: string }>({ action: "create", text: v.text, language: v.language, sampleId: v.sampleId, translation: p.translation, translationSource: p.source, subject: p.subject, institutionId, category, severity: p.severity, bureau, officerId });
      toast({ title: `Case ${r.id} created at ${r.bureau}`, body: r.institution, tone: "emerald", href: `/cases?open=${r.id}` });
      bump();
      router.push(`/cases?open=${r.id}`);
    } catch (e) {
      toast({ title: "Not created", body: (e as Error).message, tone: "red" });
    } finally {
      setBusy(false);
    }
  };
  const officers = (meta?.officers ?? []).filter((o) => o.bureau === bureau);
  return (
    <div className="mx-auto max-w-[1120px] space-y-4">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight text-white">Voice and text intake</h1>
        <p className="text-[13.5px] text-slate-400">Record or type a complaint in any supported language. The system translates, categorises, links the institution and suggests routing. You confirm before a case is created.</p>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-5">
          <VoiceIntake value={v} onChange={setV} />
          <div>
            <Label>Institution as named by the complainant (optional)</Label>
            <Input value={instText} onChange={(e) => setInstText(e.target.value)} placeholder="Name, acronym or city" />
          </div>
          <Button variant="primary" onClick={analyse} loading={busy} disabled={v.text.trim().length < 15}>
            <Wand2 className="h-4 w-4" /> Process complaint
          </Button>
        </Card>
        {p ? (
          <Card>
            <CardHeader title="Review and confirm" sub={<>Every value below is a suggestion. <Advisory /></>} />
            <div className="space-y-3 px-5 pb-5">
              <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2">
                <div className="text-[12px] text-slate-500">English ({p.source === "original" ? "as given" : p.source === "sample" ? "reviewed sample translation" : p.source === "llm" ? "machine-translated" : "offline, needs an official to read the original"})</div>
                <p className="mt-0.5 text-[13.5px] leading-relaxed text-slate-200">{p.translation}</p>
                {p.language !== "English" && (
                  <>
                    <div className="mt-2 text-[12px] text-slate-500">Original ({p.language}), stored with the case</div>
                    <p dir="auto" className="mt-0.5 text-[13.5px] text-slate-300">{p.original}</p>
                  </>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Category <span className="text-slate-600">({p.categoryReason})</span></Label>
                  <Select
                    value={category}
                    onChange={(e) => {
                      const c = e.target.value as Category;
                      setCategory(c);
                      reroute(c, institutionId);
                    }}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Severity</Label>
                  <div className="flex h-10 items-center gap-2">
                    <SeverityDot s={p.severity} /> <span className="truncate text-[12px] text-slate-500">{p.severityReason}</span>
                  </div>
                </div>
              </div>
              <div>
                <Label>Institution <span className="text-slate-600">({p.institutionReason})</span></Label>
                <Select
                  value={institutionId}
                  onChange={(e) => {
                    setInst(e.target.value);
                    reroute(category, e.target.value);
                  }}
                >
                  <option value="">Choose</option>
                  {(meta?.colleges ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              {routing && (
                <div className={cn("rounded-lg border px-3 py-2 text-[13px]", routing.caution ? "border-violet-300/35 bg-violet-500/10" : "border-sky-300/25 bg-sky-400/[0.06]")}>
                  <div className="mb-1 flex flex-wrap items-center gap-2 font-medium text-white">
                    Suggested: {routing.bureau} <ArrowRight className="h-3.5 w-3.5" /> {routing.officers.find((o) => o.id === routing.officerId)?.name} <Advisory />
                    {routing.caution && <Badge tone="violet">Possible overlap</Badge>}
                  </div>
                  <ul className="list-disc space-y-0.5 pl-5 text-[12.5px] text-slate-300">
                    {routing.why.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Bureau / cell (your decision)</Label>
                  <Select
                    value={bureau}
                    onChange={(e) => {
                      const b = e.target.value as BureauCode;
                      setBureau(b);
                      setOfficer(meta?.officers.find((o) => o.bureau === b)?.id ?? "");
                    }}
                  >
                    {(meta?.bureaus ?? []).map((b) => (
                      <option key={b.code} value={b.code}>
                        {b.code} — {b.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Officer (your decision)</Label>
                  <Select value={officerId} onChange={(e) => setOfficer(e.target.value)}>
                    {officers.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <Button variant="emerald" onClick={create} loading={busy} disabled={!institutionId || !officerId}>
                <CheckCircle2 className="h-4 w-4" /> Confirm and create case
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="p-8 text-center text-[13.5px] text-slate-400">The translation, category, institution and routing suggestion appear here for you to confirm. Try “Use sample voice complaint”.</Card>
        )}
      </div>
    </div>
  );
}
