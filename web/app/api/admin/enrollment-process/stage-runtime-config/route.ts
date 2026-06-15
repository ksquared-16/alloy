import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { departmentIdAllowed, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { isConfiguredStageKey } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { LifecycleStageQueueFiltersEmptyError } from "@/lib/lifecycle/lifecycleStageQueueFilters";
import { LifecycleStageWorkUnitIdentityConflictError } from "@/lib/lifecycle/lifecycleStageWorkUnitIdentity";
import { parseQueueMembershipV1 } from "@/lib/lifecycle/queueMembershipV1";
import { parseStageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import {
    saveLifecycleStageRuntimeConfig,
    validateLifecycleStageRuntimeConfigSnapshot,
} from "@/lib/lifecycle/saveLifecycleStageRuntimeConfig";
import type { LifecycleActivationV1 } from "@/lib/lifecycle/lifecycleActivationConfig";
import { snapshotEnrollmentPipelineWorkUnit } from "@/lib/lifecycle/parseEnrollmentPipelineQueues";

async function isValidStageForDepartment(
    orgId: string,
    departmentId: string,
    stageRaw: string
): Promise<boolean> {
    const supabase = createAdminClient();
    const { data } = await supabase
        .from("departments")
        .select("metadata")
        .eq("id", departmentId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (!data) return false;
    const metadata =
        data.metadata !== null && typeof data.metadata === "object" && !Array.isArray(data.metadata)
            ? (data.metadata as Record<string, unknown>)
            : {};
    return isConfiguredStageKey(metadata, stageRaw);
}

/** POST — canonical stage setup (statuses + optional work unit queue) in one transaction. */
export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: {
        department_id?: string;
        process_id?: string | null;
        stage_key?: string;
        stage?: string;
        selected_status_keys?: string[];
        status_keys?: string[];
        work_unit_name?: string | null;
        field_rules?: {
            required_rule_ids?: string[];
            recommended_rule_ids?: string[];
            rule_levels_v1?: { version?: number; by_rule_id?: Record<string, string> };
        } | null;
        queue_membership_v1?: unknown;
        stage_operating_plan_v1?: unknown;
    } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const departmentId = typeof body.department_id === "string" ? body.department_id.trim() : "";
    if (!departmentId) {
        return NextResponse.json({ error: "department_id is required" }, { status: 400 });
    }

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = scopeDimensionsFromAccess(access);
    if (!departmentIdAllowed(dim, departmentId)) {
        return NextResponse.json({ error: "Department not found" }, { status: 404 });
    }

    const stageKey =
        (typeof body.stage_key === "string" ? body.stage_key : body.stage)?.trim() ?? "";
    if (!stageKey) {
        return NextResponse.json({ error: "stage_key is required" }, { status: 400 });
    }

    const selectedStatusKeys = Array.isArray(body.selected_status_keys)
        ? body.selected_status_keys
        : Array.isArray(body.status_keys)
          ? body.status_keys
          : [];
    if (!selectedStatusKeys.length) {
        return NextResponse.json({ error: "selected_status_keys is required" }, { status: 400 });
    }

    const workUnitName =
        typeof body.work_unit_name === "string" ? body.work_unit_name.trim() || null : null;

    const fieldRulesRaw = body.field_rules;
    const fieldRules =
        fieldRulesRaw && typeof fieldRulesRaw === "object" && !Array.isArray(fieldRulesRaw)
            ? {
                  required_rule_ids: Array.isArray(fieldRulesRaw.required_rule_ids)
                      ? fieldRulesRaw.required_rule_ids.filter((x): x is string => typeof x === "string")
                      : [],
                  recommended_rule_ids: Array.isArray(fieldRulesRaw.recommended_rule_ids)
                      ? fieldRulesRaw.recommended_rule_ids.filter((x): x is string => typeof x === "string")
                      : [],
                  ...(fieldRulesRaw.rule_levels_v1 &&
                  typeof fieldRulesRaw.rule_levels_v1 === "object" &&
                  !Array.isArray(fieldRulesRaw.rule_levels_v1)
                      ? { rule_levels_v1: fieldRulesRaw.rule_levels_v1 }
                      : {}),
              }
            : null;

    const queueMembershipRaw = body.queue_membership_v1;
    const queueMembership =
        queueMembershipRaw !== undefined && queueMembershipRaw !== null
            ? parseQueueMembershipV1(queueMembershipRaw)
            : null;
    if (queueMembershipRaw !== undefined && queueMembershipRaw !== null && !queueMembership) {
        return NextResponse.json({ error: "Invalid queue_membership_v1" }, { status: 400 });
    }

    const operatingPlanRaw = body.stage_operating_plan_v1;
    const stageOperatingPlan =
        operatingPlanRaw !== undefined && operatingPlanRaw !== null
            ? parseStageOperatingPlanV1(operatingPlanRaw)
            : null;
    if (operatingPlanRaw !== undefined && operatingPlanRaw !== null && !stageOperatingPlan) {
        return NextResponse.json({ error: "Invalid stage_operating_plan_v1" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const deptOk = await assertRowOrg(supabase, "departments", departmentId, ctx.orgId);
    if (!deptOk.ok) return NextResponse.json({ error: "Department not found" }, { status: 404 });

    if (!(await isValidStageForDepartment(ctx.orgId, departmentId, stageKey))) {
        return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
    }

    try {
        const result = await saveLifecycleStageRuntimeConfig(supabase, {
            orgId: ctx.orgId,
            departmentId,
            processId: body.process_id ?? null,
            stageKey,
            selectedStatusKeys,
            workUnitName,
            fieldRules,
            ...(queueMembership ? { queueMembership } : {}),
            ...(stageOperatingPlan ? { stageOperatingPlan } : {}),
        });

        const pipelineSnapshot =
            result.workUnitId && result.queueDefinitionRaw != null
                ? snapshotEnrollmentPipelineWorkUnit({
                      id: result.workUnitId,
                      key: result.workUnitKey,
                      name: result.workUnitName ?? result.workUnitKey,
                      is_active: true,
                      queue_definition: result.queueDefinitionRaw,
                  })
                : null;

        const activationForValidation: LifecycleActivationV1 = {
            version: 1,
            lifecycle_name: "",
            primary_entity: "opportunity",
            primary_record_label: "Lead",
            process_id: typeof body.process_id === "string" ? body.process_id : "",
            stage_key: stageKey,
            stage_label: stageKey,
            work_unit_id: result.workUnitId,
            work_unit_name: result.workUnitName,
            status_keys: result.selectedStatusKeys,
            status_labels: result.selectedStatusKeys,
            action_definition_id: null,
            action_placement_ids: [],
            activation_owned: true,
            completed_steps: 4,
            updated_at: new Date().toISOString(),
        };
        const queueFilterValidation = validateLifecycleStageRuntimeConfigSnapshot(
            result,
            activationForValidation
        );

        const { queueDefinitionRaw: _raw, ...snapshot } = result;

        return NextResponse.json({
            snapshot,
            status_stages: result.statusStagesPayload,
            pipeline: pipelineSnapshot,
            queue_filter_validation: queueFilterValidation,
        });
    } catch (e) {
        if (e instanceof LifecycleStageWorkUnitIdentityConflictError) {
            return NextResponse.json({ error: e.message, identity_state: "conflict" }, { status: 409 });
        }
        if (e instanceof LifecycleStageQueueFiltersEmptyError) {
            return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
        }
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to save stage runtime config" },
            { status: 400 }
        );
    }
}
