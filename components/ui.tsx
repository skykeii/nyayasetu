"use client";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import * as React from "react";
import { Loader2 } from "lucide-react";

export const cn = (...a: ClassValue[]) => twMerge(clsx(a));

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "violet" | "emerald";
const BTN: Record<BtnVariant, string> = {
  primary: "bg-saffron text-paper hover:bg-saffron-600 font-semibold shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_6px_16px_-8px_rgba(166,85,11,0.6)]",
  secondary: "bg-paper text-slate-100 hover:bg-[#FBF4E8] border border-[#DDD0BB] shadow-[0_1px_2px_rgba(60,40,20,0.06)]",
  ghost: "text-slate-300 hover:bg-[#EFE6D6] hover:text-white",
  danger: "bg-red-500/10 text-red-300 border border-red-400/35 hover:bg-red-500/15",
  violet: "bg-violet-500 text-paper border border-violet-500 hover:bg-violet-400 font-semibold",
  emerald: "bg-emerald-500 text-paper border border-emerald-500 hover:bg-emerald-400 font-semibold",
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
        "inline-flex items-center justify-center gap-2 rounded-xl transition-[background-color,box-shadow,transform] duration-200 active:translate-y-px disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
        size === "sm" ? "h-9 px-3.5 text-[14px]" : "h-11 px-5 text-[15px]",
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
    <div className={cn("glass rounded-[20px]", className)} {...p}>
      {children}
    </div>
  );
}

export function CardHeader({ title, sub, right, className }: { title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-6 pt-5 pb-3", className)}>
      <div className="min-w-0">
        <h3 className="text-[19px] leading-tight text-white">{title}</h3>
        {sub && <p className="mt-1 max-w-[70ch] text-[14px] leading-snug text-slate-400">{sub}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

export function Badge({ className, children, tone = "slate" }: { className?: string; children: React.ReactNode; tone?: "slate" | "red" | "amber" | "emerald" | "violet" | "indigo" | "saffron" | "sky" }) {
  const t = {
    slate: "bg-[#F1E9DC] text-slate-300 border-[#E2D6C3]",
    red: "bg-red-500/10 text-red-300 border-red-400/30",
    amber: "bg-amber-400/10 text-amber-200 border-amber-300/30",
    emerald: "bg-emerald-400/10 text-emerald-200 border-emerald-300/30",
    violet: "bg-violet-400/15 text-violet-200 border-violet-300/35",
    indigo: "bg-indigo-400/10 text-indigo-200 border-indigo-300/30",
    saffron: "bg-orange-400/10 text-orange-200 border-orange-300/30",
    sky: "bg-sky-400/10 text-sky-200 border-sky-300/30",
  }[tone];
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-[3px] text-[13px] font-semibold leading-4 whitespace-nowrap", t, className)}>{children}</span>;
}

const field = "h-11 w-full rounded-xl border border-[#DDD0BB] bg-paper px-3.5 text-[15px] text-slate-100 shadow-[0_1px_2px_rgba(60,40,20,0.04)_inset] placeholder:text-slate-500 transition-shadow focus:border-saffron/70 focus:outline-none focus:ring-4 focus:ring-amber-400/25";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn(field, className)} {...p} />;
});

const CHEVRON = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364574A' stroke-width='2'><path d='m6 9 6 6 6-6'/></svg>")`;

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
    <div className={cn("relative overflow-hidden rounded-xl bg-[#EFE6D6]", className)}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-[#FBF6EC]/80 to-transparent" />
    </div>
  );
}

export function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <label className={cn("mb-1.5 block text-[14px] font-semibold text-slate-300", className)}>{children}</label>;
}

export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { key: T; label: React.ReactNode }[]; className?: string }) {
  return (
    <div role="tablist" className={cn("inline-flex max-w-full flex-wrap gap-1 rounded-2xl border border-[#E2D6C3] bg-[#EFE6D6]/70 p-1", className)}>
      {items.map((it) => (
        <button
          key={it.key}
          role="tab"
          aria-selected={value === it.key}
          onClick={() => onChange(it.key)}
          className={cn("rounded-xl px-3.5 py-1.5 text-[14.5px] font-medium transition-all", value === it.key ? "bg-paper text-white shadow-[0_1px_3px_rgba(60,40,20,0.12)]" : "text-slate-400 hover:text-slate-200")}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Advisory({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <span title="Machine-generated suggestion. A human official must decide." className={cn("inline-flex items-center gap-1 rounded-full border border-sky-300/40 bg-sky-400/10 px-2 py-[1px] text-[12.5px] font-semibold text-sky-200", className)}>
      Advisory{children ? <>: {children}</> : null}
    </span>
  );
}
