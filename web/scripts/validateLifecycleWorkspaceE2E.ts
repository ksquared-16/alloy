#!/usr/bin/env npx tsx
/**
 * Read-only/manual E2E audit against an existing lifecycle (no writes).
 * For simulation writes use simulatePreFixLifecycleE2E.ts (requires ALLOW_SIMULATION_WRITES=1).
 *
 * Env (optional):
 *   SIMULATION_ORG_ID or DEV_QUEUE_ORG_ID
 *   LIFECYCLE_E2E_USER_ID
 *   LIFECYCLE_E2E_DEPARTMENT_ID
 *   LIFECYCLE_E2E_PROCESS_ID
 */

import { config as loadEnv } from "dotenv";
import { getSimulationOrgId } from "./lib/lifecycleSimulationGuard";
import { isSimulationDepartmentRow } from "@/lib/lifecycle/lifecycleSimulationMarkers";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    lifecycleActivationFromMetadata,
    type LifecycleActivationV1,
} from "@/lib/lifecycle/lifecycleActivationConfig";
import { isActivationOwnedDepartmentMetadata } from "@/lib/lifecycle/lifecycleActivationOwned";
import { findProcessInDepartmentMetadata } from "@/lib/lifecycle/lifecycleCatalog";
import {
    refreshDepartmentScopeDimensions,
    resolveLifecycleDepartmentWorkspaceAccess,
} from "@/lib/lifecycle/ensureLifecycleDepartmentWorkspaceAccess";
import { repairLifecycleWorkspaceVisibility } from "@/lib/lifecycle/repairLifecycleWorkspaceVisibility";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import type { AdminAccessContextSuccess } from "@/lib/admin/getAdminAccessContext";
import { fetchWorkspaceActiveDepartments } from "@/lib/workspace/workspaceActiveDepartments";
import { filterActiveWorkspaceDepartments, applyDepartmentAccessScope } from "@/lib/workspace/workspaceActiveDepartments";
import { getWorkUnitQueueSummaries } from "@/lib/queues/QueueService";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });


function line() {
    console.log("=".repeat(88));
}

function step(n: number, label: string) {
    console.log(`\n[Step ${n}] ${label}`);
}

function pass(msg: string, detail?: unknown) {
    console.log(`  PASS: ${msg}`);
    if (detail != null) console.log("  ", detail);
}

function fail(msg: string, detail?: unknown): never {
    console.log(`  FAIL: ${msg}`);
    if (detail != null) console.log("  ", detail);
    process.exit(1);
}

async function buildDimForUser(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    userId: string
): Promise<AdminAccessScopeDimensions> {
    const { data: profile } = await supabase
        .from("user_access_profiles")
        .select("department_scope, site_scope")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .maybeSingle();

    let departmentScope: "all" | "restricted" = "all";
    let siteScope: "all" | "restricted" = "all";
    if (profile) {
        const ds = String((profile as { department_scope?: unknown }).department_scope ?? "").trim();
        const ss = String((profile as { site_scope?: unknown }).site_scope ?? "").trim();
        if (ds === "restricted") departmentScope = "restricted";
        if (ss === "restricted") siteScope = "restricted";
    }

    let allowedDepartmentIds: string[] = [];
    if (departmentScope === "restricted") {
        const { data: rows } = await supabase
            .from("user_department_access")
            .select("department_id")
            .eq("user_id", userId)
            .eq("org_id", orgId);
        allowedDepartmentIds = [...new Set((rows ?? []).map((r) => (r as { department_id: string }).department_id))];
    }

    let allowedSiteLocationIds: string[] = [];
    if (siteScope === "restricted") {
        const { data: siteRows } = await supabase
            .from("user_site_access")
            .select("location_id")
            .eq("user_id", userId)
            .eq("org_id", orgId);
        allowedSiteLocationIds = [...new Set((siteRows ?? []).map((r) => (r as { location_id: string }).location_id))];
    }

    return {
        departmentScope,
        allowedDepartmentIds,
        siteScope,
        allowedSiteLocationIds,
    };
}

type Candidate = {
    department_id: string;
    process_id: string;
    name: string;
    activation: LifecycleActivationV1;
};

