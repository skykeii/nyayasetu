import crypto from "crypto";
import fs from "fs";
import path from "path";
import { AsyncLocalStorage } from "async_hooks";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AuditEntry, Db } from "./types";
import { SCHEMA_VERSION, seedDb } from "./seed";
import { addDays, iso } from "./util";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const CACHE_MS = 3000;
const DB_TIMEOUT = 25000;
const WRITE_ATTEMPTS = 5;
const TABLE = "app_state";

type Mutation = (db: Db) => unknown;
type Holder = { db: Db | null; schema: number; rowVersion: number; checkedAt: number };
const g = globalThis as unknown as { __nyayasetu?: Holder; __nyayasetuSb?: SupabaseClient | null };
const requestScope = new AsyncLocalStorage<{ pending: Mutation[] }>();

export function supabaseClient(): SupabaseClient | null {
  if (g.__nyayasetuSb !== undefined) return g.__nyayasetuSb;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  g.__nyayasetuSb = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(DB_TIMEOUT) }) } }) : null;
  return g.__nyayasetuSb;
}

/** Hosted without Supabase there is no writable disk, so state lives only in memory. */
export function storageMode(): "supabase" | "file" | "memory" {
  if (supabaseClient()) return "supabase";
  return process.env.VERCEL ? "memory" : "file";
}

function loadFile(): Db {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
      if (raw && raw.__schema === SCHEMA_VERSION && Array.isArray(raw.cases)) {
        delete raw.__schema;
        return raw as Db;
      }
    }
  } catch {
    /* fall through to reseed */
  }
  const db = seedDb();
  writeFile(db);
  return db;
}

function writeFile(db: Db) {
  if (storageMode() !== "file") return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DB_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify({ __schema: SCHEMA_VERSION, ...db }));
    fs.renameSync(tmp, DB_FILE);
  } catch (e) {
    console.error("[nyayasetu] persist failed", e);
  }
}

const serialize = (db: Db) => ({ __schema: SCHEMA_VERSION, ...db });

/** Reads the row, creating it from the deterministic seed if the table is empty or the schema changed. */
async function loadRow(sb: SupabaseClient): Promise<{ db: Db; rowVersion: number }> {
  const { data, error } = await sb.from(TABLE).select("data, version").eq("id", 1).maybeSingle();
  if (error) throw error;
  if (data && (data.data as { __schema?: number })?.__schema === SCHEMA_VERSION) {
    const { __schema, ...db } = data.data as Db & { __schema: number };
    return { db: db as Db, rowVersion: Number(data.version) };
  }
  const db = seedDb();
  if (data) {
    const version = Number(data.version) + 1;
    const res = await sb.from(TABLE).update({ data: serialize(db), version, updated_at: new Date().toISOString() }).eq("id", 1).eq("version", data.version).select("version");
    if (res.error) throw res.error;
    return res.data.length ? { db, rowVersion: version } : loadRow(sb);
  }
  const res = await sb.from(TABLE).upsert({ id: 1, data: serialize(db), version: 0 }, { onConflict: "id", ignoreDuplicates: true }).select("version");
  if (res.error) throw res.error;
  return res.data.length ? { db, rowVersion: 0 } : loadRow(sb);
}

let hydrating: Promise<void> | null = null;
let writes: Promise<unknown> = Promise.resolve();

/** Runs one request with its own list of unsaved mutations. */
export const runWithStore = <T>(fn: () => Promise<T>) => requestScope.run({ pending: [] }, fn);

/** Makes state available before a route runs. With Supabase, re-checks the version at most every ~3 s. */
export async function hydrate() {
  if (!supabaseClient()) return;
  // requests arriving together share one check
  hydrating ??= hydrateOnce().finally(() => {
    hydrating = null;
  });
  return hydrating;
}

async function hydrateOnce() {
  const sb = supabaseClient()!;
  const h = g.__nyayasetu;
  const fresh = h?.db && h.schema === SCHEMA_VERSION && h.rowVersion >= 0;
  if (fresh && Date.now() - h!.checkedAt < CACHE_MS) return;
  if (fresh) {
    const { data, error } = await sb.from(TABLE).select("version").eq("id", 1).maybeSingle();
    if (error) throw error;
    if (data && Number(data.version) === h!.rowVersion) {
      h!.checkedAt = Date.now();
      return;
    }
  }
  const row = await loadRow(sb);
  g.__nyayasetu = { db: row.db, schema: SCHEMA_VERSION, rowVersion: row.rowVersion, checkedAt: Date.now() };
}

/** Saves this request's mutations with an optimistic version check. On conflict it reloads, re-applies and retries. */
export async function flush() {
  const sb = supabaseClient();
  const scope = requestScope.getStore();
  if (!sb || !scope?.pending.length) return;
  // one write at a time per instance, so requests here do not conflict with each other
  const run = writes.then(() => writeRow(sb, scope));
  writes = run.catch(() => undefined);
  return run;
}

