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
  if (res.status === 401 && !path.startsWith("/api/auth/")) window.location.href = "/login";
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

/** Fetch JSON; optional polling. Keeps previous data while refreshing. */
export function useApi<T>(path: string | null, opts: { interval?: number } = {}) {
  const { api, tick } = useRole();
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [n, setN] = React.useState(0);
  const lastKey = React.useRef<string>("");

  React.useEffect(() => {
    if (!path) return;
    let alive = true;
    if (lastKey.current !== path) {
      setLoading(true);
      lastKey.current = path;
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
  }, [path, n, tick, opts.interval]);

  return { data, error, loading: loading && !data, reload: () => setN((x) => x + 1) };
}
