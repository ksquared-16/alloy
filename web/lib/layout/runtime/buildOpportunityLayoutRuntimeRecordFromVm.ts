/**
 * C1b — map opportunity VM paint record → layout runtime proof record shape.
 *
 * Operators see handles and labels only — never raw UUIDs, OCM ids, or table names.
 */

import { opportunityDisplayLocationFromRecord } from "@/lib/opportunities/resolveOpportunityDisplayLocation";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import { OPPORTUNITY_COMPUTE_KEYS } from "./opportunityRelationRegistry";
import { isOpaqueIdValue, type ProofRuntimeRecord } from "./proofRecordContext";
import { mapVmInquiryChildrenToLayoutRuntimeRows } from "./mapLayoutRuntimeChildrenRows";
import {
    buildPrimaryContactPersonRelation,
    resolveOpportunityPrimaryContactPerson,
} from "./resolveOpportunityPrimaryContactPerson";

function pickDisplay(...values: unknown[]): string | null {
    for (const value of values) {
        if (value == null) continue;
        const text = String(value).trim();
        if (!text || isOpaqueIdValue(text)) continue;
        return text;
    }
    return null;
}

function parseHouseholdLastName(name: string | null | undefined): string {
    const source = (name ?? "").trim();
    if (!source) return "";
    const withoutSuffix = source.replace(/\s+(household|family)$/i, "").trim();
    const parts = withoutSuffix.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "";
    if (/family|household/i.test(source) && parts.length >= 1) return parts[0] ?? "";
    if (source.includes(",")) return source.split(",")[0]?.trim() ?? parts[0] ?? "";
    return parts[parts.length - 1] ?? parts[0] ?? "";
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

    const householdName = pickDisplay(vmRecord.name, vmRecord.title, vmRecord._customer_name);
    const lastName = parseHouseholdLastName(householdName);

    const primaryContact = resolveOpportunityPrimaryContactPerson(vmRecord);
    const primaryName = primaryContact.displayName;
    const primaryPhone = primaryContact.phone;
    const primaryEmail = primaryContact.email;

    const secondaryName = pickDisplay(
        vmRecord["person.secondary_contact_name"],
        vmRecord._secondary_contact_name,
    );

    const location = opportunityDisplayLocationFromRecord(vmRecord);
    const siteLabel =
        location.kind === "single" ? location.label
        : location.kind === "multiple" ? location.label
        : pickDisplay(vmRecord._location_label, vmRecord._location_name, vmRecord["opportunity.location"]);

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

    const statusKey = pickDisplay(vmRecord.status_key, vmRecord["opportunity.status_key"]);
    const statusLabel = pickDisplay(statusDisplay, vmRecord._status_display, statusKey);

    const tourDate = pickDisplay(
        vmRecord["opportunity.tour_date"],
        vmRecord.tour_date,
        vmRecord.tour_scheduled_at,
        vmRecord._tour_date_display,
    );
    const tourStatus = pickDisplay(vmRecord["opportunity.tour_status"], vmRecord.tour_status, vmRecord._tour_status);

    const source = pickDisplay(vmRecord["opportunity.source"], vmRecord.source);
    const channel = pickDisplay(vmRecord["opportunity.channel"], vmRecord.channel);
    const campaign = pickDisplay(vmRecord["opportunity.campaign"], vmRecord.campaign);

    const attention = pickDisplay(
        vmRecord._attention,
        vmRecord["opportunity.attention_reason"],
        vmRecord.attention_reason,
    );

    const layoutChildren = mapVmInquiryChildrenToLayoutRuntimeRows(vmRecord._inquiry_children);

    const record: ProofRuntimeRecord = {
        ...vmRecord,
        id: opportunityId,
        name: householdName ?? "Opportunity",
        last_name: lastName,
        status_key: statusKey ?? "",
        _status_display: statusLabel ?? statusKey ?? "",
        "opportunity.status_key": statusKey ?? "",
        "opportunity.location": siteLabel ?? "",
        "opportunity.tour_date": tourDate ?? "",
        "opportunity.tour_status": tourStatus ?? "",
        "opportunity.source": source ?? "",
        "opportunity.channel": channel ?? "",
        "opportunity.campaign": campaign ?? "",
        "opportunity.attention_reason": attention ?? "",
        "person.primary_contact_name": primaryName ?? "",
        "person.secondary_contact_name": secondaryName ?? "",
        "person.primary_phone": primaryPhone ?? "",
        "person.primary_email": primaryEmail ?? "",
        "person.phone": primaryPhone ?? "",
        "person.email": primaryEmail ?? "",
        _attention: attention ?? "",
        enrollment_children: layoutChildren,
        children: layoutChildren,
        tasks: Array.isArray(vmRecord._tasks_preview) ? vmRecord._tasks_preview : [],
        reminders: summaries?.reminders?.scheduled_sends ?? [],
        _relations: {
            ...(buildPrimaryContactPersonRelation(primaryContact) ?
                { primary_contact: buildPrimaryContactPersonRelation(primaryContact)! }
            :   {}),
            ...(secondaryName ?
                {
                    secondary_contact: {
                        handle: secondaryName,
                        entityType: "person",
                        fields: { secondary_contact_name: secondaryName },
                    },
                }
            :   {}),
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
