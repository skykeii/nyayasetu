"use client";
import * as React from "react";
import { Mic, Sparkles, Square } from "lucide-react";
import { Button, Label, Select, Textarea, cn } from "./ui";
import { LANGUAGES, VOICE_SAMPLES, languageName, type LanguageCode } from "@/lib/intake";

interface SpeechResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}
interface Recognizer {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export interface VoiceValue {
  text: string;
  language: LanguageCode;
  sampleId?: string;
  channel: "Text" | "Voice";
}

/** Records with the Web Speech API. The sample button keeps the demo working when speech is unavailable. */
export function VoiceIntake({ value, onChange, allowTyping = true }: { value: VoiceValue; onChange: (v: VoiceValue) => void; allowTyping?: boolean }) {
  const [recording, setRecording] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const [supported, setSupported] = React.useState(true);
  const rec = React.useRef<Recognizer | null>(null);
  const turn = React.useRef(0);
  const latest = React.useRef(value);
  latest.current = value;

  const ctor = () => {
    const w = window as unknown as { SpeechRecognition?: new () => Recognizer; webkitSpeechRecognition?: new () => Recognizer };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition;
  };
  React.useEffect(() => setSupported(!!ctor()), []);
  React.useEffect(() => () => rec.current?.stop(), []);

  const start = () => {
    const C = ctor();
    if (!C) return;
    const r = new C();
    r.lang = value.language;
    r.continuous = true;
    r.interimResults = true;
    const base = value.text ? `${value.text} ` : "";
    r.onresult = (e) => {
      const said = Array.from(e.results as ArrayLike<ArrayLike<{ transcript: string }>>)
        .map((x) => x[0].transcript)
        .join(" ");
      onChange({ ...latest.current, text: base + said, sampleId: undefined, channel: "Voice" });
    };
    r.onerror = (e) => {
      setNote(`Speech recognition stopped (${e.error}). Use a sample complaint or type instead.`);
      setRecording(false);
    };
    r.onend = () => setRecording(false);
    rec.current = r;
    setNote(null);
    try {
      r.start();
      setRecording(true);
    } catch {
      setNote("Speech recognition could not start. Use a sample complaint or type instead.");
    }
  };
  const stop = () => {
    rec.current?.stop();
    setRecording(false);
  };
  const useSample = () => {
    const pool = VOICE_SAMPLES.filter((s) => s.code === value.language);
    const list = pool.length ? pool : VOICE_SAMPLES;
    const s = list[turn.current++ % list.length];
    onChange({ text: s.original, language: s.code, sampleId: s.id, channel: "Voice" });
    setNote(`Sample ${languageName(s.code)} complaint loaded. No microphone was used.`);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-40">
          <Label>Language</Label>
          <Select value={value.language} onChange={(e) => onChange({ ...value, language: e.target.value as LanguageCode, sampleId: undefined })}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </Select>
        </div>
        {recording ? (
          <Button variant="danger" onClick={stop} type="button">
            <Square className="h-4 w-4" /> Stop recording
          </Button>
        ) : (
          <Button variant="secondary" onClick={start} disabled={!supported} type="button" title={supported ? undefined : "This browser has no speech recognition"}>
            <Mic className="h-4 w-4" /> Record voice
          </Button>
        )}
        <Button variant="violet" onClick={useSample} type="button">
          <Sparkles className="h-4 w-4" /> Use sample voice complaint
        </Button>
        {recording && <span className="inline-flex items-center gap-2 text-[12.5px] text-red-300"><span className="h-2 w-2 animate-pulse rounded-full bg-red-400" /> Listening in {languageName(value.language)}</span>}
      </div>
      {!supported && <p className="text-[12.5px] text-slate-400">This browser has no speech recognition. Type the complaint or use a sample.</p>}
      {note && value.text && <p className="text-[12.5px] text-slate-400">{note}</p>}
      <div>
        <Label>{allowTyping ? "Complaint (typed, or the voice transcript; you can correct it)" : "Transcript"}</Label>
        <Textarea
          value={value.text}
          rows={5}
          dir="auto"
          placeholder="Describe the problem: what happened, where, and since when."
          className={cn("min-h-[120px]")}
          onChange={(e) => onChange({ ...value, text: e.target.value, sampleId: undefined, channel: value.channel })}
        />
      </div>
    </div>
  );
}
