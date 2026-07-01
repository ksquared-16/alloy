/**
 * Enrollment Process — form field capture vs lifecycle field_rules (operator-facing).
 */

import { validateFormSchema, type FormField } from "@/lib/forms/schema";
import type { IntakeTypeKey } from "@/lib/forms/inferIntakeType";
import { inferIntakeTypeFromLink } from "@/lib/forms/inferIntakeType";
import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { lifecycleRequirementFieldDetailForLabel } from "@/lib/completion/lifecycleRequirementFieldDetail";
import {
    lifecycleEntityLabel,
    lifecycleFieldRequirementById,
    type LifecycleStageFieldRules,
} from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import { lifecycleFieldRuleBinding, parseCustomFieldRuleId } from "@/lib/lifecycle/lifecycleFieldRuleBindings";

export type FormRequirementCoverageState = "satisfies" | "partial" | "missing" | "unknown";

export type FormRequirementCoverageRow = {
    requirement_label: string;
    state: FormRequirementCoverageState;
};

export type FormFieldRuleCoverageRow = {
    entity_label: string;
    field_label: string;
    kind: "required" | "recommended";
    state: FormRequirementCoverageState;
};

export type FormFieldRulesCoverageSummary = "complete" | "partial" | "unknown";

export type EnrollmentProcessFormCoverageRow = {
    form_id: string;
    form_name: string;
    href: string;
    intake_type_label: string;
    captures: string[];
    requirement_rows: FormRequirementCoverageRow[];
    field_rule_rows: FormFieldRuleCoverageRow[];
    field_rules_summary: FormFieldRulesCoverageSummary;
    has_published_version: boolean;
};

/** Which operator stages a form intake type is relevant to (best-effort). */
export const INTAKE_TYPE_OPERATOR_STAGES: Record<IntakeTypeKey, readonly LifecycleOperatorStage[]> = {
    enrollment_lead: ["lead"],
    waitlist: ["waitlist"],
    packet_step: ["enrollment"],
    operational_document: ["enrollment", "tour"],
    existing_family: ["qualification", "tour", "waitlist", "enrollment"],
    general: ["lead", "qualification", "tour", "waitlist", "enrollment"],
};

export type FormCaptureTokens = {
    labels: string[];
    field_ids: string[];
};

function flattenFieldCaptures(fields: FormField[]): FormCaptureTokens {
    const labels: string[] = [];
    const field_ids: string[] = [];
    for (const f of fields) {
        if (f.type === "group") {
            const nested = flattenFieldCaptures(f.fields);
            labels.push(...nested.labels);
            field_ids.push(...nested.field_ids);
        } else {
            if (f.label?.trim()) labels.push(f.label.trim());
            if (f.id?.trim()) field_ids.push(f.id.trim());
        }
    }
    return { labels, field_ids };
}

export function extractCaptureLabelsFromSchema(schemaJson: unknown): string[] {
    return extractCaptureTokensFromSchema(schemaJson).labels;
}

export function extractCaptureTokensFromSchema(schemaJson: unknown): FormCaptureTokens {
    try {
        const parsed = validateFormSchema(schemaJson);
        const tokens = flattenFieldCaptures(parsed.fields);
        return {
            labels: [...new Set(tokens.labels)],
            field_ids: [...new Set(tokens.field_ids)],
        };
    } catch {
        return { labels: [], field_ids: [] };
    }
}

