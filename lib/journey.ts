import type { CaseAction, Status } from "./types";

/** The five stops every complaint passes on its way to a decision. */
export const STOPS = [
  { key: "received", label: "Received", hint: "Complaint registered" },
  { key: "assigned", label: "Assigned", hint: "A dealing officer owns it" },
  { key: "notice", label: "Notice sent", hint: "Institution asked to respond" },
  { key: "response", label: "Response", hint: "Reply received or hearing held" },
  { key: "decision", label: "Decision", hint: "Disposed with an order" },
] as const;

const STOP_OF: Partial<Record<CaseAction["type"], number>> = {
  Received: 0,
  Assigned: 1,
  "Notice Issued": 2,
  "Reply Received": 3,
  "Hearing Scheduled": 3,
  Disposed: 4,
};

export interface Journey {
  /** furthest stop reached, 0-4 */
  at: number;
  /** date each stop was first reached, ISO */
  dates: (string | null)[];
  /** detours taken along the way */
  transfers: number;
  escalations: number;
}

export function journeyOf(actions: Pick<CaseAction, "type" | "at">[], status: Status): Journey {
  const dates: (string | null)[] = STOPS.map(() => null);
  let at = 0;
  let transfers = 0;
  let escalations = 0;
  for (const a of [...actions].sort((x, y) => x.at.localeCompare(y.at))) {
    if (a.type === "Transferred") transfers++;
    if (a.type === "Escalated") escalations++;
    const s = STOP_OF[a.type];
    if (s === undefined) continue;
    if (!dates[s]) dates[s] = a.at;
    at = Math.max(at, s);
  }
  if (status === "Disposed") at = 4;
  // a stop that was skipped in the record still counts as passed once a later stop is reached
  if (!dates[0] && actions[0]) dates[0] = actions[0].at;
  return { at, dates, transfers, escalations };
}
