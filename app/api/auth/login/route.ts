import bcrypt from "bcryptjs";
import { z } from "zod";
import { ApiError, clientIp, parseJson, withApi } from "@/lib/api";
import { GENERIC_LOGIN_ERROR, clearLock, isLocked, recordFailure, startSession } from "@/lib/auth";
import { DEMO_2FA } from "@/lib/demo-accounts";
import { rateLimit } from "@/lib/ratelimit";
import { json } from "@/lib/server";
import { readChallenge, signChallenge } from "@/lib/session";
import { getDb } from "@/lib/store";
import { ROLE_KEYS } from "@/lib/roles";
import type { Account, RoleKey } from "@/lib/types";

export const dynamic = "force-dynamic";

const Body = z.union([
  z.object({ challenge: z.string().min(10).max(2000), code: z.string().min(1).max(12) }),
  z.object({ email: z.string().min(3).max(120), password: z.string().min(1).max(200), role: z.enum(ROLE_KEYS as [RoleKey, ...RoleKey[]]) }),
]);

const claimsFor = (a: Account) => ({ sub: a.id, role: a.role, region: a.region ?? ("Southern" as const), officerId: a.officerId, institutionId: a.institutionId });

export const POST = withApi(async (req) => {
  rateLimit(`login:${clientIp(req)}`, 30, 60000);
  const body = await parseJson(req, Body);
  const db = getDb();

  if ("challenge" in body) {
    const id = await readChallenge(body.challenge);
    const a = db.accounts.find((x) => x.id === id);
    if (!a) throw new ApiError(401, GENERIC_LOGIN_ERROR);
    const key = a.email;
    if (isLocked(db, key)) throw new ApiError(401, GENERIC_LOGIN_ERROR);
    if (body.code !== DEMO_2FA) {
      recordFailure(key, a.role, "Wrong 2FA code");
      throw new ApiError(401, GENERIC_LOGIN_ERROR);
    }
    clearLock(key);
    return startSession(claimsFor(a), a.name, "password and 2FA");
  }

  const key = body.email.trim().toLowerCase();
  const a = db.accounts.find((x) => x.email === key && x.role === body.role);
  // always run the comparison, so timing does not reveal which accounts exist
  const ok = await bcrypt.compare(body.password, a?.passwordHash ?? db.accounts[0].passwordHash);
  if (isLocked(db, key)) throw new ApiError(401, GENERIC_LOGIN_ERROR);
  if (!a || !ok) {
    recordFailure(key, body.role, "Wrong email, role or password");
    throw new ApiError(401, GENERIC_LOGIN_ERROR);
  }
  if (a.role === "ca") return json({ twoFactor: true, challenge: await signChallenge(a.id) });
  clearLock(key);
  return startSession(claimsFor(a), a.name, "password");
});
