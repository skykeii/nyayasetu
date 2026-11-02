import { z } from "zod";
import { ApiError, parseJson, withApi } from "@/lib/api";
import { getDb, mutate } from "@/lib/store";
import { json } from "@/lib/server";
import { studentFrom } from "@/lib/student";
import { PULSE_TERM } from "@/lib/intake";
import { PULSE_QUESTIONS } from "@/lib/types";

export const dynamic = "force-dynamic";

const Rating = z.number({ error: "Answer every question" }).int().min(1).max(5);
const Body = z.object({ answers: z.object({ infrastructure: Rating, faculty: Rating, fees: Rating, safety: Rating }, { error: "Answer every question" }), unable: z.boolean({ error: "Answer every question" }) });

export const POST = withApi(async (req) => {
  const db = getDb();
  const s = studentFrom(req, db);
  if (!s.pulseInvited) throw new ApiError(403, "You were not selected for this term's survey");
  if (s.pulseTermsDone.includes(PULSE_TERM)) throw new ApiError(409, "You have already answered this term's survey");
  const body = await parseJson(req, Body);
  mutate((d) => {
    const inst = d.institutions.find((i) => i.id === s.institutionId)!;
    let p = d.pulse.find((x) => x.institutionId === s.institutionId && x.term === PULSE_TERM);
    if (!p) {
      p = { institutionId: inst.id, term: PULSE_TERM, invited: Math.round(inst.enrolment * 0.08), responded: 0, sums: { infrastructure: 0, faculty: 0, fees: 0, safety: 0 }, unable: 0 };
      d.pulse.push(p);
    }
    p.responded++;
    PULSE_QUESTIONS.forEach((q) => (p!.sums[q] += body.answers[q]));
    if (body.unable) p.unable++;
    d.students.find((x) => x.id === s.id)!.pulseTermsDone.push(PULSE_TERM);
  });
  return json({ ok: true });
});
