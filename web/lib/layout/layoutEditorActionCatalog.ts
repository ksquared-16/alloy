/**
 * Experience Builder — operator-facing layout action catalog.
 *
 * Maps friendly action picks to existing `_action_button` + layoutEditorActionButton metadata.
 * Does not introduce a separate action storage model.
 */

import { isMakePrimaryContactActionKey } from "@/lib/admin/actions/makePrimaryContactAction";
import { canonicalActionDefinition } from "@/lib/admin/actions/canonicalActionRegistry";
import { resolveLayoutBuilderAvailableActions } from "@/lib/admin/actions/canonicalActionAvailability";
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
import type { LayoutEditorRowAction } from "@/lib/layout/layoutEditorRowTemplateConfig";
import type { LayoutItem } from "@/lib/layout/layoutV2";

export type LayoutEditorActionCatalogGroupKey =
    | "relationship_actions"
    | "contact_actions"
    | "enrollment_actions"
    | "record_actions";

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
    relationship_actions: "Relationship Actions",
    contact_actions: "Contact Actions",
    enrollment_actions: "Enrollment Actions",
    record_actions: "Record Actions",
};

export const LAYOUT_EDITOR_ACTION_CATALOG_GROUP_DESCRIPTIONS: Record<LayoutEditorActionCatalogGroupKey, string> = {
    relationship_actions: "Add or link people with scoped responsibilities on children and households.",
    contact_actions: "Relationship actions on household and contact surfaces.",
    enrollment_actions: "Child enrollment row actions — configured on related lists when applicable.",
    record_actions: "Navigate or open related records from the layout.",
};

const ALL_DRAWER_SURFACES: readonly DrawerLayoutEditorSurfaceKey[] = [
    "opportunity_drawer",
    "person_drawer",
    "child_drawer",
];

function catalogEntryFromAvailabilityRow(
    row: ReturnType<typeof resolveLayoutBuilderAvailableActions>[number],
): LayoutEditorActionCatalogEntry {
    const entry = row.definition;
    const groupKey: LayoutEditorActionCatalogGroupKey =
        entry.category === "relationship" ? "relationship_actions"
        : entry.category === "status_lifecycle" || entry.actionKey === "add_family_member" ? "contact_actions"
        : entry.category === "workflow" ? "enrollment_actions"
        : "record_actions";

    return {
        actionKey: row.actionKey as LayoutEditorDrawerActionKey,
        label: row.label,
        description: row.description,
        helperCopy: row.unavailableMessage ?? entry.description,
        groupKey,
        allowedSurfaces: entry.allowedLayoutSurfaces,
        allowedContexts: entry.allowedLayoutContexts,
        defaultVisibility: row.actionKey === "make_primary_contact" ? "show_when_not_primary" : undefined,
        defaultStyleIntent: "secondary",
        selectableInActionPicker: row.available,
        disabledReason: row.available ? undefined : row.unavailableMessage,
        runtimeWired: entry.runtimeWired,
    };
}

function layoutOnlyCatalogEntries(): LayoutEditorActionCatalogEntry[] {
    return [
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
            label: "Open record (retired)",
            description:
                "Retired — the record overlay this opened no longer exists. Existing authored layouts keep this value; do not add new ones.",
            groupKey: "record_actions",
            allowedSurfaces: ALL_DRAWER_SURFACES,
            allowedContexts: ["section_row", "contact_block", "contact_related_list", "contact_repeater_row"],
            defaultStyleIntent: "link",
            selectableInActionPicker: false,
            runtimeWired: false,
            runtimeWiredNote:
                "Retired with the modal record product. Card and item focus is an attention ASPECT (lib/runtime/kernel/attentionCardFocus), not a layout action.",
        },
    ];
}

function dedupeCatalogEntries(entries: LayoutEditorActionCatalogEntry[]): LayoutEditorActionCatalogEntry[] {
    const byKey = new Map<string, LayoutEditorActionCatalogEntry>();
    for (const entry of entries) {
        const prev = byKey.get(entry.actionKey);
        if (!prev) {
            byKey.set(entry.actionKey, entry);
            continue;
        }
        if (entry.selectableInActionPicker && !prev.selectableInActionPicker) {
            byKey.set(entry.actionKey, entry);
        }
    }
    return [...byKey.values()];
}

