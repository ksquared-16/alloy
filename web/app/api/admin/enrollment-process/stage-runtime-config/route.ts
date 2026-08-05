import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { departmentIdAllowed, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { LifecycleStageQueueFiltersEmptyError } from "@/lib/lifecycle/lifecycleStageQueueFilters";
import { LifecycleStageWorkUnitIdentityConflictError } from "@/lib/lifecycle/lifecycleStageWorkUnitIdentity";
import { parsePerspectivesV1 } from "@/lib/lifecycle/perspectiveConfigV1";
import { parseQueueMembershipV1 } from "@/lib/lifecycle/queueMembershipV1";
import { parseStageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import { parseStatusRollupV1 } from "@/lib/lifecycle/statusRollupV1";
import { parseStoredFieldRules } from "@/lib/lifecycle/lifecycleStageRequirementLevels";
import {
    saveLifecycleStageRuntimeConfig,
    validateLifecycleStageRuntimeConfigSnapshot,
} from "@/lib/lifecycle/saveLifecycleStageRuntimeConfig";
import { parseStageV2DraftInput } from "@/lib/lifecycle/persistStageV2DraftFields";
import type { LifecycleActivationV1 } from "@/lib/lifecycle/lifecycleActivationConfig";
import { snapshotEnrollmentPipelineWorkUnit } from "@/lib/lifecycle/parseEnrollmentPipelineQueues";

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
            rule_meta_v1?: unknown;
        } | null;
        queue_membership_v1?: unknown;
        stage_operating_plan_v1?: unknown;
        status_rollup_v1?: unknown;
        perspectives_v1?: unknown;
        stage_v2_draft?: unknown;
        /** Publication the editor loaded against — the PUBLICATION conflict token. */
        base_revision_id?: string | null;
        /** Draft revision the editor loaded — the DRAFT-EDIT conflict token. */
        draft_revision?: number;
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

    /**
     * Status keys are OPTIONAL, because they describe queue MEMBERSHIP — not the operating plan.
     *
     * This used to be a hard 400 on every save, which made a disposition-keyed child stage
     * unauthorable: `enrolling` scopes its queue by `included_disposition_keys` and has no status
     * keys at all, so editing its outcome rules was impossible without inventing membership the
     * stage does not use. Those invented keys are threaded into the work-unit save, so the
     * "harmless" workaround would have rewritten the stage's queue definition.
     *
     * Omitted now means "leave membership exactly as configured". Supplied still means "this IS
     * the membership", validated as before.
     */
    const statusKeysSupplied =
        Array.isArray(body.selected_status_keys) || Array.isArray(body.status_keys);
    const selectedStatusKeys = Array.isArray(body.selected_status_keys)
        ? body.selected_status_keys
        : Array.isArray(body.status_keys)
          ? body.status_keys
          : [];
    if (statusKeysSupplied && !selectedStatusKeys.length) {
        // An explicit empty array states an intent to clear the queue. Refuse it rather than
        // silently preserving — silently ignoring a stated intent is its own defect.
        return NextResponse.json(
            {
                error:
                    "selected_status_keys cannot be empty — omit the field to leave membership unchanged.",
            },
            { status: 400 },
        );
    }

    const workUnitName =
        typeof body.work_unit_name === "string" ? body.work_unit_name.trim() || null : null;

    const fieldRulesRaw = body.field_rules;
    const fieldRules =
        fieldRulesRaw && typeof fieldRulesRaw === "object" && !Array.isArray(fieldRulesRaw)
            ? parseStoredFieldRules(fieldRulesRaw)
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

    const statusRollupRaw = body.status_rollup_v1;
    const statusRollup =
        statusRollupRaw !== undefined && statusRollupRaw !== null
            ? parseStatusRollupV1(statusRollupRaw)
            : null;
    if (statusRollupRaw !== undefined && statusRollupRaw !== null && !statusRollup) {
        return NextResponse.json({ error: "Invalid status_rollup_v1" }, { status: 400 });
    }

    const perspectivesRaw = body.perspectives_v1;
    const perspectivesV1 =
        perspectivesRaw !== undefined && perspectivesRaw !== null
            ? parsePerspectivesV1(perspectivesRaw)
            : null;
    if (perspectivesRaw !== undefined && perspectivesRaw !== null && perspectivesV1 === null) {
        return NextResponse.json({ error: "Invalid perspectives_v1" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const deptOk = await assertRowOrg(supabase, "departments", departmentId, ctx.orgId);
    if (!deptOk.ok) return NextResponse.json({ error: "Department not found" }, { status: 404 });

    // The stage inventory is the DRAFT's, and the orchestrator checks it there. A second gate on
    // the published projection used to live here; it would now reject a stage the operator added
    // to the draft but has not published yet — the editor refusing to open what it just created.

    try {
        // The V2 stage fields are folded into the same in-memory draft mutation. They used to be a
        // second, separate whole-column write issued from here after the orchestrator returned —
        // a fifth lifecycle-builder write in one logical save, and one more way to tear a stage.
        const v2Draft = parseStageV2DraftInput(body.stage_v2_draft);

        const saveResult = await saveLifecycleStageRuntimeConfig(supabase, {
            orgId: ctx.orgId,
            departmentId,
            processId: body.process_id ?? null,
            stageKey,
            ...(statusKeysSupplied ? { selectedStatusKeys } : {}),
            workUnitName,
            fieldRules,
            actorUserId: ctx.userId,
            ...(v2Draft && Object.keys(v2Draft).length > 0 ? { stageV2Draft: v2Draft } : {}),
            ...(body.base_revision_id !== undefined
                ? { expectedBaseRevisionId: body.base_revision_id }
                : {}),
            ...(typeof body.draft_revision === "number"
                ? { expectedDraftRevision: body.draft_revision }
                : {}),
            ...(queueMembership ? { queueMembership } : {}),
            ...(stageOperatingPlan ? { stageOperatingPlan } : {}),
            ...(statusRollup ? { statusRollup } : {}),
            ...(perspectivesV1 !== null && perspectivesRaw !== undefined && perspectivesRaw !== null
                ? { perspectivesV1 }
                : {}),
        });

        if (saveResult.status === "stale_conflict") {
            // The two conflicts need different words because they need different recoveries:
            // one means a colleague is editing, the other means a newer config is already live.
            const isDraftEdit = saveResult.conflict?.kind === "draft_edit";
            return NextResponse.json(
                {
                    error: isDraftEdit
                        ? "Someone else changed this configuration while you were editing. " +
                          "Reload to see their changes, then reapply yours."
                        : "Someone else published a newer version of this configuration while you " +
                          "were editing. Reload to see their changes, then reapply yours.",
                    code: saveResult.conflict?.code,
                    conflict: saveResult.conflict,
                },
                { status: 409 },
            );
        }

        if (saveResult.status === "blocked" || !saveResult.snapshot) {
            return NextResponse.json(
                {
                    error: saveResult.errors[0]?.message ?? "This change cannot be saved.",
                    errors: saveResult.errors,
                    warnings: saveResult.warnings,
                },
                { status: 422 },
            );
        }

        const result = saveResult.snapshot;

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
            draft: saveResult.draft,
            warnings: saveResult.warnings,
            companion_writes: saveResult.companion_writes,
            // The draft changed; runtime did not. Nothing here writes the published projection.
            publication_required: saveResult.publication_required,
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
