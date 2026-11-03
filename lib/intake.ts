import type { Category, DocRef, EvidenceReport, Severity, TranslationSource } from "./types";
import { hashStr } from "./util";

/** Pure intake helpers, safe to import from client components. Everything here is advisory. */

export const LANGUAGES = [
  { code: "en-IN", label: "English" },
  { code: "hi-IN", label: "Hindi" },
  { code: "te-IN", label: "Telugu" },
  { code: "ta-IN", label: "Tamil" },
  { code: "bn-IN", label: "Bengali" },
  { code: "mr-IN", label: "Marathi" },
] as const;
export type LanguageCode = (typeof LANGUAGES)[number]["code"];
export const languageName = (code: string) => LANGUAGES.find((l) => l.code === code)?.label ?? "English";

export const DEMO_OTP = "123456";
export const DEMO_COLLEGE_INDEX = 20; // Krishna Tejaswi Institute of Technology
export const PULSE_TERM = "2026-T2";
export const LIMITS = { otpPer10Min: 3, openComplaints: 5, perDay: 5 };
export const CONSENT_VERSION = "2026-11-v1";

export const DEMO_STUDENTS = [
  { apaarId: "APAAR-2046-1001", mobile: "9000000001", name: "Sravani Yerramilli", rollNo: "KTIT22CS041", collegeIndex: DEMO_COLLEGE_INDEX },
  { apaarId: "APAAR-2046-1002", mobile: "9000000002", name: "Mohit Kandukuri", rollNo: "KTIT23EC017", collegeIndex: DEMO_COLLEGE_INDEX },
  { apaarId: "APAAR-2046-2001", mobile: "9000000003", name: "Lavanya Sekar", rollNo: "KPCE24ME102", collegeIndex: 5 },
];
// Students 4 and 5 start with no complaints, so a demo complaint from them moves the risk index and heatmap counts
export const FRESH_DEMO_STUDENTS = [
  { apaarId: "APAAR-2046-1003", mobile: "9000000004", name: "Keerthana Bollineni", rollNo: "KTIT24ME023", collegeIndex: DEMO_COLLEGE_INDEX },
  { apaarId: "APAAR-2046-1004", mobile: "9000000005", name: "Arjun Pothineni", rollNo: "KTIT24CV058", collegeIndex: DEMO_COLLEGE_INDEX },
];

export interface VoiceSample {
  id: string;
  code: LanguageCode;
  language: string;
  institutionHint: string;
  subject: string;
  category: Category;
  original: string;
  translation: string;
}

