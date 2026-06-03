import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";

export function isScheduleTourRegistryAction(a: {
    key: string;
    payload?: Record<string, unknown> | null;
}): boolean {
    const key = a.key.trim();
    const formKey =
        a.payload?.form_key != null ? String(a.payload.form_key).trim() : "";
    return (
        key === "schedule_tour" ||
        key === "reschedule_tour" ||
        formKey === "schedule_tour" ||
        formKey === "reschedule_tour"
    );
}

/** Opportunity id for tour booking — candidate-grain rows use `opportunityId` when set. */
export function resolveScheduleTourOpportunityIdFromQueueItem(item: QueuePreviewItemVm): string {
    const fromField = item.opportunityId?.trim();
    if (fromField) return fromField;
    const id = item.id.trim();
    if (id.startsWith("pcrow:")) {
        const parts = id.split(":");
        if (parts.length >= 2 && parts[1]?.trim()) return parts[1].trim();
    }
    return id;
}

export type ScheduleTourPickerRowVm = {
    opportunityId: string;
    primaryLabel: string;
    contactLine: string | null;
    childProgramLine: string | null;
    statusLine: string | null;
};

export function buildScheduleTourPickerRow(item: QueuePreviewItemVm): ScheduleTourPickerRowVm | null {
    const opportunityId = resolveScheduleTourOpportunityIdFromQueueItem(item);
    if (!opportunityId) return null;

    const waitlist = item.placementWaitlistCandidate;
    const crm = item.semanticCrmCompact;

    const primaryLabel =
        waitlist?.familyDisplayName?.trim() ||
        crm?.primaryIdentity?.trim() ||
        item.title?.trim() ||
        opportunityId;

    const contactLine =
        waitlist?.parentDisplayName?.trim() ||
        crm?.contactDisplayName?.trim() ||
        crm?.contactSnippet?.trim() ||
        [crm?.contactPhoneDisplay, crm?.contactEmail].filter(Boolean).join(" · ") ||
        null;

    const childParts: string[] = [];
    if (waitlist?.childDisplayName?.trim()) {
        childParts.push(waitlist.childDisplayName.trim());
    } else if (crm?.childName?.trim()) {
        childParts.push(crm.childName.trim());
    } else if (crm?.childrenLines?.length) {
        childParts.push(
            crm.childrenLines
                .map((c) => c.primary?.trim())
                .filter(Boolean)
                .join(", ")
        );
    }
    const program = waitlist?.cohortLabel?.trim() || crm?.programContext?.trim() || null;
    const childProgramLine =
        childParts.length || program
            ? [childParts.join(", "), program].filter(Boolean).join(" · ")
            : null;

    const statusLine = crm?.statusLabel?.trim() || item.subtitle?.trim() || null;

    return {
        opportunityId,
        primaryLabel,
        contactLine: contactLine || null,
        childProgramLine,
        statusLine,
    };
}

export function filterScheduleTourPickerRows(
    items: QueuePreviewItemVm[],
    query: string
): ScheduleTourPickerRowVm[] {
    const q = query.trim().toLowerCase();
    const rows = items
        .map(buildScheduleTourPickerRow)
        .filter((r): r is ScheduleTourPickerRowVm => r != null);
    if (!q) return rows;
    return rows.filter((row) => {
        const hay = [
            row.primaryLabel,
            row.contactLine,
            row.childProgramLine,
            row.statusLine,
            row.opportunityId,
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
        return hay.includes(q);
    });
}
