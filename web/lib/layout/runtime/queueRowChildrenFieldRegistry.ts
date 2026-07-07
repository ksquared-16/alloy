/**
 * Queue row children vocabulary — household/family children (not sibling context).
 *
 * Resolves from frozen `QueueRowContext` for compact CondensedQueueRow rendering.
 * Sibling fields (`sibling.*`) are waitlist candidate-grain only — see queueRowSiblingFieldRegistry.
 *
 * Children presentation uses the shared collection field primitive (`children`).
 * Legacy keys `children.count|names|summary` remain runtime-compatible via legacy mapping.
 */

import type { QueueRecordFieldConfig, QueueRecordNameDisplay } from "@/lib/layout/queueRecordLayoutV3";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import {
    extractChildrenCollectionItems,
    isCollectionFieldKey,
    isLegacyChildrenCollectionFieldKey,
    LEGACY_CHILDREN_COLLECTION_FIELD_KEYS,
    normalizeCollectionFieldKey,
    renderCollectionFieldFromContext,
    type CollectionFieldPresentationConfig,
} from "@/lib/presentation/collectionFieldPresentation";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";

/** Canonical children collection field key. */
export const QUEUE_ROW_CHILDREN_COLLECTION_FIELD_KEY = "children" as const;

/** @deprecated Use `children` collection field — kept for legacy config resolution. */
export const QUEUE_ROW_LEGACY_CHILDREN_FIELD_KEYS = LEGACY_CHILDREN_COLLECTION_FIELD_KEYS;

export const QUEUE_ROW_CHILDREN_FIELD_KEYS = [
    QUEUE_ROW_CHILDREN_COLLECTION_FIELD_KEY,
    ...LEGACY_CHILDREN_COLLECTION_FIELD_KEYS,
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

export function isQueueRowChildrenCollectionFieldKey(fieldKey: string): boolean {
    return normalizeCollectionFieldKey(fieldKey) === "children";
}

export { extractChildrenCollectionItems as queueRowChildrenCollectionItems };

export function queueRowChildrenCount(context: QueueRowContext): number {
    return extractChildrenCollectionItems(context).length;
}

export function queueRowChildrenNames(context: QueueRowContext): string[] {
    return extractChildrenCollectionItems(context).map((item) => item.displayName.trim()).filter(Boolean);
}

export function resolveQueueRowChildrenFieldFromContext(
    fieldKey: string,
    context: QueueRowContext,
    options?: {
        collectionPresentation?: CollectionFieldPresentationConfig;
        nameDisplay?: QueueRecordNameDisplay;
        record?: ProofRuntimeRecord | null;
    },
): string | null {
    const key = fieldKey.trim();

    if (isCollectionFieldKey(key)) {
        return renderCollectionFieldFromContext(key, context, options);
    }

    switch (key) {
        case "child.name": {
            const names = queueRowChildrenNames(context);
            if (context.row_subject.subject_type === "child" || context.row_subject.subject_type === "candidate") {
                return context.row_subject.display_name.trim() || null;
            }
            return names.length ? names.join(", ") : null;
        }
        case "inquiry_child.program":
            return (
                context.placement_context?.program_label?.trim()
                ?? context.related_subjects_summary
                    .filter((s) => s.visibility !== "hidden")
                    .map((s) => s.program_label?.trim())
                    .find(Boolean)
                ?? null
            );
        case "inquiry_child.schedule_type":
            return (
                context.placement_context?.schedule_label?.trim()
                ?? context.related_subjects_summary
                    .filter((s) => s.visibility !== "hidden")
                    .map((s) => s.schedule_label?.trim())
                    .find(Boolean)
                ?? null
            );
        default:
            return null;
    }
}

export function resolveQueueRowChildrenFieldFromFieldConfig(
    field: QueueRecordFieldConfig,
    context: QueueRowContext,
    record?: ProofRuntimeRecord | null,
): string | null {
    return resolveQueueRowChildrenFieldFromContext(field.fieldKey, context, {
        collectionPresentation: field.collectionPresentation,
        nameDisplay: field.nameDisplay,
        record,
    });
}

export function isLegacyChildrenCollectionPrimitiveKey(fieldKey: string): boolean {
    return isLegacyChildrenCollectionFieldKey(fieldKey);
}
