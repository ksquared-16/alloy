/**
 * Layout editor conditional visibility presets — maps to LayoutCondition (V1).
 */

import type { LayoutCondition } from "@/lib/layout/layoutV2";
import {
    LAYOUT_CONTACT_BLOCK_VISIBILITY_PATHS,
    type LayoutEditorContactRole,
} from "@/lib/layout/layoutEditorContactRoles";

export const LAYOUT_EDITOR_VISIBILITY_RULES = [
    "always",
    "hide_when_empty",
    "show_when_field_exists",
    "show_when_related_exists",
    "show_when_count_gt_1",
    "show_when_contact_record_exists",
    "show_when_contact_count_gt_1",
    "show_when_not_primary",
] as const;
export type LayoutEditorVisibilityRule = (typeof LAYOUT_EDITOR_VISIBILITY_RULES)[number];

export type LayoutEditorVisibilityPreset = {
    key: LayoutEditorVisibilityRule;
    label: string;
    description: string;
};

export const LAYOUT_EDITOR_VISIBILITY_PRESETS: LayoutEditorVisibilityPreset[] = [
    { key: "always", label: "Always show", description: "Visible regardless of data." },
    { key: "hide_when_empty", label: "Hide when empty", description: "Hide when the bound field has no value." },
    { key: "show_when_field_exists", label: "Show when field exists", description: "Show only when the bound field has a value." },
    {
        key: "show_when_related_exists",
        label: "Show when related record exists",
        description: "Show when a related path resolves to a value.",
    },
    { key: "show_when_count_gt_1", label: "Show when count > 1", description: "Show when a collection has more than one row." },
    {
        key: "show_when_contact_record_exists",
        label: "Show when contact record exists",
        description: "Show when the contact block resolved a person from household relationships.",
    },
    {
        key: "show_when_contact_count_gt_1",
        label: "Show when contact count > 1",
        description: "Show when the contact block resolved more than one matching person.",
    },
    {
        key: "show_when_not_primary",
        label: "Show when not primary",
        description: "Show when the resolved contact is not the primary household contact.",
    },
];

const CONTACT_VISIBILITY_PATHS = new Set<string>(Object.values(LAYOUT_CONTACT_BLOCK_VISIBILITY_PATHS));

export function isLayoutEditorContactVisibilityPath(path: string | undefined): boolean {
    const key = path?.trim() ?? "";
    return CONTACT_VISIBILITY_PATHS.has(key);
}

/** Presets available for fields inside a contact_block (relationship-aware). */
export function layoutEditorContactFieldVisibilityPresets(
    contactRole?: LayoutEditorContactRole,
): LayoutEditorVisibilityPreset[] {
    const base = LAYOUT_EDITOR_VISIBILITY_PRESETS.filter((preset) =>
        ["always", "hide_when_empty", "show_when_field_exists", "show_when_contact_record_exists"].includes(preset.key),
    );
    const extras: LayoutEditorVisibilityPreset[] = [
        LAYOUT_EDITOR_VISIBILITY_PRESETS.find((p) => p.key === "show_when_contact_count_gt_1")!,
    ];
    if (contactRole && contactRole !== "primary") {
        extras.push(LAYOUT_EDITOR_VISIBILITY_PRESETS.find((p) => p.key === "show_when_not_primary")!);
    }
    return [...base, ...extras.filter(Boolean)];
}

export function resolveVisibilityRuleKey(
    condition: LayoutCondition | undefined,
    boundPath: string,
): LayoutEditorVisibilityRule {
    if (!condition) return "always";
    if (condition.type === "count_gt") {
        if (condition.path === LAYOUT_CONTACT_BLOCK_VISIBILITY_PATHS.resolvedCount) {
            return "show_when_contact_count_gt_1";
        }
        return "show_when_count_gt_1";
    }
    if (condition.type === "exists") {
        if (condition.path === LAYOUT_CONTACT_BLOCK_VISIBILITY_PATHS.resolved) {
            return "show_when_contact_record_exists";
        }
        if (condition.path === LAYOUT_CONTACT_BLOCK_VISIBILITY_PATHS.isNotPrimary) {
            return "show_when_not_primary";
        }
        if (condition.path === boundPath) return "hide_when_empty";
        return "show_when_related_exists";
    }
    return "show_when_field_exists";
}

export function visibilityConditionForRule(
    rule: LayoutEditorVisibilityRule,
    boundPath: string,
    relatedPath?: string,
): LayoutCondition | undefined {
    switch (rule) {
        case "always":
            return undefined;
        case "hide_when_empty":
            return { type: "exists", path: boundPath };
        case "show_when_field_exists":
            return { type: "exists", path: boundPath };
        case "show_when_related_exists":
            return { type: "exists", path: relatedPath?.trim() || boundPath };
        case "show_when_count_gt_1":
            return { type: "count_gt", path: relatedPath?.trim() || boundPath, value: "1" };
        case "show_when_contact_record_exists":
            return { type: "exists", path: LAYOUT_CONTACT_BLOCK_VISIBILITY_PATHS.resolved };
        case "show_when_contact_count_gt_1":
            return {
                type: "count_gt",
                path: LAYOUT_CONTACT_BLOCK_VISIBILITY_PATHS.resolvedCount,
                value: "1",
            };
        case "show_when_not_primary":
            return { type: "exists", path: LAYOUT_CONTACT_BLOCK_VISIBILITY_PATHS.isNotPrimary };
        default:
            return undefined;
    }
}

export function validateVisibilityRule(rule: string): rule is LayoutEditorVisibilityRule {
    return (LAYOUT_EDITOR_VISIBILITY_RULES as readonly string[]).includes(rule);
}
