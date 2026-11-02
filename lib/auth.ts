import { NextResponse } from "next/server";
import { audit, mutate } from "./store";
import { ROLES } from "./roles";
import { sessionCookie, signSession, type SessionClaims } from "./session";
import type { Db } from "./types";

export const GENERIC_LOGIN_ERROR = "Those details did not work. Check them and try again, or wait a few minutes.";
const MAX_FAILS = 5;
const LOCK_MS = 5 * 60000;

export function isLocked(db: Db, key: string) {
  const l = db.loginLocks[key];
  return !!l?.until && new Date(l.until).getTime() > Date.now();
}

export function recordFailure(key: string, role: string, detail: string) {
  mutate((d) => {
    const l = d.loginLocks[key] ?? { fails: 0 };
    l.fails++;
    if (l.fails >= MAX_FAILS) {
      l.until = new Date(Date.now() + LOCK_MS).toISOString();
      l.fails = 0;
      audit(d, { role, actor: "Unknown", action: "LOGIN_LOCKED", target: key, detail: `Locked for 5 minutes after ${MAX_FAILS} failed attempts` });
    }
    d.loginLocks[key] = l;
    audit(d, { role, actor: "Unknown", action: "LOGIN_FAILED", target: key, detail });
  });
}

export async function startSession(claims: SessionClaims, actor: string, method: string) {
  const token = await signSession(claims);
  mutate((d) => audit(d, { role: claims.role, actor, action: "LOGIN", target: claims.sub, detail: `Signed in (${method})` }));
  const res = NextResponse.json({ ok: true, landing: ROLES[claims.role].landing });
  res.cookies.set(sessionCookie(token, claims.role));
  return res;
}

export const clearLock = (key: string) =>
  mutate((d) => {
    delete d.loginLocks[key];
  });
