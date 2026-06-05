import { personDrawerCrmDisplayLabel } from "@/lib/admin/person/personDrawerChildIdentity";
import type {
    PersonEnrollmentMirrorRow,
    PersonEnrollmentOpportunityRow,
} from "@/lib/admin/person/personDrawerVisibilityTypes";

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

function crmEnrollmentDisplayName(raw: string | null | undefined, fallback = "Lead"): string {
    const trimmed = raw?.trim() || fallback;
    return personDrawerCrmDisplayLabel(trimmed) ?? trimmed;
}

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
