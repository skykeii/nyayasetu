export type Region =
  | "Northern"
  | "Southern"
  | "Eastern"
  | "Western"
  | "Central"
  | "North-Western"
  | "South-Western"
  | "North-Eastern";

export const REGIONS: Region[] = [
  "Northern",
  "Southern",
  "Eastern",
  "Western",
  "Central",
  "North-Western",
  "South-Western",
  "North-Eastern",
];

export type BureauCode = "RB" | "PGRC" | "AB" | "PAPB" | "ARC";

export const BUREAUS: { code: BureauCode; name: string; short: string }[] = [
  { code: "RB", name: "Regulation Bureau", short: "RB" },
  { code: "PGRC", name: "Public Grievance Redressal Cell", short: "PGRC" },
  { code: "AB", name: "Approval Bureau", short: "AB" },
  { code: "PAPB", name: "Policy & Academic Planning Bureau", short: "PAPB" },
  { code: "ARC", name: "Anti-Ragging Cell", short: "ARC" },
];

export const OTHER_BUREAUS: BureauCode[] = ["AB", "PAPB", "ARC"];

export type Category =
  | "Fee / Refund"
  | "Faculty Qualification"
  | "Infrastructure"
  | "Admission Irregularity"
  | "Harassment / Ragging"
  | "Fake Affiliation Claim"
  | "Exam / Result"
  | "Placement Misrepresentation";

export const CATEGORIES: Category[] = [
  "Fee / Refund",
  "Faculty Qualification",
  "Infrastructure",
  "Admission Irregularity",
  "Harassment / Ragging",
  "Fake Affiliation Claim",
  "Exam / Result",
  "Placement Misrepresentation",
];

export type Status = "New" | "Under Process" | "Transferred" | "Escalated" | "Disposed";
export const STATUSES: Status[] = ["New", "Under Process", "Transferred", "Escalated", "Disposed"];

export type Severity = "Low" | "Medium" | "High" | "Critical";

export type InstitutionType = "Engineering" | "Management" | "Pharmacy" | "Architecture" | "Polytechnic" | "MCA";

export interface Institution {
  id: string; // AICTE Permanent ID e.g. 1-1234567890
  name: string;
  shortName: string;
  type: InstitutionType;
  address: string;
  city: string;
  state: string;
  region: Region;
  established: number;
  enrolment: number;
  approvedIntake: number;
}

export interface Officer {
  id: string;
  name: string;
  designation: string;
  bureau: BureauCode | "RO";
  region?: Region;
}

export type ActionType =
  | "Received"
  | "Assigned"
  | "Remark"
  | "Notice Issued"
  | "Reply Received"
  | "Hearing Scheduled"
  | "Status Change"
  | "Transferred"
  | "Escalated"
  | "Linked"
  | "Coordinated"
  | "Disposed";

export interface DocRef {
  name: string;
  size: number;
  file?: string; // stored file name under data/uploads
}

export interface CaseAction {
  id: string;
  at: string; // ISO
  type: ActionType;
  by: string; // officer name
  bureau: BureauCode | "RO" | "CA" | "SYSTEM";
  remarks: string;
  docs?: DocRef[];
  from?: string;
  to?: string;
}

export interface Case {
  id: string; // NS-2026-00001
  reference: string; // bureau's own file reference
  dateReceived: string;
  category: Category;
  status: Status;
  severity: Severity;
  bureau: BureauCode;
  officerId: string;
  institutionId: string; // resolved institution (system of record)
  reportedName: string; // institution name as written by complainant
  reportedPid?: string; // permanent ID as quoted by complainant (may be missing/mistyped)
  matchConfidence: number; // confidence of institution resolution at intake (advisory)
  matchReason: string;
  complainantType: "Student" | "Parent" | "Faculty" | "Staff" | "Anonymous" | "Public";
  complainantName: string;
  channel: "AICTE Portal" | "Email" | "Post" | "CPGRAMS" | "Helpline" | "Referred by Ministry" | "Voice Intake" | "Student Portal";
  language: string;
  subject: string;
  description: string;
  originalText?: string; // transcript or text as given, when not in English
  translationSource?: TranslationSource;
  studentComplaintId?: string;
  lastAction: string;
  lastActionDate: string;
  nextAction: string;
  expectedDisposalDate: string;
  disposedAt?: string;
  linkGroupId?: string;
  actions: CaseAction[];
  planted?: string; // seed marker for demo (overlap|sla|chain|burst)
}

