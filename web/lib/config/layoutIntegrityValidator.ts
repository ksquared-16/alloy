/**
 * Centralized layout / field config integrity validation (Card 4).
 * Read-only — safe for admin APIs and future Configuration/Layout Assist proposals.
 */

import {
    buildEffectiveDrawerLayoutPreview,
    type PreviewFieldDef,
} from "@/lib/recordChrome/effectiveDrawerLayoutPreview";
import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";
import { resolveFieldRequirementPolicy, isFieldRequiredInContext } from "@/lib/fields/fieldRequirementPolicy";
import {
    hasValidWriteTarget,
    parseFieldInteractionPolicy,
    resolveFieldEditability,
    resolveFieldInteractionPolicy,
    type FieldDefinitionInteractionSource,
} from "@/lib/fields/fieldInteractionPolicy";
import { parseFieldSectionConfig, type FieldSectionRow } from "@/lib/fields/sectionManagement";
import { normalizeOptionsFromConfig } from "@/lib/fields/fieldDefinitionConfig";
import type { EntityPresentationType } from "@/lib/entityPresentation";
import type { LayoutIntegrityIssue, LayoutIntegrityReportV1 } from "@/lib/config/layoutIntegrityTypes";

export type LayoutIntegrityFieldInput = {
    field_key: string;
    entity_type: string;
    field_type: string;
    is_active?: boolean;
    is_system?: boolean;
    is_required?: boolean;
    requirement_policy?: unknown | null;
    interaction_policy?: unknown | null;
    is_visible_in_form?: boolean;
    is_visible_in_drawer?: boolean;
    is_visible_in_table?: boolean;
    is_visible_in_public_booking?: boolean;
    section_key?: string | null;
    config?: unknown | null;
    /** When set, field is deprecated but may still be active for data retention. */
    lifecycle_status?: "draft" | "active" | "deprecated" | "archived" | null;
};

export type LayoutIntegritySectionInput = Pick<
    FieldSectionRow,
    "section_key" | "entity_type" | "is_archived" | "section_config"
>;

export type LayoutIntegrityOptionSetInput = {
    set_key: string;
    active_item_count: number;
};

export type ValidateLayoutIntegrityInput = {
    entity_type: string;
    presentation_entity_type?: EntityPresentationType;
    field_definitions: LayoutIntegrityFieldInput[];
    sections: LayoutIntegritySectionInput[];
    layout_config_json: RecordLayoutConfigJson | null;
    option_sets?: LayoutIntegrityOptionSetInput[];
    layout_id?: string | null;
};

function presentationEntityFor(entityType: string): EntityPresentationType | null {
    switch (entityType) {
        case "opportunity":
            return "opportunities";
        case "job":
            return "jobs";
        case "schedule":
            return "schedules";
        default:
            return null;
    }
}

function fieldIsVisibleAnywhere(f: LayoutIntegrityFieldInput): boolean {
    return (
        f.is_visible_in_drawer !== false ||
        f.is_visible_in_form !== false ||
        f.is_visible_in_table === true ||
        f.is_visible_in_public_booking === true
    );
}

function fieldIsExposedInDrawerPreview(fieldKeys: Set<string>, field_key: string): boolean {
    return fieldKeys.has(field_key);
}

function toPreviewFieldDef(f: LayoutIntegrityFieldInput): PreviewFieldDef {
    return {
        field_key: f.field_key,
        field_type: f.field_type,
        label: f.field_key,
        section_key: f.section_key ?? null,
        sort_order: 100,
        is_visible_in_drawer: f.is_visible_in_drawer !== false,
    };
}

