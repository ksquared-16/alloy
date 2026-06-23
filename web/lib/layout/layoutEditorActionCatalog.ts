/**
 * Experience Builder — operator-facing layout action catalog.
 *
 * Maps friendly action picks to existing `_action_button` + layoutEditorActionButton metadata.
 * Does not introduce a separate action storage model.
 */

import { isMakePrimaryContactActionKey, MAKE_PRIMARY_CONTACT_ACTION_KEY } from "@/lib/admin/actions/makePrimaryContactAction";
import {
    isAllowedLayoutEditorActionKey,
    LAYOUT_EDITOR_ACTION_KEY_LABELS,
    makeLayoutEditorActionButtonItem,
    type LayoutEditorActionButtonConfig,
    type LayoutEditorActionStyleIntent,
    type LayoutEditorDrawerActionKey,
} from "@/lib/layout/layoutEditorActionButton";
import type { DrawerLayoutEditorSurfaceKey } from "@/lib/layout/drawerLayoutEditorSurfaceConfig";
import type { LayoutEditorVisibilityRule } from "@/lib/layout/layoutEditorVisibilityRules";
import { visibilityConditionForRule } from "@/lib/layout/layoutEditorVisibilityRules";
import type { LayoutItem } from "@/lib/layout/layoutV2";

export type LayoutEditorActionCatalogGroupKey = "contact_actions" | "enrollment_actions" | "record_actions";

export type LayoutEditorActionPickerContext =
    | "section_row"
    | "contact_block"
    | "contact_related_list"
    | "contact_repeater_row";

export type LayoutEditorActionCatalogEntry = {
    actionKey: LayoutEditorDrawerActionKey;
    label: string;
    description: string;
    helperCopy?: string;
    groupKey: LayoutEditorActionCatalogGroupKey;
    allowedSurfaces: readonly DrawerLayoutEditorSurfaceKey[];
    allowedContexts: readonly LayoutEditorActionPickerContext[];
    defaultVisibility?: LayoutEditorVisibilityRule;
    defaultStyleIntent?: LayoutEditorActionStyleIntent;
    /** When false, shown disabled in picker with disabledReason. */
    selectableInActionPicker: boolean;
    disabledReason?: string;
    runtimeWired: boolean;
    runtimeWiredNote?: string;
};

export type LayoutEditorActionCatalogGroup = {
    groupKey: LayoutEditorActionCatalogGroupKey;
    groupLabel: string;
    groupDescription: string;
    actions: LayoutEditorActionCatalogEntry[];
};

export const LAYOUT_EDITOR_ACTION_CATALOG_GROUP_LABELS: Record<LayoutEditorActionCatalogGroupKey, string> = {
    contact_actions: "Contact Actions",
    enrollment_actions: "Enrollment Actions",
    record_actions: "Record Actions",
};

export const LAYOUT_EDITOR_ACTION_CATALOG_GROUP_DESCRIPTIONS: Record<LayoutEditorActionCatalogGroupKey, string> = {
    contact_actions: "Relationship actions on household and contact surfaces.",
    enrollment_actions: "Child enrollment row actions — configured on related lists when applicable.",
    record_actions: "Navigate or open related records from the layout.",
};

const ALL_DRAWER_SURFACES: readonly DrawerLayoutEditorSurfaceKey[] = [
    "opportunity_drawer",
    "person_drawer",
    "child_drawer",
];

export const LAYOUT_EDITOR_ACTION_CATALOG: LayoutEditorActionCatalogEntry[] = [
    {
        actionKey: MAKE_PRIMARY_CONTACT_ACTION_KEY,
        label: "Make Primary Contact",
        description: "Promote this contact to household primary (confirmation required).",
        helperCopy: "Primary contact is changed through this action, not by editing a field.",
        groupKey: "contact_actions",
        allowedSurfaces: ["opportunity_drawer", "person_drawer"],
        allowedContexts: ["section_row", "contact_block", "contact_related_list", "contact_repeater_row"],
        defaultVisibility: "show_when_not_primary",
        defaultStyleIntent: "secondary",
        selectableInActionPicker: true,
        runtimeWired: true,
    },
    {
        actionKey: "add_family_member",
        label: "Add family member",
        description: "Add a household adult from the drawer (when supported).",
        groupKey: "contact_actions",
        allowedSurfaces: ["opportunity_drawer", "person_drawer"],
        allowedContexts: ["section_row", "contact_block"],
        defaultStyleIntent: "secondary",
        selectableInActionPicker: true,
        runtimeWired: false,
        runtimeWiredNote: "Preview button only — full add-family-member wiring is not live yet.",
    },
    {
        actionKey: "edit_enrollment",
        label: "Edit enrollment",
        description: "Enable in-place enrollment edits on child rows.",
        groupKey: "enrollment_actions",
        allowedSurfaces: ["opportunity_drawer"],
        allowedContexts: ["section_row"],
        selectableInActionPicker: false,
        disabledReason: "Configure on Children related list → Row actions (not an layout action button).",
        runtimeWired: false,
        runtimeWiredNote: "Row-template action on child lists — not an action-button item.",
    },
    {
        actionKey: "open_child_drawer",
        label: "Open child drawer",
        description: "Open the child profile drawer from an enrollment row.",
        groupKey: "enrollment_actions",
        allowedSurfaces: ["opportunity_drawer"],
        allowedContexts: ["section_row"],
        selectableInActionPicker: false,
        disabledReason: "Configure on Children related list → Row actions.",
        runtimeWired: false,
        runtimeWiredNote: "Row-template action on child lists — not an action-button item.",
    },
    {
        actionKey: "open_drawer",
        label: "Open record",
        description: "Open a related person or child drawer from this layout.",
        groupKey: "record_actions",
        allowedSurfaces: ALL_DRAWER_SURFACES,
        allowedContexts: ["section_row", "contact_block", "contact_related_list", "contact_repeater_row"],
        defaultStyleIntent: "link",
        selectableInActionPicker: true,
        runtimeWired: false,
        runtimeWiredNote: "Preview button only — use field link behavior for live open-drawer today.",
    },
];

