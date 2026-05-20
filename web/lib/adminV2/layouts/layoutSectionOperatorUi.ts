/**
 * Card 5.5 / 5.6 — Operator-facing layout section model (Settings → Record layouts).
 */

import { INQUIRY_CHILD_NATIVE_FIELD_MANIFEST } from "@/lib/fields/inquiryChildFieldRegistry";
import { OPPORTUNITY_INQUIRY_HEADER_BODY_FIELD_KEYS } from "@/lib/recordChrome/opportunityDrawerOverviewFilters";

/** Synthetic section key — not persisted in overview_section_order. */
export const LAYOUT_DRAWER_HEADER_SECTION_KEY = "__drawer_header";

export type LayoutSectionEditorKind =
    | "header_region"
    | "field_section_ref"
    | "workflow_virtual"
    | "injected_system"
    | "layout_static";

export type LayoutSectionOperatorClass = "custom" | "workflow" | "standard" | "header";

export type LayoutSectionFieldsPanelMode = "custom_catalog" | "standard_fields";

export type LayoutSectionOperatorProfile = {
    operatorClass: LayoutSectionOperatorClass;
    operatorClassLabel: string;
    sectionKind: LayoutSectionEditorKind;
    canRenameTitle: boolean;
    canShowHide: boolean;
    canReorder: boolean;
    canAssignFields: boolean;
    canConfigureFieldBehavior: boolean;
    fieldsPanelMode: LayoutSectionFieldsPanelMode;
    sectionHint: string;
    fixedFieldsNote: string | null;
    capabilitySummary: string;
    actionsLinkLabel: string | null;
    actionsLinkHref: string | null;
};

export const LAYOUT_DRAWER_HEADER_FIELD_KEYS: readonly string[] = [
    "name",
    ...Array.from(OPPORTUNITY_INQUIRY_HEADER_BODY_FIELD_KEYS),
];

/** Rows shown read-only in Layouts (child grid columns in v1). */
export const INQUIRY_CHILDREN_FIXED_DISPLAY_FIELDS: ReadonlyArray<{ field_key: string; label: string }> = [
    { field_key: "child_name", label: "Child name" },
    { field_key: "child_dob", label: "Date of birth" },
    ...INQUIRY_CHILD_NATIVE_FIELD_MANIFEST.map((row) => ({
        field_key: row.field_key,
        label: row.label,
    })),
];

export function isLayoutDrawerHeaderSection(sectionKey: string): boolean {
    return sectionKey === LAYOUT_DRAWER_HEADER_SECTION_KEY;
}

export function normalizeLayoutSectionEditorKind(
    kind: string,
    sectionKey: string
): LayoutSectionEditorKind {
    if (isLayoutDrawerHeaderSection(sectionKey)) return "header_region";
    if (kind === "workflow_virtual") return "workflow_virtual";
    if (kind === "injected_system" || kind === "layout_static") return "injected_system";
    return "field_section_ref";
}

export function layoutSectionOperatorClassLabel(operatorClass: LayoutSectionOperatorClass): string {
    switch (operatorClass) {
        case "custom":
            return "Custom section";
        case "workflow":
            return "Workflow section";
        case "header":
            return "Header";
        case "standard":
            return "Standard section";
    }
}

export function resolveLayoutSectionOperatorClass(
    kind: LayoutSectionEditorKind,
    sectionKey: string
): LayoutSectionOperatorClass {
    if (isLayoutDrawerHeaderSection(sectionKey)) return "header";
    if (kind === "field_section_ref") return "custom";
    if (kind === "workflow_virtual") return "workflow";
    return "standard";
}

