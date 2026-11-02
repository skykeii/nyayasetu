import { z } from "zod";
import { ApiError, parseForm, validate, withApi } from "@/lib/api";
import { audit, getDb, mutate } from "@/lib/store";
import { json } from "@/lib/server";
import { saveUploads } from "@/lib/files";
import { burstCount, draftCase, nearestOwnOpen, nextComplaintId, processText, similarOpenCases, studentFrom, studentView } from "@/lib/student";
import { CONSENT_VERSION, LANGUAGES, LIMITS, VOICE_SAMPLES, languageName, maskPii } from "@/lib/intake";
import { ROUTING } from "@/lib/seed";
import type { StudentComplaint } from "@/lib/types";
import { DAY, addDays } from "@/lib/util";

export const dynamic = "force-dynamic";

const Fields = z.object({
  text: z.string().trim().max(6000).optional(),
  language: z.enum(LANGUAGES.map((l) => l.code) as [string, ...string[]]).optional(),
  channel: z.enum(["Text", "Voice", "Photo"]).optional(),
  sampleId: z.string().max(20).optional(),
  consent: z.string().max(30).optional(),
  overrideReason: z.string().trim().max(500).optional(),
});

export const POST = withApi(async (req) => {
  const db = getDb();
  const s = studentFrom(req, db);
  const form = await parseForm(req);
  const f = validate(Fields, Object.fromEntries([...form.entries()].filter(([k]) => k !== "photo")));
  if (f.consent !== CONSENT_VERSION && !s.consents.some((c) => c.version === CONSENT_VERSION)) throw new ApiError(400, "Please read and accept the privacy notice first");
  const sample = VOICE_SAMPLES.find((x) => x.id === f.sampleId);
  const text = f.text || sample?.original || "";
  const code = sample?.code ?? f.language ?? "en-IN";
  const channel = f.channel ?? "Text";
  if (text.length < 15) throw new ApiError(400, "Please describe the problem in at least 15 characters");

  const own = db.studentComplaints.filter((c) => c.studentId === s.id);
  const open = own.filter((c) => c.status === "With College" || c.status === "Resolved - Pending Verification").length;
  if (open >= LIMITS.openComplaints) throw new ApiError(429, `You already have ${open} open complaints. The limit is ${LIMITS.openComplaints}; wait for one to close.`);
  if (own.filter((c) => Date.now() - new Date(c.createdAt).getTime() < DAY).length >= LIMITS.perDay) throw new ApiError(429, `At most ${LIMITS.perDay} complaints can be filed in a day.`);

  const processed = await processText(text, code, f.sampleId);
  const near = nearestOwnOpen(db, s.id, processed.translation);
  if (near && near.score >= 0.55 && !f.overrideReason) {
    return json({ error: "You already have a similar open complaint.", similar: { id: near.complaint.id, subject: near.complaint.subject, status: near.complaint.status } }, { status: 409 });
  }
  if (near && near.score >= 0.55 && f.overrideReason!.length < 5) throw new ApiError(400, "Say briefly why this is a different complaint");

  const uploads = await saveUploads(form.getAll("photo"));
  if (uploads.error) throw new ApiError(400, uploads.error);

  const subject = sample?.subject ?? (processed.source === "unavailable" || processed.source === "glossary" ? `${processed.category} complaint (${languageName(code)})` : processed.summary || processed.translation.split(/[.!?]/)[0].slice(0, 80));
  const bureau = ROUTING[processed.category];
  // same overlap engine as the officer desks; the result is shown only to the Competent Authority
  const overlaps = similarOpenCases(db, draftCase(db, { institutionId: s.institutionId, category: processed.category, subject: maskPii(subject, processed.names), description: maskPii(processed.translation, processed.names), bureau }));

  const created = mutate((d) => {
    const now = new Date().toISOString();
    const stu = d.students.find((x) => x.id === s.id)!;
    if (!stu.consents.some((c) => c.version === CONSENT_VERSION)) stu.consents.push({ version: CONSENT_VERSION, at: now });
    const suspicious: string[] = [];
    if (near && near.score >= 0.55) suspicious.push(`Filed anyway though similar to this student's open complaint ${near.complaint.id} (${Math.round(near.score * 100)}% text match). Student's reason: ${f.overrideReason}`);
    const burst = burstCount(d, s.institutionId) + 1;
    if (burst >= 5) suspicious.push(`Burst: ${burst} complaints against this institution within 72 hours. Verify genuineness; do not act on volume alone.`);
    if (own.length >= 4 && own.filter((c) => Date.now() - new Date(c.createdAt).getTime() < 7 * DAY).length >= 3) suspicious.push("High filing rate from one account in the past 7 days");
    const nodal = d.signals.find((x) => x.institutionId === s.institutionId)?.nodalOfficer ?? "Nodal officer";
    const c: StudentComplaint = {
      id: nextComplaintId(d),
      studentId: s.id,
      pseudonym: s.pseudonym,
      institutionId: s.institutionId,
      category: processed.category,
      subject,
      channel: uploads.docs.length && channel === "Text" ? "Photo" : channel,
      language: languageName(code),
      originalText: text,
      translatedText: processed.translation,
      translationSource: processed.source,
      severity: processed.severity,
      severityReason: processed.severityReason,
      categoryReason: processed.categoryReason,
      routedBureau: bureau,
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
      actions: [{ at: now, type: "Filed", by: s.pseudonym, remarks: `Complaint submitted through the student portal (${channel.toLowerCase()}, ${languageName(code)}). Now with the college, awaiting a response.` }],
      suspicious,
      round: 1,
      rounds: [],
      overlapFlags: overlaps.map((o) => ({ caseId: o.caseId, confidence: o.confidence, reasons: o.reasons })),
      maskNames: processed.names,
      maskLevel: processed.maskLevel,
      aiSummary: processed.summary,
      aiCues: processed.cues,
    };
    d.studentComplaints.push(c);
    audit(d, { role: "student", actor: s.pseudonym, action: "STUDENT_COMPLAINT", target: c.id, detail: `${c.category}, sent to the college with ${c.routedBureau} as the AICTE unit` });
    return studentView(d, c);
  });
  return json({ complaint: created });
});
