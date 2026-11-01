import type { BureauCode, Region, RoleKey } from "./types";

export interface RoleDef {
  key: RoleKey;
  label: string;
  short: string;
  bureaus: BureauCode[] | "all";
  regional: boolean;
  defaultOfficer: string;
  can: { act: boolean; link: boolean; settings: boolean; audit: boolean; simulate: boolean };
  nav: string[];
}

export const ROLES: Record<RoleKey, RoleDef> = {
  ca: {
    key: "ca",
    label: "Competent Authority / Senior Management",
    short: "Competent Authority",
    bureaus: "all",
    regional: false,
    defaultOfficer: "CA-1",
    can: { act: true, link: true, settings: true, audit: true, simulate: true },
    nav: ["/", "/cases", "/intake", "/institutions", "/overlaps", "/grievances", "/alerts", "/reports", "/audit", "/settings"],
  },
  rb: {
    key: "rb",
    label: "Regulation Bureau Officer",
    short: "RB Officer",
    bureaus: ["RB"],
    regional: false,
    defaultOfficer: "RB-2",
    can: { act: true, link: true, settings: false, audit: false, simulate: true },
    nav: ["/", "/cases", "/intake", "/institutions", "/overlaps", "/grievances", "/alerts", "/reports"],
  },
  pgrc: {
    key: "pgrc",
    label: "Public Grievance Redressal Cell Officer",
    short: "PGRC Officer",
    bureaus: ["PGRC"],
    regional: false,
    defaultOfficer: "PGRC-2",
    can: { act: true, link: true, settings: false, audit: false, simulate: true },
    nav: ["/", "/cases", "/intake", "/institutions", "/overlaps", "/grievances", "/alerts", "/reports"],
  },
  other: {
    key: "other",
    label: "Other Bureau / Cell Officer (AB, PAPB, ARC)",
    short: "Bureau/Cell Officer",
    bureaus: ["AB", "PAPB", "ARC"],
    regional: false,
    defaultOfficer: "AB-2",
    can: { act: true, link: true, settings: false, audit: false, simulate: true },
    nav: ["/", "/cases", "/intake", "/institutions", "/overlaps", "/grievances", "/alerts", "/reports"],
  },
  ro: {
    key: "ro",
    label: "Regional Office Officer",
    short: "Regional Officer",
    bureaus: "all",
    regional: true,
    defaultOfficer: "RO-S",
    can: { act: false, link: false, settings: false, audit: false, simulate: false },
    nav: ["/", "/cases", "/institutions", "/overlaps", "/grievances", "/alerts", "/reports"],
  },
  college: {
    key: "college",
    label: "College Nodal Officer",
    short: "College Nodal Officer",
    bureaus: [],
    regional: false,
    defaultOfficer: "COL",
    can: { act: false, link: false, settings: false, audit: false, simulate: false },
    nav: ["/college", "/alerts"],
  },
};

export const ROLE_KEYS = Object.keys(ROLES) as RoleKey[];

/** The only officer APIs a college nodal officer may call. */
export const COLLEGE_API_PREFIXES = ["/api/college", "/api/meta", "/api/alerts", "/api/files", "/api/audit"];

export interface Viewer {
  role: RoleKey;
  region: Region;
  officerId: string;
  institutionId?: string; // college role only
}
