import type { RoleKey } from "./types";

/** Synthetic demo sign-ins, shown only on /login. */
export const DEMO_PASSWORD = "Nyaya@Demo2026";
export const DEMO_2FA = "123456";
export const DEMO_DOMAIN = "nyayasetu.demo";

export const officerEmail = (name: string) =>
  `${name
    .replace(/^(Dr\.|Prof\.|Shri|Smt\.|Ms\.)\s+/, "")
    .toLowerCase()
    .replace(/\.\s*/g, ".")
    .replace(/\s+/g, ".")
    .replace(/[^a-z.]/g, "")}@${DEMO_DOMAIN}`;

export const collegeEmail = (institutionName: string) => `nodal.${institutionName.split(" ").slice(0, 2).join("-").toLowerCase().replace(/[^a-z-]/g, "")}@${DEMO_DOMAIN}`;

export const DEMO_OFFICIALS: { role: RoleKey; label: string; email: string; note?: string }[] = [
  { role: "ca", label: "Competent Authority", email: officerEmail("Prof. A. K. Mathur"), note: "2FA code 123456" },
  { role: "rb", label: "RB Officer", email: officerEmail("Smt. Kavita Deshpande") },
  { role: "pgrc", label: "PGRC Officer", email: officerEmail("Shri Manoj Kulkarni") },
  { role: "other", label: "Other Bureau/Cell (AB)", email: officerEmail("Smt. Neha Agarwal") },
  { role: "ro", label: "Regional Officer, Southern", email: officerEmail("Dr. Revathi Krishnan") },
  { role: "college", label: "College Nodal, Krishna Tejaswi", email: collegeEmail("Krishna Tejaswi Institute of Technology") },
];
