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
  channel: "AICTE Portal" | "Email" | "Post" | "CPGRAMS" | "Helpline" | "Referred by Ministry";
  language: string;
  subject: string;
  description: string;
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
}

export type RoleKey = "ca" | "rb" | "pgrc" | "other" | "ro";
