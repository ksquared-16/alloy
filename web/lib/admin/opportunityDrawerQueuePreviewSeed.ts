import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";
import { queueRowGrainContextFromPreviewItem } from "@/lib/queues/queueRowGrainContext";

/** Ephemeral header hints while opportunity drawer entity GET is in flight (queue row preview only). */
export type OpportunityDrawerQueuePreviewSeed = {
    title: string;
    subtitle?: string | null;
    statusLabel?: string | null;
    /**
     * Family opportunity id for Settlement when Attention is a child/candidate row.
     * From queue `drawer_open.entity_id` — never the process_instance Attention id.
     */
    familyOpportunityId?: string | null;
    /** Authoritative status key echo for chip tone — display-only, from queue row context. */
    statusKey?: string | null;
    stageLabel?: string | null;
    /** Site / room / program context from queue CRM compact slots. */
    locationLabel?: string | null;
    valueLabel?: string | null;
    urgencyTier?: "critical" | "warning" | "standard";
    activityStaleLabel?: string | null;
    /** Display-only hint (e.g. meta line with record #) — not authoritative record number. */
    recordNumberHint?: string | null;
    /** Queue row operational summary headline (client-hint for bootstrap `oper_trust_preview` echo). */
    operTrustHeadline?: string | null;
    /** Queue row urgency echo (`low` | `medium` | `high`) when not using `urgencyTier` alone. */
    operTrustUrgency?: string | null;
    /** Card 9 — child/candidate grain context from queue row (drawer/action follow-up). */
    rowGrain?: "case" | "child" | "candidate";
    placementCandidateId?: string;
    /** Child subject = customer_members.id (process_instances.subject_id) — targets movement directly. */
    customerMemberId?: string;
    opportunityCustomerMemberId?: string;
    childLifecycleStatus?: string | null;
    /** Card 11 — read-only child lifecycle rollup headline while entity GET loads. */
    childLifecycleSummaryHeadline?: string | null;
};

function pickLocationLabel(crm: QueuePreviewItemVm["semanticCrmCompact"]): string | null {
    if (!crm) return null;
    const room = crm.roomContext?.trim();
    if (room) return room;
    const program = crm.programContext?.trim();
    if (program) return program;
    const loc = crm.locationContext?.trim();
    if (loc) return loc;
    return null;
}

function pickRecordNumberHint(item: QueuePreviewItemVm): string | null {
    const meta = item.metaLines?.find((m) => /record|inquiry|#/i.test(m.label));
    if (meta?.value?.trim()) return meta.value.trim();
    return null;
}

export function opportunityDrawerSeedFromQueueItem(item: QueuePreviewItemVm): OpportunityDrawerQueuePreviewSeed {
    const crm = item.semanticCrmCompact;
    const title =
        (crm?.primaryIdentity?.trim() || item.title?.trim() || "Opportunity") ?? "Opportunity";
    const subtitle =
        item.subtitle?.trim() ||
        crm?.commercialValue?.trim() ||
        crm?.nextStep?.trim() ||
        crm?.childName?.trim() ||
        null;
    const statusLabel = crm?.statusLabel?.trim() || null;
    const stageLabel = crm?.stageLabel?.trim() || null;
    const locationLabel = pickLocationLabel(crm);
    const valueLabel = item.valueLabel?.trim() || crm?.commercialValue?.trim() || null;
    const urgencyTier = item.urgencyTier;
    const activityStaleLabel = crm?.activityStale?.label?.trim() || null;
    const recordNumberHint = pickRecordNumberHint(item);
    const summaryPreview = item.semanticCrmCompact?.operationalSummaryPreview;
    const operTrustHeadline = summaryPreview?.headline?.trim() || null;
    const operTrustUrgency = summaryPreview?.risk_urgency_hint?.trim() || null;
    const grainCtx = queueRowGrainContextFromPreviewItem(item);
    return {
        title,
        subtitle,
        statusLabel,
        stageLabel,
        locationLabel,
        valueLabel,
        urgencyTier,
        activityStaleLabel,
        recordNumberHint,
        operTrustHeadline,
        operTrustUrgency,
        rowGrain: grainCtx.rowGrain,
        placementCandidateId: grainCtx.placementCandidateId,
        customerMemberId: grainCtx.customerMemberId,
        opportunityCustomerMemberId: grainCtx.opportunityCustomerMemberId,
        childLifecycleStatus: grainCtx.childLifecycleStatus,
        childLifecycleSummaryHeadline: item.semanticCrmCompact?.childLifecycleSummary ?? null,
    };
}

export function findQueuePreviewItemById(
    items: QueuePreviewItemVm[] | null | undefined,
    entityId: string
): QueuePreviewItemVm | null {
    const id = entityId.trim();
    if (!id || !items?.length) return null;
    return items.find((row) => row.id === id) ?? null;
}
