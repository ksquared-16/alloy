/**
 * Configurable collection field presentation — reusable across queue rows, focus panels, etc.
 *
 * One library item (e.g. `children`) resolves a collection of related records and renders
 * operator-configured list / count / summary output. Display is driven entirely by
 * `CollectionFieldPresentationConfig` — no hardcoded variant combinations.
 */

import type { QueueRecordFieldConfig, QueueRecordNameDisplay } from "@/lib/layout/queueRecordLayoutV3";
import { formatDisplayDate } from "@/lib/adminFormatters";
import { inquiryChildAgeLabelFromDob } from "@/lib/admin/drawer/inquiryChildrenHydration";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import { readLayoutRuntimeRepeaterRows } from "@/lib/layout/runtime/readLayoutRuntimeRepeaterRows";
import type { QueueRowContext, RelatedSubjectSummary } from "@/lib/workUnits/lifecycleSubjectContracts";

export type CollectionFieldKey = "children";

export type CollectionDisplayMode = "list" | "count" | "summary";

export type CollectionItemFieldKey =
    | "first_name"
    | "last_name"
    | "age"
    | "dob"
    | "program"
    | "schedule"
    | "gender";

export type CollectionListFormat = "comma" | "bullet" | "pipe" | "newline";

export type CollectionMaxDisplayed = 1 | 2 | 3 | "all";

export type CollectionOverflowBehavior = "plus_n_more" | "ellipsis" | "count_only";

export type CollectionFieldPresentationConfig = {
    displayMode: CollectionDisplayMode;
    includedFields: readonly CollectionItemFieldKey[];
    listFormat: CollectionListFormat;
    maxDisplayed: CollectionMaxDisplayed;
    overflowBehavior: CollectionOverflowBehavior;
};

export type CollectionItem = {
    subjectId: string;
    firstName: string;
    lastName: string;
    displayName: string;
    age: string | null;
    dob: string | null;
    program: string | null;
    schedule: string | null;
    gender: string | null;
};

export const COLLECTION_FIELD_KEYS = ["children"] as const;

/** Legacy primitive keys that map to the children collection. */
export const LEGACY_CHILDREN_COLLECTION_FIELD_KEYS = [
    "children.count",
    "children.names",
    "children.summary",
] as const;

export type LegacyChildrenCollectionFieldKey = (typeof LEGACY_CHILDREN_COLLECTION_FIELD_KEYS)[number];

export const COLLECTION_ITEM_FIELD_CATALOG: Record<
    CollectionItemFieldKey,
    { label: string; resolverBacked: boolean }
> = {
    first_name: { label: "First name", resolverBacked: true },
    last_name: { label: "Last name", resolverBacked: true },
    age: { label: "Age", resolverBacked: true },
    dob: { label: "DOB", resolverBacked: true },
    program: { label: "Program", resolverBacked: true },
    schedule: { label: "Schedule", resolverBacked: true },
    gender: { label: "Gender", resolverBacked: true },
};

/** Inspector copy when gender is registered but queue-row hydration is missing (should not show when resolver-backed). */
export const CHILDREN_COLLECTION_GENDER_UNAVAILABLE_REASON =
    "Gender is configured in Fields but is not available in queue row runtime yet.";

export const DEFAULT_CHILDREN_COLLECTION_PRESENTATION: CollectionFieldPresentationConfig = {
    displayMode: "list",
    includedFields: ["first_name", "last_name"],
    listFormat: "comma",
    maxDisplayed: "all",
    overflowBehavior: "plus_n_more",
};

export function isCollectionFieldKey(fieldKey: string): boolean {
    return normalizeCollectionFieldKey(fieldKey) != null;
}

export function normalizeCollectionFieldKey(fieldKey: string): CollectionFieldKey | null {
    const key = fieldKey.trim();
    if (key === "children") return "children";
    if ((LEGACY_CHILDREN_COLLECTION_FIELD_KEYS as readonly string[]).includes(key)) return "children";
    return null;
}

