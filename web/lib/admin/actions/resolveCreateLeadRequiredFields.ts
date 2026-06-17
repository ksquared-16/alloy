/**
 * Create Lead intake — resolved from Business Process Lead stage field requirements.
 */

import type { ActionWorkspaceGatherField, ActionWorkspaceBosSuggestion } from "@/lib/admin/actions/actionWorkspaceTypes";
import type { LifecycleRequirementEntityKey } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import type { ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";
import type { OrgFieldDefinitionRow } from "@/lib/lifecycle/loadOrgFieldDefinitionsForLifecycle";
import {
    mapActionIntakeValuesToCreateLeadPayload,
    missingRequiredFieldLabels,
    resolveCreateLeadActionIntakeSpec,
    validateActionIntakePayload,
} from "@/lib/lifecycle/resolveActionIntakeSpec";
import type { ActionIntakePasteExtractionResult } from "@/lib/lifecycle/actionIntakePasteParserTypes";
import { applyActionIntakePasteExtraction } from "@/lib/lifecycle/applyActionIntakePasteExtraction";
import { CREATE_LEAD_GATHER_FIELDS } from "@/lib/admin/actions/createLeadPlatformGather";

const CONTEXT_OPTIONAL_KEYS = new Set(["source", "intake_notes", "child_age"]);
const PLATFORM_CONFIDENCE_KEYS = new Set([
    "location_id",
    "email",
    "phone",
    ...CONTEXT_OPTIONAL_KEYS,
]);

function sectionForEntity(entity: LifecycleRequirementEntityKey): {
    section: ActionWorkspaceGatherField["section"];
    section_label: string;
} {
    if (entity === "person") return { section: "person", section_label: "Parent / guardian" };
    if (entity === "child") return { section: "child", section_label: "Child" };
    if (entity === "opportunity") return { section: "context", section_label: "Lead" };
    return { section: "context", section_label: "Context" };
}

export function actionIntakeFieldToGatherField(field: ActionIntakeSpec["required"][number]): ActionWorkspaceGatherField {
    const { section, section_label } = sectionForEntity(field.entity);
    return {
        payload_key: field.payload_key,
        field_label: field.field_label,
        section,
        section_label,
        tier: field.tier === "required" ? "required" : "optional",
        value_kind: field.value_kind,
        option_set_key: field.option_set_key ?? undefined,
        placement_select: field.placement_select ?? undefined,
        multiline: field.payload_key === "intake_notes" ? true : undefined,
    };
}

/** Merge configured intake fields with optional context helpers for parsing/manual entry. */
export function gatherFieldsFromActionIntakeSpec(spec: ActionIntakeSpec): ActionWorkspaceGatherField[] {
    const fromSpec = [...spec.required, ...spec.recommended, ...spec.optional].map(actionIntakeFieldToGatherField);
    const seen = new Set(fromSpec.map((f) => f.payload_key));
    const extras = CREATE_LEAD_GATHER_FIELDS.filter(
        (f) => PLATFORM_CONFIDENCE_KEYS.has(f.payload_key) && !seen.has(f.payload_key),
    );
    return [...fromSpec, ...extras];
}

export function gatherSectionsFromFields(
    fields: readonly ActionWorkspaceGatherField[],
): Array<{ key: string; label: string; fields: ActionWorkspaceGatherField[] }> {
    const order = ["person", "child", "context"] as const;
    return order
        .map((key) => {
            const sectionFields = fields.filter((f) => f.section === key);
            if (!sectionFields.length) return null;
            return { key, label: sectionFields[0]!.section_label, fields: [...sectionFields] };
        })
        .filter((s) => s != null);
}

export type CreateLeadRequiredFieldsBundle = {
    spec: ActionIntakeSpec;
    gatherFields: ActionWorkspaceGatherField[];
    sections: Array<{ key: string; label: string; fields: ActionWorkspaceGatherField[] }>;
    requiredPayloadKeys: string[];
};

export function resolveCreateLeadRequiredFields(input: {
    departmentId: string;
    processKey?: string | null;
    stageKey?: string | null;
    departmentMetadata?: Record<string, unknown> | null;
    orgFieldDefinitions?: Partial<Record<string, OrgFieldDefinitionRow[]>> | null;
}): CreateLeadRequiredFieldsBundle {
    const stageKey = input.stageKey?.trim() || "lead";
    const spec = resolveCreateLeadActionIntakeSpec({
        department_id: input.departmentId,
        process_id: input.processKey ?? null,
        operator_stage: "lead",
        builder_stage_key: stageKey,
        department_metadata: input.departmentMetadata ?? null,
        org_field_definitions: input.orgFieldDefinitions ?? null,
    });
    const gatherFields = gatherFieldsFromActionIntakeSpec(spec);
    return {
        spec,
        gatherFields,
        sections: gatherSectionsFromFields(gatherFields),
        requiredPayloadKeys: spec.required.map((f) => f.payload_key),
    };
}

export function emptyCreateLeadValuesForFields(
    fields: readonly ActionWorkspaceGatherField[],
): Record<string, string> {
    const out: Record<string, string> = {};
    for (const field of fields) out[field.payload_key] = "";
    return out;
}

export function applyHighConfidenceCreateLeadExtraction(
    values: Record<string, string>,
    extraction: ActionIntakePasteExtractionResult,
): Record<string, string> {
    const applicable: ActionIntakePasteExtractionResult = {
        ...extraction,
        fields: extraction.fields.filter((f) => f.confidence === "high" || f.confidence === "invalid"),
    };
    return applyActionIntakePasteExtraction({
        current_values: values,
        current_meta: {},
        extraction: applicable,
    }).values;
}

export function reviewSuggestionsFromExtraction(
    extraction: ActionIntakePasteExtractionResult,
    fieldLabels: Record<string, string>,
): ActionWorkspaceBosSuggestion[] {
    return extraction.fields
        .filter((f) => f.confidence !== "high" && f.confidence !== "invalid")
        .map((f) => ({
            id: `${f.payload_key}:${f.value}`,
            payload_key: f.payload_key,
            field_label: fieldLabels[f.payload_key] ?? f.payload_key,
            suggested_value: f.value,
            confidence: f.confidence as "medium" | "low",
            selected: f.confidence === "medium",
        }));
}

export function projectedCreateLeadValues(
    values: Record<string, string>,
    suggestions: ActionWorkspaceBosSuggestion[],
    selectedOnly = true,
): Record<string, string> {
    const out = { ...values };
    for (const suggestion of suggestions) {
        if (selectedOnly && !suggestion.selected) continue;
        const v = suggestion.suggested_value.trim();
        if (v) out[suggestion.payload_key] = v;
    }
    return out;
}

export function missingRequiredLabelsForCreateLead(
    spec: ActionIntakeSpec,
    values: Record<string, string>,
    suggestions: ActionWorkspaceBosSuggestion[] = [],
): string[] {
    const projected = projectedCreateLeadValues(values, suggestions, true);
    return missingRequiredFieldLabels(spec, projected);
}

export function validateCreateLeadFromIntakeSpec(
    spec: ActionIntakeSpec,
    values: Record<string, string>,
): { ok: true } | { ok: false; issues: string[] } {
    const payload = mapActionIntakeValuesToCreateLeadPayload(spec, values);
    const result = validateActionIntakePayload(spec, payload);
    if (result.ok) return { ok: true };
    return { ok: false, issues: result.issues.map((i) => i.message) };
}

export function parserSpecFromIntakeBundle(spec: ActionIntakeSpec): ActionIntakeSpec {
    return spec;
}
