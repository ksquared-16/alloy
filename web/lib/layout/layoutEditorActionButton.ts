/**
 * Layout editor — action button item metadata (Phase 5.10).
 */

import { makeId } from "@/lib/layout/builderOps";
import { RELATIONSHIP_ACTION_KEYS } from "@/lib/admin/relationship/relationshipActionContract";
import { relationshipActionRegistryEntry } from "@/lib/admin/relationship/relationshipActionRegistry";
import type { LayoutItem } from "@/lib/layout/layoutV2";
import { LAYOUT_EDITOR_ROW_ACTIONS } from "@/lib/layout/layoutEditorRowTemplateConfig";
import type { LayoutEditorVisibilityRule } from "@/lib/layout/layoutEditorVisibilityRules";
import { visibilityConditionForRule } from "@/lib/layout/layoutEditorVisibilityRules";

export const LAYOUT_EDITOR_ACTION_BUTTON_METADATA_KEY = "layoutEditorActionButton" as const;

export const LAYOUT_EDITOR_ACTION_STYLE_INTENTS = ["primary", "secondary", "ghost", "link"] as const;
export type LayoutEditorActionStyleIntent = (typeof LAYOUT_EDITOR_ACTION_STYLE_INTENTS)[number];

/** Relationship actions (excluding make_primary_contact — listed in row actions). */
export const LAYOUT_EDITOR_RELATIONSHIP_ACTION_KEYS = RELATIONSHIP_ACTION_KEYS.filter(
    (key) => key !== "make_primary_contact",
) as Exclude<(typeof RELATIONSHIP_ACTION_KEYS)[number], "make_primary_contact">[];

/** Drawer-safe action keys operators may place as layout buttons. */
export const LAYOUT_EDITOR_DRAWER_ACTION_KEYS = [
    ...LAYOUT_EDITOR_ROW_ACTIONS,
    ...LAYOUT_EDITOR_RELATIONSHIP_ACTION_KEYS,
    "add_family_member",
    "open_drawer",
] as const;
export type LayoutEditorDrawerActionKey = (typeof LAYOUT_EDITOR_DRAWER_ACTION_KEYS)[number];

function labelForDrawerActionKey(key: LayoutEditorDrawerActionKey): string {
    // No cast: the registry lookup takes `string` because the registry is definition-derived.
    const fromRegistry = relationshipActionRegistryEntry(key);
    if (fromRegistry) return fromRegistry.label;
    const staticLabels: Record<string, string> = {
        open_child_drawer: "Open child drawer",
        edit_enrollment: "Edit enrollment",
        open_schedule: "Open schedule",
        add_family_member: "Add family member",
        make_primary_contact: "Make Primary Contact",
        open_drawer: "Open related drawer",
    };
    return staticLabels[key] ?? key;
}

export const LAYOUT_EDITOR_ACTION_KEY_LABELS = Object.fromEntries(
    LAYOUT_EDITOR_DRAWER_ACTION_KEYS.map((key) => [key, labelForDrawerActionKey(key)]),
) as Record<LayoutEditorDrawerActionKey, string>;

export type LayoutEditorActionButtonConfig = {
    label?: string;
    actionKey?: LayoutEditorDrawerActionKey | string;
    styleIntent?: LayoutEditorActionStyleIntent;
};

export function isAllowedLayoutEditorActionKey(v: string): v is LayoutEditorDrawerActionKey {
    return (LAYOUT_EDITOR_DRAWER_ACTION_KEYS as readonly string[]).includes(v);
}

export function readLayoutEditorActionButtonConfig(
    metadata: Record<string, unknown> | undefined,
): LayoutEditorActionButtonConfig | null {
    const raw = metadata?.[LAYOUT_EDITOR_ACTION_BUTTON_METADATA_KEY];
    if (!raw || typeof raw !== "object") return null;
    const bag = raw as Record<string, unknown>;
    const out: LayoutEditorActionButtonConfig = {};
    if (typeof bag.label === "string") out.label = bag.label.trim();
    if (typeof bag.actionKey === "string") out.actionKey = bag.actionKey.trim();
    if (typeof bag.styleIntent === "string" && isStyleIntent(bag.styleIntent)) out.styleIntent = bag.styleIntent;
    return out;
}

export function writeLayoutEditorActionButtonConfig(
    metadata: Record<string, unknown> | undefined,
    patch: LayoutEditorActionButtonConfig,
): Record<string, unknown> {
    const next = { ...(metadata ?? {}) };
    const prev = readLayoutEditorActionButtonConfig(next) ?? {};
    next[LAYOUT_EDITOR_ACTION_BUTTON_METADATA_KEY] = { ...prev, ...patch };
    return next;
}

export function validateLayoutEditorActionButtonConfig(config: LayoutEditorActionButtonConfig, path: string): string[] {
    const errors: string[] = [];
    if (config.actionKey && !isAllowedLayoutEditorActionKey(String(config.actionKey))) {
        errors.push(`${path}: invalid actionKey "${config.actionKey}"`);
    }
    if (config.styleIntent && !isStyleIntent(config.styleIntent)) {
        errors.push(`${path}: invalid styleIntent "${config.styleIntent}"`);
    }
    return errors;
}

export function makeLayoutEditorActionButtonItem(
    config?: Partial<LayoutEditorActionButtonConfig> & { defaultVisibility?: LayoutEditorVisibilityRule },
): LayoutItem {
    const actionKey = config?.actionKey && isAllowedLayoutEditorActionKey(String(config.actionKey)) ?
        config.actionKey
    :   "edit_enrollment";
    const label = config?.label?.trim() || LAYOUT_EDITOR_ACTION_KEY_LABELS[actionKey as LayoutEditorDrawerActionKey] || "Action";
    const visibleWhen =
        config?.defaultVisibility ?
            visibilityConditionForRule(config.defaultVisibility, "_action_button")
        :   undefined;
    return {
        id: makeId("item"),
        kind: "field",
        refKey: "_action_button",
        label,
        renderHint: "link",
        visibleWhen,
        metadata: writeLayoutEditorActionButtonConfig(undefined, {
            label,
            actionKey,
            styleIntent: config?.styleIntent ?? "secondary",
        }),
    };
}

function isStyleIntent(v: string): v is LayoutEditorActionStyleIntent {
    return (LAYOUT_EDITOR_ACTION_STYLE_INTENTS as readonly string[]).includes(v);
}
