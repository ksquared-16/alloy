/**
 * Card 5 — Server-side lifecycle requirement validation for public submit.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseIntakeAutoCreateFlags } from "@/lib/forms/intake/parseIntakeAutoCreateFlags";
import { evaluateSubmittedFormsLifecycleFieldCoverage } from "@/lib/forms/lifecycle/evaluateFormsLifecycleFieldCoverage";
import type { FormsLifecycleCoverageResult } from "@/lib/forms/lifecycle/formsLifecycleCoverageTypes";
import {
    readFormLifecycleUsage,
    type FormsLifecycleUsageV1,
} from "@/lib/forms/lifecycle/formLifecycleUsageMetadata";
import { operationalIntentRequiresLifecycleRecordCoverage } from "@/lib/forms/lifecycle/isFormLifecycleReadyForRecordCreation";
import { resolveFormsLifecycleRequirementContract } from "@/lib/forms/lifecycle/resolveFormsLifecycleRequirementContract";
import {
    formsSubmitBlockedByReadiness,
    readinessResultFromFormsLifecycleCoverage,
} from "@/lib/completion/readinessFromFormsCoverage";
import type { ReadinessResult } from "@/lib/completion/readinessTypes";
import { loadOrgFieldDefinitionsForLifecycle } from "@/lib/lifecycle/loadOrgFieldDefinitionsForLifecycle";
import { linkRequiresLeadCapture } from "@/lib/public/forms/publicFormTypes";

export type PublicSubmissionLifecycleValidationSkipped = {
    ok: true;
    skipped: true;
    reason: "not_record_creating" | "legacy_no_usage" | "intake_disabled";
};

export type PublicSubmissionLifecycleValidationPassed = {
    ok: true;
    skipped: false;
    coverage: FormsLifecycleCoverageResult;
    usage: FormsLifecycleUsageV1;
    readiness?: ReadinessResult;
};

export type PublicSubmissionLifecycleValidationBlocked = {
    ok: false;
    blocked: true;
    publicMessage: string;
    missingRequiredLabels: string[];
    missingRequiredFieldKeys: string[];
    usage: FormsLifecycleUsageV1;
    coverage: FormsLifecycleCoverageResult;
    readiness?: ReadinessResult;
};

export type PublicSubmissionLifecycleValidationResult =
    | PublicSubmissionLifecycleValidationSkipped
    | PublicSubmissionLifecycleValidationPassed
    | PublicSubmissionLifecycleValidationBlocked;

export function buildPublicLifecycleValidationMessage(missingLabels: string[]): string {
    const labels = missingLabels.map((l) => l.trim()).filter(Boolean);
    if (labels.length === 0) {
        return "This form is missing required information.";
    }
    if (labels.length === 1) {
        return `This form is missing required information: ${labels[0]}.`;
    }
    const preview = labels.slice(0, 3).join(", ");
    const suffix = labels.length > 3 ? ", and others" : "";
    return `This form is missing required information: ${preview}${suffix}.`;
}

export function buildLifecycleValidationBlockedMeta(input: {
    usage: FormsLifecycleUsageV1;
    missingRequiredLabels: string[];
    missingRequiredFieldKeys: string[];
}): Record<string, unknown> {
    return {
        lifecycle_validation_blocked: true,
        missing_required_fields: input.missingRequiredLabels,
        missing_required_field_keys: input.missingRequiredFieldKeys,
        lifecycle_usage_v1: input.usage,
        intake_resolution_path: "lifecycle_validation_blocked",
        intake_needs_review: false,
        intake_auto_operationalized: false,
    };
}

/** Validate submitted payload against lifecycle contract before CRM intake. */
export async function validatePublicSubmissionLifecycleRequirements(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        formDefinitionId: string;
        schemaJson: unknown;
        linkMetadata: Record<string, unknown> | null | undefined;
        formMetadata?: Record<string, unknown> | null;
        submittedValues: Record<string, unknown>;
    }
): Promise<PublicSubmissionLifecycleValidationResult> {
    const linkMetadata = params.linkMetadata ?? {};
    if (!linkRequiresLeadCapture(linkMetadata)) {
        return { ok: true, skipped: true, reason: "intake_disabled" };
    }

    const flags = parseIntakeAutoCreateFlags(linkMetadata);
    if (!flags.auto_create_opportunity) {
        return { ok: true, skipped: true, reason: "not_record_creating" };
    }

    let formMetadata = params.formMetadata;
    if (formMetadata === undefined) {
        const { data: formRow, error } = await supabase
            .from("form_definitions")
            .select("metadata")
            .eq("org_id", params.orgId)
            .eq("id", params.formDefinitionId)
            .maybeSingle();
        if (error) throw new Error(error.message);
        formMetadata =
            formRow && typeof (formRow as { metadata?: unknown }).metadata === "object" ?
                ((formRow as { metadata: Record<string, unknown> }).metadata)
            :   null;
    }

    const usage = readFormLifecycleUsage(formMetadata);
    if (!usage) {
        return { ok: true, skipped: true, reason: "legacy_no_usage" };
    }

    if (!operationalIntentRequiresLifecycleRecordCoverage(String(usage.intake_intent))) {
        return { ok: true, skipped: true, reason: "not_record_creating" };
    }

    const { data: dept, error: deptErr } = await supabase
        .from("departments")
        .select("id, name, metadata")
        .eq("org_id", params.orgId)
        .eq("id", usage.department_id)
        .maybeSingle();
    if (deptErr) throw new Error(deptErr.message);

    const deptRow = dept as { name?: string; metadata?: Record<string, unknown> } | null;
    const orgFieldDefinitions = await loadOrgFieldDefinitionsForLifecycle(supabase, params.orgId);

    const contract = resolveFormsLifecycleRequirementContract({
        orgId: params.orgId,
        departmentId: usage.department_id,
        processId: usage.process_id ?? null,
        stageKey: usage.stage_key,
        intent: String(usage.intake_intent),
        lifecycleLabel: deptRow?.name ?? undefined,
        departmentMetadata: deptRow?.metadata ?? null,
        orgFieldDefinitions,
    });

    const coverage = evaluateSubmittedFormsLifecycleFieldCoverage(
        params.schemaJson,
        contract,
        params.submittedValues
    );

    const readiness = readinessResultFromFormsLifecycleCoverage({
        coverage,
        contract,
        trigger: "form_submit",
        orgId: params.orgId,
        departmentMetadata: deptRow?.metadata ?? null,
        formId: params.formDefinitionId,
        departmentId: usage.department_id,
    });

    const coverageWithReadiness: FormsLifecycleCoverageResult = { ...coverage, readiness };

    if (!formsSubmitBlockedByReadiness(readiness)) {
        return { ok: true, skipped: false, coverage: coverageWithReadiness, usage, readiness };
    }

    const blockingGaps = readiness.gaps.filter((g) => g.blocking);
    const labels = [...new Set(blockingGaps.map((g) => g.label.trim()).filter(Boolean))];
    const fieldKeys = [
        ...new Set(
            blockingGaps.map((g) => g.field_key?.trim() || g.requirement_id).filter(Boolean) as string[]
        ),
    ];
    return {
        ok: false,
        blocked: true,
        publicMessage: buildPublicLifecycleValidationMessage(labels),
        missingRequiredLabels: labels,
        missingRequiredFieldKeys: fieldKeys,
        usage,
        coverage: coverageWithReadiness,
        readiness,
    };
}