export function resolveLayoutSectionOperatorProfile(
    kindInput: string,
    sectionKey: string,
    options?: { titleEditable?: boolean; previewFieldKeys?: string[] }
): LayoutSectionOperatorProfile {
    const sectionKind = normalizeLayoutSectionEditorKind(kindInput, sectionKey);
    const operatorClass = resolveLayoutSectionOperatorClass(sectionKind, sectionKey);
    const titleEditable = options?.titleEditable === true;
    const previewKeys = options?.previewFieldKeys ?? [];

    if (operatorClass === "header") {
        return {
            operatorClass,
            operatorClassLabel: layoutSectionOperatorClassLabel(operatorClass),
            sectionKind,
            canRenameTitle: false,
            canShowHide: false,
            canReorder: false,
            canAssignFields: false,
            canConfigureFieldBehavior: true,
            fieldsPanelMode: "standard_fields",
            sectionHint: "Title, status, summary fields, and header actions.",
            fixedFieldsNote: null,
            capabilitySummary: "Field behavior on this layout",
            actionsLinkLabel: "Header actions",
            actionsLinkHref: "/adminV2/settings/actions?entity_type=opportunity&surface=record_header",
        };
    }

    if (operatorClass === "custom") {
        return {
            operatorClass,
            operatorClassLabel: layoutSectionOperatorClassLabel(operatorClass),
            sectionKind,
            canRenameTitle: true,
            canShowHide: true,
            canReorder: true,
            canAssignFields: true,
            canConfigureFieldBehavior: true,
            fieldsPanelMode: "custom_catalog",
            sectionHint: "",
            fixedFieldsNote: null,
            capabilitySummary: "Rename · Show/hide · Reorder · Add/remove fields · Field behavior",
            actionsLinkLabel: "Section actions",
            actionsLinkHref: `/adminV2/settings/actions?entity_type=opportunity&section_key=${encodeURIComponent(sectionKey)}`,
        };
    }

    if (operatorClass === "workflow") {
        const hasPreviewFields = previewKeys.length > 0;
        return {
            operatorClass,
            operatorClassLabel: layoutSectionOperatorClassLabel(operatorClass),
            sectionKind,
            canRenameTitle: titleEditable,
            canShowHide: true,
            canReorder: true,
            canAssignFields: false,
            canConfigureFieldBehavior: hasPreviewFields,
            fieldsPanelMode: "standard_fields",
            sectionHint: "Fields come from workflow configuration.",
            fixedFieldsNote: null,
            capabilitySummary: titleEditable
                ? "Rename · Show/hide · Reorder · Field behavior"
                : "Show/hide · Reorder · Field behavior",
            actionsLinkLabel: hasPreviewFields ? "Section actions" : null,
            actionsLinkHref: hasPreviewFields
                ? `/adminV2/settings/actions?entity_type=opportunity&section_key=${encodeURIComponent(sectionKey)}`
                : null,
        };
    }

    const fixedNote =
        sectionKey === "inquiry_children"
            ? "Child grid columns are fixed in v1."
            : sectionKey === "inquiry_tuition"
              ? "Tuition panel layout is fixed in v1."
              : null;

    const catalogKeys = resolveLayoutSectionCatalogFieldKeys(sectionKey, sectionKind, previewKeys);
    const hasBehaviorFields = catalogKeys.length > 0;

    return {
        operatorClass,
        operatorClassLabel: layoutSectionOperatorClassLabel(operatorClass),
        sectionKind,
        canRenameTitle: false,
        canShowHide: true,
        canReorder: true,
        canAssignFields: false,
        canConfigureFieldBehavior: hasBehaviorFields,
        fieldsPanelMode: "standard_fields",
        sectionHint:
            sectionKey === "inquiry_children"
                ? "Built-in children grid — add/remove catalog fields is not supported."
                : "Built-in drawer section.",
        fixedFieldsNote: fixedNote,
        capabilitySummary: hasBehaviorFields ? "Show/hide · Reorder · Field behavior" : "Show/hide · Reorder",
        actionsLinkLabel: null,
        actionsLinkHref: null,
    };
}

/** Field keys from layout preview / workflow config used to match catalog rows for behavior controls. */
export function resolveLayoutSectionCatalogFieldKeys(
    sectionKey: string,
    sectionKind: LayoutSectionEditorKind,
    previewFieldKeys: string[]
): string[] {
    if (isLayoutDrawerHeaderSection(sectionKey)) {
        return [...LAYOUT_DRAWER_HEADER_FIELD_KEYS];
    }
    if (sectionKind === "field_section_ref") {
        return [];
    }
    return [...new Set(previewFieldKeys.map((k) => k.trim()).filter(Boolean))];
}

export type LayoutSectionDisplayFieldRow = {
    id: string;
    field_key: string;
    label: string | null;
    section_key: string | null;
    sort_order: number;
    is_system: boolean;
    is_required?: boolean;
    requirement_policy?: unknown | null;
    interaction_policy?: unknown | null;
    displayOnly: boolean;
    displayOnlyReason?: string;
};