export interface LinkGroup {
  id: string;
  caseIds: string[];
  status: "Linked" | "Coordinated";
  leadBureau: BureauCode;
  note: string;
  by: string;
  at: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  role: string;
  actor: string;
  action: string;
  target: string;
  detail: string;
}

export interface Settings {
  slaDays: Record<Category, number>;
  reminderNoActionDays: number;
  warningWindowDays: number;
  overlapMinConfidence: number;
  collegeReminders: { farDays: number; nearDays: number; finalDays: number };
  verifyWindowDays: number;
  escalationGraceDays: number;
}

// ---------------- student layer ----------------
export type TranslationSource = "original" | "sample" | "llm" | "glossary" | "unavailable";

export type StudentStatus = "With College" | "Resolved - Pending Verification" | "Closed - Verified" | "Closed - Unverified" | "Escalated to AICTE" | "Closed by AICTE";

export interface StudentAccount {
  id: string;
  apaarId: string;
  mobile: string;
  name: string;
  rollNo: string;
  institutionId: string;
  pseudonym: string; // "Student #A7F3"
  pulseTermsDone: string[];
  pulseInvited: boolean;
  demo?: boolean;
}

export interface EvidenceReport {
  score: number; // 0-100, advisory
  verdict: "Likely matches" | "Partial match" | "Weak match";
  explanation: string;
  source: "mock" | "llm";
  at: string;
}

export interface StudentAction {
  at: string;
  type: string;
  by: string;
  remarks: string;
}

export interface CollegeReminder {
  at: string;
  channel: "In-app" | "SMS (simulated)";
  to: string;
  message: string;
}

export interface StudentComplaint {
  id: string; // SC-2026-00001
  studentId: string;
  pseudonym: string;
  institutionId: string;
  category: Category;
  subject: string;
  channel: "Text" | "Voice" | "Photo";
  language: string;
  originalText: string;
  translatedText: string;
  translationSource: TranslationSource;
  severity: Severity;
  severityReason: string;
  categoryReason: string;
  routedBureau: BureauCode;
  status: StudentStatus;
  createdAt: string;
  dueAt: string;
  escalationLevel: 0 | 1 | 2; // 0 nodal officer, 1 principal, 2 AICTE
  photo?: DocRef;
  proof?: { note: string; docs: DocRef[]; at: string; by: string };
  evidence?: EvidenceReport;
  verifyBy?: string;
  closedAt?: string;
  reopened?: boolean;
  caseId?: string;
  lastReminderAt?: string;
  reminders: CollegeReminder[];
  actions: StudentAction[];
  suspicious: string[]; // visible to AICTE only
}

export const PULSE_QUESTIONS = ["infrastructure", "faculty", "fees", "safety"] as const;
export type PulseQuestion = (typeof PULSE_QUESTIONS)[number];

/** Pulse answers are stored only as totals, so no response can be traced to a student. */
export interface PulseAggregate {
  institutionId: string;
  term: string;
  invited: number;
  responded: number;
  sums: Record<PulseQuestion, number>;
  unable: number; // said they felt unable to complain
}

export interface InstitutionSignals {
  institutionId: string;
  nodalOfficer: string;
  actualIntake: number;
  feeCharged: number;
  feeNorm: number;
  complianceValidUntil: string;
  profile?: "silent";
}

export interface StudentSession {
  token: string;
  studentId: string;
  expiresAt: string;
}

export interface Db {
  version: number;
  seededAt: string;
  institutions: Institution[];
  officers: Officer[];
  cases: Case[];
  linkGroups: LinkGroup[];
  dismissedPairs: string[]; // "caseA|caseB"
  alertReads: Partial<Record<RoleKey, string[]>>;
  audit: AuditEntry[];
  settings: Settings;
  counters: { case: number; action: number; audit: number; group: number };
  students: StudentAccount[];
  studentComplaints: StudentComplaint[];
  studentSessions: StudentSession[];
  otpRequests: { key: string; at: string; kind: "request" | "fail" }[];
  pulse: PulseAggregate[];
  signals: InstitutionSignals[];
}

export type RoleKey = "ca" | "rb" | "pgrc" | "other" | "ro" | "college";
