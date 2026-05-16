import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";

/** Ephemeral header hints while opportunity drawer entity GET is in flight (queue row preview only). */
export type OpportunityDrawerQueuePreviewSeed = {
    title: string;
    subtitle?: string | null;
    statusLabel?: string | null;
    stageLabel?: string | null;
};

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
    return { title, subtitle, statusLabel, stageLabel };
}

export function findQueuePreviewItemById(
    items: QueuePreviewItemVm[] | null | undefined,
    entityId: string
): QueuePreviewItemVm | null {
    const id = entityId.trim();
    if (!id || !items?.length) return null;
    return items.find((row) => row.id === id) ?? null;
}
