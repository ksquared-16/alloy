/**
 * Builder-owned lifecycle teardown — does not touch demo Enrollment unless owned.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    LIFECYCLE_ACTIVATION_METADATA_KEY,
    lifecycleActivationFromMetadata,
    type LifecycleActivationV1,
} from "@/lib/lifecycle/lifecycleActivationConfig";
import {
    isLifecycleBuilderOwnedDepartmentMetadata,
    LIFECYCLE_ACTIVATION_OWNED_DEPT_FLAG,
    LIFECYCLE_BUILDER_OWNED_METADATA_KEY,
} from "@/lib/lifecycle/lifecycleBuilderOwned";

export {
    LIFECYCLE_ACTIVATION_OWNED_DEPT_FLAG,
    activationOwnedDepartmentMetadata,
    isLifecycleBuilderOwnedDepartmentMetadata,
    isLifecycleBuilderOwnedDepartmentMetadata as isActivationOwnedDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderOwned";

export function canDeleteActivationLifecycle(metadata: unknown, activation: LifecycleActivationV1 | null): boolean {
    if (isLifecycleBuilderOwnedDepartmentMetadata(metadata)) return true;
    return activation?.activation_owned === true;
}

export async function deactivateBuilderOwnedWorkUnit(
    supabase: SupabaseClient,
    orgId: string,
    workUnitId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
    const { data: wu, error: fetchErr } = await supabase
        .from("work_units")
        .select("id, department_id")
        .eq("id", workUnitId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (fetchErr) return { ok: false, error: fetchErr.message };
    if (!wu) return { ok: false, error: "Work unit not found" };

    const { data: dept } = await supabase
        .from("departments")
        .select("metadata")
        .eq("id", (wu as { department_id: string }).department_id)
        .eq("org_id", orgId)
        .maybeSingle();
    if (!isLifecycleBuilderOwnedDepartmentMetadata(dept?.metadata)) {
        return { ok: false, error: "Only builder-owned Work Unit Queues can be removed here." };
    }

    const { error } = await supabase
        .from("work_units")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", workUnitId)
        .eq("org_id", orgId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
}

export async function deleteActivationLifecycleForDepartment(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
    const { data: dept, error: deptErr } = await supabase
        .from("departments")
        .select("id, metadata")
        .eq("id", departmentId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (deptErr) return { ok: false, error: deptErr.message };
    if (!dept) return { ok: false, error: "Department not found" };

    const metadata =
        dept.metadata !== null && typeof dept.metadata === "object" && !Array.isArray(dept.metadata)
            ? (dept.metadata as Record<string, unknown>)
            : {};
    const activation = lifecycleActivationFromMetadata(metadata);
    if (!canDeleteActivationLifecycle(metadata, activation)) {
        return {
            ok: false,
            error: "This department is not an activation-owned lifecycle. Demo Enrollment config was not created by this flow and cannot be deleted here.",
        };
    }

    if (activation?.work_unit_id) {
        await deactivateBuilderOwnedWorkUnit(supabase, orgId, activation.work_unit_id);
    }

    const placementRowIds = (activation?.action_placement_ids ?? [])
        .map((pid) => String(pid ?? "").trim())
        .filter(Boolean);
    if (placementRowIds.length > 0) {
        await supabase
            .from("action_placements")
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq("org_id", orgId)
            .in("id", placementRowIds);
    }
    if (activation?.action_definition_id) {
        await supabase
            .from("action_placements")
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq("org_id", orgId)
            .eq("action_definition_id", activation.action_definition_id);
    }

    await supabase.from("user_department_access").delete().eq("org_id", orgId).eq("department_id", departmentId);

    const nextMeta = { ...metadata };
    delete nextMeta[LIFECYCLE_ACTIVATION_METADATA_KEY];
    delete nextMeta[LIFECYCLE_BUILDER_METADATA_KEY];
    delete nextMeta[LIFECYCLE_ACTIVATION_OWNED_DEPT_FLAG];
    delete nextMeta[LIFECYCLE_BUILDER_OWNED_METADATA_KEY];

    if (isLifecycleBuilderOwnedDepartmentMetadata(metadata)) {
        const { error: delErr } = await supabase.from("departments").delete().eq("id", departmentId).eq("org_id", orgId);
        if (delErr) return { ok: false, error: delErr.message };
        return { ok: true };
    }

    const { error: updErr } = await supabase
        .from("departments")
        .update({ metadata: nextMeta, updated_at: new Date().toISOString() })
        .eq("id", departmentId)
        .eq("org_id", orgId);
    if (updErr) return { ok: false, error: updErr.message };
    return { ok: true };
}
