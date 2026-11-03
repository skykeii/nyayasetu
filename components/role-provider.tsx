"use client";
import * as React from "react";
import type { BureauCode, Category, Officer, Region, RoleKey, Settings, Status } from "@/lib/types";
import type { RoleDef } from "@/lib/roles";

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
  storage: "file" | "supabase" | "memory";
}

interface Ctx {
  role: RoleKey;
  region: Region;
  officerId: string;
  institutionId: string | null;
  meta: Meta;
  api: <T = unknown>(path: string, init?: RequestInit) => Promise<T>;
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

/** Same-origin JSON fetch; the session cookie travels automatically. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { ...init, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith("/api/auth/")) window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  if (!res.ok) throw Object.assign(new Error((data as { error?: string }).error ?? `Request failed (${res.status})`), { status: res.status, data });
  return data as T;
}

export async function signOutNow() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
  window.location.href = "/login";
}

export function RoleProvider({ children, onToast }: { children: React.ReactNode; onToast: (t: Toast) => void }) {
  const [meta, setMeta] = React.useState<Meta | null>(null);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    apiFetch<Meta>("/api/meta").then(setMeta).catch(() => undefined);
  }, [tick]);

  if (!meta) return null;
  const value: Ctx = {
    role: meta.viewer.role.key,
    region: meta.viewer.region,
    officerId: meta.viewer.officerId,
    institutionId: meta.viewer.institutionId ?? null,
    meta,
    api: apiFetch,
    tick,
    bump: () => setTick((t) => t + 1),
    toast: onToast,
  };
  return <RoleCtx.Provider value={value}>{children}</RoleCtx.Provider>;
}

/** Calls fn every `interval` ms while the tab is visible, and at once when the tab or window comes back. */
export function usePoll(fn: () => void, interval?: number) {
  const ref = React.useRef(fn);
  ref.current = fn;
  React.useEffect(() => {
    if (!interval) return;
    const id = setInterval(() => document.visibilityState === "visible" && ref.current(), interval);
    const back = () => document.visibilityState === "visible" && ref.current();
    window.addEventListener("focus", back);
    document.addEventListener("visibilitychange", back);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", back);
      document.removeEventListener("visibilitychange", back);
    };
  }, [interval]);
}

/** Fetch JSON (never cached); optional polling. Keeps previous data while refreshing. */
export function useApi<T>(path: string | null, opts: { interval?: number } = {}) {
  const { api, tick } = useRole();
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [updatedAt, setUpdatedAt] = React.useState<number | null>(null);
  const [n, setN] = React.useState(0);
  const lastKey = React.useRef<string>("");
  const latest = React.useRef(0);

  const run = React.useCallback(() => {
    if (!path) return;
    // a slow older response must not overwrite a newer one
    const seq = ++latest.current;
    api<T>(path)
      .then((d) => {
        if (seq !== latest.current) return;
        setData(d);
        setError(null);
        setUpdatedAt(Date.now());
      })
      .catch((e: Error) => seq === latest.current && setError(e.message))
      .finally(() => seq === latest.current && setLoading(false));
  }, [api, path]);

  React.useEffect(() => {
    if (!path) return;
    if (lastKey.current !== path) {
      setLoading(true);
      lastKey.current = path;
    }
    run();
    return () => {
      latest.current++;
    };
  }, [path, n, tick, run]);
  usePoll(run, opts.interval);

  return { data, error, loading: loading && !data, updatedAt, reload: () => setN((x) => x + 1) };
}
