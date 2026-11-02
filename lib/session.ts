import { SignJWT, jwtVerify } from "jose";
import type { Region, RoleKey } from "./types";

/** Signed session tokens. Edge-safe, because middleware.ts verifies them on every request. */
export const SESSION_COOKIE = "nys_session";
export const VIEWER_HEADER = "x-nys-viewer";
const DEV_SECRET = "nyayasetu-dev-only-secret-do-not-use-in-production";

export interface SessionClaims {
  sub: string;
  role: RoleKey;
  region: Region;
  officerId: string;
  institutionId?: string;
  studentId?: string;
}

let warned = false;

/** A forged session would give full authority, so a hosted deployment without a secret refuses sign-in. */
function secretKey(): Uint8Array | null {
  const raw = process.env.SESSION_SECRET;
  if (raw) {
    if (/^[0-9a-fA-F]{64}$/.test(raw)) return Uint8Array.from(raw.match(/../g)!.map((h) => parseInt(h, 16)));
    return new TextEncoder().encode(raw);
  }
  if (process.env.VERCEL) return null;
  if (!warned) {
    warned = true;
    console.warn("[nyayasetu] SESSION_SECRET is not set; using the development fallback");
  }
  return new TextEncoder().encode(DEV_SECRET);
}

export const sessionHours = (role: RoleKey) => (role === "student" ? 2 : 8);

export async function signSession(c: SessionClaims) {
  const key = secretKey();
  if (!key) throw new Error("SESSION_SECRET is not configured");
  const { sub, ...claims } = c;
  return new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setIssuedAt().setExpirationTime(`${sessionHours(c.role)}h`).sign(key);
}

export async function readSession(token: string | undefined): Promise<SessionClaims | null> {
  const key = secretKey();
  if (!token || !key) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (payload.purpose || !payload.sub || !payload.role) return null;
    return payload as unknown as SessionClaims;
  } catch {
    return null;
  }
}

/** Short-lived token for the second step of a Competent Authority sign-in. */
export async function signChallenge(accountId: string) {
  const key = secretKey();
  if (!key) throw new Error("SESSION_SECRET is not configured");
  return new SignJWT({ purpose: "2fa" }).setProtectedHeader({ alg: "HS256" }).setSubject(accountId).setExpirationTime("5m").sign(key);
}

export async function readChallenge(token: string) {
  const key = secretKey();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    return payload.purpose === "2fa" ? payload.sub ?? null : null;
  } catch {
    return null;
  }
}

export const sessionCookie = (value: string, role: RoleKey) => ({
  name: SESSION_COOKIE,
  value,
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: sessionHours(role) * 3600,
});