function normalizeCompare(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

function captureMatchesToken(capture: FormCaptureTokens, token: string): boolean {
    const target = normalizeCompare(token);
    const haystack = [...capture.labels, ...capture.field_ids];
    return haystack.some((c) => {
        const n = normalizeCompare(c);
        return n === target || n.includes(target) || target.includes(n);
    });
}

function requirementExpectedFields(requirementLabel: string): string[] | null {
    const detail = lifecycleRequirementFieldDetailForLabel(requirementLabel);
    if (!detail?.fields.length) return null;
    return [...detail.fields];
}

export function coverageStateForRequirement(
    requirementLabel: string,
    captureLabels: string[]
): FormRequirementCoverageState {
    const expected = requirementExpectedFields(requirementLabel);
    if (!expected) return "unknown";
    const capture: FormCaptureTokens = { labels: captureLabels, field_ids: [] };
    const matched = expected.filter((f) => captureMatchesToken(capture, f));
    if (matched.length === expected.length) return "satisfies";
    if (matched.length > 0) return "partial";
    return "missing";
}

export function coverageStateForFieldRule(
    ruleId: string,
    capture: FormCaptureTokens
): FormRequirementCoverageState {
    const custom = parseCustomFieldRuleId(ruleId);
    if (custom) {
        if (captureMatchesToken(capture, custom.field_key)) return "satisfies";
        const def = lifecycleFieldRequirementById(ruleId);
        if (def && captureMatchesToken(capture, def.field_label)) return "satisfies";
        return "unknown";
    }

    const binding = lifecycleFieldRuleBinding(ruleId);
    const catalogDef = lifecycleFieldRequirementById(ruleId);
    if (!binding && !catalogDef) return "unknown";
    if (!binding?.form_coverage_supported && !catalogDef) return "unknown";

    const tokens = binding?.form_capture_keys ?? [catalogDef!.field_label];
    const matched = tokens.filter((t) => captureMatchesToken(capture, t));
    if (matched.length === 0) return "missing";
    return "satisfies";
}

export function buildFormFieldRuleCoverageRows(
    fieldRules: LifecycleStageFieldRules,
    capture: FormCaptureTokens
): { rows: FormFieldRuleCoverageRow[]; summary: FormFieldRulesCoverageSummary } {
    const rows: FormFieldRuleCoverageRow[] = [];

    for (const ruleId of fieldRules.required_rule_ids) {
        const catalogDef = lifecycleFieldRequirementById(ruleId);
        const custom = parseCustomFieldRuleId(ruleId);
        const entity = custom?.entity ?? catalogDef?.entity ?? "person";
        const fieldLabel = custom
            ? custom.field_key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
            : (catalogDef?.field_label ?? ruleId);
        rows.push({
            entity_label: lifecycleEntityLabel(entity),
            field_label: fieldLabel,
            kind: "required",
            state: coverageStateForFieldRule(ruleId, capture),
        });
    }

    for (const ruleId of fieldRules.recommended_rule_ids) {
        const catalogDef = lifecycleFieldRequirementById(ruleId);
        const custom = parseCustomFieldRuleId(ruleId);
        const entity = custom?.entity ?? catalogDef?.entity ?? "person";
        const fieldLabel = custom
            ? custom.field_key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
            : (catalogDef?.field_label ?? ruleId);
        rows.push({
            entity_label: lifecycleEntityLabel(entity),
            field_label: fieldLabel,
            kind: "recommended",
            state: coverageStateForFieldRule(ruleId, capture),
        });
    }

    if (!rows.length) {
        return { rows, summary: "unknown" };
    }

    const requiredRows = rows.filter((r) => r.kind === "required");
    if (!requiredRows.length) {
        const anyUnknown = rows.some((r) => r.state === "unknown");
        return { rows, summary: anyUnknown ? "unknown" : "complete" };
    }

    if (requiredRows.every((r) => r.state === "satisfies")) {
        return { rows, summary: "complete" };
    }
    if (requiredRows.some((r) => r.state === "unknown")) {
        return { rows, summary: "unknown" };
    }
    if (requiredRows.some((r) => r.state === "satisfies")) {
        return { rows, summary: "partial" };
    }
    return { rows, summary: "partial" };
}

export function buildFormRequirementCoverageRows(
    requiredLabels: readonly string[],
    recommendedLabels: readonly string[],
    captureLabels: string[]
): FormRequirementCoverageRow[] {
    const labels = [...new Set([...requiredLabels, ...recommendedLabels])];
    return labels.map((requirement_label) => ({
        requirement_label,
        state: coverageStateForRequirement(requirement_label, captureLabels),
    }));
}

export function formRelevantToOperatorStage(
    stage: LifecycleOperatorStage,
    intakeType: IntakeTypeKey,
    formMetadata?: Record<string, unknown> | null
): boolean {
    const explicit = formMetadata?.enrollment_operator_stages;
    if (Array.isArray(explicit)) {
        return explicit.some((s) => String(s).trim() === stage);
    }
    return INTAKE_TYPE_OPERATOR_STAGES[intakeType]?.includes(stage) ?? false;
}

export function inferFormIntakeTypeForOrgForm(
    formKey: string,
    linkMetadataSamples: Record<string, unknown>[]
): IntakeTypeKey {
    for (const meta of linkMetadataSamples) {
        const t = inferIntakeTypeFromLink(meta, formKey);
        if (t !== "general") return t;
    }
    return inferIntakeTypeFromLink(linkMetadataSamples[0] ?? null, formKey);
}

export function buildEnrollmentProcessFormCoverageRows(input: {
    stage: LifecycleOperatorStage;
    required_labels: readonly string[];
    recommended_labels: readonly string[];
    field_rules: LifecycleStageFieldRules;
    forms: {
        id: string;
        key: string;
        name: string;
        metadata: Record<string, unknown> | null;
        published_schema: unknown | null;
        link_metadata_samples: Record<string, unknown>[];
    }[];
}): EnrollmentProcessFormCoverageRow[] {
    const rows: EnrollmentProcessFormCoverageRow[] = [];

    for (const form of input.forms) {
        const intakeType = inferFormIntakeTypeForOrgForm(form.key, form.link_metadata_samples);
        if (!formRelevantToOperatorStage(input.stage, intakeType, form.metadata)) continue;

        const hasPublished = form.published_schema != null;
        const capture = hasPublished ? extractCaptureTokensFromSchema(form.published_schema) : { labels: [], field_ids: [] };
        const requirement_rows = buildFormRequirementCoverageRows(
            input.required_labels,
            input.recommended_labels,
            capture.labels
        );
        const fieldCoverage = buildFormFieldRuleCoverageRows(input.field_rules, capture);

        const intake_type_label =
            intakeType === "enrollment_lead"
                ? "Enrollment lead"
                : intakeType === "waitlist"
                  ? "Waitlist intake"
                  : intakeType === "packet_step"
                    ? "Enrollment packet step"
                    : intakeType === "operational_document"
                      ? "Operational document"
                      : intakeType === "existing_family"
                        ? "Existing family update"
                        : "General form";

        rows.push({
            form_id: form.id,
            form_name: form.name,
            href: `/adminV2/forms/${form.id}`,
            intake_type_label,
            captures: capture.labels,
            requirement_rows,
            field_rule_rows: fieldCoverage.rows,
            field_rules_summary: hasPublished ? fieldCoverage.summary : "unknown",
            has_published_version: hasPublished,
        });
    }

    return rows.sort((a, b) => a.form_name.localeCompare(b.form_name));
}
