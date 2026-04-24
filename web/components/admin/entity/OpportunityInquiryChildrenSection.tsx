"use client";

import { formatDate } from "@/lib/adminFormatters";

export type InquiryChildRow = {
    id: string;
    customer_member_id: string;
    person_id: string | null;
    display_name: string | null;
    dob: string | null;
    age: string | null;
    desired_program_label: string | null;
    desired_schedule_label: string | null;
    outcome_status_label: string | null;
    notes: string | null;
};

export default function OpportunityInquiryChildrenSection({ rows }: { rows: InquiryChildRow[] }) {
    if (!rows.length) {
        return (
            <div className="md:col-span-2 rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm text-alloy-midnight/60">
                No children added to this inquiry yet.
            </div>
        );
    }

    return (
        <div className="md:col-span-2">
            <div className="overflow-x-auto rounded-lg border border-alloy-stone/25 bg-white">
                <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="border-b border-alloy-stone/25 bg-alloy-stone/10">
                        <tr className="text-[11px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/55">
                            <th className="px-3 py-2">Child</th>
                            <th className="px-3 py-2">DOB / Age</th>
                            <th className="px-3 py-2">Desired program</th>
                            <th className="px-3 py-2">Desired schedule</th>
                            <th className="px-3 py-2">Outcome</th>
                            <th className="px-3 py-2">Notes</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => {
                            const name = (r.display_name ?? "").trim() || "—";
                            const dob = r.dob ? formatDate(r.dob) : "—";
                            const age = (r.age ?? "").trim();
                            const dobAge = age ? `${dob} · ${age}` : dob;
                            const program = (r.desired_program_label ?? "").trim() || "—";
                            const schedule = (r.desired_schedule_label ?? "").trim() || "—";
                            const outcome = (r.outcome_status_label ?? "").trim() || "—";
                            const notes = (r.notes ?? "").trim() || "—";
                            return (
                                <tr key={r.id} className="border-b border-alloy-stone/20 last:border-b-0">
                                    <td className="px-3 py-2 font-medium text-alloy-midnight/85">{name}</td>
                                    <td className="px-3 py-2 text-alloy-midnight/65 tabular-nums">{dobAge}</td>
                                    <td className="px-3 py-2 text-alloy-midnight/65">{program}</td>
                                    <td className="px-3 py-2 text-alloy-midnight/65">{schedule}</td>
                                    <td className="px-3 py-2 text-alloy-midnight/65">{outcome}</td>
                                    <td className="px-3 py-2 text-alloy-midnight/65 max-w-[280px] truncate" title={notes !== "—" ? notes : undefined}>
                                        {notes}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

