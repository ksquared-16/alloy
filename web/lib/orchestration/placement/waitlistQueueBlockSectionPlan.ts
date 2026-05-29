/**
 * Live QueueBlock waitlist section plan — same keys/sort path the UI uses.
 */

import {
    ORG_PROGRAM_CATEGORY_SORT_ORDER,
    type OrgProgramCategoryKey,
} from "@/lib/orchestration/placement/orgProgramCategory";
import {
    resolveWaitlistQueueItemSection,
    resolveWaitlistQueueItemSectionKey,
    type WaitlistQueueItemSectionInput,
} from "@/lib/orchestration/placement/waitlistQueueSectionPresentation";

/** Dev-only — section header attrs + console log for waitlist live smoke. */
export const WAITLIST_SECTION_LIVE_DIAG_ENABLED =
    process.env.NODE_ENV === "development" || process.env.VITEST === "true";

export type WaitlistQueueBlockRowInput = WaitlistQueueItemSectionInput & {
    id: string;
    groupKey?: string | null;
    groupLabel?: string | null;
};

export type WaitlistQueueBlockSectionHeader = {
    sectionKey: string;
    label: string;
    rowIds: string[];
    rawGroupKeys: string[];
    canonicalKeys: string[];
    rowCount: number;
};

export type WaitlistQueueBlockSectionPlan = {
    sortedItems: WaitlistQueueBlockRowInput[];
    headers: WaitlistQueueBlockSectionHeader[];
    /** Section keys that would repeat if rows were left unsorted (live duplicate bug signal). */
    unsortedDuplicateSectionKeys: string[];
};

export function waitlistQueueItemSectionSortIndex(sectionKey: string): number {
    const idx = ORG_PROGRAM_CATEGORY_SORT_ORDER.indexOf(sectionKey as OrgProgramCategoryKey);
    return idx >= 0 ? idx : ORG_PROGRAM_CATEGORY_SORT_ORDER.length;
}

function isWaitlistPlacementRow(item: WaitlistQueueItemSectionInput): boolean {
    return (
        item.placementWaitlistCandidate != null ||
        item.placementPriorityV2?.showPlacementV2Badge === true ||
        (item.placementPriority != null && !item.placementPriority.evaluateError) ||
        Boolean(item.groupKey?.trim()) ||
        Boolean(item.groupLabel?.trim())
    );
}

/** Sort queue VM rows so org-level sections stay contiguous (live QueueBlock path). */
export function sortWaitlistQueueItemsForDisplay<T extends WaitlistQueueBlockRowInput>(
    items: ReadonlyArray<T>
): T[] {
    if (items.length < 2) return [...items];
    if (!items.some(isWaitlistPlacementRow)) return [...items];

    return [...items].sort((a, b) => {
        const sa = resolveWaitlistQueueItemSectionKey(a) ?? "unspecified";
        const sb = resolveWaitlistQueueItemSectionKey(b) ?? "unspecified";
        const bySection = waitlistQueueItemSectionSortIndex(sa) - waitlistQueueItemSectionSortIndex(sb);
        if (bySection !== 0) return bySection;

        const rawA =
            a.placementWaitlistCandidate?.cohortKey?.trim() ||
            a.groupKey?.trim() ||
            a.placementPriority?.programGroupSectionTitle?.trim() ||
            "";
        const rawB =
            b.placementWaitlistCandidate?.cohortKey?.trim() ||
            b.groupKey?.trim() ||
            b.placementPriority?.programGroupSectionTitle?.trim() ||
            "";
        return rawA.localeCompare(rawB) || a.id.localeCompare(b.id);
    });
}

function rawGroupKeyForItem(item: WaitlistQueueBlockRowInput): string {
    return (
        item.groupKey?.trim() ||
        item.placementWaitlistCandidate?.cohortKey?.trim() ||
        item.placementPriority?.programGroupSectionTitle?.trim() ||
        ""
    );
}

function headersFromItemOrder(items: ReadonlyArray<WaitlistQueueBlockRowInput>): WaitlistQueueBlockSectionHeader[] {
    const headers: WaitlistQueueBlockSectionHeader[] = [];
    let lastKey: string | undefined;

    for (const item of items) {
        const section = resolveWaitlistQueueItemSection(item);
        if (!section) continue;
        const sk = section.sectionKey;
        const raw = rawGroupKeyForItem(item);

        if (sk !== lastKey) {
            headers.push({
                sectionKey: sk,
                label: section.sectionTitle,
                rowIds: [item.id],
                rawGroupKeys: raw ? [raw] : [],
                canonicalKeys: [sk],
                rowCount: 1,
            });
            lastKey = sk;
        } else {
            const h = headers[headers.length - 1]!;
            h.rowIds.push(item.id);
            h.rowCount += 1;
            if (raw && !h.rawGroupKeys.includes(raw)) h.rawGroupKeys.push(raw);
        }
    }

    return headers;
}

/** Build section headers exactly as QueueBlock would after sorting. */
export function buildWaitlistQueueBlockSectionPlan(
    items: ReadonlyArray<WaitlistQueueBlockRowInput>
): WaitlistQueueBlockSectionPlan {
    const sortedItems = sortWaitlistQueueItemsForDisplay(items);
    const headers = headersFromItemOrder(sortedItems);

    const unsortedHeaders = headersFromItemOrder(items);
    const seen = new Set<string>();
    const unsortedDuplicateSectionKeys: string[] = [];
    for (const h of unsortedHeaders) {
        if (seen.has(h.sectionKey)) unsortedDuplicateSectionKeys.push(h.sectionKey);
        seen.add(h.sectionKey);
    }

    return { sortedItems, headers, unsortedDuplicateSectionKeys };
}

export type WaitlistSectionLivePayload = {
    sectionKey: string;
    label: string;
    rowIds: string[];
    rawGroupKeys: string[];
    canonicalKeys: string[];
};

export function logWaitlistSectionLive(payload: WaitlistSectionLivePayload): void {
    if (!WAITLIST_SECTION_LIVE_DIAG_ENABLED) return;
    console.info("[waitlist-section-live]", payload);
}

export function waitlistSectionLiveDiagAttrs(header: WaitlistQueueBlockSectionHeader): Record<string, string> {
    if (!WAITLIST_SECTION_LIVE_DIAG_ENABLED) return {};
    return {
        "data-section-key": header.sectionKey,
        "data-section-label": header.label,
        "data-row-count": String(header.rowCount),
        "data-raw-group-keys": header.rawGroupKeys.join("|"),
        "data-canonical-category-keys": header.canonicalKeys.join("|"),
    };
}
