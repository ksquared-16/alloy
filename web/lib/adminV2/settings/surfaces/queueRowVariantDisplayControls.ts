/**
 * Queue Row variant display controls — ordered group/sort and waitlist placement ranking.
 */

import type {
    QueueRowPlacementRankingCriterion,
    QueueRowVariant,
    QueueRowVariantGroupBy,
    QueueRowVariantGroupCriterion,
    QueueRowVariantSort,
    QueueRowVariantSortCriterion,
} from "@/lib/layout/queueRecordLayoutV3";
import { WAITLIST_PLACEMENT_FIELD_KEYS } from "@/lib/layout/runtime/queueWaitlistPlacementField";
import { buildQueueRowLibraryCatalog } from "@/lib/adminV2/settings/surfaces/queueRowBuilderLibrary";

export type QueueRowGroupByKey =
    | "none"
    | "program"
    | "room"
    | "desired_start_date"
    | "age_band"
    | "location";

export type QueueRowSortByKey =
    | "default"
    | "waitlist_rank"
    | "placement_score"
    | "desired_start_date"
    | "last_activity"
    | "created_date"
    | "due_date";

export const QUEUE_ROW_GROUP_BY_OPTIONS: { key: QueueRowGroupByKey; label: string }[] = [
    { key: "none", label: "None" },
    { key: "program", label: "Program" },
    { key: "room", label: "Room" },
    { key: "desired_start_date", label: "Desired start date" },
    { key: "age_band", label: "Age band" },
    { key: "location", label: "Location" },
];

export const QUEUE_ROW_SORT_BY_OPTIONS: { key: QueueRowSortByKey; label: string }[] = [
    { key: "default", label: "Default" },
    { key: "waitlist_rank", label: "Waitlist rank" },
    { key: "placement_score", label: "Placement score" },
    { key: "desired_start_date", label: "Desired start date" },
    { key: "last_activity", label: "Last activity" },
    { key: "created_date", label: "Created date" },
    { key: "due_date", label: "Due date" },
];

export type PlacementRankingCatalogEntry = {
    criterionId: string;
    fieldKey: string;
    label: string;
    registered: boolean;
    defaultDirection: "asc" | "desc";
    supportsWeight: boolean;
    defaultWeight?: number;
};

/** Operator-facing placement ranking catalog — registry-backed where available. */
export const PLACEMENT_RANKING_CATALOG: PlacementRankingCatalogEntry[] = [
    {
        criterionId: "waitlist_rank",
        fieldKey: "waitlist.positionLabel",
        label: "Waitlist rank",
        registered: true,
        defaultDirection: "asc",
        supportsWeight: false,
    },
    {
        criterionId: "sibling_enrolled",
        fieldKey: "waitlist.siblingContext",
        label: "Sibling enrolled",
        registered: true,
        defaultDirection: "desc",
        supportsWeight: false,
    },
    {
        criterionId: "employee_family",
        fieldKey: "waitlist.tierLabel",
        label: "Employee family",
        registered: true,
        defaultDirection: "desc",
        supportsWeight: false,
    },
    {
        criterionId: "program_preference",
        fieldKey: "inquiry_child.program_category",
        label: "Program preference",
        registered: true,
        defaultDirection: "asc",
        supportsWeight: false,
    },
    {
        criterionId: "desired_start_date",
        fieldKey: "child.start_date",
        label: "Desired start date",
        registered: true,
        defaultDirection: "asc",
        supportsWeight: false,
    },
    {
        criterionId: "placement_adjustment",
        fieldKey: "overrides.flags",
        label: "Placement adjustment",
        registered: true,
        defaultDirection: "desc",
        supportsWeight: false,
    },
    {
        criterionId: "capacity_room_fit",
        fieldKey: "child.room",
        label: "Capacity / room fit",
        registered: true,
        defaultDirection: "asc",
        supportsWeight: false,
    },
    {
        criterionId: "placement_score",
        fieldKey: "waitlist.priorityLabel",
        label: "Placement score",
        registered: true,
        defaultDirection: "desc",
        supportsWeight: true,
        defaultWeight: 1,
    },
    {
        criterionId: "offer_status",
        fieldKey: "opportunity.offer_status",
        label: "Offer status",
        registered: false,
        defaultDirection: "asc",
        supportsWeight: false,
    },
];

/** @deprecated Use PLACEMENT_RANKING_CATALOG */
export const PLACEMENT_SIGNAL_CATALOG = PLACEMENT_RANKING_CATALOG.map((e) => ({
    fieldKey: e.fieldKey,
    label: e.label,
    registered: e.registered,
}));

export function sortKeyToVariantSort(key: QueueRowSortByKey): QueueRowVariantSort | undefined {
    const criterion = sortKeyToSortCriterion(key);
    return criterion ?? undefined;
}

export function sortKeyToSortCriterion(key: QueueRowSortByKey): QueueRowVariantSortCriterion | null {
    switch (key) {
        case "default":
            return null;
        case "waitlist_rank":
            return { key: "waitlist.position", direction: "asc", nulls: "last" };
        case "placement_score":
            return { key: "waitlist.priority", direction: "desc", nulls: "last" };
        case "desired_start_date":
            return { key: "child.start_date", direction: "asc", nulls: "last" };
        case "last_activity":
            return { key: "updated_at", direction: "desc", nulls: "last" };
        case "created_date":
            return { key: "created_at", direction: "desc", nulls: "last" };
        case "due_date":
            return { key: "due_at", direction: "asc", nulls: "last" };
    }
}

