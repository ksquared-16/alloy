#!/usr/bin/env npx tsx
/**
 * Simulates "builder-owned lifecycle created before access fix" then runs repair + 7-step validation.
 *
 * Requires:
 *   ALLOW_SIMULATION_WRITES=1
 *   SIMULATION_ORG_ID=<uuid>   (do not use production org)
 *
 * Cleanup after run:
 *   CONFIRM_SIMULATION_CLEANUP=1 SIMULATION_ORG_ID=<uuid> npx tsx scripts/cleanupLifecycleSimulationDepartments.ts
 */

import { randomUUID } from "crypto";
import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { simulationLifecycleDisplayName } from "@/lib/lifecycle/lifecycleSimulationMarkers";
import { requireSimulationWrites } from "./lib/lifecycleSimulationGuard";
import {
    buildLifecycleBuilderOwnedMetadata,
    isLifecycleBuilderOwnedDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderOwned";
import {
    activeStagesForProcess,
    mergeLifecycleBuilderIntoMetadata,
    slugifyLifecycleKey,
    type LifecycleBuilderV1,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { LifecycleActivationV1 } from "@/lib/lifecycle/lifecycleActivationConfig";
import {
    lifecycleActivationFromMetadata,
    mergeLifecycleActivationIntoMetadata,
} from "@/lib/lifecycle/lifecycleActivationConfig";
import { findProcessInDepartmentMetadata } from "@/lib/lifecycle/lifecycleCatalog";
import {
    refreshDepartmentScopeDimensions,
    resolveLifecycleDepartmentWorkspaceAccess,
} from "@/lib/lifecycle/ensureLifecycleDepartmentWorkspaceAccess";
import { repairLifecycleWorkspaceVisibility } from "@/lib/lifecycle/repairLifecycleWorkspaceVisibility";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import {
    applyDepartmentAccessScope,
    fetchWorkspaceActiveDepartments,
    filterActiveWorkspaceDepartments,
} from "@/lib/workspace/workspaceActiveDepartments";

loadEnv({ path: resolve(process.cwd(), ".env.local") });

const ORG_ID = requireSimulationWrites("simulatePreFixLifecycleE2E");
const RESTRICTED_USER = (process.env.LIFECYCLE_E2E_USER_ID ?? "ef27a325-56ba-458e-b419-7e63e112c989").trim();
const ENROLLMENT_DEPT = "04958a78-32ca-4091-bcd3-4bbaef3fee4b";
const SOURCE_PROCESS = "b9fb54b6-0d6b-4b4a-a0d4-6246400382f6";
const SOURCE_WU = "5ba90557-876d-4450-9c28-36beac6e83be";
const LIFECYCLE_NAME = simulationLifecycleDisplayName("E2E Admissions (pre-fix sim)");

function fail(step: string, detail: unknown): never {
    console.error(`\n>>> STOP — Step failed: ${step}`);
    console.error(detail);
    process.exit(1);
}

async function buildDim(
    supabase: ReturnType<typeof createAdminClient>,
    userId: string
): Promise<AdminAccessScopeDimensions> {
    const { data: profile } = await supabase
        .from("user_access_profiles")
        .select("department_scope, site_scope")
        .eq("user_id", userId)
        .eq("org_id", ORG_ID)
        .maybeSingle();
    const departmentScope =
        profile && String((profile as { department_scope?: string }).department_scope).trim() === "restricted"
            ? ("restricted" as const)
            : ("all" as const);
    let allowedDepartmentIds: string[] = [];
    if (departmentScope === "restricted") {
        const { data: rows } = await supabase
            .from("user_department_access")
            .select("department_id")
            .eq("user_id", userId)
            .eq("org_id", ORG_ID);
        allowedDepartmentIds = [...new Set((rows ?? []).map((r) => (r as { department_id: string }).department_id))];
    }
    const { data: siteRows } = await supabase
        .from("user_site_access")
        .select("location_id")
        .eq("user_id", userId)
        .eq("org_id", ORG_ID);
    return {
        departmentScope,
        allowedDepartmentIds: departmentScope === "restricted" ? allowedDepartmentIds : null,
        siteScope: "restricted" as const,
        allowedSiteLocationIds: [...new Set((siteRows ?? []).map((r) => (r as { location_id: string }).location_id))],
    };
}

async function main() {
    const supabase = createAdminClient();
    const cleanup = process.env.CLEANUP_E2E === "1";

    console.log("=== Pre-fix lifecycle E2E simulation ===");
    console.log({ orgId: ORG_ID, restrictedUser: RESTRICTED_USER });

    const { data: enrollDept } = await supabase
        .from("departments")
        .select("metadata")
        .eq("id", ENROLLMENT_DEPT)
        .eq("org_id", ORG_ID)
        .single();
    const sourceProcess = findProcessInDepartmentMetadata(enrollDept?.metadata, SOURCE_PROCESS);
    if (!sourceProcess) fail("seed", "Lead Management process missing on Enrollment");

    const { data: sourceWu } = await supabase
        .from("work_units")
        .select("queue_definition, name, key")
        .eq("id", SOURCE_WU)
        .eq("org_id", ORG_ID)
        .single();
    if (!sourceWu) fail("seed", "source work unit missing");

    const processId = randomUUID();
    const now = new Date().toISOString();
    const builderConfig: LifecycleBuilderV1 = {
        version: 1,
        active_process_id: processId,
        processes: [
            {
                ...sourceProcess,
                id: processId,
                key: slugifyLifecycleKey(LIFECYCLE_NAME),
                name: LIFECYCLE_NAME,
                stages: activeStagesForProcess(sourceProcess),
            },
        ],
    };

    const activation: LifecycleActivationV1 = {
        version: 1,
        lifecycle_name: LIFECYCLE_NAME,
        primary_entity: "opportunity",
        primary_record_label: "Lead",
        process_id: processId,
        stage_key: "lead",
        stage_label: "Lead",
        work_unit_id: "", // patched after work unit insert
        work_unit_name: "New Leads",
        status_keys: ["new_inquiry"],
        status_labels: ["new inquiry"],
        action_definition_id: "168eea86-852a-4b65-b245-e126d55f6322",
        action_placement_ids: [],
        activation_owned: true,
        completed_steps: 5,
        updated_at: now,
    };

    let meta = buildLifecycleBuilderOwnedMetadata({
        created_by: RESTRICTED_USER,
        process_id: processId,
    });
    meta = mergeLifecycleBuilderIntoMetadata(meta, builderConfig);
    meta = mergeLifecycleActivationIntoMetadata(meta, activation);

    const deptKey = `e2e_admissions_${randomUUID().slice(0, 8)}`;
    const { data: createdDept, error: deptErr } = await supabase
        .from("departments")
        .insert({
            org_id: ORG_ID,
            key: deptKey,
            name: LIFECYCLE_NAME,
            description: "Pre-fix E2E simulation — ALLOW_SIMULATION_WRITES only",
            is_active: true,
            metadata: meta,
            updated_at: now,
        })
        .select("id")
        .single();
    if (deptErr || !createdDept) fail("seed department", deptErr?.message);
    const departmentId = (createdDept as { id: string }).id;
    console.log("\nSeeded builder-owned department (pre-fix, no UDA):", departmentId);

    const { data: createdWu, error: wuErr } = await supabase
        .from("work_units")
        .insert({
            org_id: ORG_ID,
            department_id: departmentId,
            key: "enrollment_pipeline",
            name: "New Leads",
            is_active: true,
            queue_definition: sourceWu.queue_definition,
            updated_at: now,
        })
        .select("id")
        .single();
    if (wuErr || !createdWu) fail("seed work unit", wuErr?.message);
    const workUnitId = (createdWu as { id: string }).id;

    const { data: deptMetaRow } = await supabase
        .from("departments")
        .select("metadata")
        .eq("id", departmentId)
        .single();
    const patchedActivation = { ...activation, work_unit_id: workUnitId, updated_at: new Date().toISOString() };
    const nextMeta = { ...(deptMetaRow?.metadata as Record<string, unknown>) };
    mergeLifecycleActivationIntoMetadata(nextMeta, patchedActivation);
    const { error: metaUpdErr } = await supabase
        .from("departments")
        .update({ metadata: nextMeta, updated_at: new Date().toISOString() })
        .eq("id", departmentId);
    if (metaUpdErr) fail("persist activation metadata", metaUpdErr.message);

    const { data: sampleOpps } = await supabase
        .from("opportunities")
        .select("id")
        .eq("org_id", ORG_ID)
        .eq("work_unit_id", SOURCE_WU)
        .eq("status_key", "new_inquiry")
        .limit(3);
    if (sampleOpps?.length) {
        await supabase
            .from("opportunities")
            .update({ work_unit_id: workUnitId, updated_at: now })
            .in(
                "id",
                sampleOpps.map((o) => (o as { id: string }).id)
            );
        console.log(`Moved ${sampleOpps.length} opportunities to new work unit for queue proof`);
    }

    let dim = await buildDim(supabase, RESTRICTED_USER);
    const runtimeDepartmentId = departmentId;

    console.log("\n--- Pre-repair checks (expect access missing) ---");
    const accessPre = await resolveLifecycleDepartmentWorkspaceAccess(
        supabase,
        ORG_ID,
        RESTRICTED_USER,
        runtimeDepartmentId
    );
    console.log("accessPre", accessPre);
    if (accessPre.membership_provisioned) {
        fail("pre-repair", "user already had access — delete UDA row first for valid simulation");
    }

    const apiPre = await fetchWorkspaceActiveDepartments(supabase, ORG_ID, dim);
    if (apiPre.some((d) => d.id === runtimeDepartmentId)) {
        fail("pre-repair API", {
            source: "fetchWorkspaceActiveDepartments",
            note: "department visible before repair — scope may be all",
            department_scope: dim.departmentScope,
        });
    }
    console.log("PASS pre-repair: department NOT in workspace API for restricted user");

    console.log("\n--- Step 1: Repair workspace visibility ---");
    const repair = await repairLifecycleWorkspaceVisibility(
        supabase,
        ORG_ID,
        departmentId,
        processId,
        dim,
        RESTRICTED_USER
    );
    console.log("repair result", repair);
    if (!repair.ok) fail("repair", repair);
    // W-8 removed self-provisioning: repair never inserts a user_department_access row for the
    // caller. A department-restricted principal must already hold the department, or repair refuses.
    if (!repair.actions.includes("already_visible_in_workspace_api")) {
        console.warn("WARN: repair did not confirm existing workspace visibility for this principal");
    }

    dim = await refreshDepartmentScopeDimensions(supabase, ORG_ID, RESTRICTED_USER, dim);

    console.log("\n--- Step 2: user_department_access ---");
    const { data: uda } = await supabase
        .from("user_department_access")
        .select("id, user_id, org_id, department_id")
        .eq("user_id", RESTRICTED_USER)
        .eq("org_id", ORG_ID)
        .eq("department_id", repair.department_id)
        .maybeSingle();
    if (!uda) {
        fail("user_department_access", {
            query: "user_department_access WHERE user_id, org_id, department_id",
            user_id: RESTRICTED_USER,
            org_id: ORG_ID,
            department_id: repair.department_id,
        });
    }
    console.log("PASS", uda);

    console.log("\n--- Step 3: GET /api/admin/departments equivalent ---");
    const { data: rows } = await supabase
        .from("departments")
        .select("id, is_active")
        .eq("org_id", ORG_ID);
    let scoped = applyDepartmentAccessScope(filterActiveWorkspaceDepartments(rows ?? []), dim);
    if (!scoped.some((d) => d.id === repair.department_id)) {
        fail("departments API", {
            source: "departments + filterActive + applyDepartmentAccessScope (restricted .in allow-list)",
            department_id: repair.department_id,
            allowedDepartmentIds: dim.allowedDepartmentIds,
            scoped_ids: scoped.map((d) => d.id),
        });
    }
    console.log("PASS exact department_id in API-scoped list");

    console.log("\n--- Step 4: workspace tile ---");
    const tiles = await fetchWorkspaceActiveDepartments(supabase, ORG_ID, dim);
    const tile = tiles.find((t) => t.id === repair.department_id);
    if (!tile) {
        fail("workspace tiles", {
            source: "fetchWorkspaceActiveDepartments",
            department_id: repair.department_id,
            tile_ids: tiles.map((t) => t.id),
        });
    }
    console.log("PASS tile", { id: tile.id, name: tile.name });

    console.log("\n--- Step 5: department Work Unit Queue ---");
    const { data: wus } = await supabase
        .from("work_units")
        .select("id, key, name")
        .eq("org_id", ORG_ID)
        .eq("department_id", repair.department_id)
        .eq("is_active", true);
    if (!wus?.length) {
        fail("work_units on department", { department_id: repair.department_id });
    }
    console.log("PASS work_units", wus);

    console.log("\n--- Step 6: work-unit records ---");
    const primaryWuId = (wus[0] as { id: string }).id;
    const { count, error: oppErr } = await supabase
        .from("opportunities")
        .select("id", { count: "exact", head: true })
        .eq("org_id", ORG_ID)
        .eq("work_unit_id", primaryWuId);
    if (oppErr) {
        fail("opportunities count", { source: "opportunities WHERE work_unit_id", error: oppErr.message });
    }
    const { data: statusSample } = await supabase
        .from("opportunities")
        .select("id, status_key")
        .eq("org_id", ORG_ID)
        .eq("work_unit_id", primaryWuId)
        .limit(5);
    console.log("opportunity rows on work unit", { count, sample: statusSample });
    if ((count ?? 0) < 1) {
        fail("work-unit records", {
            source: "opportunities WHERE org_id AND work_unit_id",
            work_unit_id: primaryWuId,
            count,
        });
    }
    console.log(`PASS ${count} record(s) on work unit (queue API uses same work_unit_id filter)`);

    console.log("\n--- Step 7: configured action ---");
    const { data: deptAfter } = await supabase
        .from("departments")
        .select("metadata")
        .eq("id", repair.department_id)
        .single();
    const act = lifecycleActivationFromMetadata(deptAfter?.metadata);
    const { data: def } = await supabase
        .from("action_definitions")
        .select("id, label, is_active")
        .eq("id", act?.action_definition_id ?? "")
        .eq("org_id", ORG_ID)
        .maybeSingle();
    if (!def || (def as { is_active?: boolean }).is_active === false) {
        fail("action_definitions", { id: act?.action_definition_id });
    }
    const { data: placements } = await supabase
        .from("action_placements")
        .select("id, surface, slot, is_active")
        .eq("org_id", ORG_ID)
        .eq("action_definition_id", act?.action_definition_id ?? "")
        .eq("is_active", true);
    if (!placements?.length) {
        fail("action_placements", {
            source: "action_placements for activation.action_definition_id",
            action_definition_id: act?.action_definition_id,
        });
    }
    console.log("PASS action", {
        label: (def as { label: string }).label,
        placements: placements?.map((p) => ({
            surface: (p as { surface: string }).surface,
            slot: (p as { slot: string }).slot,
        })),
        note: "Activation uses record_header placement; drawer resolves via same action_definition_id",
    });

    console.log("\n=== ALL 7 STEPS PASSED (simulated pre-fix lifecycle) ===");
    console.log({
        runtime_department_id: repair.department_id,
        process_id: processId,
        work_unit_id: workUnitId,
        user_id: RESTRICTED_USER,
    });

    if (cleanup) {
        await supabase.from("user_department_access").delete().eq("department_id", departmentId);
        await supabase.from("work_units").delete().eq("id", workUnitId);
        await supabase.from("departments").delete().eq("id", departmentId);
        console.log("\nCleaned up seeded E2E artifacts");
    } else {
        console.log("\nSeeded dept left in place (set CLEANUP_E2E=1 to remove). Open:");
        console.log(`  /adminV2/workspace`);
        console.log(`  /adminV2/workspace/dept/${departmentId}`);
        console.log(`  /adminV2/settings/lifecycle — repair/validate on "${LIFECYCLE_NAME}"`);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
