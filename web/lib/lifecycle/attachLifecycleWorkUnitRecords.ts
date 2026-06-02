/**
 * Attach existing opportunities (matching stage statuses) to lifecycle_wu_* work units.
 * Builder-owned lifecycles only — does not change status_key.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isLifecycleBuilderOwnedDepartmentMetadata } from "@/lib/lifecycle/lifecycleBuilderOwned";
import {
    listLifecycleStageWorkUnitsForDepartment,
    stageKeyFromLifecycleWorkUnitMetadata,
} from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { buildEnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import { lifecycleBuilderFromDepartmentMetadata, activeLifecycleProcess } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { lifecycleActivationFromMetadata } from "@/lib/lifecycle/lifecycleActivationConfig";
import {
    countLifecycleOpportunityRecordsForWorkUnit,
    expectedStatusKeysForLifecycleWorkUnitRow,
    listDepartmentWorkUnitIdsForOpportunityScope,
} from "@/lib/lifecycle/lifecycleOpportunityQueueScope";

export type AttachLifecycleWorkUnitRecordsResult =
    | {
          ok: true;
          department_id: string;
          actions: string[];
          attached_total: number;
          by_stage: Array<{ stage_key: string; work_unit_id: string; attached: number }>;
      }
    | { ok: false; error: string; actions?: string[] };

export async function attachMatchingRecordsToLifecycleWorkUnits(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string
): Promise<AttachLifecycleWorkUnitRecordsResult> {
    const actions: string[] = [];

    const { data: dept, error: deptErr } = await supabase
        .from("departments")
        .select("id, metadata")
        .eq("id", departmentId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (deptErr) return { ok: false, error: deptErr.message };
    if (!dept) return { ok: false, error: "Department not found" };
    if (!isLifecycleBuilderOwnedDepartmentMetadata(dept.metadata)) {
        return { ok: false, error: "Department is not builder-owned lifecycle runtime." };
    }

    const lifecycleWus = await listLifecycleStageWorkUnitsForDepartment(supabase, orgId, departmentId);
    if (!lifecycleWus.length) {
        return { ok: false, error: "No lifecycle work units found for this department." };
    }

    const activation = lifecycleActivationFromMetadata(dept.metadata);
    const builder = lifecycleBuilderFromDepartmentMetadata(dept.metadata);
    const process = builder ? activeLifecycleProcess(builder) : null;
    const stageKeys = process?.stages.map((s) => s.key) ?? [];

    const statusRows = await fetchEffectiveStatusDefinitions(supabase, orgId, "opportunities", {
        activeOnly: true,
    });
    const statusPayload = buildEnrollmentStatusStagesPayload(
        statusRows.map((r) => ({
            status_key: r.status_key,
            status_label: r.status_label,
            sort_order: Number(r.sort_order) ?? 100,
            metadata: (r.metadata ?? null) as Record<string, unknown> | null,
        })),
        stageKeys.length ? stageKeys : undefined
    );

    const deptWuIds = await listDepartmentWorkUnitIdsForOpportunityScope(supabase, orgId, departmentId);
    const now = new Date().toISOString();
    let attachedTotal = 0;
    const byStage: Array<{ stage_key: string; work_unit_id: string; attached: number }> = [];

    for (const wu of lifecycleWus) {
        const stageKey = stageKeyFromLifecycleWorkUnitMetadata(wu.metadata) ?? "";
        if (!stageKey) continue;
        const expected = activation
            ? await expectedStatusKeysForLifecycleWorkUnitRow(
                  supabase,
                  orgId,
                  departmentId,
                  stageKey,
                  activation,
                  statusPayload,
                  wu.metadata
              )
            : [];
        if (!expected.length) continue;

        const counts = await countLifecycleOpportunityRecordsForWorkUnit({
            supabase,
            orgId,
            departmentId,
            lifecycleWorkUnitId: wu.id,
            statusKeys: expected,
            departmentWorkUnitIds: deptWuIds,
        });
        if (counts.matching_elsewhere_in_department === 0) {
            byStage.push({ stage_key: stageKey, work_unit_id: wu.id, attached: 0 });
            continue;
        }

        let updateQ = supabase
            .from("opportunities")
            .update({ work_unit_id: wu.id, updated_at: now })
            .eq("org_id", orgId)
            .in("status_key", expected)
            .neq("work_unit_id", wu.id);

        const deptFilter = deptWuIds.length
            ? `work_unit_id.is.null,work_unit_id.in.(${deptWuIds.join(",")})`
            : "work_unit_id.is.null";
        updateQ = updateQ.or(deptFilter) as typeof updateQ;

        const { data: updated, error: upErr } = await updateQ.select("id");
        if (upErr) return { ok: false, error: upErr.message, actions };
        const n = (updated ?? []).length;
        attachedTotal += n;
        byStage.push({ stage_key: stageKey, work_unit_id: wu.id, attached: n });
        if (n > 0) actions.push(`attached_${n}_to_${wu.key}`);
    }

    return {
        ok: true,
        department_id: departmentId,
        actions,
        attached_total: attachedTotal,
        by_stage: byStage,
    };
}
