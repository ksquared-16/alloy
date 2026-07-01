import type { EntityLabelsMap } from "@/lib/admin/entityLabelDisplay";
import {
    adminFieldEntityPluralLabel,
    adminFieldEntitySingularLabel,
} from "@/lib/admin/adminFieldEntityDisplayLabel";

export type ResolveEntityLabelOptions = {
    /** Prefer plural form (e.g. Leads). */
    plural?: boolean;
    /** When set, plural is used when count !== 1. */
    count?: number;
    /** Used when no mapping exists and defaults would echo the raw key. */
    fallback?: string;
};

const EMBEDDED_ENTITY_TERM_RE =
    /\b(inquiries|opportunities|inquiry|opportunity)\b/gi;

/**
 * Resolve a singular API entity key (e.g. `opportunity`, `person`) to tenant-configured copy.
 * Internal keys must not be shown when configured labels exist.
 */
export function resolveEntityLabel(
    entityKey: string,
    labels: EntityLabelsMap,
    options?: ResolveEntityLabelOptions
): string {
    const key = entityKey.trim().toLowerCase();
    if (!key) return options?.fallback?.trim() || "Record";

    const plural =
        options?.plural === true ||
        (options?.plural !== false && options?.count != null && options.count !== 1);

    const resolved = plural
        ? adminFieldEntityPluralLabel(labels, key)
        : adminFieldEntitySingularLabel(labels, key);

    const fallback = options?.fallback?.trim();
    if (fallback && resolved.toLowerCase() === key) return fallback;
    return resolved;
}

/** Option labels for action-placement record type pickers. */
export function actionPlacementEntityTypeOptionLabel(
    entityType: string,
    labels: EntityLabelsMap
): string {
    const et = entityType.trim().toLowerCase();
    if (!et) return "Any record type";
    return resolveEntityLabel(et, labels, {
        fallback:
            et.charAt(0).toUpperCase() + et.slice(1).replace(/_/g, " "),
    });
}

/**
 * Rewrite operator-facing strings that still contain legacy inquiry/opportunity words
 * (queue lane labels, KPI copy, etc.) using the configured entity label.
 */
export function applyEntityLabelToOperatorCopy(
    text: string,
    labels: EntityLabelsMap,
    entityKey = "opportunity"
): string {
    const trimmed = text.trim();
    if (!trimmed) return text;

    const singular = resolveEntityLabel(entityKey, labels);
    const plural = resolveEntityLabel(entityKey, labels, { plural: true });

    return trimmed.replace(EMBEDDED_ENTITY_TERM_RE, (match) => {
        const lower = match.toLowerCase();
        if (lower === "inquiries" || lower === "opportunities") return plural;
        return singular;
    });
}

/** Queue summary / lane chip labels — rewrites embedded inquiry/opportunity terms. */
export function resolveOperatorQueueSummaryLabels<T extends { label: string }>(
    summaries: T[],
    labels: EntityLabelsMap
): T[] {
    return summaries.map((q) => ({
        ...q,
        label: applyEntityLabelToOperatorCopy(q.label, labels),
    }));
}
