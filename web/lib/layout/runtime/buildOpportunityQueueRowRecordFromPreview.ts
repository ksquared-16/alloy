/**
 * Map queue preview item VM → operator-safe layout runtime queue row record.
 */

import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";
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

/** Build layout runtime record for one queue preview row. */
export function buildOpportunityQueueRowRecordFromPreview(item: QueuePreviewItemVm): ProofRuntimeRecord {
    const crm = item.semanticCrmCompact;
    const waitlist = item.placementWaitlistCandidate;

    if (waitlist) {
        return {
            id: item.id,
            name: pickDisplay(waitlist.familyDisplayName, waitlist.childDisplayName, item.title) ?? "—",
            "child.name": pickDisplay(waitlist.childDisplayName) ?? "—",
            "waitlist.positionLabel": pickDisplay(waitlist.runtimePositionLabel) ?? "",
            "waitlist.tierLabel": pickDisplay(waitlist.bucketLabel) ?? "",
            "waitlist.waitSince": pickDisplay(waitlist.waitSinceLabel) ?? "",
            "waitlist.siblingContext": pickDisplay(waitlist.siblingLabel, waitlist.siblingContextLines?.[0]) ?? "",
            "overrides.flags": waitlist.hasActiveOverride ? "Override active" : "",
            status_key: pickDisplay(waitlist.bucketLabel) ?? "",
            _status_display: pickDisplay(waitlist.bucketLabel) ?? "",
            "opportunity.location": pickDisplay(waitlist.cohortLabel, waitlist.cohortSectionTitle) ?? "",
        };
    }

    return {
        id: item.id,
        name: pickDisplay(crm?.primaryIdentity, item.title) ?? "—",
        "person.primary_contact_name": pickDisplay(crm?.contactDisplayName, crm?.contactSnippet) ?? "",
        "person.primary_phone": pickDisplay(crm?.contactSnippet) ?? "",
        status_key: pickDisplay(crm?.statusLabel, item.status) ?? "",
        _status_display: pickDisplay(crm?.statusLabel, item.status) ?? "",
        "opportunity.location": pickDisplay(crm?.roomContext, crm?.programContext) ?? "",
        "opportunity.attention_reason": pickDisplay(crm?.attentionReason) ?? "",
        next_step: pickDisplay(crm?.nextStep) ?? "",
        last_activity: pickDisplay(crm?.lastActivity) ?? "",
        tour_scheduled_at: pickDisplay(item.meta?.find((m) => /tour/i.test(m.label))?.value) ?? "",
        enrollment_children: crm?.childName ?
            [{ id: "child-preview", "child.name": crm.childName }]
        :   [],
    };
}