export const VOICE_SAMPLES: VoiceSample[] = [
  { id: "v-hi-1", code: "hi-IN", language: "Hindi", institutionHint: "Gangotri Gyanpeeth", subject: "Fee refund not given after withdrawal", category: "Fee / Refund", original: "मैंने दो हफ्ते में ही अपना एडमिशन रद्द कर दिया था, लेकिन कॉलेज फीस वापस नहीं कर रहा है और मेरे मूल प्रमाण पत्र भी रोक लिए हैं।", translation: "I cancelled my admission within two weeks, but the college is not refunding the fee and has also withheld my original certificates." },
  { id: "v-hi-2", code: "hi-IN", language: "Hindi", institutionHint: "Saraswati Vidyapeeth", subject: "Ragging in the hostel at night", category: "Harassment / Ragging", original: "हॉस्टल में सीनियर छात्र रात को जूनियर छात्रों की रैगिंग करते हैं और शिकायत करने पर धमकी देते हैं। वार्डन कुछ नहीं करते।", translation: "Senior students rag junior students in the hostel at night and threaten us if we complain. The warden does nothing." },
  { id: "v-te-1", code: "te-IN", language: "Telugu", institutionHint: "Krishna Tejaswi", subject: "Labs not working, practicals not conducted", category: "Infrastructure", original: "మా కాలేజీలో ల్యాబ్‌లు పని చేయడం లేదు. పరికరాలు లేకుండానే ప్రాక్టికల్ మార్కులు వేస్తున్నారు. హాస్టల్‌లో తాగునీరు కూడా లేదు.", translation: "The labs in our college are not working. Practical marks are being given without any equipment. There is no drinking water in the hostel either." },
  { id: "v-te-2", code: "te-IN", language: "Telugu", institutionHint: "Deccan Plateau", subject: "Semester results withheld for fee dues", category: "Exam / Result", original: "ఫీజు బకాయి ఉందని చెప్పి నా సెమిస్టర్ ఫలితాలు నాలుగు నెలలుగా ఆపేశారు. ఉద్యోగానికి దరఖాస్తు చేయలేకపోతున్నాను.", translation: "Saying that fee dues are pending, they have withheld my semester results for four months. I am unable to apply for jobs." },
  { id: "v-ta-1", code: "ta-IN", language: "Tamil", institutionHint: "Kaveri Pragati", subject: "Unqualified teachers taking classes", category: "Faculty Qualification", original: "எங்கள் துறையில் தகுதியான ஆசிரியர்கள் இல்லை. இணையதளத்தில் உள்ள பேராசிரியர்கள் ஒரு வகுப்பும் எடுத்ததில்லை.", translation: "There are no qualified teachers in our department. The professors listed on the website have never taken a single class." },
  { id: "v-ta-2", code: "ta-IN", language: "Tamil", institutionHint: "Vaigai Valley", subject: "Placement promised but no companies came", category: "Placement Misrepresentation", original: "நூறு சதவீத வேலைவாய்ப்பு என்று விளம்பரம் செய்தார்கள், ஆனால் இந்த ஆண்டு எந்த நிறுவனமும் வரவில்லை. பயிற்சிக் கட்டணமும் வாங்கினார்கள்.", translation: "They advertised one hundred percent placement, but no company has come this year. They also collected a training fee." },
  { id: "v-bn-1", code: "bn-IN", language: "Bengali", institutionHint: "Kanchenjunga Vista", subject: "Extra fee collected without receipt", category: "Fee / Refund", original: "কলেজ রসিদ ছাড়াই অতিরিক্ত উন্নয়ন ফি নিচ্ছে। আপত্তি করলে পরীক্ষায় বসতে দেবে না বলে ভয় দেখাচ্ছে।", translation: "The college is taking an extra development fee without a receipt. If we object, they threaten not to let us sit for the exam." },
  { id: "v-bn-2", code: "bn-IN", language: "Bengali", institutionHint: "Sundarban Delta", subject: "Course claimed as AICTE approved is not", category: "Fake Affiliation Claim", original: "আমাদের বলা হয়েছিল কোর্সটি এআইসিটিই অনুমোদিত, কিন্তু এখন জানলাম অনুমোদন নেই। আমাদের ডিগ্রি বৈধ হবে কিনা জানি না।", translation: "We were told the course is AICTE approved, but now we have learned there is no approval. We do not know whether our degree will be valid." },
  { id: "v-mr-1", code: "mr-IN", language: "Marathi", institutionHint: "Sahyadri Vista", subject: "Management quota seats sold for cash", category: "Admission Irregularity", original: "महाविद्यालयाने गुणवत्ता यादी जाहीर न करता व्यवस्थापन कोट्यातील जागा रोख पैसे घेऊन दिल्या. मंजूर प्रवेश क्षमतेपेक्षा जास्त प्रवेश दिले आहेत.", translation: "The college gave management quota seats for cash without publishing a merit list. Admissions beyond the approved intake have been given." },
  { id: "v-mr-2", code: "mr-IN", language: "Marathi", institutionHint: "Bhima Sangam", subject: "Harassment by a faculty member", category: "Harassment / Ragging", original: "एक प्राध्यापक विद्यार्थिनींशी अयोग्य बोलतात आणि तक्रार केल्यास गुण कमी करण्याची धमकी देतात. समिती काहीच करत नाही.", translation: "A professor speaks inappropriately to female students and threatens to reduce marks if anyone complains. The committee does nothing." },
  { id: "v-en-1", code: "en-IN", language: "English", institutionHint: "Godavari Delta", subject: "Internal marks altered after submission", category: "Exam / Result", original: "My internal assessment marks were changed after submission and I was declared failed. The examination cell is refusing to accept my revaluation request.", translation: "My internal assessment marks were changed after submission and I was declared failed. The examination cell is refusing to accept my revaluation request." },
  { id: "v-en-2", code: "en-IN", language: "English", institutionHint: "Krishna Tejaswi", subject: "Hostel rooms overcrowded and unsafe", category: "Infrastructure", original: "Rooms meant for two students are shared by four, the washrooms are broken and the hostel wiring is unsafe. Nothing has changed in spite of repeated requests to the warden.", translation: "Rooms meant for two students are shared by four, the washrooms are broken and the hostel wiring is unsafe. Nothing has changed in spite of repeated requests to the warden." },
];

