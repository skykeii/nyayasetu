"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Building2, ClipboardList, FileBarChart2, GitMerge, GraduationCap, LayoutDashboard, Mic, Plus, School, Search, Settings2, ShieldCheck, UserCircle2, X, ChevronDown } from "lucide-react";
import { RoleProvider, useApi, useRole, type Toast } from "./role-provider";
import { Button, Select, cn } from "./ui";
import { OverlapPulse } from "./bits";
import { ROLES, ROLE_KEYS } from "@/lib/roles";
import type { Region, RoleKey } from "@/lib/types";
import type { Alert } from "@/lib/server";
import { fmtDateTime } from "@/lib/util";

const NAV = [
  { href: "/", label: "Command center", icon: LayoutDashboard },
  { href: "/college", label: "College desk", icon: School },
  { href: "/cases", label: "Cases", icon: ClipboardList },
  { href: "/intake", label: "Voice and text intake", icon: Mic },
  { href: "/institutions", label: "Institutions", icon: Building2 },
  { href: "/overlaps", label: "Overlaps", icon: GitMerge },
  { href: "/grievances", label: "Student grievances", icon: GraduationCap },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/reports", label: "Reports", icon: FileBarChart2 },
  { href: "/audit", label: "Audit trail", icon: ShieldCheck },
  { href: "/settings", label: "SLA settings", icon: Settings2 },
];

export function BridgeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <defs>
        <linearGradient id="nm" x1="0" x2="1">
          <stop offset="0" stopColor="#FF9933" />
          <stop offset="0.5" stopColor="#A78BFA" />
          <stop offset="1" stopColor="#34D399" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="10" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.12)" />
      <path d="M7 27 Q20 8 33 27" fill="none" stroke="url(#nm)" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M6 27.5 H34" stroke="#e7eaf3" strokeWidth="2" strokeLinecap="round" />
      {[12, 16.5, 20, 23.5, 28].map((x, i) => (
        <path key={x} d={`M${x} 27 V${[21.5, 18.2, 17.4, 18.2, 21.5][i]}`} stroke="#8b93ab" strokeWidth="1.2" />
      ))}
    </svg>
  );
}

function Toaster({ items, dismiss }: { items: (Toast & { id: number })[]; dismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed bottom-14 right-4 z-[80] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      <AnimatePresence initial={false}>
        {items.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40 }}
            className={cn(
              "glass-strong pointer-events-auto rounded-xl px-4 py-3 shadow-2xl",
              t.tone === "violet" && "border-violet-400/50 shadow-violet-900/40",
              t.tone === "red" && "border-red-400/40",
              t.tone === "emerald" && "border-emerald-400/40"
            )}
          >
            <div className="flex items-start gap-3">
              {t.tone === "violet" && <OverlapPulse className="mt-1.5 shrink-0" />}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-white">{t.title}</div>
                {t.body && <div className="mt-0.5 text-[13px] text-slate-300">{t.body}</div>}
                {t.href && (
                  <Link href={t.href} className="mt-1 inline-block text-[13px] font-medium text-saffron hover:underline" onClick={() => dismiss(t.id)}>
                    Review now
                  </Link>
                )}
              </div>
              <button aria-label="Dismiss" onClick={() => dismiss(t.id)} className="text-slate-500 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  // students sign in separately and never see the officer shell or send role headers
  if (path === "/student" || path.startsWith("/student/")) return <>{children}</>;
  return <OfficerShell>{children}</OfficerShell>;
}

