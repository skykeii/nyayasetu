"use client";
import * as React from "react";
import { Paperclip, X } from "lucide-react";
import { cn } from "./ui";
import type { DocRef } from "@/lib/types";

export const MAX_FILE = 4 * 1024 * 1024; // matches lib/files.ts
const OK_TYPE = /\.(png|jpe?g|pdf)$/i;

/** Same rules as the server, checked before anything is sent. The server still checks the file contents. */
export function checkFiles(files: File[]): string | null {
  const wrong = files.find((f) => !OK_TYPE.test(f.name));
  if (wrong) return `${wrong.name}: only PNG, JPG and PDF files are accepted`;
  const big = files.find((f) => f.size > MAX_FILE);
  if (big) return `${big.name} is ${(big.size / 1048576).toFixed(1)} MB; each file must be 4 MB or smaller`;
  if (files.reduce((s, f) => s + f.size, 0) > MAX_FILE) return "Attachments must total 4 MB or less";
  return null;
}

/** POSTs a form and reports upload progress (fetch cannot). Rejects with the server's message. */
export function postForm<T>(url: string, form: FormData, onProgress: (pct: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      const body = (xhr.response ?? {}) as { error?: string };
      if (xhr.status === 401) window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else reject(new Error(xhr.status === 413 ? "The upload is too large; keep attachments under 4 MB in total" : body.error ?? `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload failed: check the connection and try again"));
    xhr.send(form);
  });
}

export function FilePicker({ files, onChange, label, disabled }: { files: File[]; onChange: (f: File[]) => void; label: string; disabled?: boolean }) {
  const ref = React.useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-1.5">
      <input
        ref={ref}
        type="file"
        multiple
        disabled={disabled}
        accept="image/png,image/jpeg,application/pdf,.png,.jpg,.jpeg,.pdf"
        aria-label={label}
        onChange={(e) => {
          onChange([...files, ...(e.target.files ?? [])]);
          e.target.value = "";
        }}
        className="text-[14px] text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-slate-100"
      />
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[13px]", f.size > MAX_FILE || !OK_TYPE.test(f.name) ? "border-red-400/50 text-red-200" : "border-white/10 text-slate-200")}>
              <Paperclip className="h-3 w-3" /> {f.name} <span className="num text-slate-500">{(f.size / 1024).toFixed(0)} KB</span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => onChange(files.filter((_, j) => j !== i))} className="text-slate-500 hover:text-white">
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Progress({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  return (
    <div role="progressbar" aria-label="Upload progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="flex items-center gap-2 text-[13px] text-slate-400">
      <span className="h-1.5 w-40 overflow-hidden rounded-full bg-white/10">
        <span className="block h-full bg-saffron transition-[width]" style={{ width: `${pct}%` }} />
      </span>
      <span className="num">{pct < 100 ? `Uploading ${pct}%` : "Checking files"}</span>
    </div>
  );
}

export function DocLink({ d, base = "/api/files" }: { d: DocRef; base?: string }) {
  return d.file ? (
    <a href={`${base}/${d.file}`} className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[13px] text-slate-200 hover:border-saffron/50">
      <Paperclip className="h-3 w-3" /> {d.name}
    </a>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 text-[13px] text-slate-400">
      <Paperclip className="h-3 w-3" /> {d.name}
    </span>
  );
}
