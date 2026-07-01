/**
 * Active drawer record context for related-list / household row filtering.
 *
 * Default: exclude the viewing person or child from household/family/guardian lists.
 * Opportunity drawer lists remain unchanged unless explicit scope ids are set on the record.
 */

import type { LayoutItem } from "@/lib/layout/layoutV2";
import {
    CONTACT_REPEATER_REF_KEYS,
    isLayoutRuntimeContactRepeater,
} from "@/lib/layout/runtime/mapLayoutRuntimeContactRepeaterRows";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export const LAYOUT_RUNTIME_ANCHOR_ENTITY_METADATA_KEY = "_layout_runtime_anchor_entity" as const;
export const LAYOUT_RUNTIME_ACTIVE_PERSON_ID_METADATA_KEY = "_layout_runtime_active_person_id" as const;
export const LAYOUT_RUNTIME_ACTIVE_CHILD_PERSON_ID_METADATA_KEY = "_layout_runtime_active_child_person_id" as const;
export const LAYOUT_RUNTIME_SCOPED_PERSON_ID_METADATA_KEY = "_layout_runtime_scoped_person_id" as const;
export const LAYOUT_RUNTIME_SCOPED_CHILD_PERSON_ID_METADATA_KEY = "_layout_runtime_scoped_child_person_id" as const;

const CHILDREN_REPEATER_KEYS = new Set([
    "children",
    "enrollment_children",
    "inquiry_children",
    "_inquiry_children",
    "household_children",
    "_household_children",
]);

const PERSON_RELATED_REPEATER_KEYS = new Set(["family_adults"]);

export type LayoutRuntimeActiveRecordContext = {
    anchorEntity: string;
    activePersonId: string | null;
    activeChildPersonId: string | null;
    scopedPersonId: string | null;
    scopedChildPersonId: string | null;
};

export type ReadLayoutRuntimeRepeaterOptions = {
    activeRecord?: Partial<LayoutRuntimeActiveRecordContext> & { entityId?: string; anchorEntity?: string };
};

