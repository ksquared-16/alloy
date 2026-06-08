/**
 * Map queue preview item VM → operator-safe layout runtime queue row record.
 */

import { parseQueueRowCrmChildrenStructured } from "@/lib/ui-v2/crmQueueRowPreviewPresentation";
import type { CrmCompactChildLineVm, CrmCompactRowSemanticSlots, QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";
import type { LayoutDoc } from "../layoutV2";
import { collectLayoutDocFieldRefKeys } from "./buildOpportunityLayoutRuntimeRecordFromVm";
import { isOpaqueIdValue, type ProofRuntimeRecord } from "./proofRecordContext";
import {
    buildPrimaryContactPersonRelation,
    resolveOpportunityPrimaryContactPerson,
} from "./resolveOpportunityPrimaryContactPerson";
import type { QueueRowLayoutRuntimeEnrichment } from "./queueRowLayoutRuntimeEnrichment";

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

function parseContactNameFromLine(contactLine: string | null | undefined): string | null {
    if (!contactLine) return null;
    const parts = contactLine.split(/\s*·\s*/).map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
        if (part.includes("@")) continue;
        if (/^[\d\s\-+().]+$/.test(part) && part.replace(/\D/g, "").length >= 10) continue;
        return part;
    }
    return parts[0] ?? null;
}

function mapCrmChildLine(line: CrmCompactChildLineVm, index: number, crm: CrmCompactRowSemanticSlots): ProofRuntimeRecord {
    const childId = line.personId ?? crm.childPersonId ?? null;
    return {
        id: childId ?? line.personId ?? `child-${index}`,
        "child.id": pickDisplay(childId, line.personId) ?? "",
        "child.name": pickDisplay(line.primary) ?? "—",
        "child.age_band": pickDisplay(line.secondary, crm.ageBandContext, crm.ageContext) ?? "",
        "child.program": pickDisplay(line.programInline, line.secondary, crm.programContext) ?? "",
        "child.status": pickDisplay(crm.statusLabel, crm.stageLabel) ?? "",
        "child.location": pickDisplay(crm.locationContext, crm.roomContext) ?? "",
    };
}

function mapStructuredChildLine(line: CrmCompactChildLineVm, index: number, enrichment?: QueueRowLayoutRuntimeEnrichment | null): ProofRuntimeRecord {
    return {
        id: line.personId ?? `child-${index}`,
        "child.name": pickDisplay(line.primary) ?? "—",
        "child.age_band": pickDisplay(line.secondary) ?? "",
        "child.program": pickDisplay(line.programInline, line.secondary, enrichment?.programLabel) ?? "",
        "child.status": pickDisplay(enrichment?.statusDisplay) ?? "",
        "child.location": pickDisplay(enrichment?.locationLabel) ?? "",
    };
}

function mapCrmChildren(crm: CrmCompactRowSemanticSlots, enrichment?: QueueRowLayoutRuntimeEnrichment | null): ProofRuntimeRecord[] {
    if (crm.childrenLines && crm.childrenLines.length > 0) {
        return crm.childrenLines.map((line, i) => mapCrmChildLine(line, i, crm));
    }
    if (crm.childName) {
        return [
            {
                id: crm.childPersonId ?? "child-preview",
                "child.id": pickDisplay(crm.childPersonId) ?? "",
                "child.name": crm.childName,
                "child.age_band": pickDisplay(crm.ageBandContext, crm.ageContext) ?? "",
                "child.program": pickDisplay(crm.programContext) ?? "",
                "child.status": pickDisplay(crm.statusLabel, crm.stageLabel) ?? "",
                "child.location": pickDisplay(crm.locationContext, crm.roomContext) ?? "",
            },
        ];
    }
    const structured = parseQueueRowCrmChildrenStructured(enrichment?.crmCompactChildren);
    if (structured.length > 0) return structured.map((line, i) => mapStructuredChildLine(line, i, enrichment));
    if (enrichment?.childDisplayName) {
        return [
            {
                id: "child-enrichment",
                "child.name": enrichment.childDisplayName,
                "child.program": pickDisplay(enrichment.programLabel) ?? "",
                "child.location": pickDisplay(enrichment.locationLabel) ?? "",
            },
        ];
    }
    return [];
}

