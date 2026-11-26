/**
 * Which department owns Create Lead entry when the calling surface cannot name one.
 *
 * Workspace-level surfaces ("All locations", the actions rail, slash Create Lead) have no
 * department in hand. They were sending the first lifecycle card's department — a sort-order
 * artifact, not operator intent — which is correct only in a single-department org.
 *
 * Configuration is the authority instead: a department can host Create Lead only when its
 * builder-owned lifecycle resolves an entry work unit. Exactly one candidate is implied (the
 * same rule Location follows); more than one is a real ambiguity the operator must settle, and
 * is never guessed.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import {
    departmentUsesCreateLeadEntryBinding,
    resolveBuilderOwnedLifecycleCreateLeadBinding,
} from "@/lib/lifecycle/lifecycleCreateLeadEntryBinding";
import {
    applyDepartmentAccessScope,
    filterActiveWorkspaceDepartments,
} from "@/lib/workspace/workspaceActiveDepartments";

export type CreateLeadEntryDepartmentCandidate = {
    departmentId: string;
    workUnitId: string | null;
};

export type CreateLeadEntryDepartmentResolution =
    | { state: "resolved"; departmentId: string; workUnitId: string }
    | { state: "none" }
    | { state: "ambiguous"; departmentIds: string[] };

/** Pure selection over already-resolved candidates — implied only when unambiguous. */
export function selectCreateLeadEntryDepartment(
    candidates: readonly CreateLeadEntryDepartmentCandidate[]
): CreateLeadEntryDepartmentResolution {
    const capable = candidates.filter(
        (c): c is { departmentId: string; workUnitId: string } =>
            Boolean(c.departmentId.trim()) && Boolean(c.workUnitId?.trim())
    );
    if (capable.length === 1) {
        return {
            state: "resolved",
            departmentId: capable[0]!.departmentId,
            workUnitId: capable[0]!.workUnitId,
        };
    }
    if (capable.length === 0) return { state: "none" };
    return { state: "ambiguous", departmentIds: capable.map((c) => c.departmentId) };
}

/**
 * Resolve the create-lead entry department for an org, honouring the caller's department
 * access scope so a restricted operator can never be routed into a department they cannot see.
 */
export async function resolveCreateLeadEntryDepartmentForOrg(
    supabase: SupabaseClient,
    orgId: string,
    accessScope?: AdminAccessScopeDimensions | null
): Promise<CreateLeadEntryDepartmentResolution> {
    const { data, error } = await supabase
        .from("departments")
        .select("id, is_active, metadata")
        .eq("org_id", orgId);
    if (error) throw new Error(error.message);

    const active = filterActiveWorkspaceDepartments(
        (data ?? []) as Array<{ id: string; is_active?: boolean | null; metadata: unknown }>
    );
    const scoped = accessScope ? applyDepartmentAccessScope(active, accessScope) : active;
    const builderOwned = scoped.filter((row) => departmentUsesCreateLeadEntryBinding(row.metadata));

    const candidates = await Promise.all(
        builderOwned.map(async (row) => {
            const binding = await resolveBuilderOwnedLifecycleCreateLeadBinding(
                supabase,
                orgId,
                row.id,
                row.metadata
            );
            return { departmentId: row.id, workUnitId: binding.work_unit_id };
        })
    );

    return selectCreateLeadEntryDepartment(candidates);
}