const KEYWORDS: Record<Category, string[]> = {
  "Fee / Refund": ["fee", "fees", "refund", "deposit", "receipt", "certificate", "certificates", "caution", "tuition", "दाखला", "फीस", "వాపసు", "ఫీజు", "கட்டண", "ফি", "রসিদ", "शुल्क"],
  "Faculty Qualification": ["faculty", "teacher", "teachers", "professor", "lecturer", "hod", "qualification", "qualified", "ghost", "शिक्षक", "అధ్యాపక", "ஆசிரியர்", "பேராசிரியர்", "শিক্ষক"],
  Infrastructure: ["lab", "labs", "laboratory", "hostel", "library", "building", "washroom", "water", "equipment", "wiring", "mess", "ల్యాబ్", "హాస్టల్", "லேப்", "விடுதி", "ল্যাব", "হোস্টেল", "प्रयोगशाळा"],
  "Admission Irregularity": ["admission", "merit", "intake", "capitation", "quota", "seat", "seats", "counselling", "एडमिशन", "प्रवेश", "ప్రవేశ", "சேர்க்கை", "ভর্তি"],
  "Harassment / Ragging": ["ragging", "ragged", "rag", "harass", "harassed", "harassment", "threaten", "threatened", "bully", "inappropriate", "रैगिंग", "धमकी", "धमकी देतात", "ర్యాగింగ్", "వేధింపు", "ராகிங்", "துன்புறுத்தல்", "র‍্যাগিং", "হয়রানি"],
  "Fake Affiliation Claim": ["approved", "approval", "affiliation", "affiliated", "accreditation", "nba", "off-campus", "fake", "अनुमोदित", "मान्यता", "గుర్తింపు", "அங்கீகாரம்", "অনুমোদ"],
  "Exam / Result": ["exam", "exams", "examination", "result", "results", "marks", "revaluation", "semester", "paper", "परीक्षा", "परिणाम", "ఫలితాలు", "పరీక్ష", "தேர்வு", "முடிவு", "পরীক্ষা", "ফলাফল"],
  "Placement Misrepresentation": ["placement", "placements", "package", "recruiter", "companies", "company", "offer", "bond", "प्लेसमेंट", "ప్లేస్‌మెంట్", "வேலைவாய்ப்பு", "প্লেসমেন্ট"],
};

export function categoryOf(text: string): { category: Category; confidence: number; reason: string } {
  const lower = text.toLowerCase();
  const words = new Set(lower.split(/[^\p{L}\p{M}-]+/u));
  const hitsFor = (cat: Category) => KEYWORDS[cat].filter((k) => (/^[a-z-]+$/.test(k) ? words.has(k) : lower.includes(k)));
  let best: { category: Category; hits: string[] } = { category: "Infrastructure", hits: [] };
  for (const cat of Object.keys(KEYWORDS) as Category[]) {
    const hits = hitsFor(cat);
    if (hits.length > best.hits.length) best = { category: cat, hits };
  }
  // a safety report must reach the Anti-Ragging Cell even when other topics are mentioned too
  const safety = hitsFor("Harassment / Ragging");
  if (safety.length) best = { category: "Harassment / Ragging", hits: safety };
  if (!best.hits.length) return { category: "Infrastructure", confidence: 0.3, reason: "No clear category terms; the official should review the category" };
  return { category: best.category, confidence: Math.min(0.95, 0.5 + best.hits.length * 0.15), reason: `Matched terms: ${best.hits.slice(0, 4).join(", ")}` };
}

