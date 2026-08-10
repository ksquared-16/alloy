import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { departmentIdAllowed } from "@/lib/admin/accessScope";
import {
    activeStagesForProcess,
    lifecycleBuilderFromDepartmentMetadata,
    lifecycleWorkspaceTileDescription,
    mergeLifecycleBuilderIntoMetadata,
    slugifyLifecycleKey,
    type LifecycleBuilderV1,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    lifecycleActivationFromMetadata,
    mergeLifecycleActivationIntoMetadata,
    type LifecycleActivationV1,
} from "@/lib/lifecycle/lifecycleActivationConfig";
import {
    buildLifecycleBuilderOwnedMetadata,
    isLifecycleBuilderOwnedDepartmentMetadata,
    lifecycleBuilderOwnedFromMetadata,
    mergeLifecycleBuilderOwnedIntoMetadata,
} from "@/lib/lifecycle/lifecycleBuilderOwned";
import { findProcessInDepartmentMetadata } from "@/lib/lifecycle/lifecycleCatalog";
import {
    ensureLifecycleDepartmentWorkspaceAccess,
    refreshDepartmentScopeDimensions,
} from "@/lib/lifecycle/ensureLifecycleDepartmentWorkspaceAccess";
import { fetchWorkspaceActiveDepartments } from "@/lib/workspace/workspaceActiveDepartments";

export type RepairWorkspaceVisibilityResult =
    | { ok: true; department_id: string; actions: string[] }
    | { ok: false; error: string; actions?: string[] };

