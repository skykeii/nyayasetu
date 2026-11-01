import { getDb, mutate } from "@/lib/store";
import { json } from "@/lib/server";
import { studentFrom } from "@/lib/student";
import { PULSE_TERM } from "@/lib/intake";
import { PULSE_QUESTIONS, type PulseQuestion } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const db = getDb();
  const s = studentFrom(req, db);
  if (!s) return json({ error: "Please sign in" }, { status: 401 });
  if (!s.pulseInvited) return json({ error: "You were not selected for this term's survey" }, { status: 403 });
  if (s.pulseTermsDone.includes(PULSE_TERM)) return json({ error: "You have already answered this term's survey" }, { status: 409 });
  const body = (await req.json().catch(() => ({}))) as { answers?: Partial<Record<PulseQuestion, number>>; unable?: boolean };
  const answers = PULSE_QUESTIONS.map((q) => Number(body.answers?.[q]));
  if (answers.some((n) => !Number.isInteger(n) || n < 1 || n > 5) || typeof body.unable !== "boolean") return json({ error: "Answer every question" }, { status: 400 });
  mutate((d) => {
    const inst = d.institutions.find((i) => i.id === s.institutionId)!;
    let p = d.pulse.find((x) => x.institutionId === s.institutionId && x.term === PULSE_TERM);
    if (!p) {
      p = { institutionId: inst.id, term: PULSE_TERM, invited: Math.round(inst.enrolment * 0.08), responded: 0, sums: { infrastructure: 0, faculty: 0, fees: 0, safety: 0 }, unable: 0 };
      d.pulse.push(p);
    }
    p.responded++;
    PULSE_QUESTIONS.forEach((q, i) => (p!.sums[q] += answers[i]));
    if (body.unable) p.unable++;
    d.students.find((x) => x.id === s.id)!.pulseTermsDone.push(PULSE_TERM);
  });
  return json({ ok: true });
}
