import crypto from "crypto";
import { audit, getDb, mutate } from "@/lib/store";
import { json } from "@/lib/server";
import { verifyBotToken } from "@/lib/student";
import { DEMO_OTP, LIMITS, pseudonymFor } from "@/lib/intake";
import { DAY } from "@/lib/util";

export const dynamic = "force-dynamic";

const WINDOW = 10 * 60000;

export async function GET() {
  // public list of colleges for the sign-in form
  return json({ colleges: getDb().institutions.map((i) => ({ id: i.id, name: i.name })) });
}

export async function POST(req: Request) {
  const db = getDb();
  const body = (await req.json().catch(() => ({}))) as { action?: string; apaarId?: string; mobile?: string; institutionId?: string; botToken?: unknown; otp?: string };
  const apaarId = (body.apaarId ?? "").trim().toUpperCase();
  const mobile = (body.mobile ?? "").trim();
  if (!/^[A-Z0-9-]{6,24}$/.test(apaarId)) return json({ error: "Enter a valid college or APAAR ID" }, { status: 400 });
  if (!/^[6-9]\d{9}$/.test(mobile)) return json({ error: "Enter a 10-digit mobile number" }, { status: 400 });
  const key = `${apaarId}|${mobile}`;
  const recent = db.otpRequests.filter((o) => o.key === key && Date.now() - new Date(o.at).getTime() < WINDOW);
  const existing = db.students.find((s) => s.apaarId === apaarId);
  if (existing && existing.mobile !== mobile) return json({ error: "These details do not match our records" }, { status: 400 });
  if (!existing && !db.institutions.some((i) => i.id === body.institutionId)) return json({ error: "Choose your college" }, { status: 400 });

  if (body.action === "request") {
    if (!verifyBotToken(body.botToken)) return json({ error: "Please complete the bot check" }, { status: 400 });
    if (recent.filter((o) => o.kind === "request").length >= LIMITS.otpPer10Min) return json({ error: `Too many OTP requests. At most ${LIMITS.otpPer10Min} per 10 minutes.` }, { status: 429 });
    mutate((d) => {
      d.otpRequests = d.otpRequests.filter((o) => Date.now() - new Date(o.at).getTime() < WINDOW);
      d.otpRequests.push({ key, at: new Date().toISOString(), kind: "request" });
    });
    return json({ ok: true });
  }

  if (body.action === "verify") {
    if (!recent.some((o) => o.kind === "request")) return json({ error: "Request an OTP first" }, { status: 400 });
    if (recent.filter((o) => o.kind === "fail").length >= LIMITS.otpFails) return json({ error: "Too many wrong attempts. Try again in 10 minutes." }, { status: 429 });
    if (body.otp !== DEMO_OTP) {
      mutate((d) => d.otpRequests.push({ key, at: new Date().toISOString(), kind: "fail" }));
      return json({ error: "Wrong OTP" }, { status: 400 });
    }
    const token = crypto.randomUUID();
    mutate((d) => {
      let s = d.students.find((x) => x.apaarId === apaarId);
      if (!s) {
        const id = `STU-N${crypto.randomBytes(4).toString("hex")}`;
        s = { id, apaarId, mobile, name: "Not provided", rollNo: "Not provided", institutionId: body.institutionId!, pseudonym: pseudonymFor(id), pulseTermsDone: [], pulseInvited: parseInt(id.slice(-2), 16) % 100 < 8 };
        d.students.push(s);
      }
      d.otpRequests = d.otpRequests.filter((o) => o.key !== key);
      d.studentSessions = d.studentSessions.filter((x) => x.expiresAt > new Date().toISOString());
      d.studentSessions.push({ token, studentId: s.id, expiresAt: new Date(Date.now() + DAY).toISOString() });
      audit(d, { role: "student", actor: s.pseudonym, action: "STUDENT_LOGIN", target: s.pseudonym, detail: "OTP sign-in" });
    });
    return json({ token });
  }
  return json({ error: "Unknown action" }, { status: 400 });
}