function collectDrawerVisibleKeys(
    entity_type: string,
    presentation_entity_type: EntityPresentationType | null,
    layout_config_json: RecordLayoutConfigJson | null,
    field_definitions: LayoutIntegrityFieldInput[],
    sectionLabels: Record<string, string>
): Set<string> {
    const cfg = layout_config_json ?? {};
    const defs = field_definitions.map(toPreviewFieldDef);
    const keys = new Set<string>();

    if (entity_type === "opportunity") {
        const bundle = buildEffectiveDrawerLayoutPreview({
            presentationEntityType: "opportunities",
            config: cfg,
            fieldDefinitions: defs,
            fieldSectionLabels: sectionLabels,
        });
        for (const s of bundle.sections) {
            for (const k of s.field_keys ?? []) keys.add(k);
        }
        return keys;
    }

    if (presentation_entity_type && (entity_type === "job" || entity_type === "schedule")) {
        const bundle = buildEffectiveDrawerLayoutPreview({
            presentationEntityType: presentation_entity_type,
            config: cfg,
            fieldDefinitions: defs,
            fieldSectionLabels: sectionLabels,
        });
        for (const s of bundle.sections) {
            for (const k of s.field_keys ?? []) keys.add(k);
        }
        for (const f of defs.filter((d) => d.is_visible_in_drawer !== false)) keys.add(f.field_key);
        return keys;
    }

    for (const f of field_definitions) {
        if (f.is_visible_in_drawer !== false && f.is_active !== false) keys.add(f.field_key);
    }
    return keys;
}

function optionSetHasActiveItems(
    f: LayoutIntegrityFieldInput,
    optionSets: Map<string, number>
): boolean {
    const t = (f.field_type || "").toLowerCase();
    if (t !== "select" && t !== "multiselect") return true;
    const cfg = f.config;
    const obj =
        cfg && typeof cfg === "object" && !Array.isArray(cfg) ? (cfg as Record<string, unknown>) : {};
    const key = typeof obj.option_set_key === "string" ? obj.option_set_key.trim() : "";
    if (key) {
        const n = optionSets.get(key);
        return n !== undefined && n > 0;
    }
    const inline = normalizeOptionsFromConfig(cfg);
    return inline.length > 0;
}

/**
 * Run deterministic layout integrity checks. Same input → same output order.
 */
