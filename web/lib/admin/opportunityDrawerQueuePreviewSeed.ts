import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";

/** Ephemeral header hints while opportunity drawer entity GET is in flight (queue row preview only). */
export type OpportunityDrawerQueuePreviewSeed = {
    title: string;
    subtitle?: string | null;
    statusLabel?: string | null;
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
