/**
 * Enrollment Process — form field capture vs lifecycle requirement labels (operator-facing).
 */

import { validateFormSchema, type FormField } from "@/lib/forms/schema";
import type { IntakeTypeKey } from "@/lib/forms/inferIntakeType";
import { inferIntakeTypeFromLink } from "@/lib/forms/inferIntakeType";
import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { lifecycleRequirementFieldDetailForLabel } from "@/lib/completion/lifecycleRequirementFieldDetail";

export type FormRequirementCoverageState = "satisfies" | "partial" | "missing" | "unknown";

export type FormRequirementCoverageRow = {
    requirement_label: string;
    state: FormRequirementCoverageState;
};

export type EnrollmentProcessFormCoverageRow = {
    form_id: string;
    form_name: string;
    href: string;
    intake_type_label: string;
    captures: string[];
    requirement_rows: FormRequirementCoverageRow[];
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

function flattenFieldLabels(fields: FormField[]): string[] {
    const out: string[] = [];
    for (const f of fields) {
        if (f.type === "group") {
            out.push(...flattenFieldLabels(f.fields));
        } else if (f.label?.trim()) {
            out.push(f.label.trim());
        }
    }
    return out;
}

export function extractCaptureLabelsFromSchema(schemaJson: unknown): string[] {
    try {
        const parsed = validateFormSchema(schemaJson);
        return [...new Set(flattenFieldLabels(parsed.fields))];
    } catch {
        return [];
    }
}

function normalizeCompare(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

function captureMatchesField(captureLabels: string[], fieldLabel: string): boolean {
    const target = normalizeCompare(fieldLabel);
    return captureLabels.some((c) => {
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
    const matched = expected.filter((f) => captureMatchesField(captureLabels, f));
    if (matched.length === expected.length) return "satisfies";
    if (matched.length > 0) return "partial";
    return "missing";
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
        const captures = hasPublished ? extractCaptureLabelsFromSchema(form.published_schema) : [];
        const requirement_rows = buildFormRequirementCoverageRows(
            input.required_labels,
            input.recommended_labels,
            captures
        );

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
            captures,
            requirement_rows,
            has_published_version: hasPublished,
        });
    }

    return rows.sort((a, b) => a.form_name.localeCompare(b.form_name));
}
