"use client";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import * as React from "react";
import { Loader2 } from "lucide-react";

export const cn = (...a: ClassValue[]) => twMerge(clsx(a));

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "violet" | "emerald";
const BTN: Record<BtnVariant, string> = {
  primary: "bg-saffron text-[#1a0f02] hover:bg-saffron-300 font-semibold shadow-[0_0_0_1px_rgba(255,153,51,0.4),0_8px_24px_-8px_rgba(255,153,51,0.5)]",
  secondary: "bg-white/[0.06] text-slate-100 hover:bg-white/[0.1] border border-white/10",
  ghost: "text-slate-300 hover:bg-white/[0.06] hover:text-white",
  danger: "bg-red-500/15 text-red-300 border border-red-400/30 hover:bg-red-500/25",
  violet: "bg-violet-500/20 text-violet-200 border border-violet-400/40 hover:bg-violet-500/30",
  emerald: "bg-emerald-500/15 text-emerald-200 border border-emerald-400/35 hover:bg-emerald-500/25",
};

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md"; loading?: boolean }
>(function Button({ className, variant = "secondary", size = "md", loading, children, disabled, ...p }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
        size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm",
        BTN[variant],
        className
      )}
      {...p}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
});

export function Card({ className, children, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("glass rounded-2xl", className)} {...p}>
      {children}
    </div>
  );
}

export function CardHeader({ title, sub, right, className }: { title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-5 pt-4 pb-3", className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-white">{title}</h3>
        {sub && <p className="mt-0.5 text-[13px] text-slate-400">{sub}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

export function Badge({ className, children, tone = "slate" }: { className?: string; children: React.ReactNode; tone?: "slate" | "red" | "amber" | "emerald" | "violet" | "indigo" | "saffron" | "sky" }) {
  const t = {
    slate: "bg-white/[0.06] text-slate-300 border-white/10",
    red: "bg-red-500/10 text-red-300 border-red-400/30",
    amber: "bg-amber-400/10 text-amber-200 border-amber-300/30",
    emerald: "bg-emerald-400/10 text-emerald-200 border-emerald-300/30",
    violet: "bg-violet-400/15 text-violet-200 border-violet-300/35",
    indigo: "bg-indigo-400/10 text-indigo-200 border-indigo-300/30",
    saffron: "bg-orange-400/10 text-orange-200 border-orange-300/30",
    sky: "bg-sky-400/10 text-sky-200 border-sky-300/30",
  }[tone];
  return <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11.5px] font-medium leading-4 whitespace-nowrap", t, className)}>{children}</span>;
}

const field = "h-10 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-saffron/60 focus:outline-none focus:ring-2 focus:ring-saffron/20";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn(field, className)} {...p} />;
});

const CHEVRON = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238b93ab' stroke-width='2'><path d='m6 9 6 6 6-6'/></svg>")`;

export function Select({ className, children, style, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(field, "appearance-none pr-8", className)}
      style={{ backgroundImage: CHEVRON, backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center", backgroundSize: "14px", ...style }}
      {...p}
    >
      {children}
    </select>
  );
}

export function Textarea({ className, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(field, "h-auto min-h-[84px] py-2 leading-relaxed", className)} {...p} />;
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-lg bg-white/[0.05]", className)}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
    </div>
  );
}

export function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <label className={cn("mb-1.5 block text-[12.5px] font-medium text-slate-400", className)}>{children}</label>;
}

export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { key: T; label: React.ReactNode }[]; className?: string }) {
  return (
    <div role="tablist" className={cn("flex flex-wrap gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1", className)}>
      {items.map((it) => (
        <button
          key={it.key}
          role="tab"
          aria-selected={value === it.key}
          onClick={() => onChange(it.key)}
          className={cn("rounded-lg px-3 py-1.5 text-[13px] transition-colors", value === it.key ? "bg-white/[0.1] text-white" : "text-slate-400 hover:text-slate-200")}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Advisory({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <span title="Machine-generated suggestion. A human official must decide." className={cn("inline-flex items-center gap-1 rounded border border-sky-300/30 bg-sky-400/10 px-1.5 py-[1px] text-[11px] font-medium text-sky-200", className)}>
      Advisory{children ? <>: {children}</> : null}
    </span>
  );
}