export function buildLayoutSectionDisplayFieldRows(args: {
    entityType: string;
    sectionKey: string;
    sectionKind: string;
    catalogFields: Array<{
        id: string;
        field_key: string;
        label: string | null;
        section_key: string | null;
        sort_order: number;
        is_system: boolean;
        is_required?: boolean;
        requirement_policy?: unknown | null;
        interaction_policy?: unknown | null;
    }>;
    previewFieldKeys?: string[];
}): LayoutSectionDisplayFieldRow[] {
    const profile = resolveLayoutSectionOperatorProfile(args.sectionKind, args.sectionKey, {
        previewFieldKeys: args.previewFieldKeys,
    });
    const catalogKeys = new Set(
        resolveLayoutSectionCatalogFieldKeys(
            args.sectionKey,
            profile.sectionKind,
            args.previewFieldKeys ?? []
        )
    );

    if (profile.fieldsPanelMode === "custom_catalog") {
        return args.catalogFields
            .filter((f) => (f.section_key ?? "custom") === args.sectionKey)
            .sort((a, b) => a.sort_order - b.sort_order || a.field_key.localeCompare(b.field_key))
            .map((f) => ({ ...f, displayOnly: false }));
    }

    const rows: LayoutSectionDisplayFieldRow[] = [];
    const byKey = new Map(args.catalogFields.map((f) => [f.field_key, f]));

    if (isLayoutDrawerHeaderSection(args.sectionKey)) {
        for (const key of LAYOUT_DRAWER_HEADER_FIELD_KEYS) {
            const def = byKey.get(key);
            if (def) {
                rows.push({ ...def, displayOnly: false });
            }
        }
        return rows;
    }

    const seenKeys = new Set<string>();

    if (args.sectionKey === "inquiry_children") {
        for (const fixed of INQUIRY_CHILDREN_FIXED_DISPLAY_FIELDS) {
            seenKeys.add(fixed.field_key);
            rows.push({
                id: `fixed:${fixed.field_key}`,
                field_key: fixed.field_key,
                label: fixed.label,
                section_key: args.sectionKey,
                sort_order: rows.length * 10,
                is_system: true,
                displayOnly: true,
                displayOnlyReason: "Fixed child grid column in v1",
            });
        }
    }

    for (const key of catalogKeys) {
        if (seenKeys.has(key)) continue;
        const def = byKey.get(key);
        if (def) {
            seenKeys.add(key);
            rows.push({ ...def, displayOnly: false });
        }
    }

    const previewOrder = args.previewFieldKeys ?? [];
    rows.sort((a, b) => {
        const ai = previewOrder.indexOf(a.field_key);
        const bi = previewOrder.indexOf(b.field_key);
        if (ai >= 0 && bi >= 0) return ai - bi;
        if (ai >= 0) return -1;
        if (bi >= 0) return 1;
        return a.sort_order - b.sort_order || a.field_key.localeCompare(b.field_key);
    });

    return rows;
}

export type LayoutEditorSectionRow = {
    section_key: string;
    title: string;
    kind: string;
    visible: boolean;
    title_editable?: boolean;
};

/** Prepend drawer header as first section row (UI-only, not persisted). */
export function withDrawerHeaderEditorSection<T extends LayoutEditorSectionRow>(rows: T[]): T[] {
    if (rows.some((r) => r.section_key === LAYOUT_DRAWER_HEADER_SECTION_KEY)) {
        return rows.map((r) =>
            isLayoutDrawerHeaderSection(r.section_key)
                ? { ...r, title: "Drawer header", kind: "header_region", title_editable: false }
                : r
        );
    }
    const headerRow = {
        section_key: LAYOUT_DRAWER_HEADER_SECTION_KEY,
        title: "Drawer header",
        kind: "header_region",
        visible: true,
        title_editable: false,
    } as T;
    return [headerRow, ...rows];
}

export function layoutEditorRowsForPersist<T extends LayoutEditorSectionRow>(rows: T[]): T[] {
    return rows.filter((r) => !isLayoutDrawerHeaderSection(r.section_key));
}

export const LAYOUTS_PAGE_SUBTITLE =
    "Choose what appears in each drawer and how fields behave there.";

export const LAYOUT_FIELD_BEHAVIOR_HELPER =
    "Required settings apply only to this drawer layout.";

export const LAYOUT_REQUIREMENT_PRESET_OPTIONS: ReadonlyArray<{
    value: "optional" | "required" | "required_on_save";
    label: string;
    title: string;
}> = [
    {
        value: "optional",
        label: "Optional",
        title: "May be left empty when saving this drawer",
    },
    {
        value: "required_on_save",
        label: "Required to save",
        title: "Must be filled before staff can save this drawer",
    },
    {
        value: "required",
        label: "Always required",
        title: "Treated as required whenever this field is shown on the drawer",
    },
];

export function layoutRequirementPresetLabel(preset: string): string {
    return LAYOUT_REQUIREMENT_PRESET_OPTIONS.find((o) => o.value === preset)?.label ?? preset;
}
