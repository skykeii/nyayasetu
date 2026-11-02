import crypto from "crypto";
import { z } from "zod";
import { ApiError, clientIp, parseJson, withApi } from "@/lib/api";
import { GENERIC_LOGIN_ERROR, clearLock, isLocked, recordFailure, startSession } from "@/lib/auth";
import { DEMO_OTP, LIMITS, pseudonymFor } from "@/lib/intake";
import { rateLimit } from "@/lib/ratelimit";
import { json } from "@/lib/server";
import { getDb, mutate } from "@/lib/store";
import { verifyBotToken } from "@/lib/student";
import { blindIndex, encryptField } from "@/lib/vault";

export const dynamic = "force-dynamic";

const WINDOW = 10 * 60000;
const Body = z.object({
  action: z.enum(["request", "verify"]),
  apaarId: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{6,24}$/, "Enter a valid college or APAAR ID"),
  mobile: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number"),
  institutionId: z.string().max(40).optional(),
  botToken: z.string().max(60).optional(),
  otp: z.string().max(10).optional(),
});

export const GET = withApi(async () => json({ colleges: getDb().institutions.map((i) => ({ id: i.id, name: i.name })) }));

export const POST = withApi(async (req) => {
  rateLimit(`otp:${clientIp(req)}`, 30, 60000);
  const body = await parseJson(req, Body);
  const db = getDb();
  const { apaarId, mobile } = body;
  const key = `${apaarId}|${blindIndex(mobile)}`;
  const recent = db.otpRequests.filter((o) => o.key === key && Date.now() - new Date(o.at).getTime() < WINDOW);
  const existing = db.students.find((s) => s.apaarId === apaarId);
  if (existing && existing.mobileIndex !== blindIndex(mobile)) throw new ApiError(400, GENERIC_LOGIN_ERROR);
  if (!existing && !db.institutions.some((i) => i.id === body.institutionId)) throw new ApiError(400, "Choose your college");

  if (body.action === "request") {
    if (!verifyBotToken(body.botToken)) throw new ApiError(400, "Please complete the bot check");
    if (recent.length >= LIMITS.otpPer10Min) throw new ApiError(429, `Too many OTP requests. At most ${LIMITS.otpPer10Min} per 10 minutes.`);
    mutate((d) => {
      d.otpRequests = d.otpRequests.filter((o) => Date.now() - new Date(o.at).getTime() < WINDOW);
      d.otpRequests.push({ key, at: new Date().toISOString() });
    });
    return json({ ok: true });
  }

  if (!recent.length) throw new ApiError(400, "Request an OTP first");
  if (isLocked(db, apaarId)) throw new ApiError(401, GENERIC_LOGIN_ERROR);
  if (body.otp !== DEMO_OTP) {
    recordFailure(apaarId, "student", "Wrong OTP");
    throw new ApiError(401, GENERIC_LOGIN_ERROR);
  }
  clearLock(apaarId);
  const student = mutate((d) => {
    let s = d.students.find((x) => x.apaarId === apaarId);
    if (!s) {
      const id = `STU-N${crypto.randomBytes(4).toString("hex")}`;
      s = { id, apaarId, mobile: encryptField(mobile), mobileIndex: blindIndex(mobile), name: encryptField("Not provided"), rollNo: encryptField("Not provided"), institutionId: body.institutionId!, pseudonym: pseudonymFor(id), pulseTermsDone: [], pulseInvited: parseInt(id.slice(-2), 16) % 100 < 8, consents: [] };
      d.students.push(s);
    }
    d.otpRequests = d.otpRequests.filter((o) => o.key !== key);
    return s;
  });
  const inst = db.institutions.find((i) => i.id === student.institutionId)!;
  return startSession({ sub: student.id, role: "student", region: inst.region, officerId: "STU", studentId: student.id, institutionId: student.institutionId }, student.pseudonym, "OTP");
});
