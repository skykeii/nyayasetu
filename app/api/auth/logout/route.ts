import { NextResponse } from "next/server";
import { withApi } from "@/lib/api";
import { officerName, viewerFrom } from "@/lib/server";
import { SESSION_COOKIE } from "@/lib/session";
import { audit, getDb, mutate } from "@/lib/store";

export const dynamic = "force-dynamic";

export const POST = withApi(async (req) => {
  const db = getDb();
  const v = viewerFrom(req, db);
  mutate((d) => audit(d, { role: v.role, actor: officerName(d, v), action: "LOGOUT", target: v.accountId, detail: "Signed out" }));
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: SESSION_COOKIE, value: "", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return res;
});
