/**
 * Map queue preview item VM → operator-safe layout runtime queue row record.
 */

import { parseQueueRowCrmChildrenStructured } from "@/lib/ui-v2/crmQueueRowPreviewPresentation";
import type { CrmCompactChildLineVm, CrmCompactRowSemanticSlots, QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";
import type { LayoutDoc } from "../layoutV2";
import { collectLayoutDocFieldRefKeys } from "./buildOpportunityLayoutRuntimeRecordFromVm";
import { enrichLayoutRuntimeChildRowsFromAnchor } from "./enrichLayoutRuntimeChildRowIdentifiers";
import { ensureQueueRecordLayoutFieldKeys } from "./ensureQueueRecordLayoutFieldKeys";
import { mergeCanonicalOpportunityLayoutRuntimeChildRows } from "./mergeCanonicalOpportunityLayoutRuntimeChildRows";
import { isOpaqueIdValue, pickEntityId, type ProofRuntimeRecord } from "./proofRecordContext";
import {
    buildPrimaryContactPersonRelation,
    resolveOpportunityPrimaryContactPerson,
} from "./resolveOpportunityPrimaryContactPerson";
import { applyQueueRowContextToLayoutRecord } from "./applyQueueRowContextToLayoutRuntime";
import { suppressDuplicateQueueRowSubjectOnRecord } from "./queueRowSubjectPresentation";
import { splitQueuePreviewChildPrimaryLabel } from "./splitQueuePreviewChildPrimaryLabel";
import type { QueueRowLayoutRuntimeEnrichment } from "./queueRowLayoutRuntimeEnrichment";
import { resolveQueueRecordLayoutConfig } from "./resolveQueueRecordLayoutConfig";
import type { OpportunityQueueRowWithContext } from "@/lib/workUnits/lifecycleSubjectContracts";

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
    const resolvedId = pickEntityId(childId, line.personId) ?? "";
    const primaryRaw = pickDisplay(line.primary) ?? "";
    const { name, inlineAge } = splitQueuePreviewChildPrimaryLabel(primaryRaw);
    return {
        id: resolvedId || `child-${index}`,
        person_id: resolvedId,
        customer_member_id: pickDisplay(line.customerMemberId, line.ocmId) ?? "",
        "child.id": resolvedId,
        "child.name": name || "—",
        "child.age_band": pickDisplay(line.secondary, inlineAge, crm.ageBandContext, crm.ageContext) ?? "",
        "child.program": pickDisplay(line.programInline, line.secondary, crm.programContext) ?? "",
        "child.status": pickDisplay(crm.statusLabel, crm.stageLabel) ?? "",
        "child.location": pickDisplay(crm.locationContext, crm.roomContext) ?? "",
    };
}

