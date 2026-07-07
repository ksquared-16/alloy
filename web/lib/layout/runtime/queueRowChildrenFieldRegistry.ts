/**
 * Queue row children vocabulary — household/family children (not sibling context).
 *
 * Resolves from frozen `QueueRowContext` for compact CondensedQueueRow rendering.
 * Sibling fields (`sibling.*`) are waitlist candidate-grain only — see queueRowSiblingFieldRegistry.
 */

import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";

export const QUEUE_ROW_CHILDREN_FIELD_KEYS = [
    "children.count",
    "children.names",
    "children.summary",
] as const;

export type QueueRowChildrenFieldKey = (typeof QUEUE_ROW_CHILDREN_FIELD_KEYS)[number];

/** Child-scoped row fields resolved from row subject + placement context. */
export const QUEUE_ROW_ACTIVE_CHILD_FIELD_KEYS = [
    "child.name",
    "inquiry_child.program",
    "inquiry_child.schedule_type",
] as const;

export const QUEUE_ROW_CHILDREN_COMPACT_FIELD_KEYS = [
    ...QUEUE_ROW_CHILDREN_FIELD_KEYS,
    ...QUEUE_ROW_ACTIVE_CHILD_FIELD_KEYS,
] as const;

export function isQueueRowChildrenFieldKey(fieldKey: string): boolean {
    return (QUEUE_ROW_CHILDREN_COMPACT_FIELD_KEYS as readonly string[]).includes(fieldKey.trim());
}

function visibleHouseholdChildren(context: QueueRowContext) {
    return context.related_subjects_summary.filter((s) => s.visibility !== "hidden");
}

function visibleChildRelatedSubjects(context: QueueRowContext) {
    return visibleHouseholdChildren(context).filter(
        (s) => s.subject_type === "child" || s.subject_type === "candidate",
    );
}

export function queueRowChildrenCount(context: QueueRowContext): number {
    if (context.row_presentation_mode === "grouped_subjects") {
        return context.row_subjects?.length ?? context.row_count ?? 0;
    }
    if (context.row_subject.subject_type === "child" || context.row_subject.subject_type === "candidate") {
        const siblings = visibleChildRelatedSubjects(context).filter(
            (s) => s.subject_id !== context.row_subject.subject_id,
        );
        return siblings.length > 0 ? siblings.length + 1 : 1;
    }
    const related = visibleChildRelatedSubjects(context);
    if (related.length > 0) return related.length;
    return 0;
}

export function queueRowChildrenNames(context: QueueRowContext): string[] {
    if (context.row_presentation_mode === "grouped_subjects" && context.row_subjects?.length) {
        return context.row_subjects.map((s) => s.display_name.trim()).filter(Boolean);
    }
    if (context.row_subject.subject_type === "child" || context.row_subject.subject_type === "candidate") {
        const name = context.row_subject.display_name.trim();
        return name ? [name] : [];
    }
    return visibleChildRelatedSubjects(context)
        .map((s) => s.display_name.trim())
        .filter(Boolean);
}

export function resolveQueueRowChildrenFieldFromContext(
    fieldKey: string,
    context: QueueRowContext,
): string | null {
    const key = fieldKey.trim();
    const names = queueRowChildrenNames(context);
    const count = queueRowChildrenCount(context);

    switch (key) {
        case "children.count": {
            if (count <= 0) return null;
            return `${count} ${count === 1 ? "child" : "children"}`;
        }
        case "children.names":
            return names.length ? names.join(", ") : null;
        case "children.summary": {
            if (count <= 0) return null;
            const unit = count === 1 ? "child" : "children";
            return names.length ? `${count} ${unit}: ${names.join(", ")}` : `${count} ${unit}`;
        }
        case "child.name": {
            if (context.row_subject.subject_type === "child" || context.row_subject.subject_type === "candidate") {
                return context.row_subject.display_name.trim() || null;
            }
            return names.length ? names.join(", ") : null;
        }
        case "inquiry_child.program":
            return (
                context.placement_context?.program_label?.trim()
                ?? visibleChildRelatedSubjects(context).map((s) => s.program_label?.trim()).find(Boolean)
                ?? null
            );
        case "inquiry_child.schedule_type":
            return (
                context.placement_context?.schedule_label?.trim()
                ?? visibleChildRelatedSubjects(context).map((s) => s.schedule_label?.trim()).find(Boolean)
                ?? null
            );
        default:
            return null;
    }
}
