"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, TriangleAlert, Wand2 } from "lucide-react";
import { useRole } from "@/components/role-provider";
import { Advisory, Badge, Button, Card, CardHeader, Input, Label, Select, Textarea, cn } from "@/components/ui";
import { BureauChip, Confidence } from "@/components/bits";
import { VoiceIntake, type VoiceValue } from "@/components/voice-intake";
import { AiExplain } from "@/components/ai-explain";
import type { Processed, RoutingSuggestion, SimilarCase } from "@/lib/student";
import { CATEGORIES, type BureauCode, type Category, type Severity } from "@/lib/types";

type Preview = Processed & { subject: string; original: string; language: string; institutionId: string | null; institutionReason: string; routing: RoutingSuggestion | null; similar: SimilarCase[] };

const CHANNELS = [
  ["Letter", "Letter"],
  ["Email", "Email"],
  ["CPGRAMS", "CPGRAMS"],
  ["Phone", "Phone"],
  ["Walk-in", "Walk-in"],
  ["AICTE Portal", "Portal"],
] as const;
const TYPES = ["Student", "Parent", "Faculty", "Staff", "Other", "Anonymous"] as const;

export default function IntakePage() {
  const { api, toast, meta, bump } = useRole();
  const router = useRouter();
  const [v, setV] = React.useState<VoiceValue>({ text: "", language: "hi-IN", channel: "Voice" });
  const [channel, setChannel] = React.useState<(typeof CHANNELS)[number][0]>("Letter");
  const [type, setType] = React.useState<(typeof TYPES)[number]>("Student");
  const [complainant, setComplainant] = React.useState("");
  const [contact, setContact] = React.useState("");
  const [instQuery, setInstQuery] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [p, setP] = React.useState<Preview | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [institutionId, setInst] = React.useState("");
  const [category, setCategory] = React.useState<Category>("Infrastructure");
  const [severity, setSeverity] = React.useState<Severity>("Medium");
  const [subject, setSubject] = React.useState("");
  const [translation, setTranslation] = React.useState("");
  const [bureau, setBureau] = React.useState<BureauCode>("AB");
  const [officerId, setOfficer] = React.useState("");
  const [routing, setRouting] = React.useState<RoutingSuggestion | null>(null);
  const [similar, setSimilar] = React.useState<SimilarCase[]>([]);
  const [decision, setDecision] = React.useState<"new" | "link" | "duplicate" | "">("");
  const [targetId, setTarget] = React.useState("");
  const [lead, setLead] = React.useState<BureauCode>("RB");
  const [remarks, setRemarks] = React.useState("");
  const post = <T,>(body: object) => api<T>("/api/intake", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const applyRouting = (r: RoutingSuggestion | null) => {
    setRouting(r);
    if (r) {
      setBureau(r.bureau);
      setOfficer(r.officerId);
    }
  };
  const applySimilar = (s: SimilarCase[]) => {
    setSimilar(s);
    setDecision("");
    setTarget(s[0]?.caseId ?? "");
    setLead(s[0]?.bureau ?? "RB");
  };
  const analyse = async () => {
    setBusy(true);
    try {
      const r = await post<Preview>({ action: "preview", text: v.text, language: v.language, sampleId: v.sampleId, institutionText: instQuery || undefined });
      setP(r);
      setInst(r.institutionId ?? "");
      setCategory(r.category);
      setSeverity(r.severity);
      setSubject(r.subject);
      setTranslation(r.translation);
      applyRouting(r.routing);
      applySimilar(r.similar);
    } catch (e) {
      toast({ title: "Could not process", body: (e as Error).message, tone: "red" });
    } finally {
      setBusy(false);
    }
  };
  const recheck = async (cat: Category, inst: string) => {
    if (!inst) {
      applyRouting(null);
      return applySimilar([]);
    }
    try {
      const r = await post<{ routing: RoutingSuggestion; similar: SimilarCase[] }>({ action: "route", text: v.text, language: v.language, sampleId: v.sampleId, category: cat, institutionId: inst, translation, subject });
      applyRouting(r.routing);
      applySimilar(r.similar);
    } catch (e) {
      toast({ title: "Could not refresh", body: (e as Error).message, tone: "red" });
    }
  };
  const create = async () => {
    if (!p) return;
    setBusy(true);
    const form = new FormData();
    form.set(
      "payload",
      JSON.stringify({ text: v.text, language: v.language, sampleId: v.sampleId, translation, translationSource: p.source, subject, summary: p.summary, institutionId, category, severity, bureau, officerId, channel, complainantType: type, complainantName: complainant || undefined, contact: contact || undefined, decision: decision ? { type: decision, targetId: decision === "new" ? undefined : targetId, leadBureau: decision === "link" ? lead : undefined, remarks } : undefined })
    );
    files.forEach((f) => form.append("files", f));
    try {
      const r = await api<{ id: string; bureau: string; institution: string; status: string; duplicateOf?: string }>("/api/intake", { method: "POST", body: form });
      toast({ title: r.duplicateOf ? `Logged ${r.id} as a duplicate of ${r.duplicateOf}` : `Case ${r.id} created at ${r.bureau}`, body: r.institution, tone: "emerald", href: `/cases?open=${r.id}` });
      bump();
      router.push(`/cases?open=${r.id}`);
    } catch (e) {
      const data = (e as { data?: { similar?: SimilarCase[] } }).data;
      if (data?.similar) applySimilar(data.similar);
      toast({ title: "Not created", body: (e as Error).message, tone: "red" });
    } finally {
      setBusy(false);
    }
  };
  const officers = meta.officers.filter((o) => o.bureau === bureau);
  const needsDecision = similar.length > 0;
  const decided = !needsDecision || (decision && remarks.trim().length >= 5);
  return (
    <div className="mx-auto max-w-[1180px] space-y-4">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight text-white">Officer intake</h1>
        <p className="text-[13.5px] text-slate-400">Log a complaint received by letter, email, CPGRAMS, phone or in person, for an external complainant. AI pre-fills the details and you can edit them. Every complaint is checked against all open cases before saving.</p>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Received via</Label>
              <Select value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}>
                {CHANNELS.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Complainant type</Label>
              <Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
                {TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </div>
            {type !== "Anonymous" && (
              <>
                <div>
                  <Label>Complainant name (optional)</Label>
                  <Input value={complainant} onChange={(e) => setComplainant(e.target.value)} />
                </div>
                <div>
                  <Label>Contact (optional)</Label>
                  <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Phone or email" />
                </div>
              </>
            )}
          </div>
          <VoiceIntake value={v} onChange={setV} />
          <div>
            <Label>Institution as named by the complainant (optional; name, acronym, city or Permanent ID)</Label>
            <Input value={instQuery} onChange={(e) => setInstQuery(e.target.value)} list="institution-list" />
            <datalist id="institution-list">
              {meta.colleges.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.id}
                </option>
              ))}
            </datalist>
          </div>
          <div>
            <Label>Attachments (PNG, JPG or PDF; 4 MB in total)</Label>
            <input type="file" multiple accept="image/png,image/jpeg,application/pdf" aria-label="Attachments" onChange={(e) => setFiles([...(e.target.files ?? [])])} className="text-[13px] text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-slate-100" />
          </div>
          <Button variant="primary" onClick={analyse} loading={busy} disabled={v.text.trim().length < 15}>
            <Wand2 className="h-4 w-4" /> Process complaint
          </Button>
        </Card>
        {p ? (
          <Card>
            <CardHeader title="Review and confirm" sub={<>Every value below is a suggestion you can edit. <Advisory /></>} />
            <div className="space-y-3 px-5 pb-5">
              <div>
                <Label>Summary</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div>
                <Label>English ({p.source === "original" ? "as given" : p.source === "sample" ? "reviewed sample translation" : p.source === "llm" ? "machine-translated" : "offline, an official should read the original"})</Label>
                <Textarea value={translation} onChange={(e) => setTranslation(e.target.value)} className="min-h-[72px]" />
                {p.language !== "English" && (
                  <p dir="auto" className="mt-1 text-[12.5px] text-slate-400">
                    Original ({p.language}), stored with the case: {p.original}
                  </p>
                )}
              </div>
              {p.cues.length > 0 && <div className="text-[12.5px] text-slate-400"><Advisory>AI urgency cues</Advisory> {p.cues.join(", ")}</div>}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Category <span className="text-slate-600">({p.categoryReason})</span></Label>
                  <Select
                    value={category}
                    onChange={(e) => {
                      const c = e.target.value as Category;
                      setCategory(c);
                      recheck(c, institutionId);
                    }}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Severity <span className="text-slate-600">({p.severityReason})</span></Label>
                  <Select value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>
                    {["Low", "Medium", "High", "Critical"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </Select>
                </div>
              </div>
              <div>
                <Label>Institution <span className="text-slate-600">({p.institutionReason})</span></Label>
                <Select
                  value={institutionId}
                  onChange={(e) => {
                    setInst(e.target.value);
                    recheck(category, e.target.value);
                  }}
                >
                  <option value="">Choose</option>
                  {meta.colleges.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.id})
                    </option>
                  ))}
                </Select>
              </div>
              {routing && (
                <div className={cn("rounded-lg border px-3 py-2 text-[13px]", routing.caution ? "border-violet-300/35 bg-violet-500/10" : "border-sky-300/25 bg-sky-400/[0.06]")}>
                  <div className="mb-1 flex flex-wrap items-center gap-2 font-medium text-white">
                    Suggested: {routing.bureau} <ArrowRight className="h-3.5 w-3.5" /> {routing.officers.find((o) => o.id === routing.officerId)?.name} <Advisory />
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
                      setOfficer(meta.officers.find((o) => o.bureau === b)?.id ?? "");
                    }}
                  >
                    {meta.bureaus.map((b) => (
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

              {needsDecision && (
                <section className="rounded-xl border border-violet-300/35 bg-violet-500/[0.08] p-3.5">
                  <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-violet-100">
                    <TriangleAlert className="h-4 w-4" /> Similar open cases found <Advisory />
                  </h3>
                  <ul className="mt-2 space-y-2">
                    {similar.map((s) => (
                      <li key={s.caseId} className="rounded-lg border border-white/[0.08] bg-black/10 p-2.5">
                        <label className="flex items-start gap-2">
                          <input type="radio" name="target" checked={targetId === s.caseId} onChange={() => { setTarget(s.caseId); setLead(s.bureau); }} className="mt-1 accent-violet-400" />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="num text-[13px] font-semibold text-white">{s.caseId}</span>
                              <BureauChip code={s.bureau} />
                              <Badge>{s.status}</Badge>
                              <Confidence value={s.confidence} />
                            </span>
                            <span className="block text-[13px] text-slate-200">{s.subject}</span>
                            <span className="block text-[12px] text-slate-400">{s.reasons.slice(0, 3).join(" · ")}</span>
                          </span>
                        </label>
                        <AiExplain a={s.caseId} draft={{ subject, text: translation, bureau }} score={s.confidence} reasons={s.reasons} />
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Decision">
                    {[
                      ["link", "Link as related"],
                      ["new", "File as new anyway"],
                      ["duplicate", "Mark duplicate"],
                    ].map(([k, l]) => (
                      <label key={k} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-[13px]", decision === k ? "border-violet-300 bg-violet-500/20 text-white" : "border-white/10 text-slate-300")}>
                        <input type="radio" name="decision" checked={decision === k} onChange={() => setDecision(k as typeof decision)} className="accent-violet-400" /> {l}
                      </label>
                    ))}
                  </div>
                  {decision === "link" && (
                    <div className="mt-2">
                      <Label>Lead unit</Label>
                      <Select value={lead} onChange={(e) => setLead(e.target.value as BureauCode)}>
                        {[...new Set([bureau, ...similar.map((s) => s.bureau)])].map((b) => (
                          <option key={b}>{b}</option>
                        ))}
                      </Select>
                    </div>
                  )}
                  <div className="mt-2">
                    <Label>Remarks (mandatory; written to the timeline and audit trail)</Label>
                    <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} className="min-h-[56px]" />
                  </div>
                </section>
              )}
              <Button variant="emerald" onClick={create} loading={busy} disabled={!institutionId || !officerId || !decided}>
                <CheckCircle2 className="h-4 w-4" /> Confirm and save
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="p-8 text-center text-[13.5px] text-slate-400">The translation, category, institution, routing and any similar open cases appear here for you to confirm. Try “Use sample voice complaint”.</Card>
        )}
      </div>
    </div>
  );
}