export function sortCriterionToSortKey(criterion: QueueRowVariantSortCriterion): QueueRowSortByKey {
    const k = criterion.key.toLowerCase();
    if (k.includes("waitlist") && k.includes("position")) return "waitlist_rank";
    if (k.includes("priority") || k.includes("score")) return "placement_score";
    if (k.includes("start")) return "desired_start_date";
    if (k.includes("updated") || k.includes("activity")) return "last_activity";
    if (k.includes("created")) return "created_date";
    if (k.includes("due")) return "due_date";
    return "default";
}

export function variantSortToSortKey(sort: QueueRowVariantSort | undefined): QueueRowSortByKey {
    if (!sort) return "default";
    return sortCriterionToSortKey(sort);
}

export function normalizeGroupByCriteria(variant: Pick<QueueRowVariant, "groupBy" | "groupByCriteria">): QueueRowVariantGroupCriterion[] {
    if (variant.groupByCriteria?.length) return [...variant.groupByCriteria];
    if (variant.groupBy && variant.groupBy !== "none") return [{ key: variant.groupBy }];
    return [];
}

export function normalizeSortCriteria(variant: Pick<QueueRowVariant, "sort" | "sortCriteria">): QueueRowVariantSortCriterion[] {
    if (variant.sortCriteria?.length) return [...variant.sortCriteria];
    if (variant.sort) return [{ ...variant.sort }];
    return [];
}

export function defaultPlacementRanking(): QueueRowPlacementRankingCriterion[] {
    return PLACEMENT_RANKING_CATALOG.map((entry) => ({
        criterionId: entry.criterionId,
        fieldKey: entry.fieldKey,
        enabled: entry.registered && entry.criterionId !== "offer_status",
        direction: entry.defaultDirection,
        weight: entry.supportsWeight ? entry.defaultWeight : undefined,
    }));
}

export function normalizePlacementRanking(
    variant: Pick<QueueRowVariant, "placementRanking">,
): QueueRowPlacementRankingCriterion[] {
    if (variant.placementRanking?.length) {
        const catalogById = new Map(PLACEMENT_RANKING_CATALOG.map((e) => [e.criterionId, e]));
        return variant.placementRanking.map((c) => {
            const catalog = catalogById.get(c.criterionId);
            return {
                ...c,
                fieldKey: c.fieldKey || catalog?.fieldKey || c.criterionId,
                direction: c.direction ?? catalog?.defaultDirection ?? "asc",
            };
        });
    }
    return defaultPlacementRanking();
}

export function isPlacementCriterionRegistered(fieldKey: string, isWaitlist: boolean): boolean {
    const catalog = PLACEMENT_RANKING_CATALOG.find((e) => e.fieldKey === fieldKey);
    if (!catalog?.registered) return false;
    const libraryKeys = new Set(
        buildQueueRowLibraryCatalog({ isWaitlist, inRowZoneKeys: [] })
            .filter((i) => i.kind === "field")
            .map((i) => i.fieldKey),
    );
    return libraryKeys.has(fieldKey) || WAITLIST_PLACEMENT_FIELD_KEYS.includes(fieldKey as (typeof WAITLIST_PLACEMENT_FIELD_KEYS)[number]);
}

export function placementRegistryGaps(isWaitlist: boolean): string[] {
    return PLACEMENT_RANKING_CATALOG.filter((e) => !isPlacementCriterionRegistered(e.fieldKey, isWaitlist)).map((e) => e.fieldKey);
}

export function isRegisteredPlacementField(fieldKey: string): boolean {
    return (
        WAITLIST_PLACEMENT_FIELD_KEYS.includes(fieldKey as (typeof WAITLIST_PLACEMENT_FIELD_KEYS)[number]) ||
        PLACEMENT_RANKING_CATALOG.some((s) => s.fieldKey === fieldKey && s.registered)
    );
}

export function addGroupCriterion(
    criteria: readonly QueueRowVariantGroupCriterion[],
    key: Exclude<QueueRowVariantGroupBy, "none">,
): QueueRowVariantGroupCriterion[] {
    if (criteria.some((c) => c.key === key)) return [...criteria];
    return [...criteria, { key }];
}

export function addSortCriterion(
    criteria: readonly QueueRowVariantSortCriterion[],
    sortKey: QueueRowSortByKey,
): QueueRowVariantSortCriterion[] {
    const next = sortKeyToSortCriterion(sortKey);
    if (!next) return [...criteria];
    if (criteria.some((c) => c.key === next.key && c.direction === next.direction)) return [...criteria];
    return [...criteria, next];
}

export function reorderCriteria<T>(items: readonly T[], index: number, direction: -1 | 1): T[] {
    const target = index + direction;
    if (target < 0 || target >= items.length) return [...items];
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
}

export function patchVariantDisplayFromCriteria(
    groupByCriteria: QueueRowVariantGroupCriterion[],
    sortCriteria: QueueRowVariantSortCriterion[],
): Pick<QueueRowVariant, "groupByCriteria" | "sortCriteria" | "groupBy" | "sort"> {
    return {
        groupByCriteria,
        sortCriteria,
        groupBy: groupByCriteria[0]?.key ?? "none",
        sort: sortCriteria[0],
    };
}

export function groupByOptionLabel(key: QueueRowGroupByKey): string {
    return QUEUE_ROW_GROUP_BY_OPTIONS.find((o) => o.key === key)?.label ?? key;
}

export function sortByOptionLabel(key: QueueRowSortByKey): string {
    return QUEUE_ROW_SORT_BY_OPTIONS.find((o) => o.key === key)?.label ?? key;
}

export function sortCriterionLabel(criterion: QueueRowVariantSortCriterion): string {
    return sortByOptionLabel(sortCriterionToSortKey(criterion));
}
