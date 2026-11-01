import { audit, getDb, mutate } from "@/lib/store";
import { json } from "@/lib/server";
import { burstCount, nearestOwn, nextComplaintId, processText, saveUploads, studentFrom, studentView } from "@/lib/student";
import { LIMITS, VOICE_SAMPLES, languageName } from "@/lib/intake";
import { ROUTING } from "@/lib/seed";
import type { StudentComplaint } from "@/lib/types";
import { DAY, addDays } from "@/lib/util";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const db = getDb();
  const s = studentFrom(req, db);
  if (!s) return json({ error: "Please sign in" }, { status: 401 });
  const form = await req.formData();
  const sampleId = String(form.get("sampleId") ?? "") || undefined;
  const sample = VOICE_SAMPLES.find((x) => x.id === sampleId);
  const text = String(form.get("text") ?? sample?.original ?? "").trim();
  const code = sample?.code ?? String(form.get("language") ?? "en-IN");
  const channel = String(form.get("channel") ?? "Text") as StudentComplaint["channel"];
  if (text.length < 15) return json({ error: "Please describe the problem in at least 15 characters" }, { status: 400 });

  const own = db.studentComplaints.filter((c) => c.studentId === s.id);
  const open = own.filter((c) => c.status === "With College" || c.status === "Resolved - Pending Verification").length;
  if (open >= LIMITS.openComplaints) return json({ error: `You already have ${open} open complaints. The limit is ${LIMITS.openComplaints}; wait for one to close.` }, { status: 429 });
  if (own.filter((c) => Date.now() - new Date(c.createdAt).getTime() < DAY).length >= LIMITS.perDay) return json({ error: `At most ${LIMITS.perDay} complaints can be filed in a day.` }, { status: 429 });

  const processed = await processText(text, code, sampleId);
  const near = nearestOwn(db, s.id, processed.translation);
  if (near.score >= 0.85) return json({ error: `This looks the same as your earlier complaint ${near.id}, so it was not filed again.`, duplicateOf: near.id }, { status: 409 });

  const uploads = await saveUploads(form.getAll("photo"));
  if (uploads.error) return json({ error: uploads.error }, { status: 400 });

  const created = mutate((d) => {
    const now = new Date().toISOString();
    const suspicious: string[] = [];
    if (near.score >= 0.55) suspicious.push(`Similar to this student's earlier complaint ${near.id} (${Math.round(near.score * 100)}% text match)`);
    const burst = burstCount(d, s.institutionId) + 1;
    if (burst >= 5) suspicious.push(`Burst: ${burst} complaints against this institution within 72 hours. Verify genuineness; do not act on volume alone.`);
    if (own.length >= 4 && own.filter((c) => Date.now() - new Date(c.createdAt).getTime() < 7 * DAY).length >= 3) suspicious.push("High filing rate from one account in the past 7 days");
    const nodal = d.signals.find((x) => x.institutionId === s.institutionId)?.nodalOfficer ?? "Nodal officer";
    const sub = processed.translation.split(/[.!?]/)[0].slice(0, 80);
    const c: StudentComplaint = {
      id: nextComplaintId(d),
      studentId: s.id,
      pseudonym: s.pseudonym,
      institutionId: s.institutionId,
      category: processed.category,
      subject: sample?.subject ?? (processed.source === "unavailable" || processed.source === "glossary" ? `${processed.category} complaint (${languageName(code)})` : sub),
      channel: uploads.docs.length && channel === "Text" ? "Photo" : channel,
      language: languageName(code),
      originalText: text,
      translatedText: processed.translation,
      translationSource: processed.source,
      severity: processed.severity,
      severityReason: processed.severityReason,
      categoryReason: processed.categoryReason,
      routedBureau: ROUTING[processed.category],
      status: "With College",
      createdAt: now,
      dueAt: addDays(now, d.settings.slaDays[processed.category]),
      escalationLevel: 0,
      photo: uploads.docs[0],
      lastReminderAt: now,
      reminders: [
        { at: now, channel: "In-app", to: nodal, message: "New student complaint received." },
        { at: now, channel: "SMS (simulated)", to: nodal, message: "New student complaint received." },
      ],
      actions: [{ at: now, type: "Submitted", by: s.pseudonym, remarks: `Complaint submitted through the student portal (${channel.toLowerCase()}, ${languageName(code)}).` }],
      suspicious,
    };
    d.studentComplaints.push(c);
    audit(d, { role: "student", actor: s.pseudonym, action: "STUDENT_COMPLAINT", target: c.id, detail: `${c.category}, routed to college with ${c.routedBureau} as AICTE unit${suspicious.length ? `; ${suspicious.length} flag(s)` : ""}` });
    return studentView(d, c);
  });
  return json({ complaint: created });
}