export function isLegacyChildrenCollectionFieldKey(fieldKey: string): fieldKey is LegacyChildrenCollectionFieldKey {
    return (LEGACY_CHILDREN_COLLECTION_FIELD_KEYS as readonly string[]).includes(fieldKey.trim());
}

export function collectionItemFieldIsAvailable(fieldKey: CollectionItemFieldKey): boolean {
    return COLLECTION_ITEM_FIELD_CATALOG[fieldKey].resolverBacked;
}

/** Subfields operators may toggle in the Children collection inspector. */
export function selectableChildrenCollectionItemFieldKeys(): CollectionItemFieldKey[] {
    return (Object.keys(COLLECTION_ITEM_FIELD_CATALOG) as CollectionItemFieldKey[]).filter((key) =>
        collectionItemFieldIsAvailable(key),
    );
}

/** Subfields registered but not queue-row resolver-backed — inspector unavailable only. */
export function unavailableChildrenCollectionItemFieldKeys(): CollectionItemFieldKey[] {
    return (Object.keys(COLLECTION_ITEM_FIELD_CATALOG) as CollectionItemFieldKey[]).filter(
        (key) => !collectionItemFieldIsAvailable(key),
    );
}

export function normalizeCollectionFieldPresentation(
    config: Partial<CollectionFieldPresentationConfig> | null | undefined,
): CollectionFieldPresentationConfig {
    const base = DEFAULT_CHILDREN_COLLECTION_PRESENTATION;
    const includedFields = (config?.includedFields ?? base.includedFields).filter((key) =>
        collectionItemFieldIsAvailable(key),
    );
    return {
        displayMode: config?.displayMode ?? base.displayMode,
        includedFields: includedFields.length > 0 ? includedFields : ["first_name", "last_name"],
        listFormat: config?.listFormat ?? base.listFormat,
        maxDisplayed: config?.maxDisplayed ?? base.maxDisplayed,
        overflowBehavior: config?.overflowBehavior ?? base.overflowBehavior,
    };
}

/** Map legacy children.* primitive keys to equivalent collection configs. */
export function legacyCollectionPresentationFromFieldKey(
    fieldKey: string,
    nameDisplay?: QueueRecordNameDisplay,
): CollectionFieldPresentationConfig | null {
    const key = fieldKey.trim();
    switch (key) {
        case "children.count":
            return normalizeCollectionFieldPresentation({
                displayMode: "count",
                includedFields: [],
                listFormat: "comma",
                maxDisplayed: "all",
                overflowBehavior: "plus_n_more",
            });
        case "children.names":
            return normalizeCollectionFieldPresentation({
                displayMode: "list",
                includedFields:
                    nameDisplay === "first_name" ? ["first_name"] : (["first_name", "last_name"] as const),
                listFormat: "comma",
                maxDisplayed: "all",
                overflowBehavior: "plus_n_more",
            });
        case "children.summary":
            return normalizeCollectionFieldPresentation({
                displayMode: "summary",
                includedFields: ["first_name", "last_name"],
                listFormat: "comma",
                maxDisplayed: "all",
                overflowBehavior: "plus_n_more",
            });
        default:
            return null;
    }
}

export function collectionPresentationFromFieldConfig(
    field: Pick<QueueRecordFieldConfig, "fieldKey" | "collectionPresentation" | "nameDisplay">,
): CollectionFieldPresentationConfig | null {
    const collectionKey = normalizeCollectionFieldKey(field.fieldKey);
    if (!collectionKey) return null;
    if (field.collectionPresentation) {
        return normalizeCollectionFieldPresentation(field.collectionPresentation);
    }
    return (
        legacyCollectionPresentationFromFieldKey(field.fieldKey, field.nameDisplay)
        ?? normalizeCollectionFieldPresentation(undefined)
    );
}

