/**
 * Card 4 — Map server field-policy metadata to drawer field display (no enforcement).
 */

import type { EntityDrawerSectionConfig } from "@/lib/entityPresentation";
import type { DrawerFieldPolicyResolved } from "@/lib/fields/drawerFieldPolicyAdapter";
import { resolveFieldEditability } from "@/lib/fields/fieldInteractionPolicy";
import { resolveFieldRequirementPolicy } from "@/lib/fields/fieldRequirementPolicy";
import { isAdvancedRequirementPolicyForSettings } from "@/lib/fields/fieldPolicySettingsUi";
import { resolveOpportunityLinkedFieldSources } from "@/lib/admin/drawer/linkedRecordFieldEditing";

export type DrawerFieldPolicyChrome = {
    /** Show required asterisk on label. */
    showRequired: boolean;
    /** Policy marks field read-only in drawer (display + block edit). */
    readOnly: boolean;
    /** When set, inline edit routes to linked record PATCH (V1: primary person). */
    linkedSourceLabel?: string | null;
    readOnlyReason?: string | null;
};

type FieldDefRow = {
    field_key: string;
    is_system: boolean;
    is_required?: boolean;
    requirement_policy?: unknown | null;
    interaction_policy?: unknown | null;
    label?: string | null;
};

function normalizeDrawerPolicyEntityType(entityType: string): "opportunity" | "job" | null {
    const t = entityType.trim().toLowerCase();
    if (t === "opportunity" || t === "opportunities") return "opportunity";
    if (t === "job" || t === "jobs") return "job";
    return null;
}

/** Build per-field chrome from entity GET `_field_definitions` + `_field_policy_resolved`. */
export function buildDrawerFieldPolicyChromeFromEntityData(
    data: Record<string, unknown> | null,
    drawerEntityType: string
): Record<string, DrawerFieldPolicyChrome> {
    const canon = normalizeDrawerPolicyEntityType(drawerEntityType);
    if (!canon || !data) return {};

    const resolved = (data._field_policy_resolved ?? {}) as Record<string, DrawerFieldPolicyResolved>;
    const defs = (data._field_definitions ?? []) as FieldDefRow[];
    const linkedByKey =
        canon === "opportunity"
            ? resolveOpportunityLinkedFieldSources(data, defs, { permission_keys: ["__drawer_display__"] })
            : {};
    const out: Record<string, DrawerFieldPolicyChrome> = {};

    for (const def of defs) {
        const map = resolved[def.field_key];
        if (!map || map.policyMode !== "enforceable") continue;

        const reqPolicy = resolveFieldRequirementPolicy(def);
        const showRequired =
            !isAdvancedRequirementPolicyForSettings(reqPolicy) &&
            (reqPolicy.mode === "required" || reqPolicy.mode === "required_on_save");

        const editability = resolveFieldEditability(
            {
                field_key: def.field_key,
                entity_type: canon,
                is_system: def.is_system,
                interaction_policy: def.interaction_policy,
            },
            { permission_keys: ["__drawer_display__"] }
        );
        const linked = linkedByKey[def.field_key];
        let readOnly = !editability.editable && editability.editability_mode === "read_only";
        let linkedSourceLabel: string | null = null;
        let readOnlyReason: string | null = null;

        if (linked) {
            if (linked.editable) {
                readOnly = false;
                linkedSourceLabel = "Primary person";
            } else {
                readOnly = true;
                readOnlyReason = linked.read_only_reason ?? "Linked person field is read-only.";
            }
        } else if (!editability.editable && editability.lock_reason) {
            readOnlyReason = editability.lock_reason;
        }

        out[def.field_key] = { showRequired, readOnly, linkedSourceLabel, readOnlyReason };
    }

    return out;
}

export function buildFieldLabelMapFromEntityData(data: Record<string, unknown> | null): Record<string, string> {
    const defs = (data?._field_definitions ?? []) as FieldDefRow[];
    const out: Record<string, string> = {};
    for (const d of defs) {
        const label = d.label?.trim();
        out[d.field_key] = label || d.field_key;
    }
    return out;
}

function applyChromeToField<T extends { key: string; editable?: boolean; label: string }>(
    field: T,
    chromeMap: Record<string, DrawerFieldPolicyChrome>
): T {
    const chrome = chromeMap[field.key];
    if (!chrome) return field;
    const next = { ...field };
    if (chrome.readOnly) {
        next.editable = false;
    } else if (chrome.linkedSourceLabel) {
        next.editable = true;
    }
    if (chrome.showRequired && !field.label.includes("*")) {
        next.label = `${field.label} *`;
    }
    if (chrome.linkedSourceLabel && !field.label.includes("(")) {
        next.label = `${field.label} (${chrome.linkedSourceLabel})`;
    }
    return next;
}

/** Apply read-only + required label chrome to overview section field configs. */
export function applyPolicyChromeToOverviewSections(
    sections: EntityDrawerSectionConfig[],
    chromeMap: Record<string, DrawerFieldPolicyChrome>
): EntityDrawerSectionConfig[] {
    if (Object.keys(chromeMap).length === 0) return sections;

    return sections.map((section) => ({
        ...section,
        fields: section.fields.map((f) => applyChromeToField(f, chromeMap)),
        subsections: section.subsections?.map((sub) => ({
            ...sub,
            fields: sub.fields.map((f) => applyChromeToField(f, chromeMap)),
        })),
    }));
}
