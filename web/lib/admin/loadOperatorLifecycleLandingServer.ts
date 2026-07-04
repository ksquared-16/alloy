import "server-only";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { buildLifecycleCatalog } from "@/lib/lifecycle/lifecycleCatalog";
import {
    filterActiveWorkspaceDepartments,
    applyDepartmentAccessScope,
} from "@/lib/workspace/workspaceActiveDepartments";
import {
    buildOperatorLifecycleLandingCards,
    type OperatorLifecycleLandingCard,
    type OperatorLifecycleDepartmentRow,
    type OperatorLifecycleWorkUnitRow,
} from "@/lib/admin/buildOperatorLifecycleLanding";

const DEPARTMENT_COLUMNS =
    "id, org_id, key, name, description, sort_order, is_active, metadata, created_at, updated_at";
const WORK_UNIT_COLUMNS =
    "id, org_id, department_id, key, name, description, sort_order, is_active, queue_definition, metadata, created_at, updated_at";

/**
 * Server-side first-paint seed for the `/workspace` lifecycle landing (Operational Runtime
 * Doctrine Laws 1, 3, 5 — reveal once, no visible construction, one first-paint payload).
 *
 * Builds the SAME base cards the client loader builds (`buildOperatorLifecycleLandingCards`),
 * from the SAME inputs and the SAME access scoping the `/api/admin/{lifecycle-catalog,
 * departments,work-units}` routes apply — so the server seed and the client refetch are
 * shape-identical and merge in stable order without a reorder/flicker. Rollup counts
 * (`activeRecordCount`/`needsAttentionCount`) stay `null` here and patch in place on the
 * client (the allowed value-patch); the tile STRUCTURE is final at first paint.
 *
 * Purely additive: on any failure / no access this returns `[]`, so the client load path
 * (and therefore today's behavior + the runtime-flag rollback path) is unchanged.
 */
export async function loadOperatorLifecycleLandingCardsServer(): Promise<OperatorLifecycleLandingCard[]> {
    try {
        const gate = await loadAdminRouteGate();
        if (!gate.ok) return [];
        const dim = gate.dim;
        const supabase = createAdminClient();

        const restrictedAllowed =
            dim.departmentScope === "restricted" ? (dim.allowedDepartmentIds ?? []) : null;
        if (restrictedAllowed && restrictedAllowed.length === 0) return [];

        const [catalogEntries, departments, workUnits] = await Promise.all([
            buildLifecycleCatalog(supabase, gate.orgId, dim).catch(() => []),
            (async (): Promise<OperatorLifecycleDepartmentRow[]> => {
                let q = supabase
                    .from("departments")
                    .select(DEPARTMENT_COLUMNS)
                    .eq("org_id", gate.orgId)
                    .order("sort_order", { ascending: true })
                    .order("name", { ascending: true });
                if (restrictedAllowed) q = q.in("id", restrictedAllowed);
                const { data } = await q;
                const active = filterActiveWorkspaceDepartments(data ?? []);
                return applyDepartmentAccessScope(active, dim) as OperatorLifecycleDepartmentRow[];
            })().catch(() => [] as OperatorLifecycleDepartmentRow[]),
            (async (): Promise<OperatorLifecycleWorkUnitRow[]> => {
                // Defense-in-depth: only ACTIVE work units feed the operator landing, so an
                // inactive/archived unit can never surface a process card / work-view count.
                let q = supabase
                    .from("work_units")
                    .select(WORK_UNIT_COLUMNS)
                    .eq("org_id", gate.orgId)
                    .eq("is_active", true);
                if (restrictedAllowed) q = q.in("department_id", restrictedAllowed);
                const { data } = await q;
                return (data ?? []) as OperatorLifecycleWorkUnitRow[];
            })().catch(() => [] as OperatorLifecycleWorkUnitRow[]),
        ]);

        return buildOperatorLifecycleLandingCards({ catalogEntries, departments, workUnits });
    } catch {
        return [];
    }
}