async function writeRow(sb: SupabaseClient, scope: { pending: Mutation[] }) {
  if (!scope.pending.length) return;
  try {
    await attemptWrite(sb, scope);
  } catch (e) {
    // this instance's copy now differs from the database, so the next request must reload
    if (g.__nyayasetu) {
      g.__nyayasetu.checkedAt = 0;
      g.__nyayasetu.rowVersion = -1;
    }
    throw e;
  }
}

async function attemptWrite(sb: SupabaseClient, scope: { pending: Mutation[] }) {
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    const h = g.__nyayasetu!;
    const next = h.rowVersion + 1;
    const res = await sb.from(TABLE).update({ data: serialize(h.db!), version: next, updated_at: new Date().toISOString() }).eq("id", 1).eq("version", h.rowVersion).select("version");
    if (res.error) throw res.error;
    if (res.data.length) {
      h.rowVersion = next;
      h.checkedAt = Date.now();
      scope.pending = [];
      return;
    }
    if (attempt === WRITE_ATTEMPTS - 1) break;
    await new Promise((r) => setTimeout(r, 80 + Math.random() * 220 * (attempt + 1)));
    const row = await loadRow(sb);
    for (const fn of scope.pending) fn(row.db);
    row.db.version += scope.pending.length;
    g.__nyayasetu = { db: row.db, schema: SCHEMA_VERSION, rowVersion: row.rowVersion, checkedAt: Date.now() };
  }
  const { ApiError } = await import("./api");
  throw new ApiError(409, "Someone else changed this at the same moment. Please try again.");
}

export function getDb(): Db {
  if (!g.__nyayasetu || g.__nyayasetu.schema !== SCHEMA_VERSION || !g.__nyayasetu.db) {
    if (supabaseClient()) throw new Error("hydrate() must run before getDb()");
    g.__nyayasetu = { db: loadFile(), schema: SCHEMA_VERSION, rowVersion: 0, checkedAt: 0 };
  }
  return g.__nyayasetu.db!;
}

function save(fn: Mutation, db: Db) {
  if (supabaseClient()) requestScope.getStore()?.pending.push(fn);
  else writeFile(db);
}

/** Apply a mutation, bump version, persist. */
export function mutate<T>(fn: (db: Db) => T): T {
  const db = getDb();
  const out = fn(db);
  db.version++;
  save(fn, db);
  return out;
}

/** Persist without bumping the data version (audit-only writes). */
export function touch<T>(fn: (db: Db) => T): T {
  const db = getDb();
  const out = fn(db);
  save(fn, db);
  return out;
}

export function nextActionId(db: Db) {
  db.counters.action++;
  return `A${db.counters.action}`;
}

/** Each entry stores the hash of the previous one, so any edit breaks the chain. */
export function auditHash(e: Omit<AuditEntry, "hash">) {
  return crypto.createHash("sha256").update(JSON.stringify([e.prevHash, e.id, e.at, e.role, e.actor, e.action, e.target, e.detail])).digest("hex");
}

export function audit(db: Db, e: Omit<AuditEntry, "id" | "at" | "hash" | "prevHash">) {
  db.counters.audit++;
  const entry = { id: `AU${db.counters.audit}`, at: iso(Date.now()), ...e, prevHash: db.audit.at(-1)?.hash ?? "GENESIS" };
  db.audit.push({ ...entry, hash: auditHash(entry) });
  if (db.audit.length > 5000) db.audit.splice(0, db.audit.length - 5000);
}

/** Walks the chain. The oldest retained entry anchors it, because old entries are trimmed. */
export function verifyAudit(db: Db) {
  let prev: string | null = null;
  for (let i = 0; i < db.audit.length; i++) {
    const e = db.audit[i];
    const { hash, ...rest } = e;
    if (auditHash(rest) !== hash || (prev !== null && e.prevHash !== prev)) return { ok: false, checked: db.audit.length, brokenAt: e.id };
    prev = hash;
  }
  return { ok: true, checked: db.audit.length, brokenAt: null as string | null };
}

export function nextCaseId(db: Db) {
  const y = new Date().getFullYear();
  const prefix = `NS-${y}-`;
  let max = 0;
  for (const c of db.cases) if (c.id.startsWith(prefix)) max = Math.max(max, Number(c.id.slice(prefix.length)));
  return `${prefix}${String(max + 1).padStart(5, "0")}`;
}

export function recomputeSla(db: Db) {
  for (const c of db.cases) c.expectedDisposalDate = addDays(c.dateReceived, db.settings.slaDays[c.category]);
}
