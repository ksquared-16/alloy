/**
 * Server front door for a CONFIGURED transition reference.
 *
 * An operator surface holds a configured ref — the `transition_ref` (or outcome key) a tenant authored
 * into its stage operating plan. It does not hold, and must not choose, a typed canonical destination.
 * This resolves one into the other on the server, so configuration expresses intent and code keeps
 * executable semantics.
 *
 * It composes existing authority and adds none of its own:
 *
 *   department for the opportunity  → `resolveEnrollmentDepartmentForOpportunity`
 *   the tenant's process config     → that department's metadata
 *   the subject's current stage     → `resolveBuilderStageKeyForStatus`
 *   that stage's operating plan     → `resolveEffectiveStageOperatingPlan`
 *   ref → typed destination         → `resolveConfiguredTransitionRef`
 *
 * Every refusal is fail-closed, and the reasons are distinguishable so a caller can tell a
 * misconfigured tenant from a bad request.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    resolveBuilderStageKeyForStatus,
} from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionBpResolver";
import type { EnrollmentStatusDestinationKey } from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionContract";
import {
    resolveConfiguredTransitionRef,
    type ConfiguredTransitionRefFailure,
} from "@/lib/admin/enrollmentStatus/resolveConfiguredTransitionRef";
import { resolveEnrollmentDepartmentForOpportunity } from "@/lib/lifecycle/resolveStageWorkOutcomeContext";
import { resolveEffectiveStageOperatingPlan } from "@/lib/lifecycle/resolveEffectiveStageOperatingPlan";
import {
    activeLifecycleProcess,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";

export type TransitionRefResolutionFailure =
    | ConfiguredTransitionRefFailure
    /** The opportunity does not exist, or carries no status to resolve a current stage from. */
    | "subject_unresolved"
    /** No enrollment department, so the tenant has no process configuration to resolve against. */
    | "process_unconfigured"
    /** The subject's current status maps to no configured stage. */
    | "current_stage_unresolved";

export type TransitionRefResolution =
    | {
          ok: true;
          destinationKey: EnrollmentStatusDestinationKey;
          targetStatusKey: string | null;
          currentStageKey: string;
          outcomeKey: string | null;
      }
    | { ok: false; reason: TransitionRefResolutionFailure };

async function loadDepartmentMetadata(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string,
): Promise<Record<string, unknown> | null> {
    const { data } = await supabase
        .from("departments")
        .select("metadata")
        .eq("id", departmentId)
        .eq("org_id", orgId)
        .maybeSingle();
    const md = (data as { metadata?: unknown } | null)?.metadata;
    return md != null && typeof md === "object" && !Array.isArray(md) ? (md as Record<string, unknown>) : null;
}

export async function resolveTransitionRefForOpportunity(params: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    /** The configured `transition_ref` or outcome key the operator surface holds. */
    ref: string;
}): Promise<TransitionRefResolution> {
    const orgId = params.orgId.trim();
    const opportunityId = params.opportunityId.trim();
    const ref = params.ref.trim();
    if (!orgId || !opportunityId || !ref) return { ok: false, reason: "unknown_ref" };

    const { data: row } = await params.supabase
        .from("opportunities")
        .select("status_key")
        .eq("id", opportunityId)
        .eq("org_id", orgId)
        .maybeSingle();
    const currentStatusKey = (row as { status_key?: string | null } | null)?.status_key ?? null;
    if (!currentStatusKey) return { ok: false, reason: "subject_unresolved" };

    const departmentId = await resolveEnrollmentDepartmentForOpportunity({
        supabase: params.supabase,
        opportunityId,
        orgId,
    });
    if (!departmentId) return { ok: false, reason: "process_unconfigured" };

    const departmentMetadata = await loadDepartmentMetadata(params.supabase, orgId, departmentId);
    if (!departmentMetadata) return { ok: false, reason: "process_unconfigured" };

    const currentStageKey = resolveBuilderStageKeyForStatus({
        departmentMetadata,
        statusKey: currentStatusKey,
    });
    if (!currentStageKey) return { ok: false, reason: "current_stage_unresolved" };

    const { plan } = resolveEffectiveStageOperatingPlan({
        departmentMetadata,
        builderStageKey: currentStageKey,
    });

    const builder = lifecycleBuilderFromDepartmentMetadata(departmentMetadata);
    const process = activeLifecycleProcess(builder);
    const processStages = (process?.stages ?? []).map((s) => ({ key: s.key, label: s.label }));

    const resolved = resolveConfiguredTransitionRef({
        ref,
        currentStageKey,
        stageOperatingPlan: plan,
        processTracks: process ?? null,
        processStages,
    });
    if (!resolved.ok) return { ok: false, reason: resolved.reason };

    return {
        ok: true,
        destinationKey: resolved.destinationKey,
        targetStatusKey: resolved.targetStatusKey,
        currentStageKey,
        outcomeKey: resolved.outcomeKey,
    };
}
