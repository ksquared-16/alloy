/**
 * Layout editor conditional visibility presets — maps to LayoutCondition (V1).
 */

import type { LayoutCondition } from "@/lib/layout/layoutV2";

export const LAYOUT_EDITOR_VISIBILITY_RULES = [
    "always",
    "hide_when_empty",
    "show_when_field_exists",
    "show_when_related_exists",
    "show_when_count_gt_1",
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
];

export function resolveVisibilityRuleKey(
    condition: LayoutCondition | undefined,
    boundPath: string,
): LayoutEditorVisibilityRule {
    if (!condition) return "always";
    if (condition.type === "count_gt") return "show_when_count_gt_1";
    if (condition.type === "exists" && condition.path === boundPath) return "hide_when_empty";
    if (condition.type === "exists") return "show_when_related_exists";
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
        default:
            return undefined;
    }
}

export function validateVisibilityRule(rule: string): rule is LayoutEditorVisibilityRule {
    return (LAYOUT_EDITOR_VISIBILITY_RULES as readonly string[]).includes(rule);
}
