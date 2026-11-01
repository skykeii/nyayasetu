"use client";
import * as React from "react";
import type { BureauCode, Category, Officer, Region, RoleKey, Settings, Status } from "@/lib/types";
import { ROLE_KEYS, type RoleDef } from "@/lib/roles";

export interface Meta {
  viewer: { role: RoleDef; region: Region; officerId: string; officerName: string; designation?: string; institutionId?: string };
  officers: Officer[];
  bureaus: { code: BureauCode; name: string; short: string }[];
  regions: Region[];
  categories: Category[];
  statuses: Status[];
  settings: Settings;
  colleges: { id: string; name: string }[];
  seededAt: string;
  llm: boolean;
}

interface Ctx {
  role: RoleKey;
  region: Region;
  officerId: string | null;
  institutionId: string | null;
  setRole: (r: RoleKey, region?: Region, officerId?: string | null, institutionId?: string | null) => void;
  meta: Meta | null;
  api: <T = unknown>(path: string, init?: RequestInit) => Promise<T>;
  headers: Record<string, string>;
  tick: number;
  bump: () => void;
  toast: (t: Toast) => void;
}
export interface Toast {
  title: string;
  body?: string;
  tone?: "default" | "violet" | "red" | "emerald";
  href?: string;
}

const RoleCtx = React.createContext<Ctx | null>(null);
export const useRole = () => {
  const c = React.useContext(RoleCtx);
  if (!c) throw new Error("RoleProvider missing");
  return c;
};

const KEY = "nyayasetu.session";

export function RoleProvider({ children, onToast }: { children: React.ReactNode; onToast: (t: Toast) => void }) {
  const [state, setState] = React.useState<{ role: RoleKey; region: Region; officerId: string | null; institutionId: string | null }>({ role: "ca", region: "Southern", officerId: null, institutionId: null });
  const [meta, setMeta] = React.useState<Meta | null>(null);
  const [tick, setTick] = React.useState(0);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (ROLE_KEYS.includes(s.role)) setState({ institutionId: null, ...s });
      }
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  const headers = React.useMemo(() => {
    const h: Record<string, string> = { "x-role": state.role, "x-region": state.region };
    if (state.officerId) h["x-officer"] = state.officerId;
    if (state.institutionId) h["x-institution"] = state.institutionId;
    return h;
  }, [state]);

  const api = React.useCallback(
    async <T,>(path: string, init: RequestInit = {}) => {
      const res = await fetch(path, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) }, cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
      return data as T;
    },
    [headers]
  );

  React.useEffect(() => {
    if (!ready) return;
    api<Meta>("/api/meta").then(setMeta).catch(() => undefined);
  }, [api, ready, tick]);

  const setRole = React.useCallback((role: RoleKey, region?: Region, officerId?: string | null, institutionId?: string | null) => {
    setState((s) => {
      const next = { role, region: region ?? s.region, officerId: officerId === undefined ? (role === s.role ? s.officerId : null) : officerId, institutionId: institutionId === undefined ? s.institutionId : institutionId };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      const h: Record<string, string> = { "x-role": next.role, "x-region": next.region, "Content-Type": "application/json" };
      if (next.officerId) h["x-officer"] = next.officerId;
      if (next.institutionId) h["x-institution"] = next.institutionId;
      fetch("/api/audit", { method: "POST", headers: h, body: "{}" }).catch(() => undefined);
      return next;
    });
  }, []);

  const value: Ctx = {
    ...state,
    setRole,
    meta,
    api,
    headers,
    tick,
    bump: () => setTick((t) => t + 1),
    toast: onToast,
  };
  if (!ready) return null;
  return <RoleCtx.Provider value={value}>{children}</RoleCtx.Provider>;
}

/** Fetch JSON with role headers; optional polling. Keeps previous data while refreshing. */
export function useApi<T>(path: string | null, opts: { interval?: number } = {}) {
  const { api, headers, tick } = useRole();
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [n, setN] = React.useState(0);
  const hkey = JSON.stringify(headers);
  const lastKey = React.useRef<string>("");

  React.useEffect(() => {
    if (!path) return;
    let alive = true;
    const key = `${path}|${hkey}`;
    if (lastKey.current !== key) {
      if (lastKey.current.split("|")[1] !== hkey) setData(null);
      setLoading(true);
      lastKey.current = key;
    }
    const run = () =>
      api<T>(path)
        .then((d) => {
          if (!alive) return;
          setData(d);
          setError(null);
        })
        .catch((e: Error) => alive && setError(e.message))
        .finally(() => alive && setLoading(false));
    run();
    const id = opts.interval ? setInterval(run, opts.interval) : undefined;
    return () => {
      alive = false;
      if (id) clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, hkey, n, tick, opts.interval]);

  return { data, error, loading: loading && !data, reload: () => setN((x) => x + 1) };
}
