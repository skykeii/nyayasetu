import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "Security & Privacy | NyayaSetu" };

const IMPLEMENTED = [
  "Sign-in with bcrypt-hashed passwords; the server takes role, region and officer only from a signed, httpOnly session cookie (8 hours, 2 for students)",
  "Lockout for 5 minutes after 5 failed sign-ins; sign-ins, sign-outs and failures are audit-logged",
  "Role checks on every page and API route, plus an Origin check on requests that change data",
  "Security headers: Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy",
  "Uploads limited to PNG, JPG and PDF, checked by extension and file contents, capped at 4 MB, stored under random names and served only through role-checked routes",
  "Input validation with zod on API routes that take input; error messages do not expose internals",
  "Student name, mobile and roll number encrypted at rest with AES-256-GCM; decrypted only for the student's own view and an audit-logged reveal by the Competent Authority",
  "Colleges and partner desks see a pseudonym and masked text; genuineness and overlap flags stay inside AICTE",
  "Tamper-evident audit log: each entry stores a hash of the previous one, with a Verify integrity check",
  "In-memory rate limits on sign-in, OTP and AI endpoints",
  "Privacy notice and consent record for students, with a Request deletion action that goes to the AICTE desk",
  "Text sent to Groq is pre-redacted: phones, emails, roll numbers and APAAR IDs are removed first, and the API key stays on the server",
];
const MOCKED = ["OTP: always 123456, no SMS is sent", "Competent Authority 2FA: always 123456", "Bot check: a mock slider, with a marked swap point for Turnstile or hCaptcha", "SMS reminders: logged only, not sent", "Evidence check without a Groq key: scores the note and file types, without inspecting images"];
const PLANNED = ["Real SMS gateway", "Single sign-on (SSO)", "Full relational PostgreSQL schema (the prototype stores state as JSON in Supabase Postgres)", "Web application firewall (WAF)", "Formal retention schedule and automated deletion workflow", "Independent security review"];

function Block({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="glass rounded-2xl p-5">
      <h2 className="text-[16px] font-semibold text-white">{title}</h2>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-slate-300">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </section>
  );
}

export default function SecurityPage() {
  return (
    <main className="mx-auto max-w-[820px] space-y-4 px-4 py-8">
      <Link href="/" className="inline-flex items-center gap-1.5 text-[14px] text-slate-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <div>
        <h1 className="text-[34px] leading-[1.1] tracking-tight text-white">Security &amp; Privacy</h1>
        <p className="text-[15px] text-slate-400">NyayaSetu is a demo on synthetic data, not connected to any AICTE system and not certified for real complaints. This page separates what is built from what is simulated.</p>
      </div>
      <Block title="Implemented" items={IMPLEMENTED} />
      <Block title="Mocked for the demo" items={MOCKED} />
      <Block title="Planned for production" items={PLANNED} />
    </main>
  );
}
