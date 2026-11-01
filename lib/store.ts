import fs from "fs";
import path from "path";
import type { AuditEntry, Db } from "./types";
import { SCHEMA_VERSION, seedDb } from "./seed";
import { addDays, iso } from "./util";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

type Holder = { db: Db | null; schema: number };
const g = globalThis as unknown as { __nyayasetu?: Holder };

function load(): Db {
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
  write(db);
  return db;
}

function write(db: Db) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DB_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify({ __schema: SCHEMA_VERSION, ...db }));
    fs.renameSync(tmp, DB_FILE);
  } catch (e) {
    console.error("[nyayasetu] persist failed", e);
  }
}

export function getDb(): Db {
  if (!g.__nyayasetu || g.__nyayasetu.schema !== SCHEMA_VERSION || !g.__nyayasetu.db) {
    g.__nyayasetu = { db: load(), schema: SCHEMA_VERSION };
  }
  return g.__nyayasetu.db!;
}

/** Apply a mutation, bump version, persist. */
export function mutate<T>(fn: (db: Db) => T): T {
  const db = getDb();
  const out = fn(db);
  db.version++;
  write(db);
  return out;
}

/** Persist without bumping the data version (audit-only writes). */
export function touch<T>(fn: (db: Db) => T): T {
  const db = getDb();
  const out = fn(db);
  write(db);
  return out;
}

export function nextActionId(db: Db) {
  db.counters.action++;
  return `A${db.counters.action}`;
}

export function audit(db: Db, e: Omit<AuditEntry, "id" | "at">) {
  db.counters.audit++;
  db.audit.push({ id: `AU${db.counters.audit}`, at: iso(Date.now()), ...e });
  if (db.audit.length > 5000) db.audit.splice(0, db.audit.length - 5000);
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
