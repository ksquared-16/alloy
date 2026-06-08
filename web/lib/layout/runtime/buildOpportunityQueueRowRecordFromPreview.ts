/**
 * Map queue preview item VM → operator-safe layout runtime queue row record.
 */

import type { CrmCompactChildLineVm, CrmCompactRowSemanticSlots, QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";
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

function parseHouseholdLastName(primaryIdentity: string | null | undefined, title: string | null | undefined): string {
    const source = pickDisplay(primaryIdentity, title) ?? "";
    if (!source) return "";
    const withoutSuffix = source.replace(/\s+(household|family)$/i, "").trim();
    const parts = withoutSuffix.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "";
    if (/family|household/i.test(source)) return parts[0] ?? "";
    if (source.includes(",")) return source.split(",")[0]?.trim() ?? parts[0] ?? "";
    return parts[parts.length - 1] ?? parts[0] ?? "";
}

function mapCrmChildLine(line: CrmCompactChildLineVm, index: number, crm: CrmCompactRowSemanticSlots): ProofRuntimeRecord {
    return {
        id: line.personId ?? `child-${index}`,
        "child.name": pickDisplay(line.primary) ?? "—",
        "child.age_band": pickDisplay(line.secondary, crm.ageBandContext, crm.ageContext) ?? "",
        "child.program": pickDisplay(line.programInline, line.secondary, crm.programContext) ?? "",
        "child.status": pickDisplay(crm.statusLabel, crm.stageLabel) ?? "",
        "child.location": pickDisplay(crm.locationContext, crm.roomContext) ?? "",
    };
}

function mapCrmChildren(crm: CrmCompactRowSemanticSlots): ProofRuntimeRecord[] {
    if (crm.childrenLines && crm.childrenLines.length > 0) {
        return crm.childrenLines.map((line, i) => mapCrmChildLine(line, i, crm));
    }
    if (crm.childName) {
        return [
            {
                id: crm.childPersonId ?? "child-preview",
                "child.name": crm.childName,
                "child.age_band": pickDisplay(crm.ageBandContext, crm.ageContext) ?? "",
                "child.program": pickDisplay(crm.programContext) ?? "",
                "child.status": pickDisplay(crm.statusLabel, crm.stageLabel) ?? "",
                "child.location": pickDisplay(crm.locationContext, crm.roomContext) ?? "",
            },
        ];
    }
    return [];
}

function resolveTourDate(crm: CrmCompactRowSemanticSlots, metaLines?: QueuePreviewItemVm["metaLines"]): string {
    const fromMeta = metaLines?.find((m) => /tour/i.test(m.label))?.value;
    return (
        pickDisplay(
            crm.rowPreviewLabelTourDate && crm.tourContext ? crm.tourContext : null,
            crm.tourContext,
            crm.crmCompactTimingValueLine,
            fromMeta,
        ) ?? ""
    );
}

/** Build layout runtime record for one queue preview row. */
export function buildOpportunityQueueRowRecordFromPreview(item: QueuePreviewItemVm): ProofRuntimeRecord {
    const crm = item.semanticCrmCompact;
    const waitlist = item.placementWaitlistCandidate;

    if (waitlist) {
        return {
            id: item.id,
            name: pickDisplay(waitlist.familyDisplayName, waitlist.childDisplayName, item.title) ?? "—",
            last_name: parseHouseholdLastName(waitlist.familyDisplayName, item.title),
            "child.name": pickDisplay(waitlist.childDisplayName) ?? "—",
            "child.program": pickDisplay(waitlist.cohortLabel) ?? "",
            "child.location": pickDisplay(waitlist.cohortSectionTitle, waitlist.cohortLabel) ?? "",
            "child.status": pickDisplay(waitlist.bucketLabel) ?? "",
            "child.desired_start_date": pickDisplay(waitlist.waitSinceLabel) ?? "",
            "child.room": "",
            "waitlist.positionLabel": pickDisplay(waitlist.runtimePositionLabel) ?? "",
            "waitlist.tierLabel": pickDisplay(waitlist.bucketLabel) ?? "",
            "waitlist.waitSince": pickDisplay(waitlist.waitSinceLabel) ?? "",
            "waitlist.siblingContext": pickDisplay(waitlist.siblingLabel, waitlist.siblingContextLines?.[0]) ?? "",
            "overrides.flags": waitlist.hasActiveOverride ? "Override active" : "",
            status_key: pickDisplay(waitlist.bucketLabel) ?? "",
            _status_display: pickDisplay(waitlist.bucketLabel) ?? "",
            "opportunity.status_key": pickDisplay(waitlist.bucketLabel) ?? "",
            "opportunity.location": pickDisplay(waitlist.cohortSectionTitle, waitlist.cohortLabel) ?? "",
            "person.primary_contact_name": pickDisplay(waitlist.parentDisplayName, waitlist.familyDisplayName) ?? "",
            children: [],
            enrollment_children: [],
        };
    }

    const primaryIdentity = pickDisplay(crm?.primaryIdentity, item.title) ?? "—";
    const lastName = parseHouseholdLastName(crm?.primaryIdentity, item.title);
    const statusLabel = pickDisplay(crm?.statusLabel, crm?.stageLabel, item.subtitle);
    const layoutChildren = crm ? mapCrmChildren(crm) : [];

    return {
        id: item.id,
        name: primaryIdentity,
        last_name: lastName,
        "person.primary_contact_name": pickDisplay(crm?.contactDisplayName, crm?.contactSnippet) ?? "",
        "person.primary_phone": pickDisplay(crm?.contactPhoneDisplay, crm?.contactSnippet) ?? "",
        "person.primary_email": pickDisplay(crm?.contactEmail) ?? "",
        status_key: statusLabel ?? "",
        _status_display: statusLabel ?? "",
        "opportunity.status_key": statusLabel ?? "",
        "opportunity.location": pickDisplay(crm?.locationContext, crm?.roomContext, crm?.programContext) ?? "",
        "opportunity.attention_reason": pickDisplay(crm?.attentionReason, crm?.queuePriorityExplanation) ?? "",
        _attention: pickDisplay(crm?.attentionReason, crm?.queuePriorityExplanation) ?? "",
        next_step: pickDisplay(crm?.nextStep) ?? "",
        last_activity: pickDisplay(crm?.lastActivity) ?? "",
        "opportunity.tour_date": resolveTourDate(crm ?? ({} as CrmCompactRowSemanticSlots), item.metaLines),
        tour_scheduled_at: resolveTourDate(crm ?? ({} as CrmCompactRowSemanticSlots), item.metaLines),
        children: layoutChildren,
        enrollment_children: layoutChildren,
    };
}