function mapStructuredChildLine(line: CrmCompactChildLineVm, index: number, enrichment?: QueueRowLayoutRuntimeEnrichment | null): ProofRuntimeRecord {
    const resolvedId = pickEntityId(line.personId) ?? "";
    const primaryRaw = pickDisplay(line.primary) ?? "";
    const { name, inlineAge } = splitQueuePreviewChildPrimaryLabel(primaryRaw);
    return {
        id: resolvedId || `child-${index}`,
        person_id: resolvedId,
        customer_member_id: pickDisplay(line.customerMemberId, line.ocmId) ?? "",
        "child.id": resolvedId,
        "child.name": name || "—",
        "child.age_band": pickDisplay(line.secondary, inlineAge) ?? "",
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
        const { name, inlineAge } = splitQueuePreviewChildPrimaryLabel(crm.childName);
        return [
            {
                id: crm.childPersonId ?? "child-preview",
                "child.id": pickDisplay(crm.childPersonId) ?? "",
                "child.name": name || crm.childName,
                "child.age_band": pickDisplay(crm.ageBandContext, crm.ageContext, inlineAge) ?? "",
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

function normalizeInquiryChildrenAnchor(raw: unknown): unknown {
    if (!Array.isArray(raw)) return raw;
    return raw.map((entry, index) => {
        if (!entry || typeof entry !== "object") return entry;
        const row = entry as Record<string, unknown>;
        const personId = row.person_id ?? row.personId;
        const memberId = row.customer_member_id ?? row.customerMemberId ?? row.ocmId;
        return {
            ...row,
            id: row.id ?? memberId ?? (personId ? `inquiry-person:${personId}` : `preview-inquiry-${index}`),
            display_name: row.display_name ?? row.primary,
            person_id: personId,
            customer_member_id: memberId,
            dob: row.dob ?? row.date_of_birth,
        };
    });
}

function normalizeCrmCompactChildrenAnchor(raw: unknown): unknown {
    const structured = parseQueueRowCrmChildrenStructured(raw);
    if (structured.length === 0) return undefined;
    return structured.map((line, index) => ({
        primary: line.primary,
        display_name: line.primary,
        person_id: line.personId ?? "",
        customer_member_id: line.customerMemberId ?? "",
        ocm_id: line.ocmId ?? "",
        id: line.personId ?? line.customerMemberId ?? line.ocmId ?? `crm-compact-${index}`,
    }));
}

function buildChildEnrichmentAnchor(
    enrichment: QueueRowLayoutRuntimeEnrichment | null,
): Record<string, unknown> {
    const anchor: Record<string, unknown> = {
        _primary_child_person_id: enrichment?.primaryChildPersonId ?? null,
    };
    if (Array.isArray(enrichment?.inquiryChildren) && enrichment.inquiryChildren.length > 0) {
        anchor._inquiry_children = normalizeInquiryChildrenAnchor(enrichment.inquiryChildren);
    }
    const crmCompact = normalizeCrmCompactChildrenAnchor(enrichment?.crmCompactChildren);
    if (crmCompact) anchor._crm_compact_children = crmCompact;
    return anchor;
}

function mergePersonIdsFromCrmCompactChildren(
    rows: ProofRuntimeRecord[],
    enrichment: QueueRowLayoutRuntimeEnrichment | null,
): ProofRuntimeRecord[] {
    const structured = parseQueueRowCrmChildrenStructured(enrichment?.crmCompactChildren);
    if (structured.length === 0) return rows;

    return rows.map((row, index) => {
        const line =
            structured[index]
            ?? structured.find((candidate) => {
                const rowName = pickDisplay(row["child.name"]) ?? "";
                return rowName && candidate.primary.trim().toLowerCase() === rowName.trim().toLowerCase();
            });
        const personId = pickEntityId(line?.personId) ?? "";
        if (!personId) return row;
        return {
            ...row,
            person_id: personId,
            "child.id": personId,
            id: personId || row.id,
        };
    });
}

function resolvePreviewLayoutChildren(
    crm: CrmCompactRowSemanticSlots | undefined,
    enrichment: QueueRowLayoutRuntimeEnrichment | null,
): ProofRuntimeRecord[] {
    const slots = crm ?? ({} as CrmCompactRowSemanticSlots);
    const anchor = buildChildEnrichmentAnchor(enrichment);
    const hasCrmLines = (slots.childrenLines?.length ?? 0) > 0 || Boolean(slots.childName?.trim());
    const hasInquiryChildren = Array.isArray(enrichment?.inquiryChildren) && enrichment.inquiryChildren.length > 0;
    const hasHouseholdChildren = Array.isArray(enrichment?.householdChildren) && enrichment.householdChildren.length > 0;

    if (hasInquiryChildren || hasHouseholdChildren) {
        const crmRows = hasCrmLines ? mapCrmChildren(slots, enrichment) : [];
        const merged = mergeCanonicalOpportunityLayoutRuntimeChildRows({
            inquiryChildren: normalizeInquiryChildrenAnchor(enrichment?.inquiryChildren),
            householdChildren: enrichment?.householdChildren ?? (crmRows.length > 0 ? crmRows : undefined),
        });
        if (merged.length > 0) {
            return enrichLayoutRuntimeChildRowsFromAnchor(merged, anchor, { collectionKey: "children" });
        }
    }

    let rows = mapCrmChildren(slots, enrichment);
    if (rows.length === 0 && enrichment?.crmCompactChildren) {
        const structured = parseQueueRowCrmChildrenStructured(enrichment.crmCompactChildren);
        if (structured.length > 0) {
            rows = structured.map((line, index) => mapStructuredChildLine(line, index, enrichment));
        }
    }

    rows = mergePersonIdsFromCrmCompactChildren(rows, enrichment);
    return enrichLayoutRuntimeChildRowsFromAnchor(rows, anchor, { collectionKey: "children" });
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
    const layoutChildren = resolvePreviewLayoutChildren(crm, enrichment);
    const contactName = pickDisplay(
        crm?.contactDisplayName,
        parseContactNameFromLine(enrichment?.contactLine),
        enrichment?.contactLine,
    );
    const contactPhone = pickDisplay(crm?.contactPhoneDisplay, enrichment?.primaryPhone);
    const contactEmail = pickDisplay(crm?.contactEmail, enrichment?.primaryEmail);
    const primaryPersonId = pickEntityId(
        crm?.contactPersonId,
        enrichment?.primaryPersonId,
        item.relatedPersonId,
    ) ?? "";
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
        "customer.display_name": householdName,
        "customer.name": householdName,
        "person.primary_contact_name": primaryContact.displayName ?? "",
        "person.primary_phone": primaryContact.phone ?? "",
        "person.primary_email": primaryContact.email ?? "",
        "person.phone": primaryContact.phone ?? "",
        "person.email": primaryContact.email ?? "",
        "person.id": primaryPersonId,
        "opportunity.primary_person_id": primaryPersonId,
        _primary_person_id: primaryPersonId || undefined,
        _primary_child_person_id: enrichment?.primaryChildPersonId ?? undefined,
        _inquiry_children: enrichment?.inquiryChildren,
        status_key: statusLabel ?? "",
        _status_display: statusLabel ?? "",
        "opportunity.status_key": statusLabel ?? "",
        "opportunity.status_label": statusLabel ?? "",
        "opportunity.location": pickDisplay(enrichment?.locationLabel, crm?.locationContext, crm?.roomContext, crm?.programContext) ?? "",
        "opportunity.attention_reason": pickDisplay(enrichment?.attentionReason, crm?.attentionReason, crm?.queuePriorityExplanation) ?? "",
        _attention: pickDisplay(enrichment?.attentionReason, crm?.attentionReason, crm?.queuePriorityExplanation) ?? "",
        next_step: pickDisplay(crm?.nextStep) ?? "",
        "opportunity.next_step": pickDisplay(crm?.nextStep) ?? "",
        last_activity: pickDisplay(crm?.lastActivity) ?? "",
        "opportunity.tour_date": tourDate,
        tour_scheduled_at: tourDate,
        children: layoutChildren,
        enrollment_children: layoutChildren,
        ...(enrichment?.inquirySummaryTasks ? { _inquiry_summary_tasks: enrichment.inquirySummaryTasks } : {}),
        ...(enrichment?.operationalAttention != null ?
            { _operational_attention: enrichment.operationalAttention }
        :   {}),
        ...(enrichment?.operationalRecommendation != null ?
            { _operational_recommendation: enrichment.operationalRecommendation }
        :   {}),
        ...(enrichment?.operationalRecommendationPreview != null ?
            { _operational_recommendation_preview: enrichment.operationalRecommendationPreview }
        :   {}),
        ...(enrichment?.attentionSuggestion != null ? { _attention_suggestion: enrichment.attentionSuggestion } : {}),
        ...(enrichment?.attentionSuggestionPreview != null ?
            { _attention_suggestion_preview: enrichment.attentionSuggestionPreview }
        :   {}),
        _relations: {
            ...(buildPrimaryContactPersonRelation(primaryContact) ?
                { primary_contact: buildPrimaryContactPersonRelation(primaryContact)! }
            :   {}),
        },
    };

    const withDocKeys = ensureQueueDocRefKeys(baseRecord, doc);
    const rowContext = (item as OpportunityQueueRowWithContext)._queue_row_context ?? null;
    const withContext = rowContext ? applyQueueRowContextToLayoutRecord(withDocKeys, rowContext) : withDocKeys;
    const finalized = doc
        ? ensureQueueRecordLayoutFieldKeys(withContext, resolveQueueRecordLayoutConfig(doc))
        : withContext;
    return suppressDuplicateQueueRowSubjectOnRecord(finalized);
}