/** Static union for label lookup — builder groups resolve dynamically via canonical availability. */
export const LAYOUT_EDITOR_ACTION_CATALOG: LayoutEditorActionCatalogEntry[] = dedupeCatalogEntries([
    ...resolveLayoutBuilderAvailableActions({
        surfaceKey: "child_drawer",
        context: "section_row",
        includeUnavailable: true,
    }).map(catalogEntryFromAvailabilityRow),
    ...resolveLayoutBuilderAvailableActions({
        surfaceKey: "opportunity_drawer",
        context: "section_row",
        includeUnavailable: true,
    }).map(catalogEntryFromAvailabilityRow),
    ...resolveLayoutBuilderAvailableActions({
        surfaceKey: "opportunity_drawer",
        context: "contact_block",
        includeUnavailable: true,
    }).map(catalogEntryFromAvailabilityRow),
    ...resolveLayoutBuilderAvailableActions({
        surfaceKey: "person_drawer",
        context: "contact_block",
        includeUnavailable: true,
    }).map(catalogEntryFromAvailabilityRow),
    ...layoutOnlyCatalogEntries(),
]);

const CATALOG_BY_KEY = new Map(LAYOUT_EDITOR_ACTION_CATALOG.map((entry) => [entry.actionKey, entry]));

export function layoutEditorActionCatalogEntryForKey(actionKey: string): LayoutEditorActionCatalogEntry | null {
    const trimmed = actionKey.trim();
    if (!trimmed || !isAllowedLayoutEditorActionKey(trimmed)) return null;
    const cached = CATALOG_BY_KEY.get(trimmed as LayoutEditorDrawerActionKey);
    if (cached) return cached;
    const def = canonicalActionDefinition(trimmed);
    if (!def || def.allowedLayoutSurfaces.length === 0) return null;
    return catalogEntryFromAvailabilityRow({
        actionKey: trimmed,
        label: def.label,
        description: def.description,
        available: true,
        reason: "available",
        definition: def,
    });
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

export function buildLayoutEditorActionCatalogGroups(options: {
    surfaceKey: DrawerLayoutEditorSurfaceKey;
    context: LayoutEditorActionPickerContext;
    lifecycleStageKey?: string | null;
    businessProcessKey?: string | null;
    dbAvailableKeys?: readonly string[] | null;
}): LayoutEditorActionCatalogGroup[] {
    const groupOrder: LayoutEditorActionCatalogGroupKey[] = [
        "relationship_actions",
        "contact_actions",
        "enrollment_actions",
        "record_actions",
    ];

    const availableRows = resolveLayoutBuilderAvailableActions({
        surfaceKey: options.surfaceKey,
        context: options.context,
        lifecycleStageKey: options.lifecycleStageKey,
        businessProcessKey: options.businessProcessKey,
        dbAvailableKeys: options.dbAvailableKeys,
        includeUnavailable: false,
    });
    const availableWhenConfiguredRows = resolveLayoutBuilderAvailableActions({
        surfaceKey: options.surfaceKey,
        context: options.context,
        lifecycleStageKey: options.lifecycleStageKey,
        businessProcessKey: options.businessProcessKey,
        includeUnavailable: true,
    }).filter((row) => !row.available && row.reason !== "hidden_surface" && row.reason !== "hidden_context");
    const layoutOnly = layoutOnlyCatalogEntries().filter((entry) =>
        entry.allowedSurfaces.includes(options.surfaceKey)
        && entry.allowedContexts.includes(options.context)
        && entry.selectableInActionPicker,
    );

    const availableKeys = new Set(availableRows.map((row) => row.actionKey));
    const configuredOnlyRows = availableWhenConfiguredRows.filter((row) => !availableKeys.has(row.actionKey));

    const actions = [
        ...availableRows.map(catalogEntryFromAvailabilityRow),
        ...configuredOnlyRows.map((row) => ({
            ...catalogEntryFromAvailabilityRow(row),
            selectableInActionPicker: false,
            disabledReason:
                row.unavailableMessage
                ?? "Available when configured in Business Process or Configuration → Actions.",
        })),
        ...layoutOnly,
    ].sort((a, b) => a.label.localeCompare(b.label));

    return groupOrder.flatMap((groupKey) => {
        const groupActions = actions.filter((entry) => entry.groupKey === groupKey);
        if (groupActions.length === 0) return [];
        return [
            {
                groupKey,
                groupLabel: LAYOUT_EDITOR_ACTION_CATALOG_GROUP_LABELS[groupKey],
                groupDescription: LAYOUT_EDITOR_ACTION_CATALOG_GROUP_DESCRIPTIONS[groupKey],
                actions: groupActions,
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

export function layoutEditorRowTemplateActionKeys(): LayoutEditorRowAction[] {
    // `make_primary_contact` is a relationship row action (promote a non-primary
    // adult to household primary) — exposed here so the Builder row-action control
    // can offer it on contact / household-member related lists, not as a field.
    return ["open_child_drawer", "edit_enrollment", "open_schedule", "make_primary_contact"];
}
