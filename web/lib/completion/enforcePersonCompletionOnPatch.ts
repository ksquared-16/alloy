import type { SupabaseClient } from "@supabase/supabase-js";
import {
    customerPersonRowIsHouseholdPrimaryContact,
    resolveCustomerHouseholdPrimaryContactPersonId,
} from "@/lib/admin/person/householdPrimaryContact";
import { resolvePersonDrawerProfile } from "@/lib/admin/person/resolvePersonDrawerProfile";
import { isPersonEmployeePlacementOnlyPatch } from "@/lib/admin/personEmployeePlacementFields";
import { evaluateCompletionRequirements } from "@/lib/completion/evaluateCompletionRequirements";
import { evaluatePersonCompletionRequirements } from "@/lib/completion/evaluatePersonCompletionRequirements";
import type { CompletionEvaluationContext } from "@/lib/completion/requirementValidationTypes";
import { formatRequirementValidationSummary } from "@/lib/completion/requirementValidationResult";
import type { RequirementValidationResult } from "@/lib/completion/requirementValidationTypes";
import { COMPLETION_REQUIREMENT_VALIDATION_ERROR } from "@/lib/completion/requirementValidationTypes";
import { validateStatusTransition } from "@/lib/admin/statusTransitionRules";
import { makeRequirementViolation } from "@/lib/completion/requirementValidationResult";
import { buildRequirementValidationResult } from "@/lib/completion/requirementValidationResult";

export type ValidateStatusTransitionStructuredInput = Parameters<typeof validateStatusTransition>[0];

/**
 * Bridge legacy `status_transition_rules` into structured completion output.
 * Complements field-policy rules — does not replace them.
 */
export async function validateStatusTransitionStructured(
    input: ValidateStatusTransitionStructuredInput
): Promise<RequirementValidationResult> {
    const legacy = await validateStatusTransition(input);
    if (legacy.ok) return buildRequirementValidationResult([]);

    const entityId = String(input.entityId ?? "").trim() || "unknown";
    const entityType = String(input.entityType ?? "opportunities");

    return buildRequirementValidationResult([
        makeRequirementViolation({
            entity_type: entityType,
            entity_id: entityId,
            label: "Status transition",
            requirement_type: "required_before_status_transition",
            blocking_level: "hard_block",
            missing_reason: legacy.message,
            context: {
                status_from: input.fromStatusKey ?? undefined,
                status_to: input.toStatusKey,
                action_key: input.actionKey ?? undefined,
            },
        }),
    ]);
}

/** BOS-readable payload for operational assist / transition denial copy. */
export type BosCompletionRequirementPayload = {
    ok: boolean;
    summary: string;
    blocking_labels: string[];
    warnings_labels: string[];
    recommendations_labels: string[];
    result: RequirementValidationResult;
    readiness?: import("@/lib/completion/readinessTypes").ReadinessResult;
};

export function toBosCompletionRequirementPayload(
    result: RequirementValidationResult
): BosCompletionRequirementPayload {
    return {
        ok: result.ok,
        summary: formatRequirementValidationSummary(result),
        blocking_labels: result.blocking.map((v) => v.label),
        warnings_labels: result.warnings.map((v) => v.label),
        recommendations_labels: result.recommendations.map((v) => v.label),
        result,
    };
}

export type EnforcePersonCompletionOnPatchInput = {
    supabase: SupabaseClient;
    orgId: string;
    personId: string;
    body: Record<string, unknown>;
    existing: Record<string, unknown>;
    phase?: "save" | "status_change";
    status_to?: string | null;
};

export type EnforcePersonCompletionOnPatchResult =
    | { ok: true; validation: RequirementValidationResult }
    | { ok: false; validation: RequirementValidationResult; message: string };

/**
 * Server-side person PATCH completion guardrails.
 * Blocks only on hard_block violations; warnings pass through.
 */
export async function enforcePersonCompletionOnPatch(
    input: EnforcePersonCompletionOnPatchInput
): Promise<EnforcePersonCompletionOnPatchResult> {
    const merged: Record<string, unknown> = { ...input.existing, ...input.body };

    const { data: customerPersons } = await input.supabase
        .from("customer_persons")
        .select("customer_id, role_type, is_primary, person_id")
        .eq("org_id", input.orgId)
        .eq("person_id", input.personId);

    const cpRows = (customerPersons ?? []) as Array<{
        customer_id?: string | null;
        role_type?: string | null;
        is_primary?: boolean | null;
    }>;

    const customerId = cpRows.map((r) => r.customer_id).find((id) => id != null) ?? null;

    let household_guardian_count: number | undefined;
    let household_has_primary_contact: boolean | undefined;

    if (customerId) {
        const { data: guardians } = await input.supabase
            .from("customer_persons")
            .select("person_id, role_type, is_primary")
            .eq("org_id", input.orgId)
            .eq("customer_id", customerId);

        const gRows = (guardians ?? []) as Array<{
            role_type?: string | null;
            is_primary?: boolean | null;
        }>;
        household_guardian_count = gRows.length;
        household_has_primary_contact =
            gRows.some((r) => customerPersonRowIsHouseholdPrimaryContact(r)) ||
            (await resolveCustomerHouseholdPrimaryContactPersonId(
                input.supabase,
                input.orgId,
                customerId
            )) != null;
    }

    const { data: members } = await input.supabase
        .from("customer_members")
        .select("relationship, person_id")
        .eq("org_id", input.orgId)
        .eq("person_id", input.personId);

    const profile = resolvePersonDrawerProfile({
        person_id: input.personId,
        is_employee: merged.is_employee as boolean | null | undefined,
        customer_persons: cpRows,
        customer_members: (members ?? []) as Array<{ relationship?: string | null }>,
    });

    const ctx: CompletionEvaluationContext = {
        phase: input.phase ?? (input.status_to ? "status_change" : "save"),
        org_id: input.orgId,
        entity_type: "person",
        entity_id: input.personId,
        surface: "person_drawer",
        status_to: input.status_to,
        profile_keys: profile.profiles,
        values: merged,
        related: {
            customer_id: customerId,
            customer_persons: cpRows,
            customer_members: (members ?? []) as Array<{ relationship?: string | null }>,
            household_guardian_count,
            household_has_primary_contact,
        },
    };

    const validation = evaluateCompletionRequirements(ctx);
    const personOnly = evaluatePersonCompletionRequirements(ctx);

    if (isPersonEmployeePlacementOnlyPatch(input.body)) {
        if (personOnly.ok) return { ok: true, validation: personOnly };
        return {
            ok: false,
            validation: personOnly,
            message: formatRequirementValidationSummary(personOnly) || COMPLETION_REQUIREMENT_VALIDATION_ERROR,
        };
    }

    if (validation.ok) return { ok: true, validation };

    return {
        ok: false,
        validation,
        message: formatRequirementValidationSummary(validation) || COMPLETION_REQUIREMENT_VALIDATION_ERROR,
    };
}

export { COMPLETION_REQUIREMENT_VALIDATION_ERROR };