const CRITICAL = ["suicide", "assault", "ragging", "ragged", "rag", "harass", "harassed", "harassment", "threaten", "threatened", "molest", "unsafe"];
const HIGH = ["certificate", "certificates", "withheld", "fraud", "fake", "cash", "capitation", "invalid", "detention", "failed", "not valid", "not approved", "no approval"];

export function severityOf(text: string, category: Category): { severity: Severity; reason: string } {
  const lower = text.toLowerCase();
  const words = new Set(lower.split(/[^a-z-]+/));
  const crit = CRITICAL.filter((k) => words.has(k));
  if (category === "Harassment / Ragging" || crit.length) return { severity: "Critical", reason: crit.length ? `safety terms: ${crit.slice(0, 3).join(", ")}` : "harassment or ragging category" };
  const high = HIGH.filter((k) => (k.includes(" ") ? lower.includes(k) : words.has(k)));
  if (high.length) return { severity: "High", reason: `serious terms: ${high.slice(0, 3).join(", ")}` };
  if (category === "Infrastructure" || category === "Placement Misrepresentation") return { severity: "Medium", reason: "routine for this category" };
  return { severity: "Medium", reason: "no serious terms found" };
}

const GLOSSARY: [string, string][] = [
  ["फीस", "fee"], ["धमकी", "threatened"], ["रैगिंग", "ragging"], ["हॉस्टल", "hostel"], ["परीक्षा", "exam"], ["प्रमाण पत्र", "certificates"], ["एडमिशन", "admission"], ["शिक्षक", "teachers"],
  ["ఫీజు", "fee"], ["హాస్టల్", "hostel"], ["ల్యాబ్", "lab"], ["ఫలితాలు", "results"], ["పరీక్ష", "exam"], ["ర్యాగింగ్", "ragging"],
  ["கட்டண", "fee"], ["ஆசிரியர்", "teachers"], ["தேர்வு", "exam"], ["ராகிங்", "ragging"], ["விடுதி", "hostel"], ["வேலைவாய்ப்பு", "placement"],
  ["ফি", "fee"], ["পরীক্ষা", "exam"], ["হোস্টেল", "hostel"], ["অনুমোদ", "approval"], ["ল্যাব", "lab"],
  ["प्रवेश", "admission"], ["शुल्क", "fee"], ["प्राध्यापक", "professor"], ["धमकी देतात", "threatened"], ["प्रयोगशाळा", "lab"],
];

/** Offline translation: a known sample, or a gloss of recognised words. It never invents a sentence. */
export function translateOffline(text: string, code: string, sampleId?: string): { translation: string; source: TranslationSource } {
  if (code === "en-IN") return { translation: text, source: "original" };
  const sample = VOICE_SAMPLES.find((s) => s.id === sampleId || s.original === text.trim());
  if (sample) return { translation: sample.translation, source: "sample" };
  const hits = [...new Set(GLOSSARY.filter(([k]) => text.includes(k)).map(([, v]) => v))];
  if (hits.length) return { translation: `Word gloss only, not a full translation. Terms recognised: ${hits.join(", ")}. An official should read the original.`, source: "glossary" };
  return { translation: "Translation unavailable offline. The original text is kept for an official to read.", source: "unavailable" };
}