function resolveTourDate(
    crm: CrmCompactRowSemanticSlots | undefined,
    enrichment: QueueRowLayoutRuntimeEnrichment | null | undefined,
    metaLines?: QueuePreviewItemVm["metaLines"],
): string {
    const fromMeta = metaLines?.find((m) => /tour/i.test(m.label))?.value;
    return (
        pickDisplay(
            enrichment?.tourDisplay,
            crm?.rowPreviewLabelTourDate && crm.tourContext ? crm.tourContext : null,
            crm?.tourContext,
            crm?.crmCompactTimingValueLine,
            fromMeta,
        ) ?? ""
    );
}

/**
 * Doc-driven completeness: every configured queue-card field refKey must exist on
 * the row record so the card renders a value-or-placeholder ("—") rather than an
 * absent field. The standard refKeys are mapped above from the raw item/CRM/
 * enrichment; anything the published doc adds that has no source resolves to "".
 * (Collection-column child.* refKeys bind per-row and are excluded.)
 */
function ensureQueueDocRefKeys(record: ProofRuntimeRecord, doc?: LayoutDoc | null): ProofRuntimeRecord {
    if (!doc) return record;
    const mutable = record as Record<string, unknown>;
    for (const refKey of collectLayoutDocFieldRefKeys(doc)) {
        if (mutable[refKey] === undefined) mutable[refKey] = "";
    }
    return record;
}

/** Build layout runtime record for one queue preview row. */
export function buildOpportunityQueueRowRecordFromPreview(
    item: QueuePreviewItemVm,
    doc?: LayoutDoc | null,
): ProofRuntimeRecord {
    const crm = item.semanticCrmCompact;
    const enrichment = item.layoutRuntimeEnrichment ?? null;
    const waitlist = item.placementWaitlistCandidate;

    if (waitlist) {
        return ensureQueueDocRefKeys({
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
        }, doc);
    }

    const householdName = pickDisplay(enrichment?.customerName, crm?.primaryIdentity, item.title) ?? "—";
    const lastName = parseHouseholdLastName(enrichment?.customerName ?? crm?.primaryIdentity, item.title);
    const statusLabel = pickDisplay(
        enrichment?.statusDisplay,
        crm?.statusLabel,
        crm?.stageLabel,
        item.subtitle,
        enrichment?.statusKey,
    );
    const layoutChildren = mapCrmChildren(crm ?? ({} as CrmCompactRowSemanticSlots), enrichment);
    const contactName = pickDisplay(
        crm?.contactDisplayName,
        parseContactNameFromLine(enrichment?.contactLine),
        enrichment?.contactLine,
    );
    const contactPhone = pickDisplay(crm?.contactPhoneDisplay, enrichment?.primaryPhone);
    const contactEmail = pickDisplay(crm?.contactEmail, enrichment?.primaryEmail);
    const primaryContact = resolveOpportunityPrimaryContactPerson({
        "person.primary_contact_name": contactName ?? "",
        "person.primary_phone": contactPhone ?? "",
        "person.primary_email": contactEmail ?? "",
    });
    const tourDate = resolveTourDate(crm, enrichment, item.metaLines);

    const baseRecord: ProofRuntimeRecord = {
        id: item.id,
        name: householdName,
        last_name: lastName,
        "person.primary_contact_name": primaryContact.displayName ?? "",
        "person.primary_phone": primaryContact.phone ?? "",
        "person.primary_email": primaryContact.email ?? "",
        status_key: statusLabel ?? "",
        _status_display: statusLabel ?? "",
        "opportunity.status_key": statusLabel ?? "",
        "opportunity.location": pickDisplay(enrichment?.locationLabel, crm?.locationContext, crm?.roomContext, crm?.programContext) ?? "",
        "opportunity.attention_reason": pickDisplay(enrichment?.attentionReason, crm?.attentionReason, crm?.queuePriorityExplanation) ?? "",
        _attention: pickDisplay(enrichment?.attentionReason, crm?.attentionReason, crm?.queuePriorityExplanation) ?? "",
        next_step: pickDisplay(crm?.nextStep) ?? "",
        last_activity: pickDisplay(crm?.lastActivity) ?? "",
        "opportunity.tour_date": tourDate,
        tour_scheduled_at: tourDate,
        children: layoutChildren,
        enrollment_children: layoutChildren,
        _relations: {
            ...(buildPrimaryContactPersonRelation(primaryContact) ?
                { primary_contact: buildPrimaryContactPersonRelation(primaryContact)! }
            :   {}),
        },
    };

    return ensureQueueDocRefKeys(baseRecord, doc);
}
