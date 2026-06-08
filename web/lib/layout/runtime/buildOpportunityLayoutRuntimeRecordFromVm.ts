/**
 * C1b — map opportunity VM paint record → layout runtime proof record shape.
 *
 * Operators see handles and labels only — never raw UUIDs, OCM ids, or table names.
 */

import { mapRawInquiryChildrenToDrawerRows } from "@/lib/admin/drawer/inquiryChildrenDrawerRows";
import { opportunityDisplayLocationFromRecord } from "@/lib/opportunities/resolveOpportunityDisplayLocation";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import { OPPORTUNITY_COMPUTE_KEYS } from "./opportunityRelationRegistry";
import { isOpaqueIdValue, type ProofRuntimeRecord } from "./proofRecordContext";

function pickDisplay(...values: unknown[]): string | null {
    for (const value of values) {
        if (value == null) continue;
        const text = String(value).trim();
        if (!text || isOpaqueIdValue(text)) continue;
        return text;
    }
    return null;
}

function mapEnrollmentChildren(raw: unknown): ProofRuntimeRecord[] {
    if (!Array.isArray(raw)) return [];
    return mapRawInquiryChildrenToDrawerRows(raw).map((row) => {
        const name =
            pickDisplay(row.display_name, [row.first_name, row.last_name].filter(Boolean).join(" ")) ?? "—";
        return {
            id: pickDisplay(row.id) ?? "row",
            "child.name": name,
            "inquiry_child.desired_start_date": row.desired_start_date ?? "",
            "inquiry_child.location_id": pickDisplay(row.location_label) ?? "",
            "inquiry_child.program_room_cohort_key":
                pickDisplay(row.program_room_cohort_label, row.desired_program_label) ?? "",
            "inquiry_child.outcome_status_key":
                pickDisplay(row.outcome_status_label, row.outcome_status_key) ?? "",
        };
    });
}

export type BuildOpportunityLayoutRuntimeRecordInput = {
    vmRecord: Record<string, unknown>;
    opportunityId: string;
    statusDisplay?: string | null;
    summaries?: OpportunityDrawerViewModel["summaries"];
};

/** Build operator-safe layout runtime record from settled VM payload. */
export function buildOpportunityLayoutRuntimeRecordFromVm(
    input: BuildOpportunityLayoutRuntimeRecordInput,
): ProofRuntimeRecord {
    const { vmRecord, opportunityId, statusDisplay, summaries } = input;

    const primaryName = pickDisplay(
        vmRecord["person.primary_contact_name"],
        vmRecord._primary_contact_name,
        vmRecord._primary_person_name,
        vmRecord._customer_name,
    );
    const primaryPhone = pickDisplay(
        vmRecord["person.primary_phone"],
        vmRecord["person.phone"],
        vmRecord._primary_contact_phone,
        vmRecord._primary_person_phone,
    );
    const primaryEmail = pickDisplay(
        vmRecord["person.primary_email"],
        vmRecord["person.email"],
        vmRecord._primary_contact_email,
        vmRecord._primary_person_email,
    );

    const location = opportunityDisplayLocationFromRecord(vmRecord);
    const siteLabel =
        location.kind === "single" ? location.label
        : location.kind === "multiple" ? location.label
        : pickDisplay(vmRecord._location_label, vmRecord._location_name);

    const householdAddress = pickDisplay(
        vmRecord["location.formatted_address"],
        vmRecord._household_address,
        vmRecord._formatted_address,
    );

    const programCategory = pickDisplay(
        vmRecord["enrollment.program_category"],
        vmRecord._program_category,
        vmRecord.desired_program_type,
    );

    const placementPriority = pickDisplay(
        vmRecord["enrollment.placement_priority"],
        vmRecord._placement_priority_display,
    );

    const statusKey = pickDisplay(vmRecord.status_key);
    const statusLabel = pickDisplay(statusDisplay, vmRecord._status_display, statusKey);

    const enrollmentChildren = mapEnrollmentChildren(vmRecord._inquiry_children);

    const record: ProofRuntimeRecord = {
        ...vmRecord,
        id: opportunityId,
        name: pickDisplay(vmRecord.name, vmRecord.title) ?? "Opportunity",
        status_key: statusKey ?? "",
        _status_display: statusLabel ?? statusKey ?? "",
        "person.primary_contact_name": primaryName ?? "",
        "person.primary_phone": primaryPhone ?? "",
        "person.primary_email": primaryEmail ?? "",
        "person.phone": primaryPhone ?? "",
        "person.email": primaryEmail ?? "",
        enrollment_children: enrollmentChildren,
        tasks: Array.isArray(vmRecord._tasks_preview) ? vmRecord._tasks_preview : [],
        reminders: summaries?.reminders?.scheduled_sends ?? [],
        _relations: {
            primary_contact: {
                handle: primaryName ?? "—",
                entityType: "person",
                fields: {
                    primary_contact_name: primaryName ?? "",
                    primary_phone: primaryPhone ?? "",
                    primary_email: primaryEmail ?? "",
                },
            },
            ...(siteLabel ?
                {
                    enrollment_site_location: {
                        handle: siteLabel,
                        entityType: "location",
                        fields: { label: siteLabel },
                    },
                }
            :   {}),
            ...(householdAddress ?
                {
                    household_address: {
                        handle: householdAddress,
                        entityType: "location",
                        fields: { formatted_address: householdAddress },
                    },
                }
            :   {}),
        },
        _computed: {
            ...(programCategory ? { [OPPORTUNITY_COMPUTE_KEYS.program_category]: programCategory } : {}),
            ...(placementPriority ? { [OPPORTUNITY_COMPUTE_KEYS.placement_priority]: placementPriority } : {}),
        },
    };

    return record;
}
