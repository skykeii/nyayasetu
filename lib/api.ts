import { NextResponse } from "next/server";
import { z } from "zod";
import { flush, hydrate, runWithStore } from "./store";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Wraps a route: loads state, saves it before responding, and never leaks internal errors. */
export function withApi<P = unknown>(fn: (req: Request, ctx: { params: P }) => Promise<Response> | Response) {
  return async (req: Request, ctx: { params: P }) => {
    try {
      return await runWithStore(async () => {
        await hydrate();
        const res = await fn(req, ctx);
        await flush();
        return res;
      });
    } catch (e) {
      if (e instanceof ApiError) return NextResponse.json({ error: e.message }, { status: e.status });
      console.error("[nyayasetu] request failed", e);
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
  };
}

const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Invalid request";

export function validate<S extends z.ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const r = schema.safeParse(value);
  if (!r.success) throw new ApiError(400, firstIssue(r.error));
  return r.data;
}

export async function parseJson<S extends z.ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  return validate(schema, await req.json().catch(() => ({})));
}

export function parseQuery<S extends z.ZodTypeAny>(req: Request, schema: S): z.infer<S> {
  return validate(schema, Object.fromEntries(new URL(req.url).searchParams));
}

export async function parseForm(req: Request) {
  try {
    return await req.formData();
  } catch {
    throw new ApiError(400, "Invalid form submission");
  }
}

/** Best-effort client address for rate limits. */
export const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