function splitDisplayName(displayName: string): { first: string; last: string } {
    const parts = displayName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { first: "", last: "" };
    if (parts.length === 1) return { first: parts[0]!, last: "" };
    return { first: parts[0]!, last: parts.slice(1).join(" ") };
}

function trimOrNull(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

function visibleChildRelatedSubjects(context: QueueRowContext): RelatedSubjectSummary[] {
    return context.related_subjects_summary
        .filter((s) => s.visibility !== "hidden")
        .filter((s) => s.subject_type === "child" || s.subject_type === "candidate");
}

function subjectSummaryToItem(summary: RelatedSubjectSummary): CollectionItem {
    const { first, last } = splitDisplayName(summary.display_name);
    const dob = trimOrNull(summary.date_of_birth);
    const ageLabel = trimOrNull(summary.age_label) ?? resolveAgeLabelFromDob(dob);
    return {
        subjectId: summary.subject_id,
        firstName: first,
        lastName: last,
        displayName: summary.display_name.trim(),
        age: ageLabel,
        dob,
        program: trimOrNull(summary.program_label),
        schedule: trimOrNull(summary.schedule_label),
        gender: trimOrNull(summary.gender_label),
    };
}

function compactStoredAgeLabel(rawAge: string): string {
    const age = rawAge.trim();
    if (!age) return age;
    const compact = age.replace(/\s+/g, "").replace(/years?/i, "y").replace(/months?/i, "m");
    return compact.includes("y") || compact.includes("m") ? compact : age;
}

function resolveAgeLabelFromDob(dob: string | null): string | null {
    if (!dob?.trim()) return null;
    return inquiryChildAgeLabelFromDob(dob)?.label ?? null;
}

function resolveItemAgeLabel(item: CollectionItem): string | null {
    if (item.age?.trim()) return compactStoredAgeLabel(item.age);
    return resolveAgeLabelFromDob(item.dob);
}

function resolveItemDobDisplay(item: CollectionItem): string | null {
    const dob = item.dob?.trim();
    if (!dob) return null;
    return formatDisplayDate(dob) || dob;
}

function enrichItemFromChildRow(item: CollectionItem, row: ProofRuntimeRecord): CollectionItem {
    const firstName =
        trimOrNull(row["child.first_name"])
        ?? trimOrNull(row.first_name)
        ?? item.firstName;
    const lastName =
        trimOrNull(row["child.last_name"])
        ?? trimOrNull(row.last_name)
        ?? item.lastName;
    const displayName =
        trimOrNull(row["child.name"])
        ?? trimOrNull(row["child.display_name"])
        ?? ([firstName, lastName].filter(Boolean).join(" ") || item.displayName);

    const dob =
        trimOrNull(row["child.date_of_birth"])
        ?? trimOrNull(row["child.dob"])
        ?? item.dob;
    const ageLabel =
        resolveAgeLabelFromDob(dob)
        ?? (trimOrNull(row["child.age"]) ? compactStoredAgeLabel(String(row["child.age"])) : null)
        ?? (trimOrNull(row["child.dob_age"]) ? compactStoredAgeLabel(String(row["child.dob_age"])) : null)
        ?? item.age;

    return {
        ...item,
        subjectId:
            trimOrNull(row["child.id"])
            ?? trimOrNull(row.person_id)
            ?? trimOrNull(row.id)
            ?? item.subjectId,
        firstName: firstName ?? item.firstName,
        lastName: lastName ?? item.lastName,
        displayName: displayName ?? item.displayName,
        age: ageLabel,
        dob,
        program:
            trimOrNull(row["inquiry_child.program"])
            ?? trimOrNull(row["child.program"])
            ?? item.program,
        schedule:
            trimOrNull(row["inquiry_child.schedule_type"])
            ?? trimOrNull(row["child.schedule"])
            ?? item.schedule,
        gender: trimOrNull(row["child.gender"]) ?? item.gender,
    };
}

function childrenRepeaterItem() {
    return {
        id: "children",
        kind: "related_list" as const,
        refKey: "children",
        source: "children",
        related: { entityType: "child" as const },
    };
}

function childRowsBySubjectId(record: ProofRuntimeRecord | null | undefined): Map<string, ProofRuntimeRecord> {
    const map = new Map<string, ProofRuntimeRecord>();
    if (!record) return map;
    const rows = readLayoutRuntimeRepeaterRows(record, childrenRepeaterItem());
    for (const row of rows) {
        const subjectId =
            trimOrNull(row["child.id"])
            ?? trimOrNull(row.person_id)
            ?? trimOrNull(row.id);
        if (subjectId) map.set(subjectId, row);
    }
    return map;
}

/** Extract children collection items from queue row context (+ optional layout record enrichment). */
export function extractChildrenCollectionItems(
    context: QueueRowContext,
    record?: ProofRuntimeRecord | null,
): CollectionItem[] {
    const childRows = childRowsBySubjectId(record);
    const items: CollectionItem[] = [];

    if (context.row_presentation_mode === "grouped_subjects" && context.row_subjects?.length) {
        for (const subject of context.row_subjects) {
            const base = subjectSummaryToItem({
                subject_type: subject.subject_type,
                subject_id: subject.subject_id,
                display_name: subject.display_name,
                status_label: "—",
                date_of_birth: subject.date_of_birth ?? null,
                age_label: subject.age_label ?? null,
                gender_label: subject.gender_label ?? null,
            });
            const row = childRows.get(subject.subject_id);
            items.push(row ? enrichItemFromChildRow(base, row) : base);
        }
        return items;
    }

    if (context.row_subject.subject_type === "child" || context.row_subject.subject_type === "candidate") {
        const primary = subjectSummaryToItem({
            subject_type: context.row_subject.subject_type,
            subject_id: context.row_subject.subject_id,
            display_name: context.row_subject.display_name,
            status_label: "—",
            program_label: context.placement_context?.program_label ?? null,
            schedule_label: context.placement_context?.schedule_label ?? null,
            date_of_birth: context.row_subject.date_of_birth ?? null,
            age_label: context.row_subject.age_label ?? null,
            gender_label: context.row_subject.gender_label ?? null,
        });
        const primaryRow = childRows.get(context.row_subject.subject_id);
        items.push(primaryRow ? enrichItemFromChildRow(primary, primaryRow) : primary);

        if (context.row_presentation_mode !== "grouped_subjects") {
            return items.filter((item) => item.displayName.trim().length > 0);
        }
    }

    for (const summary of visibleChildRelatedSubjects(context)) {
        const base = subjectSummaryToItem(summary);
        const row = childRows.get(summary.subject_id);
        items.push(row ? enrichItemFromChildRow(base, row) : base);
    }

    return items.filter((item) => item.displayName.trim().length > 0);
}

export function resolveCollectionItemFieldValue(
    item: CollectionItem,
    fieldKey: CollectionItemFieldKey,
): string | null {
    if (!collectionItemFieldIsAvailable(fieldKey)) return null;
    switch (fieldKey) {
        case "first_name":
            return item.firstName.trim() || null;
        case "last_name":
            return item.lastName.trim() || null;
        case "age":
            return resolveItemAgeLabel(item);
        case "dob":
            return resolveItemDobDisplay(item);
        case "program":
            return item.program;
        case "schedule":
            return item.schedule;
        case "gender":
            return item.gender;
        default:
            return null;
    }
}

function formatItemLine(item: CollectionItem, includedFields: readonly CollectionItemFieldKey[]): string | null {
    if (!includedFields.length) return item.displayName.trim() || null;

    const nameFieldKeys = includedFields.filter((key) => key === "first_name" || key === "last_name");
    const includesAge = includedFields.includes("age");
    const includesDob = includedFields.includes("dob");
    const tailFieldKeys = includedFields.filter(
        (key) => key !== "first_name" && key !== "last_name" && key !== "age" && key !== "dob",
    );

    const nameParts = nameFieldKeys
        .map((key) => resolveCollectionItemFieldValue(item, key))
        .filter((value): value is string => Boolean(value?.trim()));
    const nameSegment = nameParts.length > 0 ? nameParts.join(" ") : null;

    const ageLabel = includesAge ? resolveItemAgeLabel(item) : null;
    const dobLabel = includesDob ? resolveItemDobDisplay(item) : null;

    let head = nameSegment ?? "";
    if (includesAge && ageLabel) {
        head = head ? `${head} (${ageLabel})` : ageLabel;
    } else if (!head && dobLabel) {
        head = dobLabel;
    } else if (head && includesDob && dobLabel) {
        head = `${head} ${dobLabel}`;
    } else if (!head) {
        head = item.displayName.trim();
    }

    const tailParts = tailFieldKeys
        .map((key) => resolveCollectionItemFieldValue(item, key))
        .filter((value): value is string => Boolean(value?.trim()));

    const segments = [head, ...tailParts].filter(Boolean);
    return segments.length > 0 ? segments.join(" ") : null;
}

function listSeparator(format: CollectionListFormat): string {
    switch (format) {
        case "bullet":
            return " • ";
        case "pipe":
            return " | ";
        case "newline":
            return "\n";
        case "comma":
        default:
            return ", ";
    }
}

function countLabel(count: number): string {
    return `${count} ${count === 1 ? "child" : "children"}`;
}

function resolveMaxDisplayed(max: CollectionMaxDisplayed): number | null {
    return max === "all" ? null : max;
}

function applyOverflow(
    lines: string[],
    totalCount: number,
    config: CollectionFieldPresentationConfig,
): string | null {
    const max = resolveMaxDisplayed(config.maxDisplayed);
    if (max == null || totalCount <= max) {
        return lines.length ? lines.join(listSeparator(config.listFormat)) : null;
    }

    const visible = lines.slice(0, max);
    const hidden = totalCount - max;

    if (config.overflowBehavior === "count_only") {
        return countLabel(totalCount);
    }

    const separator = listSeparator(config.listFormat);
    const body = visible.join(separator);

    if (config.overflowBehavior === "ellipsis") {
        return body ? `${body}…` : countLabel(totalCount);
    }

    return body ? `${body}${separator}+${hidden} more` : countLabel(totalCount);
}

/** Render a configured collection presentation string (null when empty). */
export function renderCollectionFieldPresentation(
    collectionKey: CollectionFieldKey,
    context: QueueRowContext,
    configInput: CollectionFieldPresentationConfig,
    record?: ProofRuntimeRecord | null,
): string | null {
    if (collectionKey !== "children") return null;

    const config = normalizeCollectionFieldPresentation(configInput);
    const items = extractChildrenCollectionItems(context, record);
    const count = items.length;
    if (count <= 0) return null;

    if (config.displayMode === "count") {
        return countLabel(count);
    }

    const lines = items
        .map((item) => formatItemLine(item, config.includedFields))
        .filter((line): line is string => Boolean(line?.trim()));

    if (config.displayMode === "summary") {
        const listBody = applyOverflow(lines, count, config);
        if (!listBody) return countLabel(count);
        return `${countLabel(count)}: ${listBody}`;
    }

    return applyOverflow(lines, count, config);
}

export function renderCollectionFieldFromContext(
    fieldKey: string,
    context: QueueRowContext,
    options?: {
        collectionPresentation?: CollectionFieldPresentationConfig;
        nameDisplay?: QueueRecordNameDisplay;
        record?: ProofRuntimeRecord | null;
    },
): string | null {
    const collectionKey = normalizeCollectionFieldKey(fieldKey);
    if (!collectionKey) return null;

    const config =
        options?.collectionPresentation
        ?? legacyCollectionPresentationFromFieldKey(fieldKey, options?.nameDisplay)
        ?? normalizeCollectionFieldPresentation(undefined);

    return renderCollectionFieldPresentation(collectionKey, context, config, options?.record);
}
