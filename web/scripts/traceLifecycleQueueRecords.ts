#!/usr/bin/env npx tsx
/**
 * Read-only trace: lifecycle department work units, status keys, and queue query equivalence.
 *
 * Env:
 *   SIMULATION_ORG_ID or DEV_QUEUE_ORG_ID (required)
 *   TRACE_DEPARTMENT_ID (optional — first builder-owned lifecycle dept if omitted)
 *   TRACE_WORK_UNIT_ID (optional — first lifecycle_wu_* in dept if omitted)
 *
 * Usage:
 *   cd web && npx tsx scripts/traceLifecycleQueueRecords.ts
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getSimulationOrgId } from "./lib/lifecycleSimulationGuard";
import {
    lifecycleActivationFromMetadata,
    type LifecycleActivationV1,
} from "@/lib/lifecycle/lifecycleActivationConfig";
import { isActivationOwnedDepartmentMetadata } from "@/lib/lifecycle/lifecycleActivationOwned";
import { findProcessInDepartmentMetadata } from "@/lib/lifecycle/lifecycleCatalog";
import {
    isLifecycleStageWorkUnitKey,
    stageKeyFromLifecycleWorkUnitMetadata,
} from "@/lib/lifecycle/lifecycleStageWorkUnit";
import {
    resolveLifecycleOpportunityQueueScope,
    type LifecycleOpportunityQueueScope,
} from "@/lib/lifecycle/lifecycleOpportunityQueueScope";
import { getWorkUnitQueueSummaries } from "@/lib/queues/QueueService";
import {
    buildLifecycleQueueFilterEquivalent,
    countOpportunitiesByStatusKeys,
    countOpportunitiesByWorkUnitIds,
    fetchMatchingOpportunitySamples,
    queueStatusKeysFromQueueConfig,
    runLifecycleQueueCountQuery,
} from "@/lib/lifecycle/lifecycleQueueTrace";
import {
    expectedStatusKeysForLifecycleStageValidation,
    queueStatusKeysForLifecycleWorkUnitValidation,
} from "@/lib/lifecycle/lifecycleWorkUnitQueueValidation";
import { buildEnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import { loadQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";
import type { QueueConfig } from "@/lib/config/queueDefinitionSchema";
import { isLifecycleStageWorkUnitMetadata } from "@/lib/lifecycle/lifecycleOpportunityQueueScope";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

function section(title: string) {
    console.log("\n" + "=".repeat(80));
    console.log(title);
    console.log("=".repeat(80));
}

function printJson(label: string, value: unknown) {
    console.log(`\n${label}:`);
    console.log(JSON.stringify(value, null, 2));
}

function resolveScopeBundle(params: {
    workUnitId: string;
    departmentId: string;
    workUnitKey: string;
    workUnitMetadata: unknown;
    departmentWorkUnitIdsForLifecycleScope?: readonly string[];
}): { scope: LifecycleOpportunityQueueScope; departmentWorkUnitIds: string[] } {
    const scope = resolveLifecycleOpportunityQueueScope({
        workUnitId: params.workUnitId,
        workUnitKey: params.workUnitKey,
        workUnitMetadata: params.workUnitMetadata,
        departmentId: params.departmentId,
    });
    if (scope.mode === "lifecycle_status") {
        const departmentWorkUnitIds =
            params.departmentWorkUnitIdsForLifecycleScope?.map((id) => id.trim()).filter(Boolean) ?? [];
        return { scope, departmentWorkUnitIds };
    }
    return { scope, departmentWorkUnitIds: [params.workUnitId] };
}

function extractQueueStatusFilters(queueDefinition: unknown): { queue_key: string; status_keys: string[] }[] {
    try {
        const bundle = loadQueueDefinitionBundle(queueDefinition);
        return bundle.def.queues.map((q: QueueConfig) => ({
            queue_key: q.key,
            status_keys: queueStatusKeysFromQueueConfig(q),
        }));
    } catch {
        return [];
    }
}

async function loadStatusPayload(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    departmentId: string
) {
    const defs = await fetchEffectiveStatusDefinitions(supabase as any, orgId, "opportunities", {
        activeOnly: true,
    });
    return buildEnrollmentStatusStagesPayload(
        defs.map((d) => ({
            status_key: d.status_key,
            status_label: d.status_label,
            sort_order: d.sort_order ?? 0,
            metadata: (d.metadata as Record<string, unknown> | null) ?? null,
        }))
    );
}

async function main() {
    const orgId = getSimulationOrgId();
    const supabase = createAdminClient();

    section("Lifecycle queue records trace");
    console.log({ org_id: orgId });

    const { data: depts, error: deptsErr } = await supabase
        .from("departments")
        .select("id, key, name, is_active, metadata")
        .eq("org_id", orgId)
        .eq("is_active", true);
    if (deptsErr) throw new Error(deptsErr.message);

    type DeptCandidate = { department_id: string; name: string; activation: LifecycleActivationV1 };
    const candidates: DeptCandidate[] = [];
    for (const d of depts ?? []) {
        const meta =
            d.metadata !== null && typeof d.metadata === "object" && !Array.isArray(d.metadata)
                ? (d.metadata as Record<string, unknown>)
                : {};
        const activation = lifecycleActivationFromMetadata(meta);
        const builderOwned =
            isActivationOwnedDepartmentMetadata(meta) || activation?.activation_owned === true;
        if (!builderOwned || !activation?.process_id) continue;
        if (!findProcessInDepartmentMetadata(meta, activation.process_id)) continue;
        candidates.push({
            department_id: d.id as string,
            name: (d.name as string) ?? activation.lifecycle_name,
            activation,
        });
    }

    if (!candidates.length) {
        throw new Error("No builder-owned lifecycle departments found. Set TRACE_DEPARTMENT_ID explicitly.");
    }

    let departmentId = (process.env.TRACE_DEPARTMENT_ID ?? "").trim();
    let candidate = candidates.find((c) => c.department_id === departmentId);
    if (!candidate) {
        candidate = candidates[0];
        departmentId = candidate.department_id;
    }

    printJson(
        "Available lifecycle departments",
        candidates.map((c) => ({ id: c.department_id, name: c.name, process_id: c.activation.process_id }))
    );

    section("1) department_id");
    console.log(departmentId, `(${candidate.name})`);

    const { data: wuRows, error: wuErr } = await supabase
        .from("work_units")
        .select("id, key, name, is_active, department_id, queue_definition, metadata")
        .eq("org_id", orgId)
        .eq("department_id", departmentId)
        .eq("is_active", true)
        .order("key");
    if (wuErr) throw new Error(wuErr.message);

    section("2) Active work_units for department");
    const workUnits = (wuRows ?? []).map((w) => ({
        id: w.id,
        key: w.key,
        name: w.name,
        is_active: w.is_active,
        lifecycle_stage: isLifecycleStageWorkUnitMetadata(w.metadata)
            ? stageKeyFromLifecycleWorkUnitMetadata(w.metadata)
            : null,
        queue_status_filters: extractQueueStatusFilters(w.queue_definition),
    }));
    printJson("work_units", workUnits);

    const departmentWorkUnitIds = (wuRows ?? []).map((w) => String(w.id));

    const { data: deptRow } = await supabase
        .from("departments")
        .select("metadata")
        .eq("id", departmentId)
        .eq("org_id", orgId)
        .maybeSingle();
    const deptMeta = deptRow?.metadata ?? null;
    const activation = candidate.activation;
    const statusPayload = await loadStatusPayload(supabase, orgId, departmentId);

    const lifecycleWuRows = (wuRows ?? []).filter((w) =>
        isLifecycleStageWorkUnitKey((w as { key?: string }).key)
    );

    section("3) Lifecycle stages (lifecycle_wu_*)");
    const stages = lifecycleWuRows.map((w) => {
        const stageKey = stageKeyFromLifecycleWorkUnitMetadata(w.metadata) ?? "";
        const selected = expectedStatusKeysForLifecycleStageValidation(
            stageKey,
            statusPayload,
            activation,
            w.metadata
        );
        const queueKeys = queueStatusKeysForLifecycleWorkUnitValidation(
            {
                id: w.id as string,
                key: (w.key as string) ?? "",
                name: (w.name as string) ?? "",
                is_active: Boolean(w.is_active),
                queue_definition: w.queue_definition,
            },
            stageKey
        );
        return {
            stage_key: stageKey,
            stage_label:
                (w.metadata as { lifecycle_stage_label?: string } | null)?.lifecycle_stage_label ??
                stageKey,
            selected_status_keys: selected,
            queue_definition_status_keys: queueKeys,
            linked_lifecycle_wu_work_unit_id: w.id,
            work_unit_key: w.key,
        };
    });
    printJson("stages", stages);

    let workUnitId = (process.env.TRACE_WORK_UNIT_ID ?? "").trim();
    let targetWu = lifecycleWuRows.find((w) => String(w.id) === workUnitId);
    if (!targetWu) {
        targetWu = lifecycleWuRows[0];
        workUnitId = targetWu ? String(targetWu.id) : "";
    }
    if (!targetWu || !workUnitId) {
        throw new Error("No lifecycle_wu_* work unit in department. Set TRACE_WORK_UNIT_ID or repair work units in Settings.");
    }

    section("4) Selected work unit");
    const wuKey = (targetWu.key as string) ?? "";
    const stageKey = stageKeyFromLifecycleWorkUnitMetadata(targetWu.metadata) ?? "";
    const queueRoute =
        `/api/admin/work-units/${encodeURIComponent(workUnitId)}/queues?include_previews=false&count_mode=exact&summary_mode=all&limit=3`;
    printJson("work_unit", {
        work_unit_id: workUnitId,
        work_unit_key: wuKey,
        work_unit_name: targetWu.name,
        stage_key: stageKey,
        queue_definition_filters: extractQueueStatusFilters(targetWu.queue_definition),
        queue_route_url: queueRoute,
    });

    const scope = resolveLifecycleOpportunityQueueScope({
        workUnitId,
        workUnitKey: wuKey,
        workUnitMetadata: targetWu.metadata,
        departmentId,
    });
    const browserBundle = resolveScopeBundle({
        workUnitId,
        departmentId,
        workUnitMetadata: targetWu.metadata,
        workUnitKey: wuKey,
    });
    const deptBootstrapBundle = resolveScopeBundle({
        workUnitId,
        departmentId,
        workUnitMetadata: targetWu.metadata,
        workUnitKey: wuKey,
        departmentWorkUnitIdsForLifecycleScope: departmentWorkUnitIds,
    });

    const bundle = loadQueueDefinitionBundle(targetWu.queue_definition);
    const primaryQueue = bundle.def.queues[0];
    const laneStatusKeys = primaryQueue ? queueStatusKeysFromQueueConfig(primaryQueue) : [];

    section("5) Opportunities that SHOULD match (status + department scope)");
    const shouldMatch = await fetchMatchingOpportunitySamples({
        supabase,
        orgId,
        scope: deptBootstrapBundle.scope,
        departmentWorkUnitIds: deptBootstrapBundle.departmentWorkUnitIds,
        statusKeys: laneStatusKeys,
        limit: 25,
    });
    printJson("samples (dept scope + lane status keys)", shouldMatch);

    section("6) Count by status_key (org, lane + expected keys)");
    const expectedForStage = expectedStatusKeysForLifecycleStageValidation(
        stageKey,
        statusPayload,
        activation,
        targetWu.metadata
    );
    const keysToCount = [...new Set([...laneStatusKeys, ...expectedForStage])];
    const countByStatus = await countOpportunitiesByStatusKeys(supabase, orgId, keysToCount);
    printJson("count_by_status_key", countByStatus);

    section("7) Count by work_unit_id (department work units)");
    const countByWu = await countOpportunitiesByWorkUnitIds(supabase, orgId, departmentWorkUnitIds);
    printJson("count_by_work_unit_id", countByWu);

    section("Critical question — status keys vs org data");
    const orgHasAnyLaneStatus = laneStatusKeys.some((k) => (countByStatus[k] ?? 0) > 0);
    const orgHasExpected = expectedForStage.some((k) => (countByStatus[k.toLowerCase()] ?? 0) > 0);
    console.log({
        lane_status_keys: laneStatusKeys,
        expected_status_keys_for_stage: expectedForStage,
        org_has_opportunity_with_lane_status: orgHasAnyLaneStatus,
        org_has_opportunity_with_expected_status: orgHasExpected,
        queue_filter_includes_expected: expectedForStage.every((k) =>
            laneStatusKeys.map((x) => x.toLowerCase()).includes(k.toLowerCase())
        ),
    });
    if (!orgHasAnyLaneStatus && orgHasExpected) {
        console.log(
            "\n>>> LIKELY CAUSE: queue_definition status filters do not include keys where records exist."
        );
    }
    if (!orgHasAnyLaneStatus && !orgHasExpected) {
        console.log("\n>>> LIKELY CAUSE: No opportunities use selected/expected status keys in this org.");
    }

    section("Verify queue query — browser path (no dept WU preload)");
    const browserFilter = buildLifecycleQueueFilterEquivalent({
        orgId,
        scope: browserBundle.scope,
        departmentWorkUnitIds: browserBundle.departmentWorkUnitIds,
        statusKeys: laneStatusKeys,
    });
    const browserCount = await runLifecycleQueueCountQuery({
        supabase,
        orgId,
        scope: browserBundle.scope,
        departmentWorkUnitIds: browserBundle.departmentWorkUnitIds,
        statusKeys: laneStatusKeys,
    });
    printJson("browser_api_equivalent", { ...browserFilter, returned_count: browserCount });

    section("Verify queue query — dept bootstrap path (with departmentWorkUnitIdsForLifecycleScope)");
    const deptFilter = buildLifecycleQueueFilterEquivalent({
        orgId,
        scope: deptBootstrapBundle.scope,
        departmentWorkUnitIds: deptBootstrapBundle.departmentWorkUnitIds,
        statusKeys: laneStatusKeys,
    });
    const deptCount = await runLifecycleQueueCountQuery({
        supabase,
        orgId,
        scope: deptBootstrapBundle.scope,
        departmentWorkUnitIds: deptBootstrapBundle.departmentWorkUnitIds,
        statusKeys: laneStatusKeys,
    });
    printJson("dept_bootstrap_equivalent", { ...deptFilter, returned_count: deptCount });

    section("Live getWorkUnitQueueSummaries — mirrors /api/admin/work-units/:id/queues");
    const [apiBrowser, apiDeptPreload] = await Promise.all([
        getWorkUnitQueueSummaries({
            orgId,
            workUnitId,
            includePreviews: false,
            countAccuracy: "exact",
        }),
        getWorkUnitQueueSummaries({
            orgId,
            workUnitId,
            includePreviews: false,
            countAccuracy: "exact",
            preloadedQueueDefinition: {
                queue_definition: targetWu.queue_definition,
                workUnitMetadata: targetWu.metadata,
                departmentId,
                workUnitKey: wuKey,
                departmentWorkUnitIdsForLifecycleScope: departmentWorkUnitIds,
            },
        }),
    ]);
    printJson("getWorkUnitQueueSummaries (browser — no preload ids)", {
        queues: apiBrowser.queues.map((q) => ({ key: q.key, count: q.count })),
        lifecycle_queue_debug: (apiBrowser as { lifecycle_queue_debug?: unknown }).lifecycle_queue_debug,
    });
    printJson("getWorkUnitQueueSummaries (dept preload ids)", {
        queues: apiDeptPreload.queues.map((q) => ({ key: q.key, count: q.count })),
        lifecycle_queue_debug: (apiDeptPreload as { lifecycle_queue_debug?: unknown }).lifecycle_queue_debug,
    });

    section("Likely causes checklist");
    console.log({
        "1_status_key_mismatch": !orgHasAnyLaneStatus,
        "2_work_unit_scope_strict_on_browser": browserFilter.scope_mode === "lifecycle_status_strict_wu",
        "3_lifecycle_scope_active": scope.mode === "lifecycle_status",
        "4_browser_vs_dept_count_delta": browserCount !== deptCount,
        "5_queue_definition_missing_filters": laneStatusKeys.length === 0,
    });
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