function trimId(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

function normalizeAnchorEntity(value: string): string {
    const v = value.trim().toLowerCase();
    if (v === "person" || v === "persons") return "person";
    if (v === "child" || v === "children") return "child";
    if (v === "opportunity" || v === "opportunities") return "opportunity";
    return v;
}

export function isLayoutRuntimeChildrenRepeaterItem(item: Pick<LayoutItem, "source" | "refKey">): boolean {
    const keys = [item.source, item.refKey].filter(Boolean).map(String);
    return keys.some((key) => CHILDREN_REPEATER_KEYS.has(key));
}

export function isLayoutRuntimePersonRelatedRepeater(item: Pick<LayoutItem, "kind" | "source" | "refKey">): boolean {
    if (isLayoutRuntimeContactRepeater(item)) return true;
    const key = String(item.refKey ?? item.source ?? "").trim();
    return PERSON_RELATED_REPEATER_KEYS.has(key);
}

/** Resolve active drawer record ids used to filter related-list rows. */
export function resolveLayoutRuntimeActiveRecordContext(
    record: ProofRuntimeRecord,
    overrides?: ReadLayoutRuntimeRepeaterOptions["activeRecord"],
): LayoutRuntimeActiveRecordContext {
    const anchorEntity = normalizeAnchorEntity(
        overrides?.anchorEntity
        ?? String(record[LAYOUT_RUNTIME_ANCHOR_ENTITY_METADATA_KEY] ?? record.entity_type ?? ""),
    );

    const entityId =
        trimId(overrides?.entityId)
        ?? trimId(record[LAYOUT_RUNTIME_ACTIVE_PERSON_ID_METADATA_KEY])
        ?? trimId(record[LAYOUT_RUNTIME_ACTIVE_CHILD_PERSON_ID_METADATA_KEY])
        ?? trimId(record.id);

    const activePersonId =
        trimId(overrides?.activePersonId)
        ?? (anchorEntity === "person" ? entityId ?? trimId(record["person.id"]) : null);

    const activeChildPersonId =
        trimId(overrides?.activeChildPersonId)
        ?? (anchorEntity === "child" ? entityId ?? trimId(record["child.id"]) : null);

    return {
        anchorEntity,
        activePersonId,
        activeChildPersonId,
        scopedPersonId:
            trimId(overrides?.scopedPersonId) ?? trimId(record[LAYOUT_RUNTIME_SCOPED_PERSON_ID_METADATA_KEY]),
        scopedChildPersonId:
            trimId(overrides?.scopedChildPersonId)
            ?? trimId(record[LAYOUT_RUNTIME_SCOPED_CHILD_PERSON_ID_METADATA_KEY]),
    };
}

function rowPersonIds(row: ProofRuntimeRecord): string[] {
    return [row.person_id, row["person.id"], row.id].map(trimId).filter((id): id is string => Boolean(id));
}

function rowChildPersonIds(row: ProofRuntimeRecord): string[] {
    return [row["child.id"], row.person_id, row["person.id"], row.id]
        .map(trimId)
        .filter((id): id is string => Boolean(id));
}

export function rowMatchesActivePerson(row: ProofRuntimeRecord, activePersonId: string): boolean {
    return rowPersonIds(row).some((id) => id === activePersonId);
}

export function rowMatchesActiveChild(row: ProofRuntimeRecord, activeChildPersonId: string): boolean {
    return rowChildPersonIds(row).some((id) => id === activeChildPersonId);
}

function shouldApplyActiveRecordExclusion(context: LayoutRuntimeActiveRecordContext): boolean {
    if (context.anchorEntity === "person" || context.anchorEntity === "child") return true;
    if (
        context.anchorEntity === "opportunity"
        && (context.scopedPersonId || context.scopedChildPersonId)
    ) {
        return true;
    }
    return false;
}

/** Filter related-list rows to exclude the active drawer record when configured. */
export function filterRelatedListRowsExcludingActiveRecord(
    rows: ProofRuntimeRecord[],
    item: LayoutItem,
    context: LayoutRuntimeActiveRecordContext,
): ProofRuntimeRecord[] {
    if (!shouldApplyActiveRecordExclusion(context)) return rows;

    const personRepeater = isLayoutRuntimePersonRelatedRepeater(item);
    const childRepeater = isLayoutRuntimeChildrenRepeaterItem(item);

    if (context.anchorEntity === "person" && context.activePersonId && personRepeater) {
        return rows.filter((row) => !rowMatchesActivePerson(row, context.activePersonId!));
    }

    if (context.anchorEntity === "child") {
        const activeId = context.activeChildPersonId ?? context.activePersonId;
        if (!activeId) return rows;
        if (personRepeater) {
            return rows.filter((row) => !rowMatchesActivePerson(row, activeId));
        }
        if (childRepeater) {
            return rows.filter((row) => !rowMatchesActiveChild(row, activeId));
        }
    }

    if (context.anchorEntity === "opportunity") {
        if (context.scopedPersonId && personRepeater) {
            return rows.filter((row) => !rowMatchesActivePerson(row, context.scopedPersonId!));
        }
        if (context.scopedChildPersonId && childRepeater) {
            return rows.filter((row) => !rowMatchesActiveChild(row, context.scopedChildPersonId!));
        }
    }

    return rows;
}

export function shouldUseOtherHouseholdEmptyLanguage(context: LayoutRuntimeActiveRecordContext): boolean {
    return context.anchorEntity === "person" || context.anchorEntity === "child";
}

/** Operator-facing empty copy when the active record is excluded from household lists. */
export function layoutRuntimeRelatedListEmptyMessage(
    item: LayoutItem,
    context: LayoutRuntimeActiveRecordContext,
): string {
    const useOther = shouldUseOtherHouseholdEmptyLanguage(context);
    const refKey = String(item.refKey ?? item.source ?? "").trim();

    if (isLayoutRuntimeContactRepeater(item)) {
        if (refKey === "household_members") {
            return useOther ?
                    "No other household members on this record yet."
                :   "No household members on this record yet.";
        }
        return useOther ?
                "No other household contacts on this record yet."
            :   "No household contacts on this record yet.";
    }

    if (refKey === "family_adults") {
        return useOther ?
                "No other household members on this record yet."
            :   "No family adults on this record yet.";
    }

    if (isLayoutRuntimeChildrenRepeaterItem(item)) {
        return context.anchorEntity === "child" ?
                "No other children linked yet."
            :   "No children linked yet.";
    }

    return "No related records yet.";
}

export function stampLayoutRuntimeActiveRecordContext(
    record: ProofRuntimeRecord,
    input: {
        anchorEntity: "person" | "child" | "opportunity";
        entityId: string;
    },
): ProofRuntimeRecord {
    const entityId = trimId(input.entityId);
    if (!entityId) return record;

    const next: ProofRuntimeRecord = {
        ...record,
        [LAYOUT_RUNTIME_ANCHOR_ENTITY_METADATA_KEY]: input.anchorEntity,
    };

    if (input.anchorEntity === "person") {
        next[LAYOUT_RUNTIME_ACTIVE_PERSON_ID_METADATA_KEY] = entityId;
    } else if (input.anchorEntity === "child") {
        next[LAYOUT_RUNTIME_ACTIVE_CHILD_PERSON_ID_METADATA_KEY] = entityId;
    }

    return next;
}

export { CONTACT_REPEATER_REF_KEYS };