const CATALOG_BY_KEY = new Map(LAYOUT_EDITOR_ACTION_CATALOG.map((entry) => [entry.actionKey, entry]));

export function layoutEditorActionCatalogEntryForKey(actionKey: string): LayoutEditorActionCatalogEntry | null {
    const trimmed = actionKey.trim();
    if (!trimmed || !isAllowedLayoutEditorActionKey(trimmed)) return null;
    return CATALOG_BY_KEY.get(trimmed as LayoutEditorDrawerActionKey) ?? null;
}

export function resolveLayoutEditorActionFriendlyLabel(actionKey: string): string {
    return layoutEditorActionCatalogEntryForKey(actionKey)?.label ?? LAYOUT_EDITOR_ACTION_KEY_LABELS[actionKey as LayoutEditorDrawerActionKey] ?? actionKey;
}

export function isLayoutEditorActionRuntimeWired(actionKey: string): boolean {
    const entry = layoutEditorActionCatalogEntryForKey(actionKey);
    if (entry) return entry.runtimeWired;
    return isMakePrimaryContactActionKey(actionKey);
}

export function layoutEditorActionRuntimeWiredNote(actionKey: string): string | null {
    const entry = layoutEditorActionCatalogEntryForKey(actionKey);
    if (entry?.runtimeWired) return null;
    if (entry?.runtimeWiredNote) return entry.runtimeWiredNote;
    if (isMakePrimaryContactActionKey(actionKey)) return null;
    return "Preview button only — this action is not fully wired in layout runtime yet.";
}

function entryMatchesPickerContext(
    entry: LayoutEditorActionCatalogEntry,
    options: { surfaceKey: DrawerLayoutEditorSurfaceKey; context: LayoutEditorActionPickerContext },
): boolean {
    if (!entry.allowedSurfaces.includes(options.surfaceKey)) return false;
    if (!entry.allowedContexts.includes(options.context)) return false;
    return true;
}

export function buildLayoutEditorActionCatalogGroups(options: {
    surfaceKey: DrawerLayoutEditorSurfaceKey;
    context: LayoutEditorActionPickerContext;
}): LayoutEditorActionCatalogGroup[] {
    const groupOrder: LayoutEditorActionCatalogGroupKey[] = [
        "contact_actions",
        "enrollment_actions",
        "record_actions",
    ];

    return groupOrder.flatMap((groupKey) => {
        const actions = LAYOUT_EDITOR_ACTION_CATALOG.filter((entry) => entry.groupKey === groupKey)
            .filter((entry) => entryMatchesPickerContext(entry, options))
            .sort((a, b) => a.label.localeCompare(b.label));
        if (actions.length === 0) return [];
        return [
            {
                groupKey,
                groupLabel: LAYOUT_EDITOR_ACTION_CATALOG_GROUP_LABELS[groupKey],
                groupDescription: LAYOUT_EDITOR_ACTION_CATALOG_GROUP_DESCRIPTIONS[groupKey],
                actions,
            },
        ];
    });
}

export function layoutEditorActionButtonConfigFromCatalogEntry(
    entry: LayoutEditorActionCatalogEntry,
): LayoutEditorActionButtonConfig & { defaultVisibility?: LayoutEditorVisibilityRule } {
    return {
        actionKey: entry.actionKey,
        label: entry.label,
        styleIntent: entry.defaultStyleIntent ?? "secondary",
        defaultVisibility: entry.defaultVisibility,
    };
}

export function makeLayoutEditorActionButtonFromCatalogEntry(
    entry: LayoutEditorActionCatalogEntry,
): LayoutItem {
    const config = layoutEditorActionButtonConfigFromCatalogEntry(entry);
    const item = makeLayoutEditorActionButtonItem(config);
    if (!entry.defaultVisibility) return item;
    return {
        ...item,
        visibleWhen: visibilityConditionForRule(entry.defaultVisibility, "_action_button"),
    };
}

export function layoutEditorRowTemplateActionKeys(): LayoutEditorDrawerActionKey[] {
    return ["open_child_drawer", "edit_enrollment", "open_schedule"];
}
