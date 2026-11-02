"use client";
import * as React from "react";
import { Mic, Sparkles, Square } from "lucide-react";
import { Button, Label, Select, Textarea } from "./ui";
import { LANGUAGES, VOICE_SAMPLES, languageName, type LanguageCode } from "@/lib/intake";

const MAX_SECONDS = 60;
const MAX_BYTES = 4 * 1024 * 1024;

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

/** Records with MediaRecorder for Groq Whisper, falling back to Web Speech, a sample, or typing. */
export function VoiceIntake({ value, onChange }: { value: VoiceValue; onChange: (v: VoiceValue) => void }) {
  const [recording, setRecording] = React.useState(false);
  const [seconds, setSeconds] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const recorder = React.useRef<MediaRecorder | null>(null);
  const timer = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const speech = React.useRef<Recognizer | null>(null);
  const turn = React.useRef(0);
  const latest = React.useRef(value);
  latest.current = value;

  const speechCtor = () => {
    const w = window as unknown as { SpeechRecognition?: new () => Recognizer; webkitSpeechRecognition?: new () => Recognizer };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition;
  };
  React.useEffect(
    () => () => {
      recorder.current?.state === "recording" && recorder.current.stop();
      speech.current?.stop();
      if (timer.current) clearInterval(timer.current);
    },
    []
  );

  const startSpeech = (why: string) => {
    const C = speechCtor();
    if (!C) {
      setNote(`${why} This browser has no speech recognition either. Use a sample or type instead.`);
      return;
    }
    const r = new C();
    r.lang = latest.current.language;
    r.continuous = true;
    r.interimResults = true;
    const base = latest.current.text ? `${latest.current.text} ` : "";
    r.onresult = (e) => {
      const said = Array.from(e.results).map((x) => x[0].transcript).join(" ");
      onChange({ ...latest.current, text: base + said, sampleId: undefined, channel: "Voice" });
    };
    r.onerror = (e) => {
      setNote(`Speech recognition stopped (${e.error}). Use a sample complaint or type instead.`);
      setRecording(false);
    };
    r.onend = () => setRecording(false);
    speech.current = r;
    setNote(`${why} Using the browser's speech recognition instead.`);
    try {
      r.start();
      setRecording(true);
    } catch {
      setNote("Speech recognition could not start. Use a sample complaint or type instead.");
    }
  };

  const upload = async (blob: Blob, durationSec: number) => {
    setBusy(true);
    const form = new FormData();
    form.set("audio", new File([blob], "voice.webm", { type: blob.type || "audio/webm" }));
    form.set("language", latest.current.language);
    form.set("durationSec", String(Math.min(durationSec, 60)));
    try {
      const res = await fetch("/api/ai/transcribe", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "failed");
      const prior = latest.current.text ? `${latest.current.text} ` : "";
      onChange({ ...latest.current, text: prior + data.text, sampleId: undefined, channel: "Voice" });
      setNote("Transcribed by Groq Whisper. Check the text; you can correct it. Advisory.");
    } catch {
      setNote("AI transcription is unavailable. Press Record again for browser speech recognition, use a sample, or type.");
      noAi.current = true;
    } finally {
      setBusy(false);
    }
  };
  const noAi = React.useRef(false);

  const start = async () => {
    setNote(null);
    if (noAi.current || typeof MediaRecorder === "undefined") return startSpeech("Recording is not available.");
    const status = await fetch("/api/ai/status").then((r) => r.json()).catch(() => ({ stt: false }));
    if (!status.stt) return startSpeech("AI transcription is offline.");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      const began = Date.now();
      let size = 0;
      rec.ondataavailable = (e) => {
        chunks.push(e.data);
        size += e.data.size;
        if (size > MAX_BYTES * 0.95) stop();
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timer.current) clearInterval(timer.current);
        setRecording(false);
        const blob = new Blob(chunks, { type: rec.mimeType });
        if (blob.size > MAX_BYTES) return setNote("That recording is over 4 MB. Record a shorter one.");
        upload(blob, Math.round((Date.now() - began) / 1000));
      };
      recorder.current = rec;
      rec.start(1000);
      setRecording(true);
      setSeconds(0);
      timer.current = setInterval(() => {
        const s = Math.round((Date.now() - began) / 1000);
        setSeconds(s);
        if (s >= MAX_SECONDS) stop();
      }, 500);
    } catch {
      startSpeech("The microphone could not be used.");
    }
  };
  const stop = () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
    speech.current?.stop();
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
          <Button variant="secondary" onClick={start} type="button" loading={busy}>
            {!busy && <Mic className="h-4 w-4" />} {busy ? "Transcribing" : "Record voice"}
          </Button>
        )}
        <Button variant="violet" onClick={useSample} type="button">
          <Sparkles className="h-4 w-4" /> Use sample voice complaint
        </Button>
        {recording && (
          <span className="inline-flex items-center gap-2 text-[13.5px] text-red-300">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" /> Listening in {languageName(value.language)}
            {seconds > 0 && <span className="num">{seconds}s of {MAX_SECONDS}s</span>}
          </span>
        )}
      </div>
      {note && value.text !== undefined && <p className="text-[13.5px] text-slate-400">{note}</p>}
      <div>
        <Label>Complaint (typed, or the voice transcript; you can correct it)</Label>
        <Textarea value={value.text} rows={5} dir="auto" placeholder="Describe the problem: what happened, where, and since when." className="min-h-[120px]" onChange={(e) => onChange({ ...value, text: e.target.value, sampleId: undefined })} />
      </div>
    </div>
  );
}
