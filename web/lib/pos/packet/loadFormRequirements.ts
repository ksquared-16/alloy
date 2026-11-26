/**
 * Phase 7 — the canonical server seam the composer uses to load meaningful requirements from selected
 * published forms. Uses the existing deterministic enumerator + operator-language labels; the UI never
 * re-interprets and never sees raw schema JSON.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { coerceSchema } from "./loadPacketProjection";
import { enumerateRequirementsFromForm, refKey, type EnumerableFormSchema, type RequirementResponsibility } from "./requirementResponsibility";
import {
    isInformationalOnly,
    partyOptions,
    requirementTypeLabel,
    responsibilitySummary,
    satisfactionLabel,
    scopeLabel,
    validSatisfactions,
    validScopes,
} from "./requirementResponsibilityLabels";

export interface EnumeratedRequirementDTO {
    ref: { form_definition_id: string; section_id?: string | null; field_id?: string | null };
    requirement_key: string;
    type: string;
    type_label: string;
    label: string;
    required: boolean;
    informational_only: boolean;
    configurable: boolean;
    source_form: { id: string; name: string | null };
    source_section: { id: string; title: string | null } | null;
    field_type: string | null;
    recommended: RequirementResponsibility;
    recommended_summary: string;
    options: {
        applies_to: Array<{ value: string; label: string }>;
        responsible_party: Array<{ kind: string; label: string }>;
        satisfied_by: Array<{ value: string; label: string }>;
    };
}

export interface LoadFormRequirementsResult {
    ok: boolean;
    error?: string;
    forms: Array<{ form_definition_id: string; name: string | null; requirements: EnumeratedRequirementDTO[] }>;
    missing_published_forms: string[];
}

function sectionTitleFor(schema: EnumerableFormSchema, sectionId: string | null | undefined): string | null {
    if (!sectionId) return null;
    return schema.sections.find((s) => s.id === sectionId)?.title ?? null;
}

function fieldTypeFor(schema: EnumerableFormSchema, fieldId: string | null | undefined): string | null {
    if (!fieldId) return null;
    return schema.fields.find((f) => f.id === fieldId)?.type ?? null;
}

/** Load enumerated requirements (operator-language) for a set of published forms, preserving order. */
export async function loadFormRequirements(
    supabase: SupabaseClient,
    args: { orgId: string; formIds: string[] }
): Promise<LoadFormRequirementsResult> {
    const formIds = Array.from(new Set(args.formIds)).filter(Boolean);
    if (formIds.length === 0) return { ok: true, forms: [], missing_published_forms: [] };

    const { data: defRows, error: defErr } = await supabase
        .from("form_definitions")
        .select("id, name")
        .eq("org_id", args.orgId)
        .in("id", formIds);
    if (defErr) return { ok: false, error: defErr.message, forms: [], missing_published_forms: [] };
    const nameById = new Map(((defRows ?? []) as Array<{ id: string; name: string | null }>).map((r) => [r.id, r.name]));

    const { data: verRows, error: verErr } = await supabase
        .from("form_definition_versions")
        .select("form_definition_id, version_number, schema_json")
        .eq("org_id", args.orgId)
        .in("form_definition_id", formIds)
        .eq("status", "published")
        .order("version_number", { ascending: false });
    if (verErr) return { ok: false, error: verErr.message, forms: [], missing_published_forms: [] };
    const schemaByForm = new Map<string, unknown>();
    for (const row of (verRows ?? []) as Array<{ form_definition_id: string; schema_json: unknown }>) {
        if (!schemaByForm.has(row.form_definition_id)) schemaByForm.set(row.form_definition_id, row.schema_json);
    }

    const forms: LoadFormRequirementsResult["forms"] = [];
    const missing: string[] = [];
    for (const fid of formIds) {
        const schema = coerceSchema(schemaByForm.get(fid));
        if (!schema) {
            missing.push(fid);
            continue;
        }
        const name = nameById.get(fid) ?? null;
        const enumerated = enumerateRequirementsFromForm(fid, schema);
        const requirements: EnumeratedRequirementDTO[] = enumerated.map((req) => {
            const type = req.type;
            const recommendedScope = req.default_responsibility.applies_to;
            return {
                ref: req.ref,
                requirement_key: refKey(req.ref),
                type,
                type_label: requirementTypeLabel(type),
                label: req.label,
                required: req.required,
                informational_only: isInformationalOnly(type),
                configurable: !isInformationalOnly(type),
                source_form: { id: fid, name },
                source_section: req.ref.section_id ? { id: req.ref.section_id, title: sectionTitleFor(schema, req.ref.section_id) } : null,
                field_type: fieldTypeFor(schema, req.ref.field_id),
                recommended: req.default_responsibility,
                recommended_summary: responsibilitySummary(req.default_responsibility),
                options: {
                    applies_to: validScopes(type).map((s) => ({ value: s, label: scopeLabel(s) })),
                    responsible_party: partyOptions().map((p) => ({ kind: p.kind, label: p.label })),
                    satisfied_by: validSatisfactions(recommendedScope).map((r) => ({ value: r, label: satisfactionLabel(r) })),
                },
            };
        });
        forms.push({ form_definition_id: fid, name, requirements });
    }

    return { ok: true, forms, missing_published_forms: missing };
}