async function main() {
    const orgId = getSimulationOrgId();
    const supabase = createAdminClient();

    line();
    console.log("Lifecycle workspace E2E validation (service role)");
    console.log({ orgId });

    const { data: depts, error: deptsErr } = await supabase
        .from("departments")
        .select("id, key, name, is_active, metadata")
        .eq("org_id", orgId);
    if (deptsErr) fail("departments query", deptsErr.message);

    const candidates: Candidate[] = [];
    for (const d of depts ?? []) {
        if (isSimulationDepartmentRow(d as { key: string; name: string; description?: string })) continue;
        const meta =
            d.metadata !== null && typeof d.metadata === "object" && !Array.isArray(d.metadata)
                ? (d.metadata as Record<string, unknown>)
                : {};
        const activation = lifecycleActivationFromMetadata(meta);
        const builderOwned =
            isActivationOwnedDepartmentMetadata(meta) || activation?.activation_owned === true;
        if (!builderOwned) continue;
        if (!activation?.process_id) continue;
        const process = findProcessInDepartmentMetadata(meta, activation.process_id);
        if (!process) continue;
        candidates.push({
            department_id: d.id as string,
            process_id: activation.process_id,
            name: (d.name as string) ?? activation.lifecycle_name,
            activation,
        });
    }

    if (!candidates.length) {
        fail("No builder-owned lifecycle departments in org", { orgId });
    }

    console.log(`Found ${candidates.length} builder-owned lifecycle department(s):`);
    for (const c of candidates) {
        console.log(`  - ${c.name} dept=${c.department_id} process=${c.process_id} wu=${c.activation.work_unit_id ?? "(none)"}`);
    }

    let departmentId = process.env.LIFECYCLE_E2E_DEPARTMENT_ID?.trim() ?? "";
    let processId = process.env.LIFECYCLE_E2E_PROCESS_ID?.trim() ?? "";
    let candidate = candidates.find((c) => c.department_id === departmentId && c.process_id === processId);
    if (!candidate) {
        candidate = candidates[0];
        departmentId = candidate.department_id;
        processId = candidate.process_id;
    }

    console.log("\nSelected target:", { departmentId, processId, name: candidate.name });

    let userId = process.env.LIFECYCLE_E2E_USER_ID?.trim() ?? "";
    if (!userId) {
        const { data: restrictedProfiles } = await supabase
            .from("user_access_profiles")
            .select("user_id, department_scope")
            .eq("org_id", orgId)
            .eq("department_scope", "restricted");
        const restrictedIds = (restrictedProfiles ?? []).map((p) => (p as { user_id: string }).user_id);
        if (restrictedIds.length) {
            const { data: admins } = await supabase
                .from("app_users")
                .select("id, auth_user_id, role")
                .eq("org_id", orgId)
                .in("role", ["admin", "ops"]);
            const adminAuthIds = new Set(
                (admins ?? [])
                    .map((a) => {
                        const row = a as { auth_user_id?: string | null; id?: string };
                        return row.auth_user_id ?? row.id ?? "";
                    })
                    .filter(Boolean)
            );
            userId = restrictedIds.find((id) => adminAuthIds.has(id)) ?? restrictedIds[0];
        }
    }
    if (!userId) {
        const { data: admins } = await supabase
            .from("app_users")
            .select("auth_user_id, id, role, email")
            .eq("org_id", orgId)
            .eq("role", "admin")
            .limit(1);
        const row = admins?.[0] as { auth_user_id?: string; id?: string; email?: string } | undefined;
        userId = row?.auth_user_id ?? row?.id ?? "";
        console.log("Using first org admin (no restricted profile found):", row?.email ?? userId);
    }

    if (!userId) fail("Could not resolve current user id — set LIFECYCLE_E2E_USER_ID");

    const { data: profileRow } = await supabase
        .from("user_access_profiles")
        .select("department_scope, site_scope")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .maybeSingle();

    const { data: appUser } = await supabase
        .from("app_users")
        .select("role, email")
        .eq("org_id", orgId)
        .or(`auth_user_id.eq.${userId},id.eq.${userId}`)
        .maybeSingle();

    console.log("\nCurrent user identity:", {
        user_id: userId,
        org_id: orgId,
        role: (appUser as { role?: string } | null)?.role ?? "(unknown)",
        email: (appUser as { email?: string } | null)?.email ?? null,
        department_scope: (profileRow as { department_scope?: string } | null)?.department_scope ?? "all (no profile)",
        site_scope: (profileRow as { site_scope?: string } | null)?.site_scope ?? "all",
    });

    const { data: deptRow } = await supabase
        .from("departments")
        .select("id, name, org_id, is_active, metadata")
        .eq("id", departmentId)
        .eq("org_id", orgId)
        .maybeSingle();

    step(0, "departments row (pre-repair)");
    if (!deptRow) fail("departments row missing", { departmentId, orgId });
    pass("departments row", {
        id: deptRow.id,
        name: deptRow.name,
        org_id: deptRow.org_id,
        is_active: deptRow.is_active,
        activation_owned: isActivationOwnedDepartmentMetadata(
            deptRow.metadata as Record<string, unknown>
        ),
    });

    let dim = await buildDimForUser(supabase, orgId, userId);
    const runtimeDeptId = departmentId;

    const accessBefore = await resolveLifecycleDepartmentWorkspaceAccess(
        supabase,
        orgId,
        userId,
        runtimeDeptId
    );
    console.log("\nPre-repair access state:", accessBefore);

    let repairedDeptId = departmentId;
    if (process.env.ALLOW_SIMULATION_WRITES === "1") {
        step(1, "Run Repair workspace visibility");
        const repairResult = await repairLifecycleWorkspaceVisibility(
            supabase,
            orgId,
            departmentId,
            processId,
            dim,
            userId
        );
        if (!repairResult.ok) {
            fail("repairLifecycleWorkspaceVisibility", { error: repairResult.error, actions: repairResult.actions });
        }
        pass("repair ok", { department_id: repairResult.department_id, actions: repairResult.actions });
        repairedDeptId = repairResult.department_id;
        if (dim.departmentScope === "restricted") {
            dim = await refreshDepartmentScopeDimensions(supabase, orgId, userId, dim);
        }
    } else {
        console.log("\n[Step 1] Skipped repair (read-only). Set ALLOW_SIMULATION_WRITES=1 to run repair.");
    }

    step(2, "user_department_access row");
    const { data: uda, error: udaErr } = await supabase
        .from("user_department_access")
        .select("id, user_id, org_id, department_id")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .eq("department_id", repairedDeptId)
        .maybeSingle();

    if (dim.departmentScope === "restricted") {
        if (udaErr) fail("user_department_access query", udaErr.message);
        if (!uda) {
            fail("user_department_access missing", {
                query: "user_department_access WHERE user_id, org_id, department_id",
                user_id: userId,
                org_id: orgId,
                department_id: repairedDeptId,
            });
        }
        pass("user_department_access exists", uda);
    } else {
        pass("department_scope=all — membership row not required", { note: "skipped strict UDA check" });
    }

    const accessAfter = await resolveLifecycleDepartmentWorkspaceAccess(
        supabase,
        orgId,
        userId,
        repairedDeptId
    );
    if (!accessAfter.membership_provisioned || !accessAfter.visible_in_departments_api) {
        fail("resolveLifecycleDepartmentWorkspaceAccess after repair", accessAfter);
    }
    pass("resolve access after repair", accessAfter);

    step(3, "GET /api/admin/departments equivalent");
    const { data: apiRows, error: apiErr } = await supabase
        .from("departments")
        .select("id, org_id, key, name, description, sort_order, is_active, metadata")
        .eq("org_id", orgId)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
    if (apiErr) fail("departments list query (API shape)", apiErr.message);

    let scoped = filterActiveWorkspaceDepartments(apiRows ?? []);
    if (dim.departmentScope === "restricted") {
        const allowed = dim.allowedDepartmentIds ?? [];
        if (!allowed.length) {
            fail("restricted scope with empty allowedDepartmentIds", { userId });
        }
        scoped = applyDepartmentAccessScope(scoped, dim);
    }
    const apiIds = scoped.map((d) => d.id);
    if (!apiIds.includes(repairedDeptId)) {
        fail("department not in scoped API list", {
            source: "GET /api/admin/departments filter chain",
            repairedDeptId,
            department_scope: dim.departmentScope,
            allowedDepartmentIds: dim.allowedDepartmentIds,
            apiIds,
        });
    }
    pass("exact department_id in API-scoped list", { repairedDeptId, apiCount: apiIds.length });

    step(4, "/adminV2/workspace tile (rendered list)");
    const tiles = await fetchWorkspaceActiveDepartments(supabase, orgId, dim);
    const tileIds = tiles.map((t) => t.id);
    if (!tileIds.includes(repairedDeptId)) {
        fail("workspace tile list missing department", {
            source: "fetchWorkspaceActiveDepartments + filterActiveWorkspaceDepartments",
            repairedDeptId,
            tileIds,
        });
    }
    const tile = tiles.find((t) => t.id === repairedDeptId);
    pass("workspace tile includes exact department_id", { id: tile?.id, name: tile?.name, key: tile?.key });

    step(5, "Department page — Work Unit Queue");
    const workUnitId = candidate.activation.work_unit_id?.trim() ?? "";
    const { data: wuRows, error: wuErr } = await supabase
        .from("work_units")
        .select("id, key, name, department_id, is_active")
        .eq("org_id", orgId)
        .eq("department_id", repairedDeptId);
    if (wuErr) fail("work_units for department", wuErr.message);

    if (!wuRows?.length) {
        fail("no work_units on department", {
            query: "work_units WHERE org_id AND department_id",
            department_id: repairedDeptId,
        });
    }
    pass("work_units on department", wuRows);

    const primaryWu =
        wuRows.find((w) => (w as { id: string }).id === workUnitId) ??
        wuRows.find((w) => String((w as { key?: string }).key ?? "").toLowerCase() === "enrollment_pipeline") ??
        wuRows[0];
    const primaryWuId = (primaryWu as { id: string }).id;

    if (workUnitId && primaryWuId !== workUnitId) {
        fail("activation work_unit_id not on department", {
            activation_work_unit_id: workUnitId,
            department_work_units: wuRows.map((w) => (w as { id: string }).id),
        });
    }

    step(6, "Work-unit page — queue summaries / records");
    try {
        const { queues: summaries } = await getWorkUnitQueueSummaries({
            orgId,
            workUnitId: primaryWuId,
            countAccuracy: "exact",
        });
        const total = summaries.reduce((n, s) => n + (s.count ?? 0), 0);
        pass("queue summaries loaded", {
            work_unit_id: primaryWuId,
            queue_count: summaries.length,
            total_records_across_queues: total,
            queues: summaries.map((s) => ({ key: s.key, count: s.count })),
        });
        if (summaries.length === 0) {
            fail("work unit has no queue definitions in summaries", { work_unit_id: primaryWuId });
        }
    } catch (e) {
        fail("getWorkUnitQueueSummaries", {
            work_unit_id: primaryWuId,
            error: e instanceof Error ? e.message : String(e),
        });
    }

    step(7, "Drawer Actions — action_definition + placements");
    const actionDefId = candidate.activation.action_definition_id?.trim() ?? "";
    const placementIds = candidate.activation.action_placement_ids ?? [];

    if (!actionDefId) {
        fail("activation has no action_definition_id", {
            source: "departments.metadata.lifecycle_activation_v1",
            department_id: repairedDeptId,
        });
    }

    const { data: actionDef, error: adErr } = await supabase
        .from("action_definitions")
        .select("id, key, label, is_active, org_id")
        .eq("id", actionDefId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (adErr || !actionDef) {
        fail("action_definitions row", { action_definition_id: actionDefId, error: adErr?.message });
    }
    pass("action definition exists", actionDef);

    const { data: placements, error: plErr } = await supabase
        .from("action_placements")
        .select("id, action_definition_id, surface, entity_type, is_active")
        .eq("org_id", orgId)
        .eq("action_definition_id", actionDefId);
    if (plErr) fail("action_placements query", plErr.message);

    const drawerPlacements = (placements ?? []).filter((p) => {
        const surface = String((p as { surface?: string }).surface ?? "").toLowerCase();
        return surface.includes("drawer") || surface === "record_drawer";
    });

    if (!placements?.length) {
        fail("no action_placements for definition", { action_definition_id: actionDefId });
    }

    if (placementIds.length) {
        const missing = placementIds.filter((id) => !(placements ?? []).some((p) => (p as { id: string }).id === id));
        if (missing.length) {
            fail("activation placement ids missing in DB", { missing, activation_placement_ids: placementIds });
        }
    }

    pass("action placements for drawer", {
        total_placements: placements?.length,
        drawer_like: drawerPlacements.length,
        placement_ids_in_activation: placementIds,
    });

    line();
    console.log("\nALL STEPS PASSED");
    console.log({
        runtime_department_id: repairedDeptId,
        user_id: userId,
        work_unit_id: primaryWuId,
        action_definition_id: actionDefId,
    });
    line();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