export async function repairLifecycleWorkspaceVisibility(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string,
    processId: string,
    dim: AdminAccessScopeDimensions,
    currentUserId?: string | null
): Promise<RepairWorkspaceVisibilityResult> {
    const actions: string[] = [];

    const { data: dept, error: deptErr } = await supabase
        .from("departments")
        .select("id, key, name, is_active, metadata")
        .eq("id", departmentId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (deptErr) return { ok: false, error: deptErr.message };
    if (!dept) return { ok: false, error: "Department not found" };

    const process = findProcessInDepartmentMetadata(dept.metadata, processId);
    if (!process) return { ok: false, error: "Lifecycle process not found on department" };

    const lifecycleName = process.name.trim();
    const metadata =
        dept.metadata !== null && typeof dept.metadata === "object" && !Array.isArray(dept.metadata)
            ? (dept.metadata as Record<string, unknown>)
            : {};
    const activationOwned = isLifecycleBuilderOwnedDepartmentMetadata(metadata);
    let workingDim = dim;
    if (currentUserId?.trim()) {
        const ensureAccess = await ensureLifecycleDepartmentWorkspaceAccess({
            supabase,
            orgId,
            departmentId,
            currentUserId: currentUserId.trim(),
        });
        if (!ensureAccess.ok) {
            return { ok: false, error: ensureAccess.error, actions };
        }
        if (ensureAccess.department_scope === "restricted") {
            workingDim = await refreshDepartmentScopeDimensions(
                supabase,
                orgId,
                currentUserId.trim(),
                workingDim
            );
        }
    }

    const scoped = await fetchWorkspaceActiveDepartments(supabase, orgId, workingDim);
    const tile = scoped.find((d) => d.id === departmentId);
    const userHasAccess = departmentIdAllowed(workingDim, departmentId);
    const nameMatches =
        tile?.name.trim().toLowerCase() === lifecycleName.toLowerCase() ||
        (dept as { name: string }).name.trim().toLowerCase() === lifecycleName.toLowerCase();

    if (
        tile &&
        userHasAccess &&
        (dept as { is_active?: boolean }).is_active !== false &&
        (!activationOwned || nameMatches)
    ) {
        actions.push("already_visible_in_workspace_api");
        return { ok: true, department_id: departmentId, actions };
    }

    if (!userHasAccess) {
        return {
            ok: false,
            error: "This department is outside your workspace access scope. user_department_access was not provisioned — check Users & Roles department_scope.",
            actions,
        };
    }

    let targetDeptId = departmentId;

    if (activationOwned) {
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if ((dept as { is_active?: boolean }).is_active === false) {
            updates.is_active = true;
            actions.push("activated_department");
        }
        if (!nameMatches && lifecycleName) {
            updates.name = lifecycleName;
            actions.push("renamed_department_to_lifecycle_name");
        }
        let nextMeta = { ...metadata };
        if (!lifecycleBuilderOwnedFromMetadata(nextMeta) && currentUserId?.trim()) {
            nextMeta = mergeLifecycleBuilderOwnedIntoMetadata(nextMeta, {
                created_by: currentUserId.trim(),
                process_id: processId,
            });
            actions.push("migrated_builder_owned_marker");
        }
        const activation = lifecycleActivationFromMetadata(metadata);
        if (activation) {
            mergeLifecycleActivationIntoMetadata(nextMeta, {
                ...activation,
                lifecycle_name: lifecycleName,
                activation_owned: true,
            });
            actions.push("synced_activation_metadata");
        }
        updates.metadata = nextMeta;
        const { error: updErr } = await supabase
            .from("departments")
            .update(updates)
            .eq("id", departmentId)
            .eq("org_id", orgId);
        if (updErr) return { ok: false, error: updErr.message, actions };
        actions.push("updated_builder_owned_department");
        return { ok: true, department_id: departmentId, actions };
    }

    const deptKey = slugifyLifecycleKey(lifecycleName);
    const { data: existingByKey } = await supabase
        .from("departments")
        .select("id, metadata")
        .eq("org_id", orgId)
        .eq("key", deptKey)
        .maybeSingle();

    if (existingByKey?.id) {
        targetDeptId = existingByKey.id as string;
        actions.push("reused_department_by_key");
    } else {
        const now = new Date().toISOString();
        const builderConfig: LifecycleBuilderV1 = {
            version: 1,
            active_process_id: process.id,
            processes: [{ ...process, stages: activeStagesForProcess(process) }],
        };
        const oldActivation = lifecycleActivationFromMetadata(metadata);
        const activation: LifecycleActivationV1 = oldActivation
            ? {
                  ...oldActivation,
                  lifecycle_name: lifecycleName,
                  process_id: process.id,
                  activation_owned: true,
              }
            : {
                  version: 1,
                  lifecycle_name: lifecycleName,
                  primary_entity: "opportunity",
                  primary_record_label: "Lead",
                  process_id: process.id,
                  stage_key: "",
                  stage_label: "",
                  work_unit_id: null,
                  work_unit_name: null,
                  status_keys: [],
                  status_labels: [],
                  action_definition_id: null,
                  action_placement_ids: [],
                  activation_owned: true,
                  completed_steps: 0,
                  updated_at: now,
              };

        let nextMeta = buildLifecycleBuilderOwnedMetadata({
            created_by: currentUserId?.trim() || "repair",
            process_id: process.id,
        });
        nextMeta = mergeLifecycleBuilderIntoMetadata(nextMeta, builderConfig);
        nextMeta = mergeLifecycleActivationIntoMetadata(nextMeta, activation);

        const { data: created, error: insErr } = await supabase
            .from("departments")
            .insert({
                org_id: orgId,
                key: deptKey,
                name: lifecycleName,
                description: lifecycleWorkspaceTileDescription(process.description, lifecycleName),
                is_active: true,
                metadata: nextMeta,
                updated_at: now,
            })
            .select("id")
            .single();
        if (insErr) return { ok: false, error: insErr.message, actions };
        targetDeptId = (created as { id: string }).id;
        actions.push("created_dedicated_department");
    }

    const { data: targetDept } = await supabase
        .from("departments")
        .select("id, name, is_active, metadata")
        .eq("id", targetDeptId)
        .eq("org_id", orgId)
        .maybeSingle();

    if (targetDept && (targetDept as { is_active?: boolean }).is_active === false) {
        await supabase
            .from("departments")
            .update({ is_active: true, name: lifecycleName, updated_at: new Date().toISOString() })
            .eq("id", targetDeptId)
            .eq("org_id", orgId);
        actions.push("activated_target_department");
    }

    if (targetDeptId !== departmentId && currentUserId?.trim()) {
        const ensureTarget = await ensureLifecycleDepartmentWorkspaceAccess({
            supabase,
            orgId,
            departmentId: targetDeptId,
            currentUserId: currentUserId.trim(),
        });
        if (!ensureTarget.ok) {
            return { ok: false, error: ensureTarget.error, actions };
        }
        workingDim = await refreshDepartmentScopeDimensions(
            supabase,
            orgId,
            currentUserId.trim(),
            workingDim
        );
    }

    const after = await fetchWorkspaceActiveDepartments(supabase, orgId, workingDim);
    if (!after.some((d) => d.id === targetDeptId)) {
        return {
            ok: false,
            error:
                "Repair ran but department still missing from workspace API list. If department_scope is restricted, user_department_access must include this department.",
            actions,
        };
    }

    actions.push("verified_in_workspace_api");
    return { ok: true, department_id: targetDeptId, actions };
}