function OfficerShell({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<(Toast & { id: number })[]>([]);
  const dismiss = React.useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = React.useCallback(
    (t: Toast) => {
      const id = Date.now() + Math.random();
      setToasts((x) => [...x.slice(-3), { ...t, id }]);
      setTimeout(() => dismiss(id), 7000);
    },
    [dismiss]
  );
  return (
    <RoleProvider onToast={push}>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1 px-4 pb-20 pt-5 md:px-6 xl:px-8">{children}</main>
          <footer className="no-print fixed bottom-0 left-0 right-0 z-30 flex items-center justify-between gap-3 border-t border-white/[0.06] bg-[#0A0F1E]/85 px-4 py-2 text-[12px] text-slate-400 backdrop-blur md:pl-[84px] lg:pl-[256px]">
            <span className="inline-flex items-center gap-2">
              <span className="rounded border border-amber-300/40 bg-amber-400/10 px-1.5 py-0.5 font-semibold text-amber-200">Synthetic demo data</span>
              <span className="hidden sm:inline">Fictional institutions and complainants. Not connected to any AICTE system.</span>
            </span>
            <span className="hidden md:inline">Machine suggestions are advisory. Every action is an official&apos;s recorded decision.</span>
          </footer>
        </div>
      </div>
      <Toaster items={toasts} dismiss={dismiss} />
    </RoleProvider>
  );
}

function Sidebar() {
  const path = usePathname();
  const { role } = useRole();
  const { data } = useApi<{ unread: number; counts: Record<string, number> }>("/api/alerts?limit=1", { interval: 5000 });
  const allowed = ROLES[role].nav;
  return (
    <aside className="no-print sticky top-0 z-40 hidden h-screen w-[68px] shrink-0 flex-col border-r border-white/[0.06] bg-[#0A0F1E]/70 backdrop-blur-xl md:flex lg:w-60">
      <Link href={allowed[0]} className="flex items-center gap-3 px-4 pb-5 pt-5">
        <BridgeMark className="h-9 w-9 shrink-0" />
        <div className="hidden min-w-0 lg:block">
          <div className="text-[17px] font-bold tracking-tight text-white">NyayaSetu</div>
          <div className="truncate text-[11.5px] leading-tight text-slate-400">One window for every institution complaint</div>
        </div>
      </Link>
      <nav className="flex flex-1 flex-col gap-0.5 px-2.5">
        {NAV.filter((n) => allowed.includes(n.href)).map((n) => {
          const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
          const badge = n.href === "/overlaps" ? data?.counts?.overlap : n.href === "/alerts" ? data?.unread : undefined;
          return (
            <Link
              key={n.href}
              href={n.href}
              title={n.label}
              className={cn(
                "group relative flex h-10 items-center gap-3 rounded-lg px-3 text-[14px] transition-colors",
                active ? "bg-white/[0.07] text-white" : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100"
              )}
            >
              {active && <motion.span layoutId="navbar" className="absolute left-0 top-2 h-6 w-[3px] rounded-r bg-saffron" />}
              <n.icon className={cn("h-[18px] w-[18px] shrink-0", active && "text-saffron")} />
              <span className="hidden lg:inline">{n.label}</span>
              {!!badge && (
                <span className={cn("num ml-auto hidden rounded-full px-1.5 text-[11px] font-semibold lg:inline", n.href === "/overlaps" ? "bg-violet-500/25 text-violet-200" : "bg-red-500/20 text-red-200")}>{badge}</span>
              )}
              {!!badge && <span className={cn("absolute right-2 top-2 h-1.5 w-1.5 rounded-full lg:hidden", n.href === "/overlaps" ? "bg-violet-400" : "bg-red-400")} />}
            </Link>
          );
        })}
      </nav>
      <div className="hidden px-4 pb-14 text-[11.5px] leading-relaxed text-slate-500 lg:block">
        SIH 2026 · PS SIH26264
        <br />
        AICTE, Ministry of Education
      </div>
    </aside>
  );
}

function RoleSwitcher() {
  const { role, region, officerId, institutionId, setRole, meta } = useRole();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const def = ROLES[role];
  const officers = (meta?.officers ?? []).filter((o) =>
    role === "ca" ? o.id === "CA-1" : role === "ro" ? o.bureau === "RO" && o.region === region : def.bureaus !== "all" && def.bureaus.includes(o.bureau as never)
  );
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex h-10 items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.04] pl-2 pr-2.5 text-left hover:bg-white/[0.07]" aria-expanded={open}>
        <UserCircle2 className="h-6 w-6 text-saffron" />
        <span className="hidden min-w-0 sm:block">
          <span className="block max-w-[180px] truncate text-[13px] font-medium leading-tight text-white">{meta?.viewer.officerName ?? "…"}</span>
          <span className="block max-w-[180px] truncate text-[11.5px] leading-tight text-slate-400">
            {def.short}
            {role === "ro" ? `, ${region}` : ""}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="glass-strong absolute right-0 top-12 z-50 w-80 rounded-xl p-4 shadow-2xl">
            <div className="mb-3 text-[13px] text-slate-300">Demo sign-in. Choose who you are; the server enforces what this role can see and do.</div>
            <div className="space-y-1">
              {ROLE_KEYS.map((k) => (
                <button
                  key={k}
                  onClick={() => setRole(k as RoleKey, undefined, null)}
                  className={cn("flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13.5px]", role === k ? "bg-saffron/15 text-white ring-1 ring-saffron/40" : "text-slate-300 hover:bg-white/[0.05]")}
                >
                  {ROLES[k as RoleKey].label}
                </button>
              ))}
            </div>
            {role === "ro" && (
              <div className="mt-3">
                <div className="mb-1 text-[12px] text-slate-400">Region</div>
                <Select value={region} onChange={(e) => setRole("ro", e.target.value as Region, null)}>
                  {(meta?.regions ?? []).map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </Select>
              </div>
            )}
            {role === "college" && (
              <div className="mt-3">
                <div className="mb-1 text-[12px] text-slate-400">College</div>
                <Select value={institutionId ?? meta?.viewer.institutionId ?? ""} onChange={(e) => setRole("college", undefined, null, e.target.value)}>
                  {(meta?.colleges ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            {officers.length > 1 && (
              <div className="mt-3">
                <div className="mb-1 text-[12px] text-slate-400">Acting officer</div>
                <Select value={officerId ?? meta?.viewer.officerId ?? ""} onChange={(e) => setRole(role, region, e.target.value)}>
                  {officers.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} — {o.designation}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Bell2() {
  const { api, toast, bump } = useRole();
  const { data, reload } = useApi<{ items: Alert[]; unread: number; counts: Record<string, number> }>("/api/alerts?limit=7", { interval: 5000 });
  const [open, setOpen] = React.useState(false);
  const seen = React.useRef<Set<string> | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!data) return;
    const ids = new Set(data.items.map((a) => a.id));
    if (seen.current) {
      const fresh = data.items.find((a) => !seen.current!.has(a.id) && !a.read && (a.type === "overlap" || a.type === "duplicate"));
      if (fresh) toast({ title: fresh.title, body: fresh.message, tone: "violet", href: fresh.href });
    }
    seen.current = new Set([...(seen.current ?? []), ...ids]);
  }, [data, toast]);
  React.useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const tone = (s: Alert["severity"], t: Alert["type"]) => (t === "overlap" || t === "duplicate" ? "bg-violet-400" : s === "critical" ? "bg-red-500" : s === "high" ? "bg-red-400" : s === "medium" ? "bg-amber-300" : "bg-sky-300");
  return (
    <div className="relative" ref={ref}>
      <button aria-label="Notifications" onClick={() => setOpen((o) => !o)} className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.07]">
        <Bell className="h-[18px] w-[18px] text-slate-200" />
        {!!data?.unread && <span className="num absolute -right-1.5 -top-1.5 min-w-[20px] rounded-full bg-red-500 px-1 text-center text-[11px] font-bold leading-5 text-white">{data.unread > 99 ? "99+" : data.unread}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="glass-strong absolute right-0 top-12 z-50 w-[380px] max-w-[calc(100vw-2rem)] rounded-xl shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="text-sm font-semibold text-white">Notifications</span>
              <button
                className="text-[12.5px] text-slate-400 hover:text-white"
                onClick={async () => {
                  await api("/api/alerts", { method: "POST", body: JSON.stringify({ all: true }), headers: { "Content-Type": "application/json" } });
                  reload();
                  bump();
                }}
              >
                Mark all read
              </button>
            </div>
            <div className="scroll-thin max-h-[420px] overflow-y-auto">
              {data?.items.map((a) => (
                <Link key={a.id} href={a.href} onClick={() => setOpen(false)} className={cn("flex gap-3 border-b border-white/[0.05] px-4 py-3 hover:bg-white/[0.04]", a.read && "opacity-60")}>
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", tone(a.severity, a.type))} />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-white">{a.title}</span>
                    <span className="block truncate text-[12.5px] text-slate-400">{a.message}</span>
                    <span className="block text-[11.5px] text-slate-500">{fmtDateTime(a.at)}</span>
                  </span>
                </Link>
              ))}
            </div>
            <Link href="/alerts" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-center text-[13px] font-medium text-saffron hover:bg-white/[0.04]">
              Open all alerts
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Topbar() {
  const router = useRouter();
  const path = usePathname();
  const { role, api, toast, bump } = useRole();
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const allowed = ROLES[role].nav;
  React.useEffect(() => {
    const base = "/" + (path.split("/")[1] ?? "");
    if (!allowed.includes(base === "/" ? "/" : base)) router.replace(allowed[0]);
  }, [role, path, allowed, router]);
  const simulate = async () => {
    setBusy(true);
    try {
      const r = await api<{ id: string; bureau: string; category: string; institution: string; overlapWith?: string }>("/api/simulate", { method: "POST" });
      toast({ title: `New case ${r.id} received at ${r.bureau}`, body: `${r.category} · ${r.institution}`, href: `/cases?open=${r.id}` });
      bump();
    } catch (e) {
      toast({ title: "Could not simulate case", body: (e as Error).message, tone: "red" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-white/[0.06] bg-[#0A0F1E]/75 px-4 backdrop-blur-xl md:px-6 xl:px-8">
      <Link href="/" className="md:hidden">
        <BridgeMark className="h-8 w-8" />
      </Link>
      <form
        className={cn("relative max-w-md flex-1", role === "college" && "invisible")}
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`/cases?q=${encodeURIComponent(q.trim())}`);
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search case ID, Permanent ID, institution, reference"
          aria-label="Search cases"
          className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.04] pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-saffron/50 focus:outline-none"
        />
      </form>
      <div className="ml-auto flex items-center gap-2">
        {ROLES[role].can.simulate && (
          <Button variant="primary" onClick={simulate} loading={busy} className="hidden sm:inline-flex">
            {!busy && <Plus className="h-4 w-4" />}
            Simulate incoming case
          </Button>
        )}
        <Bell2 />
        <RoleSwitcher />
      </div>
    </header>
  );
}