/** Removes contact details and self-identification before a college sees the text. */
export function maskPii(text: string, names: string[] = []) {
  const known = names.reduce((t, n) => t.split(n).join("[name hidden]"), text);
  return known
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email hidden]")
    .replace(/(\+?91[\s-]?)?\b[6-9]\d{9}\b/g, "[phone hidden]")
    .replace(/\b(roll\s*(no|number)?\.?\s*[:#-]?\s*)[\w/-]+/gi, "[roll number hidden]")
    .replace(/\bAPAAR[-\s]?[\w-]+/gi, "[ID hidden]")
    .replace(/\b[A-Z]{2,6}\d{2}[A-Z]{0,4}\d{2,4}\b/g, "[roll number hidden]")
    .replace(/\b([Mm]y name is|[Tt]his is|I am called)\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)?/g, "[name hidden]")
    .replace(/(मेरा नाम|माझे नाव|నా పేరు|என் பெயர்|আমার নাম)\s+\S+(\s+\S+)?/g, "[name hidden]");
}

/** Applied to all text before it leaves for an AI provider. */
export const redactForAi = (text: string) => maskPii(text);

export const pseudonymFor = (studentId: string) => `Student #${hashStr(`nyayasetu:${studentId}`).toUpperCase().padStart(4, "0").slice(-4)}`;

export const URGENCY_SEVERITY: Record<Severity, number> = { Critical: 70, High: 52, Medium: 36, Low: 20 };

/** Urgency 0-100 = severity x ageing x SLA proximity x similar complaints. */
export function urgencyOf(o: { severity: Severity; createdAt: string; dueAt: string; similar: number; now?: number }) {
  const now = o.now ?? Date.now();
  const total = Math.max(1, new Date(o.dueAt).getTime() - new Date(o.createdAt).getTime());
  const elapsed = Math.max(0, (now - new Date(o.createdAt).getTime()) / total);
  const daysLeft = Math.ceil((new Date(o.dueAt).getTime() - now) / 86400000);
  const ageing = 1 + Math.min(1, elapsed) * 0.15;
  const proximity = daysLeft < 0 ? 1.35 : 1 + Math.max(0, elapsed - 0.5) * 0.5;
  const similar = 1 + Math.min(o.similar, 4) * 0.05;
  const score = Math.min(100, Math.round(URGENCY_SEVERITY[o.severity] * ageing * proximity * similar));
  const label = score >= 70 ? "Critical" : score >= 50 ? "High" : score >= 30 ? "Medium" : "Low";
  const when = daysLeft < 0 ? `${-daysLeft}d overdue` : `${daysLeft}d to disposal date`;
  const reason = `${o.severity} severity, ${when}${o.similar ? `, ${o.similar} similar complaint${o.similar === 1 ? "" : "s"}` : ""}`;
  return { score, label: label as Severity, reason, daysLeft };
}

const EVIDENCE_TERMS: Record<Category, string[]> = {
  "Fee / Refund": ["refund", "receipt", "ledger", "fee", "returned", "certificate"],
  "Faculty Qualification": ["appointment", "qualification", "faculty", "order", "teacher"],
  Infrastructure: ["photo", "lab", "repair", "installed", "hostel", "equipment", "water"],
  "Admission Irregularity": ["merit", "register", "admission", "intake"],
  "Harassment / Ragging": ["committee", "inquiry", "suspended", "squad", "action"],
  "Fake Affiliation Claim": ["withdrawn", "clarification", "approval", "corrected"],
  "Exam / Result": ["result", "marks", "declared", "revaluation"],
  "Placement Misrepresentation": ["offer", "withdrawn", "refund", "records"],
};

/** Deterministic stand-in for vision review: scores what was submitted, never what is true. */
export function mockEvidence(o: { category: Category; note: string; docs: DocRef[]; at: string }): EvidenceReport {
  const lower = o.note.toLowerCase();
  const terms = EVIDENCE_TERMS[o.category].filter((t) => lower.includes(t));
  const image = o.docs.some((d) => /\.(png|jpe?g|webp)$/i.test(d.name));
  const jitter = parseInt(hashStr(o.note + o.docs.map((d) => d.name).join()).slice(0, 2), 36) % 11;
  const score = Math.min(92, 30 + Math.min(terms.length, 3) * 14 + (image ? 12 : 0) + (o.note.length >= 60 ? 8 : 0) + jitter);
  const parts = [
    terms.length ? `The note mentions ${terms.slice(0, 3).join(", ")}, which fits this ${o.category} complaint.` : `The note does not mention terms expected for a ${o.category} complaint.`,
    image ? "A photo was attached." : "No photo was attached, only a document.",
    "Files were not visually inspected, so an official or the student must judge them.",
  ];
  return { score, verdict: score >= 70 ? "Likely matches" : score >= 50 ? "Partial match" : "Weak match", explanation: parts.join(" "), source: "mock", at: o.at };
}

