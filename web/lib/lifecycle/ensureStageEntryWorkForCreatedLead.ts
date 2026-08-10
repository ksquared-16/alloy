/**
 * After Create Lead persists a new opportunity in its entry stage, spawn the
 * destination stage's configured primary work (e.g. Contact Family on Lead).
 *
 * Uses the existing stage-entry spawn seam — does not invent work when the
 * published plan has no entry template.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { DOMAIN_LIFECYCLE_SYSTEM_ACTOR_USER_ID } from "@/lib/lifecycle/emitDomainLifecycleStatusChangedEvent";
import { resolveEnrollmentDepartmentForOpportunity } from "@/lib/lifecycle/resolveStageWorkOutcomeContext";
import {
    spawnDestinationStageEntryWork,
    type SpawnDestinationStageEntryWorkResult,
} from "@/lib/lifecycle/spawnDestinationStageEntryWork";

function trimOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

export async function ensureStageEntryWorkForCreatedLead(params: {
    supabase: SupabaseClient;
    orgId: string;
    userId?: string | null;
    opportunityId: string;
    /** Durable stage already written on the opportunity (Create Lead writes `lead`). */
    stageKey: string;
    departmentId?: string | null;
    now?: Date;
}): Promise<SpawnDestinationStageEntryWorkResult> {
    const opportunityId = params.opportunityId.trim();
    const orgId = params.orgId.trim();
    const stageKey = params.stageKey.trim();
    if (!opportunityId || !orgId || !stageKey) {
        return { action: "skipped", reason: "missing_scope" };
    }

    const departmentId =
        trimOrNull(params.departmentId) ??
        (await resolveEnrollmentDepartmentForOpportunity({
            supabase: params.supabase,
            orgId,
            opportunityId,
        }));
    if (!departmentId) {
        return { action: "skipped", reason: "no_enrollment_department", stage_key: stageKey };
    }

    const { data: dept, error: deptErr } = await params.supabase
        .from("departments")
        .select("metadata")
        .eq("id", departmentId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (deptErr || !dept) {
        return { action: "skipped", reason: "department_load_failed", stage_key: stageKey };
    }

    const departmentMetadata =
        dept.metadata != null && typeof dept.metadata === "object" && !Array.isArray(dept.metadata)
            ? (dept.metadata as Record<string, unknown>)
            : {};

    return spawnDestinationStageEntryWork({
        supabase: params.supabase,
        orgId,
        userId: trimOrNull(params.userId) ?? DOMAIN_LIFECYCLE_SYSTEM_ACTOR_USER_ID,
        opportunityId,
        departmentId,
        destinationStageKey: stageKey,
        departmentMetadata,
        now: params.now,
    });
}
