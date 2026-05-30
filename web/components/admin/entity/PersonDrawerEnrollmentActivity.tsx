"use client";

import {
    oppInqEyebrow,
    oppInqInnerCardCompact,
    oppInqLeadSummaryShellClassName,
} from "@/components/admin/drawer/opportunityInquiryDrawerTypography";
import type {
    PersonEnrollmentMirrorRow,
    PersonEnrollmentOpportunityRow,
} from "@/lib/admin/person/personDrawerVisibilityTypes";
import { personDrawerCrmDisplayLabel } from "@/lib/admin/person/personDrawerChildIdentity";
import { useMemo } from "react";

type OpenDrawer = (type: string, id: string) => void;

function crmEnrollmentDisplayName(raw: string | null | undefined, fallback = "Lead"): string {
    const trimmed = raw?.trim() || fallback;
    return personDrawerCrmDisplayLabel(trimmed) ?? trimmed;
}

export type PersonEnrollmentActivityEntry = {
    opportunity_id: string;
    opportunity_name: string;
    status_label: string | null;
    role_label: string | null;
    program_label: string | null;
    location_label: string | null;
    room_label: string | null;
    outcome_label: string | null;
    source: "mirror" | "opportunity";
};

/** Merge OCM mirror + opportunity-person rows into deduped enrollment activity entries. */
export function buildPersonEnrollmentActivityEntries(
    mirror: PersonEnrollmentMirrorRow[],
    opportunities: PersonEnrollmentOpportunityRow[]
): PersonEnrollmentActivityEntry[] {
    const byOpp = new Map<string, PersonEnrollmentActivityEntry>();

    for (const row of opportunities) {
        const id = String(row.opportunity_id ?? "").trim();
        if (!id) continue;
        byOpp.set(id, {
            opportunity_id: id,
            opportunity_name: crmEnrollmentDisplayName(row.opportunity_name),
            status_label: row.status_label?.trim() || row.status_key?.trim() || null,
            role_label: row.role_label?.trim() || null,
            program_label: null,
            location_label: null,
            room_label: null,
            outcome_label: null,
            source: "opportunity",
        });
    }

    for (const row of mirror) {
        const id = String(row.opportunity_id ?? "").trim();
        if (!id) continue;
        const existing = byOpp.get(id);
        byOpp.set(id, {
            opportunity_id: id,
            opportunity_name: crmEnrollmentDisplayName(
                row.opportunity_name?.trim() || existing?.opportunity_name
            ),
            status_label: (() => {
                const raw =
                    row.outcome_status_label?.trim() ||
                    row.opportunity_status_label?.trim() ||
                    existing?.status_label ||
                    null;
                return raw ? personDrawerCrmDisplayLabel(raw) ?? raw : null;
            })(),
            role_label: existing?.role_label ?? null,
            program_label: row.program_label?.trim() || existing?.program_label || null,
            location_label: row.location_label?.trim() || existing?.location_label || null,
            room_label: row.room_label?.trim() || existing?.room_label || null,
            outcome_label: row.outcome_status_label?.trim() || row.outcome_status_key?.trim() || null,
            source: "mirror",
        });
    }

    return [...byOpp.values()];
}

export default function PersonDrawerEnrollmentActivity({
    mirrorRows,
    opportunityRows,
    onOpenDrawer,
    leadSummaryShell = false,
}: {
    mirrorRows: PersonEnrollmentMirrorRow[];
    opportunityRows: PersonEnrollmentOpportunityRow[];
    onOpenDrawer: OpenDrawer;
    /** Pine-accent shell — single primary home for enrollment on child drawer. */
    leadSummaryShell?: boolean;
}) {
    const entries = useMemo(
        () => buildPersonEnrollmentActivityEntries(mirrorRows, opportunityRows),
        [mirrorRows, opportunityRows]
    );

    if (entries.length === 0) return null;

    const cards = (
        <div className="space-y-2" data-person-drawer-enrollment-activity="true">
            {entries.map((entry) => (
                <div key={entry.opportunity_id} className={leadSummaryShell ? "px-0.5 py-0.5" : oppInqInnerCardCompact}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                        <button
                            type="button"
                            onClick={() => onOpenDrawer("opportunities", entry.opportunity_id)}
                            className="text-left text-[13px] font-semibold text-alloy-blue hover:underline"
                        >
                            {personDrawerCrmDisplayLabel(entry.opportunity_name) ?? entry.opportunity_name}
                        </button>
                        {entry.status_label ? (
                            <span className="text-[10px] font-medium tracking-wide text-alloy-midnight/45">
                                {personDrawerCrmDisplayLabel(entry.status_label)}
                            </span>
                        ) : null}
                    </div>
                    {(entry.role_label || entry.program_label || entry.location_label || entry.room_label) && (
                        <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
                            {entry.role_label ? (
                                <div>
                                    <dt className={oppInqEyebrow}>Role</dt>
                                    <dd className="text-[12px] text-alloy-midnight/80">{entry.role_label}</dd>
                                </div>
                            ) : null}
                            {entry.program_label ? (
                                <div>
                                    <dt className={oppInqEyebrow}>Program</dt>
                                    <dd className="text-[12px] text-alloy-midnight/80">{entry.program_label}</dd>
                                </div>
                            ) : null}
                            {entry.location_label ? (
                                <div>
                                    <dt className={oppInqEyebrow}>Location</dt>
                                    <dd className="text-[12px] text-alloy-midnight/80">{entry.location_label}</dd>
                                </div>
                            ) : null}
                            {entry.room_label ? (
                                <div>
                                    <dt className={oppInqEyebrow}>Room</dt>
                                    <dd className="text-[12px] text-alloy-midnight/80">{entry.room_label}</dd>
                                </div>
                            ) : null}
                        </dl>
                    )}
                </div>
            ))}
        </div>
    );

    if (leadSummaryShell) {
        return (
            <div className={oppInqLeadSummaryShellClassName} data-person-drawer-enrollment-lead-shell="true">
                {cards}
            </div>
        );
    }

    return cards;
}
