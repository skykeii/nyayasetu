"use client";
import * as React from "react";
import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { useRole } from "./role-provider";
import { Badge, Card, CardHeader } from "./ui";
import { BureauChip } from "./bits";
import type { StudentSummary } from "@/lib/student";
import type { StudentStatus } from "@/lib/types";
import { fmtDate } from "@/lib/util";

export const studentTone = (s: StudentStatus) => ({ "With College": "amber", "Resolved - Pending Verification": "sky", "Closed - Verified": "emerald", "Closed - Unverified": "slate", "Escalated to AICTE": "saffron", "Closed by AICTE": "emerald" } as const)[s];

/** Masked, read-only student-portal complaints. Only the Competent Authority can open them on the grievance desk. */
export function StudentComplaintList({ items, title, sub, plain }: { items: StudentSummary[]; title: string; sub: string; plain?: boolean }) {
  const { role } = useRole();
  if (!items.length) return null;
  const rows = (
    <ul className="divide-y divide-white/[0.06]">
      {items.map((s) => {
        const body = (
          <>
            <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-medium text-white">{s.subject}</span>
              <span className="block truncate text-[13px] text-slate-400">
                <span className="num">{s.id}</span> · {s.pseudonym} · {s.category} · filed {fmtDate(s.createdAt)}
                {s.caseId ? ` · registered as ${s.caseId}` : ""}
              </span>
            </span>
            <BureauChip code={s.routedBureau} />
            <Badge tone={studentTone(s.status)}>{s.status}</Badge>
          </>
        );
        return (
          <li key={s.id}>
            {role === "ca" ? (
              <Link href={`/grievances?complaint=${s.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-white/[0.03]">
                {body}
              </Link>
            ) : (
              <div className="flex items-center gap-3 px-5 py-2.5">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
  if (plain)
    return (
      <section className="overflow-hidden rounded-2xl border border-[#EADFCD] bg-paper">
        <h3 className="px-5 pt-4 text-[17px] text-white">{title}</h3>
        <p className="px-5 pb-2 text-[13.5px] text-slate-400">{sub}</p>
        {rows}
      </section>
    );
  return (
    <Card className="overflow-hidden">
      <CardHeader title={title} sub={sub} />
      {rows}
    </Card>
  );
}
