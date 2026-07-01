/**
 * Preflight + requirement evaluation for enrollment status transitions (OCM-scoped).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateLifecycleActionRequirements } from "@/lib/completion/lifecycleActionRequirementCatalog";
import {
    buildOpportunityCompletionContextFromDb,
    loadOpportunityRecordForEffectiveRequirements,
} from "@/lib/completion/loadRecordForEffectiveRequirements";
import type { RequirementValidationResult } from "@/lib/completion/requirementValidationTypes";
import {
    buildRequirementValidationResult,
    mergeRequirementValidationResults,
} from "@/lib/completion/requirementValidationResult";
import { makeRequirementViolation } from "@/lib/completion/requirementValidationResult";
import type {
    EnrollmentStatusDestinationKey,
    EnrollmentStatusTransitionScope,
} from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionContract";
import { UPDATE_ENROLLMENT_STATUS_ACTION_KEY } from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionContract";
import {
    activeLifecycleProcess,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { resolveEnrollmentStatusTargetKey } from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionDestinations";
import {
    findBpDestinationOption,
    resolveBpEnrollmentStatusDestinations,
    tourBypassRequiredForDestination,
} from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionBpResolver";
import {
    bypassReasonRequiredForSkippedStages,
    readEnrollmentManualTransitionPolicy,
    skippedBuilderStagesBetween,
} from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionPolicy";

export type EnrollmentStatusTransitionPreflightInput = {
    supabase: SupabaseClient;
    orgId: string;
    scope: EnrollmentStatusTransitionScope;
    destinationKey: EnrollmentStatusDestinationKey;
    targetStatusKey?: string | null;
    departmentId?: string | null;
    workUnitId?: string | null;
    bypassReason?: string | null;
    builderStageKey?: string | null;
};

export type EnrollmentStatusTransitionPreflightResult = {
    ok: boolean;
    targetStatusKey: string;
    validation: RequirementValidationResult;
    requiresBypassReason: boolean;
    destinationSource: "bp" | "default_fallback";
    skippedStageLabels: string[];
};

async function loadDepartmentMetadata(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string | null | undefined,
): Promise<Record<string, unknown> | null> {
    const id = departmentId?.trim();
    if (!id) return null;
    const { data } = await supabase
        .from("departments")
        .select("metadata")
        .eq("id", id)
        .eq("org_id", orgId)
        .maybeSingle();
    const md = (data as { metadata?: unknown } | null)?.metadata;
    return md != null && typeof md === "object" && !Array.isArray(md)
        ? (md as Record<string, unknown>)
        : null;
}

function filterChildrenToScope(
    children: Array<Record<string, unknown>>,
    scope: EnrollmentStatusTransitionScope,
): Array<Record<string, unknown>> {
    const ocmId = scope.opportunityCustomerMemberId?.trim();
    if (!ocmId || scope.grain === "case") return children;
    return children.filter((c) => {
        const id = typeof c.id === "string" ? c.id.trim() : "";
        return id === ocmId;
    });
}

export async function evaluateEnrollmentStatusTransitionPreflight(
    input: EnrollmentStatusTransitionPreflightInput,
): Promise<EnrollmentStatusTransitionPreflightResult> {
    const grain =
        input.scope.grain === "case" && !input.scope.opportunityCustomerMemberId?.trim()
            ? "case"
            : "child";

    const record = await loadOpportunityRecordForEffectiveRequirements(
        input.supabase,
        input.orgId,
        input.scope.opportunityId,
    );
    if (!record) {
        const fallbackTarget =
            input.targetStatusKey?.trim() ||
            resolveEnrollmentStatusTargetKey(input.destinationKey, input.scope.grain);
        return {
            ok: false,
            targetStatusKey: fallbackTarget,
            requiresBypassReason: false,
            destinationSource: "default_fallback",
            skippedStageLabels: [],
            validation: buildRequirementValidationResult([
                makeRequirementViolation({
                    entity_type: "opportunity",
                    entity_id: input.scope.opportunityId,
                    field_key: "opportunity_id",
                    label: "Record",
                    requirement_type: "required_before_action",
                    blocking_level: "hard_block",
                    missing_reason: "Opportunity not found.",
                }),
            ]),
        };
    }

    const departmentId =
        input.departmentId?.trim() ||
        (typeof record.department_id === "string" ? record.department_id.trim() : null);
    const departmentMetadata = await loadDepartmentMetadata(input.supabase, input.orgId, departmentId);

    let currentStatusKey =
        typeof record.status_key === "string" ? record.status_key.trim() : null;

    if (input.scope.opportunityCustomerMemberId?.trim()) {
        const { data: ocm } = await input.supabase
            .from("opportunity_customer_members")
            .select("outcome_status_key")
            .eq("org_id", input.orgId)
            .eq("opportunity_id", input.scope.opportunityId)
            .eq("id", input.scope.opportunityCustomerMemberId.trim())
            .maybeSingle();
        const ocmStatus = (ocm as { outcome_status_key?: string | null } | null)?.outcome_status_key;
        if (typeof ocmStatus === "string" && ocmStatus.trim()) {
            currentStatusKey = ocmStatus.trim();
        }
    }

    const bpResolved = resolveBpEnrollmentStatusDestinations({
        departmentMetadata,
        currentStatusKey,
        grain,
        builderStageKey: input.builderStageKey,
    });

    const bpDestination = findBpDestinationOption(
        bpResolved.destinations,
        input.destinationKey,
        input.targetStatusKey,
    );

    const builder = lifecycleBuilderFromDepartmentMetadata(departmentMetadata ?? {});
    const process = activeLifecycleProcess(builder);
    const policy = readEnrollmentManualTransitionPolicy(process);

    const targetStatusKey =
        input.targetStatusKey?.trim() ||
        bpDestination?.defaultStatusKey ||
        resolveEnrollmentStatusTargetKey(input.destinationKey, grain);

    const targetBuilderStageKey = bpDestination?.builderStageKey ?? null;
    const skippedStages =
        process && bpResolved.currentBuilderStageKey && targetBuilderStageKey
            ? skippedBuilderStagesBetween(process, bpResolved.currentBuilderStageKey, targetBuilderStageKey)
            : [];
    const skippedStageLabels = skippedStages.map((s) => s.label);

    const destinationAllowed =
        Boolean(bpDestination) ||
        bpResolved.destinations.some((d) => d.destinationKey === input.destinationKey);

    const destinationViolations = [];
    if (!destinationAllowed) {
        destinationViolations.push(
            makeRequirementViolation({
                entity_type: "opportunity",
                entity_id: input.scope.opportunityId,
                field_key: "destination_key",
                label: "Destination",
                requirement_type: "required_before_action",
                blocking_level: "hard_block",
                missing_reason:
                    policy.mode === "strict_transitions_only"
                        ? "That destination is not allowed from the current stage per Business Process configuration."
                        : "That destination is not configured on the enrollment Business Process.",
            }),
        );
    }

    const ctx = await buildOpportunityCompletionContextFromDb(input.supabase, {
        orgId: input.orgId,
        opportunityId: input.scope.opportunityId,
        phase: "action",
        action_key: UPDATE_ENROLLMENT_STATUS_ACTION_KEY,
        status_to: targetStatusKey,
        department_id: departmentId,
        work_unit_id: input.workUnitId,
    });

    if (!ctx) {
        return {
            ok: false,
            targetStatusKey,
            requiresBypassReason: false,
            destinationSource: bpResolved.destinationSource,
            skippedStageLabels,
            validation: mergeRequirementValidationResults(
                buildRequirementValidationResult(destinationViolations),
                buildRequirementValidationResult([
                    makeRequirementViolation({
                        entity_type: "opportunity",
                        entity_id: input.scope.opportunityId,
                        field_key: "opportunity_id",
                        label: "Record",
                        requirement_type: "required_before_action",
                        blocking_level: "hard_block",
                        missing_reason: "Could not load opportunity for requirement checks.",
                    }),
                ]),
            ),
        };
    }

    if (ctx.related?.inquiry_children?.length && input.scope.opportunityCustomerMemberId) {
        ctx.related = {
            ...ctx.related,
            inquiry_children: filterChildrenToScope(
                ctx.related.inquiry_children as Array<Record<string, unknown>>,
                input.scope,
            ) as typeof ctx.related.inquiry_children,
        };
    }

    const mappedActionKey =
        input.destinationKey === "waitlist" ? "move_to_waitlist"
        : input.destinationKey === "enrolled" ? "approve_enrollment"
        : UPDATE_ENROLLMENT_STATUS_ACTION_KEY;

    const actionValidation = evaluateLifecycleActionRequirements(
        {
            ...ctx,
            surface: "opportunity_drawer",
            action_key: mappedActionKey,
            status_to: targetStatusKey,
        },
        { destination_key: input.destinationKey },
    );

    const currentCaseStatus =
        typeof record.status_key === "string" ? record.status_key : null;
    const scopedChild = ctx.related?.inquiry_children?.[0];
    const currentChildStatus =
        scopedChild && typeof scopedChild.outcome_status_key === "string"
            ? scopedChild.outcome_status_key
            : null;

    const tourBypassRequired = tourBypassRequiredForDestination(bpDestination, {
        destinationKey: input.destinationKey,
        currentCaseStatusKey: currentCaseStatus,
        currentChildStatusKey: currentChildStatus,
    });
    const skipBypassRequired = bypassReasonRequiredForSkippedStages(policy, skippedStages);
    const requiresBypassReason = tourBypassRequired || skipBypassRequired;

    const skippedStageWarnings = skippedStages.map((stage) =>
        makeRequirementViolation({
            entity_type: "opportunity",
            entity_id: input.scope.opportunityId,
            field_key: `skipped_stage_${stage.key}`,
            label: "Skipped stage",
            requirement_type: "recommended_non_blocking",
            blocking_level: "recommendation",
            missing_reason: stage.label,
        }),
    );

    const bypassViolations = [];
    if (requiresBypassReason && !input.bypassReason?.trim()) {
        bypassViolations.push(
            makeRequirementViolation({
                entity_type: "opportunity",
                entity_id: input.scope.opportunityId,
                field_key: "bypass_reason",
                label: "Reason for skipping requirements",
                requirement_type: "required_before_action",
                blocking_level: "hard_block",
                missing_reason:
                    skippedStageLabels.length > 0
                        ? `A reason is required when skipping: ${skippedStageLabels.join(", ")}.`
                        : "A reason is required when moving to Waitlist before tour completion (e.g. No space available).",
                context: { requirement_level: "required" },
            }),
        );
    }

    const validation = mergeRequirementValidationResults(
        buildRequirementValidationResult(destinationViolations),
        actionValidation,
        buildRequirementValidationResult(bypassViolations),
        buildRequirementValidationResult(skippedStageWarnings),
    );

    return {
        ok: validation.ok,
        targetStatusKey,
        validation,
        requiresBypassReason,
        destinationSource: bpResolved.destinationSource,
        skippedStageLabels,
    };
}