export function validateLayoutIntegrity(input: ValidateLayoutIntegrityInput): LayoutIntegrityReportV1 {
    const issues: LayoutIntegrityIssue[] = [];
    const entity_type = input.entity_type;
    const layout_id = input.layout_id ?? undefined;
    const presentation =
        input.presentation_entity_type ?? presentationEntityFor(entity_type);

    const sectionKeys = new Set(input.sections.map((s) => s.section_key));
    const sectionLabels: Record<string, string> = {};
    for (const s of input.sections) sectionLabels[s.section_key] = s.section_key;

    const activeFields = input.field_definitions.filter((f) => f.is_active !== false);
    const fieldKeys = new Set(activeFields.map((f) => f.field_key));

    const drawerVisibleKeys = collectDrawerVisibleKeys(
        entity_type,
        presentation,
        input.layout_config_json,
        activeFields,
        sectionLabels
    );

    const optionSetMap = new Map<string, number>();
    for (const os of input.option_sets ?? []) {
        optionSetMap.set(os.set_key, os.active_item_count);
    }

    // --- Per-field checks ---
    for (const f of activeFields) {
        const row: FieldDefinitionInteractionSource = {
            field_key: f.field_key,
            entity_type: f.entity_type,
            is_system: f.is_system,
            interaction_policy: f.interaction_policy,
        };

        const reqPolicy = resolveFieldRequirementPolicy(f);
        const required = isFieldRequiredInContext(f, { phase: "save", values: {} });
        const visibleAnywhere = fieldIsVisibleAnywhere(f);
        const inDrawer = fieldIsExposedInDrawerPreview(drawerVisibleKeys, f.field_key);

        if (required && !visibleAnywhere && !inDrawer) {
            issues.push({
                severity: "error",
                code: "required_field_not_visible",
                entity_type,
                layout_id,
                field_key: f.field_key,
                message: `Field "${f.field_key}" is required (${reqPolicy.mode}) but not visible on any surface.`,
                recommendation: "Expose the field on drawer, form, or table, or relax requirement policy.",
            });
        }

        if (f.lifecycle_status === "deprecated" && (visibleAnywhere || inDrawer)) {
            issues.push({
                severity: "warning",
                code: "deprecated_field_visible",
                entity_type,
                field_key: f.field_key,
                message: `Deprecated field "${f.field_key}" is still visible.`,
                recommendation: "Hide on layouts or archive the field definition.",
            });
        }

        if (row.interaction_policy != null) {
            const parsed = parseFieldInteractionPolicy(row.interaction_policy);
            if (!parsed.ok) {
                issues.push({
                    severity: "error",
                    code: "editable_without_write_target",
                    entity_type,
                    field_key: f.field_key,
                    message: `Field "${f.field_key}" has invalid interaction_policy: ${parsed.error}`,
                });
            }
        }

        const resolved = resolveFieldEditability(row, { permission_keys: [] });
        if (resolved.editable && !hasValidWriteTarget(row)) {
            issues.push({
                severity: "error",
                code: "editable_without_write_target",
                entity_type,
                field_key: f.field_key,
                message: `Field "${f.field_key}" is editable but has no valid write target.`,
                recommendation: "Set interaction_policy.ownership with write_target_entity and write_target_field.",
            });
        }

        if (resolved.editability_mode === "editable_through_related_record") {
            const policy = resolveFieldInteractionPolicy(row);
            if (!policy.ownership || policy.ownership.write_behavior !== "related_record") {
                issues.push({
                    severity: "error",
                    code: "related_record_missing_ownership",
                    entity_type,
                    field_key: f.field_key,
                    message: `Field "${f.field_key}" uses related-record editability without ownership metadata.`,
                    recommendation: "Add ownership with write_behavior related_record.",
                });
            }
        }

        if (resolved.editability_mode === "action_controlled") {
            const policy = resolveFieldInteractionPolicy(row);
            if (policy.ownership?.write_behavior !== "none") {
                issues.push({
                    severity: "error",
                    code: "action_controlled_incorrectly_editable",
                    entity_type,
                    field_key: f.field_key,
                    message: `Field "${f.field_key}" is action_controlled but write_behavior is not none.`,
                    recommendation: "Set ownership.write_behavior to none for action-controlled fields.",
                });
            }
        }

        if (!optionSetHasActiveItems(f, optionSetMap)) {
            issues.push({
                severity: "warning",
                code: "option_field_no_active_options",
                entity_type,
                field_key: f.field_key,
                message: `Select field "${f.field_key}" has no active options or option set items.`,
                recommendation: "Add option_set items or inline config.options.",
            });
        }

        const sk = f.section_key?.trim();
        if (sk && !sectionKeys.has(sk)) {
            issues.push({
                severity: "error",
                code: "invalid_section_reference",
                entity_type,
                field_key: f.field_key,
                section_key: sk,
                message: `Field "${f.field_key}" references unknown section_key "${sk}".`,
                recommendation: "Create the section or update section_key.",
            });
        }

        if (f.is_active !== false && !visibleAnywhere && !inDrawer && f.lifecycle_status !== "draft") {
            issues.push({
                severity: "warning",
                code: "field_never_exposed",
                entity_type,
                field_key: f.field_key,
                message: `Active field "${f.field_key}" is not exposed on any configured surface.`,
                recommendation: "Expose on drawer or form, or archive if unused.",
            });
        }
    }

    // --- Section checks ---
    const fieldsBySection = new Map<string, string[]>();
    for (const f of activeFields) {
        const sk = f.section_key?.trim() || "custom";
        const list = fieldsBySection.get(sk) ?? [];
        list.push(f.field_key);
        fieldsBySection.set(sk, list);
    }

    for (const section of input.sections) {
        if (section.is_archived) continue;
        const keys = fieldsBySection.get(section.section_key) ?? [];
        if (keys.length === 0) {
            issues.push({
                severity: "warning",
                code: "empty_section",
                entity_type,
                section_key: section.section_key,
                message: `Section "${section.section_key}" has no fields assigned.`,
                recommendation: "Assign fields or archive the section.",
            });
        }
        const cfgParse = parseFieldSectionConfig(section.section_config ?? {});
        if (!cfgParse.ok) {
            issues.push({
                severity: "error",
                code: "invalid_section_reference",
                entity_type,
                section_key: section.section_key,
                message: `Section "${section.section_key}" has invalid section_config: ${cfgParse.error}`,
            });
        }
    }

    // --- Layout JSON references field_keys with no active definition (custom registry only) ---
    const layoutReferencedKeys = new Set<string>();
    for (const w of input.layout_config_json?.inquiry_workflow_sections ?? []) {
        for (const k of w.field_keys ?? []) {
            if (k?.trim()) layoutReferencedKeys.add(k.trim());
        }
    }
    for (const key of layoutReferencedKeys) {
        if (!fieldKeys.has(key)) {
            issues.push({
                severity: "error",
                code: "visible_field_missing_definition",
                entity_type,
                field_key: key,
                message: `Layout config references "${key}" but no active field definition exists.`,
                recommendation: "Add a field definition or remove the key from layout config.",
            });
        }
    }

    // --- Duplicate field placements in drawer preview sections ---
    const drawerFieldKeyCounts = new Map<string, number>();
    if (entity_type === "opportunity" || presentation) {
        const bundle = buildEffectiveDrawerLayoutPreview({
            presentationEntityType:
                entity_type === "opportunity" ? "opportunities" : (presentation as EntityPresentationType),
            config: input.layout_config_json ?? {},
            fieldDefinitions: activeFields.map(toPreviewFieldDef),
            fieldSectionLabels: sectionLabels,
        });
        for (const s of bundle.sections) {
            for (const k of s.field_keys ?? []) {
                drawerFieldKeyCounts.set(k, (drawerFieldKeyCounts.get(k) ?? 0) + 1);
            }
        }
    }
    for (const [key, count] of drawerFieldKeyCounts) {
        if (count > 1) {
            issues.push({
                severity: "warning",
                code: "duplicate_field_placement",
                entity_type,
                field_key: key,
                message: `Field "${key}" appears ${count} times in drawer layout sections.`,
                recommendation: "Deduplicate field_keys in layout or section config.",
            });
        }
    }

    // Layout ordering: duplicate keys in overview_section_order
    const order = input.layout_config_json?.overview_section_order ?? [];
    if (order.length) {
        const seen = new Set<string>();
        for (const k of order) {
            if (seen.has(k)) {
                issues.push({
                    severity: "warning",
                    code: "layout_ordering_conflict",
                    entity_type,
                    layout_id,
                    section_key: k,
                    message: `overview_section_order lists "${k}" more than once.`,
                    recommendation: "Deduplicate overview_section_order.",
                });
            }
            seen.add(k);
        }
    }

    // Stable sort: errors first, then code, field_key
    const severityRank = { error: 0, warning: 1 };
    issues.sort(
        (a, b) =>
            severityRank[a.severity] - severityRank[b.severity] ||
            a.code.localeCompare(b.code) ||
            (a.field_key ?? "").localeCompare(b.field_key ?? "")
    );

    const error_count = issues.filter((i) => i.severity === "error").length;
    const warning_count = issues.filter((i) => i.severity === "warning").length;

    return {
        version: 1,
        entity_type,
        checked_at_iso: new Date(0).toISOString(),
        issues,
        issue_count: issues.length,
        error_count,
        warning_count,
    };
}

/** Same as validateLayoutIntegrity but stamps checked_at_iso at call time (for APIs). */
export function validateLayoutIntegrityNow(input: ValidateLayoutIntegrityInput): LayoutIntegrityReportV1 {
    const report = validateLayoutIntegrity(input);
    return { ...report, checked_at_iso: new Date().toISOString() };
}
