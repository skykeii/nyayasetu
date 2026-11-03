import type { BureauCode, Region, RoleKey } from "./types";

export interface RoleDef {
  key: RoleKey;
  label: string;
  short: string;
  bureaus: BureauCode[] | "all";
  regional: boolean;
  defaultOfficer: string;
  can: { act: boolean; link: boolean; settings: boolean; audit: boolean; simulate: boolean };
  // role experience: what this role sees once signed in
  nav: string[];
  landing: string;
  accent: string;
  badge: string;
  api: string[] | "all"; // API prefixes the role may call, enforced in middleware.ts
}

const OFFICER_NAV = ["/desk", "/cases", "/intake", "/institutions", "/overlaps", "/heatmap", "/alerts", "/reports"];
const OFFICER_API = ["/api/alerts", "/api/cases", "/api/dashboard", "/api/files", "/api/heatmap", "/api/institutions", "/api/intake", "/api/overlaps", "/api/reports", "/api/simulate", "/api/ai"];

export const ROLES: Record<RoleKey, RoleDef> = {
  ca: {
    key: "ca",
    label: "Competent Authority / Senior Management",
    short: "Competent Authority",
    bureaus: "all",
    regional: false,
    defaultOfficer: "CA-1",
    can: { act: true, link: true, settings: true, audit: true, simulate: true },
    nav: ["/", "/cases", "/intake", "/institutions", "/overlaps", "/heatmap", "/grievances", "/alerts", "/reports", "/audit", "/settings"],
    landing: "/",
    accent: "#AA5419",
    badge: "Competent Authority",
    api: "all",
  },
  rb: {
    key: "rb",
    label: "Regulation Bureau Officer",
    short: "RB Officer",
    bureaus: ["RB"],
    regional: false,
    defaultOfficer: "RB-2",
    can: { act: true, link: true, settings: false, audit: false, simulate: true },
    nav: OFFICER_NAV,
    landing: "/desk",
    accent: "#42517F",
    badge: "RB Officer",
    api: OFFICER_API,
  },
  pgrc: {
    key: "pgrc",
    label: "Public Grievance Redressal Cell Officer",
    short: "PGRC Officer",
    bureaus: ["PGRC"],
    regional: false,
    defaultOfficer: "PGRC-2",
    can: { act: true, link: true, settings: false, audit: false, simulate: true },
    nav: OFFICER_NAV,
    landing: "/desk",
    accent: "#3B6731",
    badge: "PGRC Officer",
    api: OFFICER_API,
  },
  other: {
    key: "other",
    label: "Other Bureau / Cell Officer (AB, PAPB, ARC)",
    short: "Bureau/Cell Officer",
    bureaus: ["AB", "PAPB", "ARC"],
    regional: false,
    defaultOfficer: "AB-2",
    can: { act: true, link: true, settings: false, audit: false, simulate: true },
    nav: OFFICER_NAV,
    landing: "/desk",
    accent: "#2A6563",
    badge: "Bureau/Cell Officer",
    api: OFFICER_API,
  },
  ro: {
    key: "ro",
    label: "Regional Office Officer",
    short: "Regional Officer",
    bureaus: "all",
    regional: true,
    defaultOfficer: "RO-S",
    can: { act: false, link: false, settings: false, audit: false, simulate: false },
    nav: ["/", "/heatmap", "/cases", "/institutions", "/overlaps", "/alerts", "/reports"],
    landing: "/",
    accent: "#823D66",
    badge: "Regional Officer",
    api: OFFICER_API.filter((p) => p !== "/api/intake" && p !== "/api/simulate"),
  },
  college: {
    key: "college",
    label: "College Nodal Officer",
    short: "College Nodal Officer",
    bureaus: [],
    regional: false,
    defaultOfficer: "COL",
    can: { act: false, link: false, settings: false, audit: false, simulate: false },
    nav: ["/college"],
    landing: "/college",
    accent: "#9E6813",
    badge: "College Nodal Officer",
    api: ["/api/college", "/api/alerts", "/api/files"],
  },
  student: {
    key: "student",
    label: "Student",
    short: "Student",
    bureaus: [],
    regional: false,
    defaultOfficer: "STU",
    can: { act: false, link: false, settings: false, audit: false, simulate: false },
    nav: ["/student"],
    landing: "/student",
    accent: "#9A3D4A",
    badge: "Student",
    api: ["/api/student", "/api/ai/transcribe"],
  },
};

export const ROLE_KEYS = Object.keys(ROLES) as RoleKey[];

// any signed-in role may call these
const COMMON_API = ["/api/auth", "/api/ai/status", "/api/meta"];

export function canCallApi(role: RoleKey, pathname: string) {
  const allowed = ROLES[role].api;
  const match = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
  return allowed === "all" || allowed.some(match) || COMMON_API.some(match);
}

export function canOpenPage(role: RoleKey, pathname: string) {
  const base = `/${pathname.split("/")[1] ?? ""}`;
  return ROLES[role].nav.includes(base);
}

export interface Viewer {
  role: RoleKey;
  region: Region;
  officerId: string;
  accountId: string;
  institutionId?: string; // college role
  studentId?: string; // student role
}
