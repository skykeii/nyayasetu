"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, ClipboardList, CornerDownLeft, Search } from "lucide-react";
import { useRole } from "./role-provider";
import { Badge, cn } from "./ui";
import { ROLES } from "@/lib/roles";

interface Hit {
  key: string;
  label: string;
  sub?: string;
  href: string;
  kind: "Page" | "Case" | "Institution";
}

export function CommandPalette({ pages }: { pages: { href: string; label: string }[] }) {
  const { api, role } = useRole();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [remote, setRemote] = React.useState<Hit[]>([]);
  const [active, setActive] = React.useState(0);
  const input = React.useRef<HTMLInputElement>(null);
  const returnTo = React.useRef<HTMLElement | null>(null);
  const searchable = ROLES[role].nav.includes("/cases");

  React.useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => {
          if (!o) returnTo.current = document.activeElement as HTMLElement;
          return !o;
        });
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  React.useEffect(() => {
    if (open) {
      setQ("");
      setRemote([]);
      setActive(0);
      setTimeout(() => input.current?.focus(), 0);
    } else returnTo.current?.focus?.();
  }, [open]);
  React.useEffect(() => {
    const term = q.trim();
    if (!open || !searchable || term.length < 2) return setRemote([]);
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const [cases, insts] = await Promise.all([
          api<{ items: { id: string; subject: string; institutionName: string }[] }>(`/api/cases?q=${encodeURIComponent(term)}&pageSize=5`),
          api<{ items: { id: string; name: string; city: string; state: string }[] }>(`/api/institutions?q=${encodeURIComponent(term)}`),
        ]);
        if (!alive) return;
        setRemote([
          ...insts.items.slice(0, 5).map((i): Hit => ({ key: `i-${i.id}`, label: i.name, sub: `${i.id} · ${i.city}, ${i.state}`, href: `/institutions/${i.id}`, kind: "Institution" })),
          ...cases.items.map((c): Hit => ({ key: `c-${c.id}`, label: c.id, sub: `${c.subject} · ${c.institutionName}`, href: `/cases?open=${c.id}`, kind: "Case" })),
        ]);
      } catch {
        if (alive) setRemote([]);
      }
    }, 180);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, open, api, searchable]);

  const term = q.trim().toLowerCase();
  const hits: Hit[] = [...pages.filter((p) => !term || p.label.toLowerCase().includes(term)).map((p): Hit => ({ key: p.href, label: p.label, href: p.href, kind: "Page" })), ...remote];
  const go = (h?: Hit) => {
    if (!h) return;
    setOpen(false);
    router.push(h.href);
  };
  React.useEffect(() => setActive(0), [q, remote]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/55 px-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={() => setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label="Command palette" className="glass-strong w-full max-w-xl overflow-hidden rounded-xl shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 border-b border-white/10 px-4">
          <Search className="h-4 w-4 shrink-0 text-slate-500" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            role="combobox"
            aria-expanded
            aria-controls="palette-results"
            aria-activedescendant={hits[active] ? `palette-${hits[active].key}` : undefined}
            aria-label={searchable ? "Search pages, cases and institutions" : "Search pages"}
            placeholder={searchable ? "Go to a page, case or institution" : "Go to a page"}
            className="h-12 w-full bg-transparent text-[15px] text-white placeholder:text-slate-500 focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, hits.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") go(hits[active]);
            }}
          />
          <kbd className="rounded border border-white/15 px-1.5 py-0.5 text-[12px] text-slate-400">Esc</kbd>
        </div>
        <ul id="palette-results" role="listbox" className="scroll-thin max-h-[50vh] overflow-y-auto py-1">
          {hits.map((h, i) => (
            <li key={h.key} id={`palette-${h.key}`} role="option" aria-selected={i === active}>
              <button onMouseEnter={() => setActive(i)} onClick={() => go(h)} className={cn("flex w-full items-center gap-3 px-4 py-2 text-left", i === active && "bg-white/[0.08]")}>
                {h.kind === "Institution" ? <Building2 className="h-4 w-4 shrink-0 text-slate-400" /> : h.kind === "Case" ? <ClipboardList className="h-4 w-4 shrink-0 text-slate-400" /> : <CornerDownLeft className="h-4 w-4 shrink-0 text-slate-400" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] text-white">{h.label}</span>
                  {h.sub && <span className="block truncate text-[13px] text-slate-400">{h.sub}</span>}
                </span>
                <Badge>{h.kind}</Badge>
              </button>
            </li>
          ))}
          {hits.length === 0 && <li className="px-4 py-6 text-center text-[14.5px] text-slate-400">Nothing matches “{q}”.</li>}
        </ul>
      </div>
    </div>
  );
}
