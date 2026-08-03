import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { emitStatusChangedEvent } from "@/lib/admin/emitStatusChangedEvent";
import {
    assertChildLifecycleMutationTarget,
    resolveStatusMutationGrain,
} from "@/lib/admin/actions/resolveStatusMutationGrain";
import { assertAllowedStatusKey } from "@/lib/admin/statusDefinitionsResolve";
import { validateStatusTransition } from "@/lib/admin/statusTransitionRules";
import { emitEvent } from "@/lib/emitEvent";
import { findOrCreatePersonInOrgWithMeta } from "@/lib/persons/findOrCreatePersonInOrg";
import { upsertAndLinkPersonForAdmin } from "@/lib/admin/person/upsertAndLinkPersonForAdmin";
import { normalizeOpportunityWritePayload } from "@/lib/opportunityIdentity";
import { updateOpportunityCustomerMemberLifecycleStatus } from "@/lib/opportunities/updateOpportunityCustomerMemberLifecycleStatus";
import { executeWorkflowRun } from "@/lib/workflowRun";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { accessScopeRestrictsData, assertEntityDrawerRecordReadable } from "@/lib/admin/accessScope";
import {
    CREATE_LEAD_ACTION_ENTITY_ID,
    isCreateLeadExecuteRequest,
    QUALIFICATION_STATUS_KEY,
} from "@/lib/admin/actions/createLeadActionConstants";
import {
    assertMoveToQualificationAllowed,
    executeCreateLeadAction,
    validateMarkLostPayload,
    validateOpportunityStatusTransitionForAction,
} from "@/lib/admin/actions/entryLifecycleActions";
import { firstMatchingVisibleWorkView } from "@/lib/lifecycle/operationalProjection";
import {
    fetchDepartmentMetadataForWorkUnit,
    savedWorkViewsFromDepartmentMetadata,
} from "@/lib/lifecycle/resolveWorkViewRuntimeContext";
import { invalidateWorkUnitQueueItemsServerCacheForWorkUnit } from "@/lib/workspace/workUnitQueueItemsServerCache";
import {
    executeConfirmTourAction,
    executeRecordTourOutcomeAction,
} from "@/lib/admin/actions/executeTourBookingActions";
import {
    APPROVE_ENROLLMENT_ACTION_KEY,
    ENROLLED_STATUS_KEY,
} from "@/lib/admin/actions/enrollmentApprovalConstants";
import {
    mergeEnrollmentDateMetadata,
    stampChildEnrollmentDatesIfBlank,
    todayEnrollmentDateIso,
} from "@/lib/admin/actions/executeApproveEnrollmentAction";
import { stampEnrollmentDateOnProcessInstances } from "@/lib/enrollment/stampEnrollmentDateOnProcessInstances";
import type { OperationalEnrollmentHandoffResult } from "@/lib/childcareOperational/enrollmentAgreementHandoff";
import { executeOperationalEnrollmentHandoffFromApprovedOpportunity } from "@/lib/childcareOperational/enrollmentAgreementHandoff";
import { isChildcareOperationalEnrollmentV1EnabledForOrg } from "@/lib/childcareOperational/featureFlag";
import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";
import type { RequirementValidationResult } from "@/lib/completion/requirementValidationTypes";
import { preflightOpportunityActionOrNull } from "@/lib/admin/actions/adminActionPreflight";
import { applyMetadataAutoPopulate } from "@/lib/completion/applyAutoPopulateInstructions";
import { autoPopulateForLifecycleAction } from "@/lib/completion/lifecycleActionRequirementCatalog";
import { WAITLISTED_STATUS_KEY } from "@/lib/admin/actions/lifecycleActionMetadataKeys";

export type ExecuteAdminActionCtx = {
    orgId: string;
    userId?: string;
    /** When set with restricted dept/site dimensions, entity targets must pass drawer-style scope gates. */
    accessScope?: AdminAccessScopeDimensions | null;
};

export type ExecuteAdminActionInput = {
    actionKey: string;
    entityType: string;
    entityId: string;
    context?: {
        surface?: string;
        department_id?: string | null;
        work_unit_id?: string | null;
        section_key?: string | null;
    };
    payload?: Record<string, unknown>;
};

export type ExecuteAdminActionResult =
    | {
          ok: true;
          correlation_id: string;
          execution_result: Record<string, unknown>;
      }
    | {
          ok: false;
          correlation_id: string;
          error: string;
          status: number;
          completion_requirements?: RequirementValidationResult;
          effective_requirements?: import("@/lib/completion/effectiveRequirementsTypes").EffectiveRequirementsResult;
          action_preflight?: import("@/lib/admin/actions/actionPreflightPresentation").ActionPreflightUiPayload;
          readiness?: import("@/lib/completion/readinessTypes").ReadinessResult;
      };

function mergePayload(
    schemaDefaults: Record<string, unknown> | null | undefined,
    body: Record<string, unknown> | undefined
): Record<string, unknown> {
    const a = schemaDefaults && typeof schemaDefaults === "object" ? schemaDefaults : {};
    const b = body && typeof body === "object" ? body : {};
    return { ...a, ...b };
}

async function executeChildLifecycleStatusUpdate(
    supabase: SupabaseClient,
    ctx: ExecuteAdminActionCtx,
    correlationId: string,
    actionKey: string,
    entityTypeRaw: string,
    entityId: string,
    merged: Record<string, unknown>,
    inputContext?: ExecuteAdminActionInput["context"]
): Promise<ExecuteAdminActionResult> {
    const grainCtx = resolveStatusMutationGrain(merged, entityId);
    let ocmId = grainCtx.opportunityCustomerMemberId;
    const opportunityId = grainCtx.opportunityId ?? entityId;

    if (!ocmId && grainCtx.placementCandidateId) {
        const { data: cand } = await supabase
            .from("placement_candidates")
            .select("opportunity_customer_member_id, opportunity_id")
            .eq("id", grainCtx.placementCandidateId)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        ocmId =
            typeof (cand as { opportunity_customer_member_id?: unknown } | null)?.opportunity_customer_member_id ===
            "string"
                ? String((cand as { opportunity_customer_member_id: string }).opportunity_customer_member_id).trim()
                : null;
    }

    const target = assertChildLifecycleMutationTarget({
        ...grainCtx,
        opportunityId,
        opportunityCustomerMemberId: ocmId,
    });
    if (!target.ok) {
        return { ok: false, correlation_id: correlationId, error: target.error, status: 400 };
    }

    const statusKey = merged.status_key != null ? String(merged.status_key).trim() : "";
    if (!statusKey) {
        return {
            ok: false,
            correlation_id: correlationId,
            error: "update_status requires payload_schema.status_key",
            status: 400,
        };
    }

    const result = await updateOpportunityCustomerMemberLifecycleStatus({
        supabase,
        orgId: ctx.orgId,
        opportunityId: target.opportunityId,
        opportunityCustomerMemberId: target.opportunityCustomerMemberId,
        nextStatusKey: statusKey,
        actorUserId: ctx.userId,
        source: "executeAdminAction:update_status",
        reason: merged.reason != null ? String(merged.reason) : null,
        rowGrain: grainCtx.grain === "candidate" ? "candidate" : "child",
        placementCandidateId: grainCtx.placementCandidateId,
        metadata: {
            action_key: actionKey,
            ...(inputContext?.surface ? { surface: inputContext.surface } : {}),
        },
    });

    if (result.error) {
        return { ok: false, correlation_id: correlationId, error: result.error.message, status: 400 };
    }

    return await withActionExecutedEmit(supabase, ctx, correlationId, actionKey, entityTypeRaw, entityId, {
        kind: "update_child_lifecycle_status",
        entity: "opportunity_customer_members",
        id: target.opportunityCustomerMemberId,
        opportunity_id: target.opportunityId,
        row_grain: grainCtx.grain,
        before: result.before,
        after: result.after,
        event_emitted: result.eventEmitted,
        placement_hook: result.placementHook ?? null,
    });
}

async function findDefinitionForOrg(
    supabase: SupabaseClient,
    orgId: string,
    key: string
): Promise<{
    id: string;
    key: string;
    action_type: string;
    entity_type: string | null;
    payload_schema: Record<string, unknown> | null;
    workflow_id: string | null;
} | null> {
    const { data: rows, error } = await supabase
        .from("action_definitions")
        .select("id, key, action_type, entity_type, payload_schema, workflow_id, org_id, is_active")
        .eq("key", key)
        .eq("is_active", true)
        .or(`org_id.is.null,org_id.eq.${orgId}`);
    if (error || !rows?.length) return null;
    type Row = { org_id: string | null; id: string; key: string; action_type: string; entity_type: string | null; payload_schema: unknown; workflow_id: string | null };
    const typed = rows as Row[];
    const orgSpecific = typed.find((r) => r.org_id === orgId);
    const global = typed.find((r) => r.org_id == null);
    const chosen = orgSpecific ?? global ?? null;
    if (!chosen) return null;
    return {
        id: chosen.id,
        key: chosen.key,
        action_type: chosen.action_type,
        entity_type: chosen.entity_type,
        payload_schema: (chosen.payload_schema as Record<string, unknown> | null) ?? {},
        workflow_id: chosen.workflow_id,
    };
}

function mapEntityToTable(entityType: string): string | null {
    const t = entityType.trim().toLowerCase();
    if (t === "opportunity" || t === "opportunities") return "opportunities";
    if (t === "job" || t === "jobs") return "jobs";
    if (t === "schedule" || t === "schedules") return "schedules";
    return null;
}

/** Canonical plural entity_type for workflow_events / Activity Log. */
function mapEntityTypeForActivityEvent(raw: string): string | null {
    const x = raw.trim().toLowerCase();
    if (x === "opportunity" || x === "opportunities") return "opportunities";
    if (x === "job" || x === "jobs") return "jobs";
    if (x === "schedule" || x === "schedules") return "schedules";
    if (x === "customer" || x === "customers") return "customers";
    return null;
}

async function withActionExecutedEmit(
    _supabase: SupabaseClient,
    ctx: ExecuteAdminActionCtx,
    correlationId: string,
    actionKey: string,
    entityTypeRaw: string,
    entityId: string,
    execution_result: Record<string, unknown>
): Promise<ExecuteAdminActionResult> {
    const et = mapEntityTypeForActivityEvent(entityTypeRaw);
    if (et) {
        try {
            await emitEvent({
                org_id: ctx.orgId,
                event_type: "action_executed",
                entity_type: et,
                entity_id: entityId,
                payload: {
                    action_key: actionKey,
                    actor_user_id: ctx.userId ?? null,
                },
            });
        } catch (e) {
            console.error("[executeAdminAction] action_executed emit failed", e);
        }
    }
    return { ok: true, correlation_id: correlationId, execution_result };
}

/**
 * Server-side action executor (v1). Does not replace domain PATCH routes — reuses org checks + status bridge.
 */
export async function executeAdminAction(
    supabase: SupabaseClient,
    ctx: ExecuteAdminActionCtx,
    input: ExecuteAdminActionInput
): Promise<ExecuteAdminActionResult> {
    const correlationId = randomUUID();
    const actionKey = String(input.actionKey ?? "").trim();
    const entityIdRaw = String(input.entityId ?? "").trim();
    const entityTypeRaw = String(input.entityType ?? "").trim();
    const createLeadRequest = isCreateLeadExecuteRequest(actionKey, entityIdRaw);
    if (!actionKey || !entityTypeRaw) {
        return { ok: false, correlation_id: correlationId, error: "action_key and entity_type are required", status: 400 };
    }
    if (!entityIdRaw && !createLeadRequest) {
        return { ok: false, correlation_id: correlationId, error: "action_key, entity_type, and entity_id are required", status: 400 };
    }
    const entityId = createLeadRequest ? CREATE_LEAD_ACTION_ENTITY_ID : entityIdRaw;

    const table = mapEntityToTable(entityTypeRaw);
    if (!table && !createLeadRequest) {
        return { ok: false, correlation_id: correlationId, error: "Unsupported entity_type", status: 400 };
    }

    const def = await findDefinitionForOrg(supabase, ctx.orgId, actionKey);
    if (!def) {
        return { ok: false, correlation_id: correlationId, error: "Unknown or inactive action", status: 404 };
    }

    if (createLeadRequest) {
        const mergedCreate = mergePayload(def.payload_schema, input.payload);
        let created: Awaited<ReturnType<typeof executeCreateLeadAction>>;
        try {
            created = await executeCreateLeadAction(supabase, ctx, {
                merged: mergedCreate,
                context: input.context,
            });
        } catch (e) {
            // executeCreateLeadAction throws (rather than returning EntryLifecycleActionError) when a
            // downstream native insert fails — e.g. ensureCustomerForPersonNative on a stale/diverged
            // schema (missing column), or a CHECK-constraint rejecting a value the application path
            // considers canonical (e.g. chk_pcs_source_kind vs the deployed source_kind vocabulary).
            // Both are record-model-out-of-sync failures, NOT bad operator input: the operator never
            // types a source_kind or a column name. Translate to operator-safe copy that does not blame
            // the entered information and does not leak DB/constraint details, plus a highly searchable
            // server log. Searchable on: action_key=create_lead + correlation_id.
            const technical = e instanceof Error ? e.message : String(e);
            const schemaOutOfSync =
                /PGRST204|schema cache|Could not find the .* column|violates check constraint/i.test(technical);
            console.error("[executeAdminAction] create_lead execution threw", {
                action_key: actionKey,
                correlation_id: correlationId,
                org_id: ctx.orgId,
                schema_out_of_sync: schemaOutOfSync,
                error: technical,
            });
            return {
                ok: false,
                correlation_id: correlationId,
                error: schemaOutOfSync
                    ? "I couldn't create the lead because the record model is out of sync — this is a system issue, not the information you entered. Your draft is saved; an administrator needs to apply a fix before you retry."
                    : "I couldn't create the lead. Review the information and try again.",
                status: schemaOutOfSync ? 500 : 400,
            };
        }
        if (!created.ok) {
            return { ok: false, correlation_id: correlationId, error: created.error, status: created.status };
        }

        return await withActionExecutedEmit(
            supabase,
            ctx,
            correlationId,
            actionKey,
            entityTypeRaw,
            created.processing_case_id,
            {
                mode: created.mode,
                processing_case_id: created.processing_case_id,
                readiness: created.readiness,
                idempotency_key: created.idempotency_key,
                work_unit_id: created.work_unit_id,
                status_key: created.status_key,
                stage_key: created.stage_key,
            },
        );
    }

    if (def.entity_type != null && String(def.entity_type).trim() !== "") {
        const norm = (s: string) => {
            const x = s.trim().toLowerCase();
            if (x === "opportunities") return "opportunity";
            return x;
        };
        const want = norm(String(def.entity_type));
        const got = norm(entityTypeRaw);
        if (want !== got) {
            return { ok: false, correlation_id: correlationId, error: "Action does not apply to this entity type", status: 400 };
        }
    }

    const scopeDim = ctx.accessScope ?? null;
    if (scopeDim && accessScopeRestrictsData(scopeDim)) {
        if (!table) {
            return { ok: false, correlation_id: correlationId, error: "Unsupported entity_type", status: 400 };
        }
        const okTarget = await assertEntityDrawerRecordReadable(supabase, ctx.orgId, scopeDim, table, entityId);
        if (!okTarget) {
            return { ok: false, correlation_id: correlationId, error: "Not found", status: 404 };
        }
    }

    const merged = mergePayload(def.payload_schema, input.payload);

    if (table === "opportunities") {
        const preflightFail = await preflightOpportunityActionOrNull(correlationId, {
            supabase,
            orgId: ctx.orgId,
            opportunityId: entityId,
            actionKey,
            payload: merged,
            departmentId: input.context?.department_id ?? null,
            workUnitId: input.context?.work_unit_id ?? null,
        });
        if (preflightFail) return preflightFail;
    }

    if (actionKey === "confirm_tour" || actionKey === "record_tour_outcome") {
        if (table !== "opportunities") {
            return {
                ok: false,
                correlation_id: correlationId,
                error: "Tour booking actions support opportunities only",
                status: 400,
            };
        }
        if (!(await assertRowOrg(supabase, "opportunities", entityId, ctx.orgId)).ok) {
            return { ok: false, correlation_id: correlationId, error: "Not found", status: 404 };
        }
        if (actionKey === "confirm_tour") {
            const bookingId = merged.booking_id != null ? String(merged.booking_id).trim() : null;
            const confirmed = await executeConfirmTourAction(supabase, ctx, entityId, bookingId);
            if (!confirmed.ok) {
                return { ok: false, correlation_id: correlationId, error: confirmed.error, status: confirmed.status };
            }
            return await withActionExecutedEmit(supabase, ctx, correlationId, actionKey, entityTypeRaw, entityId, {
                kind: "confirm_tour",
                booking_id: confirmed.booking_id,
            });
        }
        const outcome = await executeRecordTourOutcomeAction(supabase, ctx, entityId, merged);
        if (!outcome.ok) {
            return { ok: false, correlation_id: correlationId, error: outcome.error, status: outcome.status };
        }
        return await withActionExecutedEmit(supabase, ctx, correlationId, actionKey, entityTypeRaw, entityId, {
            kind: "record_tour_outcome",
            booking_id: outcome.booking_id,
            outcome: outcome.outcome,
        });
    }

    switch (def.action_type) {
        case "open_form": {
            const formKey = merged.form_key != null ? String(merged.form_key).trim() : "";
            if (!formKey) {
                return { ok: false, correlation_id: correlationId, error: "open_form requires payload_schema.form_key", status: 400 };
            }
            if (formKey === "mark_lost") {
                const lostCheck = await validateMarkLostPayload(merged);
                if (!lostCheck.ok) {
                    return { ok: false, correlation_id: correlationId, error: lostCheck.error, status: lostCheck.status };
                }
            }
            const required =
                Array.isArray(merged.required_fields) && merged.required_fields.every((x) => typeof x === "string")
                    ? (merged.required_fields as string[])
                    : [];
            for (const k of required) {
                const v = (merged as Record<string, unknown>)[k];
                if (v == null || String(v).trim() === "") {
                    return { ok: false, correlation_id: correlationId, error: `Missing required field: ${k}`, status: 400 };
                }
            }

            const after = merged.after && typeof merged.after === "object" ? (merged.after as Record<string, unknown>) : {};
            const afterUpdateStatusKey = after.update_status_key != null ? String(after.update_status_key).trim() : "";
            let updatedRow: Record<string, unknown> | null = null;
            const submitActionType = merged.submit_action_type != null ? String(merged.submit_action_type).trim() : "";

            if (formKey === "add_related_person" || formKey === "add_family_member") {
                const firstName = merged.first_name != null ? String(merged.first_name).trim() : "";
                const lastName = merged.last_name != null ? String(merged.last_name).trim() : "";
                const email = merged.email != null ? String(merged.email).trim() || null : null;
                const phone = merged.phone != null ? String(merged.phone).trim() || null : null;
                const roleTypeRaw = merged.role_type != null ? String(merged.role_type).trim() : "";

                const entityNorm = String(entityTypeRaw).trim().toLowerCase();
                let customerId: string | null = null;
                let opportunityId: string | null = null;

                if (entityNorm === "opportunity" || entityNorm === "opportunities") {
                    const { data: opp } = await supabase
                        .from("opportunities")
                        .select("id, org_id, customer_id")
                        .eq("id", entityId)
                        .eq("org_id", ctx.orgId)
                        .maybeSingle();
                    if (!opp) {
                        return { ok: false, correlation_id: correlationId, error: "Not found", status: 404 };
                    }
                    opportunityId = entityId;
                    customerId = (opp as { customer_id?: string | null }).customer_id ?? null;
                } else if (entityNorm === "customer" || entityNorm === "customers") {
                    customerId = entityId;
                } else if (formKey === "add_family_member") {
                    return {
                        ok: false,
                        correlation_id: correlationId,
                        error: "add_family_member supports opportunity entities only",
                        status: 400,
                    };
                } else {
                    return {
                        ok: false,
                        correlation_id: correlationId,
                        error: "add_related_person supports opportunity or customer entities only",
                        status: 400,
                    };
                }

                if (!customerId && !opportunityId) {
                    return {
                        ok: false,
                        correlation_id: correlationId,
                        error: "Record is not linked to a household/customer yet",
                        status: 400,
                    };
                }

                const linked = await upsertAndLinkPersonForAdmin(supabase, {
                    orgId: ctx.orgId,
                    firstName,
                    lastName,
                    email,
                    phone,
                    roleType: roleTypeRaw,
                    customerId,
                    opportunityId,
                    actionKey,
                });
                if (!linked.ok) {
                    return { ok: false, correlation_id: correlationId, error: linked.error, status: 400 };
                }

                const kind = formKey === "add_related_person" ? "add_related_person" : "add_family_member";
                return await withActionExecutedEmit(supabase, ctx, correlationId, actionKey, entityTypeRaw, entityId, {
                    kind,
                    customer_id: customerId,
                    opportunity_id: opportunityId,
                    person_id: linked.result.person_id,
                    customer_person_id: linked.result.customer_person_id,
                    opportunity_person_id: linked.result.opportunity_person_id,
                    existed: linked.result.existed,
                });
            }

            // When submit_action_type=update_status, treat `after.update_status_key` as the target status key
            // for submission (forms often don't ask for status_key explicitly).
            // Reserve the "after" write for workflow submission paths (e.g. schedule_tour) to avoid double updates.
            if (afterUpdateStatusKey && submitActionType !== "update_status") {
                if (table !== "opportunities") {
                    return { ok: false, correlation_id: correlationId, error: "open_form.after.update_status_key supports opportunities only", status: 400 };
                }
                if (!(await assertRowOrg(supabase, "opportunities", entityId, ctx.orgId)).ok) {
                    return { ok: false, correlation_id: correlationId, error: "Not found", status: 404 };
                }
                const chk = await assertAllowedStatusKey(supabase, ctx.orgId, "opportunities", afterUpdateStatusKey);
                if (!chk.ok) {
                    return { ok: false, correlation_id: correlationId, error: chk.message, status: 400 };
                }
                const { data: existing } = await supabase
                    .from("opportunities")
                    .select("status_key, customer_id, primary_contact_id, primary_person_id, metadata, work_unit_id")
                    .eq("id", entityId)
                    .eq("org_id", ctx.orgId)
                    .maybeSingle();
                if (!existing) {
                    return { ok: false, correlation_id: correlationId, error: "Not found", status: 404 };
                }
                const oldStatusKey = (existing as { status_key?: string | null }).status_key ?? null;
                const md = ((existing as { metadata?: Record<string, unknown> | null }).metadata ?? null) as Record<string, unknown> | null;
                const contextWorkUnitId =
                    (input.context?.work_unit_id != null ? String(input.context.work_unit_id).trim() : "") ||
                    ((existing as { work_unit_id?: string | null }).work_unit_id ?? "") ||
                    null;
                let contextDepartmentId =
                    (input.context?.department_id != null ? String(input.context.department_id).trim() : "") || null;
                if (!contextDepartmentId && contextWorkUnitId) {
                    const { data: wu } = await supabase
                        .from("work_units")
                        .select("department_id")
                        .eq("id", contextWorkUnitId)
                        .eq("org_id", ctx.orgId)
                        .maybeSingle();
                    contextDepartmentId = (wu as { department_id?: string | null } | null)?.department_id ?? null;
                }
                const transition = await validateStatusTransition({
                    supabase,
                    orgId: ctx.orgId,
                    entityType: "opportunities",
                    entityId,
                    departmentId: contextDepartmentId,
                    workUnitId: contextWorkUnitId,
                    actionKey: actionKey,
                    fromStatusKey: oldStatusKey,
                    toStatusKey: afterUpdateStatusKey,
                    currentMetadata: md,
                    payload: merged,
                });
                if (!transition.ok) {
                    return { ok: false, correlation_id: correlationId, error: transition.message, status: 400 };
                }
                const _afterStatusPatch: Record<string, unknown> = { status_key: afterUpdateStatusKey };
                await normalizeOpportunityWritePayload(supabase, _afterStatusPatch, "executeAdminAction:open_form.after");
                const { data: updated, error: upErr } = await supabase
                    .from("opportunities")
                    .update(_afterStatusPatch)
                    .eq("id", entityId)
                    .eq("org_id", ctx.orgId)
                    .select()
                    .single();
                if (upErr || !updated) {
                    return { ok: false, correlation_id: correlationId, error: upErr?.message ?? "Update failed", status: 400 };
                }
                updatedRow = updated as Record<string, unknown>;
                const newStatusKey = (updated as { status_key?: string | null }).status_key ?? null;
                const metadata: Record<string, unknown> = {};
                const cust = (existing as { customer_id?: string | null }).customer_id;
                const pp = (existing as { primary_person_id?: string | null }).primary_person_id;
                const pc = (existing as { primary_contact_id?: string | null }).primary_contact_id;
                if (cust != null) metadata.customer_id = cust;
                if (pp != null) metadata.primary_person_id = pp;
                // LEGACY: contact-based identity (do not extend). TODO: migrate to person_id
                if (pc != null) metadata.fallback_contact_id = pc;
                try {
                    await emitStatusChangedEvent({
                        supabase,
                        orgId: ctx.orgId,
                        entityType: "opportunities",
                        entityId,
                        oldStatusKey,
                        newStatusKey,
                        metadata: Object.keys(metadata).length ? metadata : undefined,
                        actorUserId: ctx.userId,
                    });
                } catch (e) {
                    console.error("[executeAdminAction] emitStatusChangedEvent (open_form.after)", e);
                }
            }
            if (submitActionType === "append_note" || formKey === "add_note") {
                if (table !== "opportunities") {
                    return {
                        ok: false,
                        correlation_id: correlationId,
                        error: "append_note supports opportunities only",
                        status: 400,
                    };
                }
                if (!(await assertRowOrg(supabase, "opportunities", entityId, ctx.orgId)).ok) {
                    return { ok: false, correlation_id: correlationId, error: "Not found", status: 404 };
                }
                const note = merged.note != null ? String(merged.note).trim() : "";
                if (!note) {
                    return { ok: false, correlation_id: correlationId, error: "Note body is required.", status: 400 };
                }
                const { data: existing } = await supabase
                    .from("opportunities")
                    .select("metadata, status_key")
                    .eq("id", entityId)
                    .eq("org_id", ctx.orgId)
                    .maybeSingle();
                if (!existing) {
                    return { ok: false, correlation_id: correlationId, error: "Not found", status: 404 };
                }
                const md = ((existing as { metadata?: Record<string, unknown> | null }).metadata ?? null) as Record<
                    string,
                    unknown
                > | null;
                const nextMd: Record<string, unknown> = { ...(md && typeof md === "object" ? md : {}) };
                const prev = typeof nextMd.notes === "string" ? String(nextMd.notes) : "";
                const ts = new Date().toISOString();
                const line = `[${ts}] ${note}`;
                nextMd.notes = prev && prev.trim() ? `${prev.trim()}\n${line}` : line;
                const { data: updated, error: upErr } = await supabase
                    .from("opportunities")
                    .update({ metadata: nextMd })
                    .eq("id", entityId)
                    .eq("org_id", ctx.orgId)
                    .select()
                    .single();
                if (upErr || !updated) {
                    return { ok: false, correlation_id: correlationId, error: upErr?.message ?? "Update failed", status: 400 };
                }
                return await withActionExecutedEmit(supabase, ctx, correlationId, actionKey, entityTypeRaw, entityId, {
                    kind: "append_note",
                    row: updated as Record<string, unknown>,
                });
            }

            if (submitActionType === "update_status") {
                if (table !== "opportunities") {
                    return { ok: false, correlation_id: correlationId, error: "open_form submit_action_type=update_status supports opportunities only", status: 400 };
                }
                if (!(await assertRowOrg(supabase, "opportunities", entityId, ctx.orgId)).ok) {
                    return { ok: false, correlation_id: correlationId, error: "Not found", status: 404 };
                }
                const statusKey = merged.status_key != null ? String(merged.status_key).trim() : afterUpdateStatusKey;
                if (!statusKey) {
                    return { ok: false, correlation_id: correlationId, error: "Missing required field: status_key", status: 400 };
                }
                const chk = await assertAllowedStatusKey(supabase, ctx.orgId, "opportunities", statusKey);
                if (!chk.ok) {
                    return { ok: false, correlation_id: correlationId, error: chk.message, status: 400 };
                }

                const { data: existing } = await supabase
                    .from("opportunities")
                    .select("status_key, customer_id, primary_contact_id, primary_person_id, metadata, work_unit_id")
                    .eq("id", entityId)
                    .eq("org_id", ctx.orgId)
                    .maybeSingle();
                if (!existing) {
                    return { ok: false, correlation_id: correlationId, error: "Not found", status: 404 };
                }

                const oldStatusKey = (existing as { status_key?: string | null }).status_key ?? null;
                const md = ((existing as { metadata?: Record<string, unknown> | null }).metadata ?? null) as Record<string, unknown> | null;
                const nextMd: Record<string, unknown> = { ...(md && typeof md === "object" ? md : {}) };
                const contextWorkUnitId =
                    (input.context?.work_unit_id != null ? String(input.context.work_unit_id).trim() : "") ||
                    ((existing as { work_unit_id?: string | null }).work_unit_id ?? "") ||
                    null;
                let contextDepartmentId =
                    (input.context?.department_id != null ? String(input.context.department_id).trim() : "") || null;
                if (!contextDepartmentId && contextWorkUnitId) {
                    const { data: wu } = await supabase
                        .from("work_units")
                        .select("department_id")
                        .eq("id", contextWorkUnitId)
                        .eq("org_id", ctx.orgId)
                        .maybeSingle();
                    contextDepartmentId = (wu as { department_id?: string | null } | null)?.department_id ?? null;
                }

                const note = merged.note != null ? String(merged.note).trim() : "";
                if (note) {
                    const prev = typeof nextMd.notes === "string" ? String(nextMd.notes) : "";
                    const ts = new Date().toISOString();
                    const line = `[${ts}] ${note}`;
                    nextMd.notes = prev && prev.trim() ? `${prev.trim()}\n${line}` : line;
                }
                const nextStep = merged.next_step != null ? String(merged.next_step).trim() : "";
                if (nextStep) nextMd.next_step = nextStep;

                if (formKey === "contact_attempted") {
                    nextMd.last_contact_attempt_at = new Date().toISOString();
                    const methodRaw =
                        merged.last_contact_attempt_method != null
                            ? String(merged.last_contact_attempt_method).trim()
                            : merged.contact_method != null
                              ? String(merged.contact_method).trim()
                              : "";
                    if (methodRaw) nextMd.last_contact_attempt_method = methodRaw;
                }

                const transition = await validateStatusTransition({
                    supabase,
                    orgId: ctx.orgId,
                    entityType: "opportunities",
                    entityId,
                    departmentId: contextDepartmentId,
                    workUnitId: contextWorkUnitId,
                    actionKey: actionKey,
                    fromStatusKey: oldStatusKey,
                    toStatusKey: statusKey,
                    currentMetadata: md,
                    payload: merged,
                });
                if (!transition.ok) {
                    return { ok: false, correlation_id: correlationId, error: transition.message, status: 400 };
                }

                const _openFormStatusPatch: Record<string, unknown> = { status_key: statusKey, metadata: nextMd };
                if (formKey === "mark_lost" || actionKey === "mark_lost") {
                    const lostCheck = await validateMarkLostPayload(merged);
                    if (!lostCheck.ok) {
                        return { ok: false, correlation_id: correlationId, error: lostCheck.error, status: lostCheck.status };
                    }
                    _openFormStatusPatch.lost_reason = lostCheck.lostReason;
                }
                await normalizeOpportunityWritePayload(supabase, _openFormStatusPatch, "executeAdminAction:open_form.submit:update_status");
                const { data: updated, error: upErr } = await supabase
                    .from("opportunities")
                    .update(_openFormStatusPatch)
                    .eq("id", entityId)
                    .eq("org_id", ctx.orgId)
                    .select()
                    .single();
                if (upErr || !updated) {
                    return { ok: false, correlation_id: correlationId, error: upErr?.message ?? "Update failed", status: 400 };
                }
                updatedRow = updated as Record<string, unknown>;
                const newStatusKey = (updated as { status_key?: string | null }).status_key ?? null;

                const metadata: Record<string, unknown> = {};
                const cust = (existing as { customer_id?: string | null }).customer_id;
                const pp = (existing as { primary_person_id?: string | null }).primary_person_id;
                const pc = (existing as { primary_contact_id?: string | null }).primary_contact_id;
                if (cust != null) metadata.customer_id = cust;
                if (pp != null) metadata.primary_person_id = pp;
                // LEGACY: contact-based identity (do not extend). TODO: migrate to person_id
                if (pc != null) metadata.fallback_contact_id = pc;
                try {
                    await emitStatusChangedEvent({
                        supabase,
                        orgId: ctx.orgId,
                        entityType: "opportunities",
                        entityId,
                        oldStatusKey,
                        newStatusKey,
                        metadata: Object.keys(metadata).length ? metadata : undefined,
                        actorUserId: ctx.userId,
                    });
                } catch (e) {
                    console.error("[executeAdminAction] emitStatusChangedEvent (open_form.submit:update_status)", e);
                }

                return await withActionExecutedEmit(supabase, ctx, correlationId, actionKey, entityTypeRaw, entityId, {
                    kind: "update_status",
                    status_key: statusKey,
                    ...(updatedRow ? { row: updatedRow } : {}),
                });
            }

            if (submitActionType !== "start_workflow") {
                return {
                    ok: false,
                    correlation_id: correlationId,
                    error: "open_form v1 supports submit_action_type=start_workflow, update_status, or append_note",
                    status: 400,
                };
            }

            const wfId = def.workflow_id;
            if (!wfId) {
                return { ok: false, correlation_id: correlationId, error: "Action has no workflow_id", status: 400 };
            }
            if (!(await assertRowOrg(supabase, "workflows", wfId, ctx.orgId)).ok) {
                return { ok: false, correlation_id: correlationId, error: "Workflow not found for org", status: 404 };
            }
            const { data: wfRow, error: wfErr } = await supabase
                .from("workflows")
                .select("id, event_type, entity_type")
                .eq("id", wfId)
                .single();
            if (wfErr || !wfRow) {
                return { ok: false, correlation_id: correlationId, error: "Workflow not found", status: 404 };
            }
            const wf = wfRow as { id: string; event_type: string; entity_type: string };

            const tourDate = merged.tour_date != null ? String(merged.tour_date).trim() : "";
            const tourTime = merged.tour_time != null ? String(merged.tour_time).trim() : "";
            const tourAtLocal = tourDate && tourTime ? `${tourDate}T${tourTime}:00` : null;

            // Enrollment v1: persist tour inputs onto the opportunity metadata for display/conditions.
            // `tour_bookings` is scheduling SoT (Tour Scheduling V1). The drawer header "Schedule tour" action uses
            // slot booking APIs by default; this execute path remains for manual date/time (legacy) only.
            if (table === "opportunities" && formKey === "schedule_tour" && (tourDate || tourTime)) {
                const { data: cur, error: curErr } = await supabase
                    .from("opportunities")
                    .select("metadata")
                    .eq("id", entityId)
                    .eq("org_id", ctx.orgId)
                    .maybeSingle();
                if (!curErr && cur) {
                    const md = ((cur as { metadata?: Record<string, unknown> | null }).metadata ?? null) as Record<string, unknown> | null;
                    const nextMd: Record<string, unknown> = { ...(md && typeof md === "object" ? md : {}) };
                    if (tourDate) nextMd.tour_date = tourDate;
                    if (tourTime) nextMd.tour_time = tourTime;
                    nextMd.tour_schedule_source = "legacy_metadata_only";
                    const _tourMetadataPatch: Record<string, unknown> = { metadata: nextMd };
                    await normalizeOpportunityWritePayload(supabase, _tourMetadataPatch, "executeAdminAction:schedule_tour_metadata");
                    const { data: mdUpdated } = await supabase
                        .from("opportunities")
                        .update(_tourMetadataPatch)
                        .eq("id", entityId)
                        .eq("org_id", ctx.orgId)
                        .select()
                        .single();
                    if (mdUpdated && typeof mdUpdated === "object") {
                        updatedRow = mdUpdated as Record<string, unknown>;
                    }
                }
            }

            const eventPayload: Record<string, unknown> = {
                ...(merged.event_payload && typeof merged.event_payload === "object" ? (merged.event_payload as object) : {}),
                event_type: wf.event_type,
                entity_type: wf.entity_type,
                org_id: ctx.orgId,
                occurred_at: new Date().toISOString(),
                opportunity: { id: entityId },
                action_form: {
                    form_key: formKey,
                    tour_date: tourDate || null,
                    tour_time: tourTime || null,
                    tour_at_local: tourAtLocal,
                },
            };

            let eventId: string | null = null;
            try {
                eventId = await emitEvent({
                    org_id: ctx.orgId,
                    event_type: wf.event_type,
                    entity_type: wf.entity_type,
                    entity_id: entityId,
                    action_type: null,
                    occurred_at: eventPayload.occurred_at as string,
                    payload: eventPayload,
                });
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                return { ok: false, correlation_id: correlationId, error: `emitEvent failed: ${msg}`, status: 500 };
            }
            try {
                const run = await executeWorkflowRun(supabase, wf.id, eventPayload, {
                    event_id: eventId,
                    org_id: ctx.orgId,
                });
                return await withActionExecutedEmit(supabase, ctx, correlationId, actionKey, entityTypeRaw, entityId, {
                    kind: "start_workflow",
                    workflow_id: wf.id,
                    workflow_run_id: run.workflow_run_id,
                    run_status: run.status,
                    ...(updatedRow ? { row: updatedRow } : {}),
                });
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                return { ok: false, correlation_id: correlationId, error: msg, status: 500 };
            }
        }
        case "navigate": {
            const href = merged.href != null ? String(merged.href) : "";
            if (!href) {
                return { ok: false, correlation_id: correlationId, error: "navigate requires payload.href", status: 400 };
            }
            return await withActionExecutedEmit(supabase, ctx, correlationId, actionKey, entityTypeRaw, entityId, {
                kind: "navigate",
                href,
            });
        }
        case "external_link": {
            const href = merged.href != null ? String(merged.href) : "";
            if (!href) {
                return { ok: false, correlation_id: correlationId, error: "external_link requires payload.href", status: 400 };
            }
            return await withActionExecutedEmit(supabase, ctx, correlationId, actionKey, entityTypeRaw, entityId, {
                kind: "external_link",
                href,
            });
        }
        case "open_drawer": {
            const drawer = merged.drawer && typeof merged.drawer === "object" ? (merged.drawer as Record<string, unknown>) : {};
            const entityType = String(drawer.entityType ?? "opportunities").trim();
            const defaultSurface = drawer.defaultSurface != null ? String(drawer.defaultSurface) : null;
            return await withActionExecutedEmit(supabase, ctx, correlationId, actionKey, entityTypeRaw, entityId, {
                kind: "open_drawer",
                drawer: { entityType, id: entityId, defaultSurface },
            });
        }
        case "ui_intent": {
            return await withActionExecutedEmit(supabase, ctx, correlationId, actionKey, entityTypeRaw, entityId, {
                kind: "ui_intent",
                intent: merged.intent ?? merged,
                context: input.context ?? {},
            });
        }
        case "update_status": {
            if (table !== "opportunities") {
                return { ok: false, correlation_id: correlationId, error: "update_status v1 supports opportunities only", status: 400 };
            }
            const grainCtx = resolveStatusMutationGrain(merged, entityId);
            if (grainCtx.grain === "child" || grainCtx.grain === "candidate") {
                return executeChildLifecycleStatusUpdate(
                    supabase,
                    ctx,
                    correlationId,
                    actionKey,
                    entityTypeRaw,
                    entityId,
                    merged,
                    input.context
                );
            }
            if (!(await assertRowOrg(supabase, "opportunities", entityId, ctx.orgId)).ok) {
                return { ok: false, correlation_id: correlationId, error: "Not found", status: 404 };
            }

            if (actionKey === "move_to_qualification") {
                const pre = await assertMoveToQualificationAllowed(supabase, ctx.orgId, entityId, merged);
                if (!pre.ok) {
                    return { ok: false, correlation_id: correlationId, error: pre.error, status: pre.status };
                }
                merged.status_key = QUALIFICATION_STATUS_KEY;
            }

            if (actionKey === "move_to_waitlist") {
                merged.status_key = WAITLISTED_STATUS_KEY;
            }

            let statusKey = merged.status_key != null ? String(merged.status_key).trim() : "";
            if (!statusKey) {
                return { ok: false, correlation_id: correlationId, error: "update_status requires payload_schema.status_key", status: 400 };
            }
            const chk = await assertAllowedStatusKey(supabase, ctx.orgId, "opportunities", statusKey);
            if (!chk.ok) {
                return { ok: false, correlation_id: correlationId, error: chk.message, status: 400 };
            }

            if (actionKey === "mark_lost") {
                const lostCheck = await validateMarkLostPayload(merged);
                if (!lostCheck.ok) {
                    return { ok: false, correlation_id: correlationId, error: lostCheck.error, status: lostCheck.status };
                }
                merged.lost_reason = lostCheck.lostReason;
                statusKey = "lost";
            }

            if (actionKey === APPROVE_ENROLLMENT_ACTION_KEY) {
                merged.status_key = ENROLLED_STATUS_KEY;
                statusKey = ENROLLED_STATUS_KEY;
            }

            const transitionCtx = await validateOpportunityStatusTransitionForAction(supabase, ctx, {
                actionKey,
                entityId,
                toStatusKey: statusKey,
                merged,
                context: input.context,
            });
            if (!transitionCtx.ok) {
                return { ok: false, correlation_id: correlationId, error: transitionCtx.error, status: transitionCtx.status };
            }
            const existing = transitionCtx.existing;
            const oldStatusKey = transitionCtx.oldStatusKey;

            let operationalEnrollmentHandoff: OperationalEnrollmentHandoffResult | null = null;
            if (actionKey === APPROVE_ENROLLMENT_ACTION_KEY) {
                if (await isChildcareOperationalEnrollmentV1EnabledForOrg(supabase, ctx.orgId)) {
                    const todayYmd = await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId);
                    const enrollmentDate = todayEnrollmentDateIso();
                    operationalEnrollmentHandoff =
                        await executeOperationalEnrollmentHandoffFromApprovedOpportunity({
                            supabase,
                            orgId: ctx.orgId,
                            opportunityId: entityId,
                            actorUserId: ctx.userId,
                            todayYmd,
                            enrollmentDateYmd: enrollmentDate,
                            correlationId,
                        });
                    if (!operationalEnrollmentHandoff.ok) {
                        return {
                            ok: false,
                            correlation_id: correlationId,
                            error:
                                operationalEnrollmentHandoff.error ??
                                "Operational enrollment handoff failed",
                            status: 500,
                        };
                    }
                }
            }

            const updates: Record<string, unknown> = { status_key: statusKey };
            if (merged.lost_reason != null) {
                updates.lost_reason = String(merged.lost_reason);
            }
            if (actionKey === APPROVE_ENROLLMENT_ACTION_KEY || actionKey === "move_to_waitlist") {
                const existingMd =
                    (existing.metadata as Record<string, unknown> | null | undefined) ?? null;
                const auto = autoPopulateForLifecycleAction(actionKey, {
                    opportunityId: entityId,
                    payload: merged,
                });
                updates.metadata = applyMetadataAutoPopulate(existingMd, auto);
                if (actionKey === APPROVE_ENROLLMENT_ACTION_KEY) {
                    const enrollmentDate = todayEnrollmentDateIso();
                    updates.metadata = mergeEnrollmentDateMetadata(
                        updates.metadata as Record<string, unknown>,
                        enrollmentDate
                    );
                }
            }
            await normalizeOpportunityWritePayload(supabase, updates, "executeAdminAction:update_status");
            const { data: updated, error: upErr } = await supabase
                .from("opportunities")
                .update(updates)
                .eq("id", entityId)
                .eq("org_id", ctx.orgId)
                .select()
                .single();
            if (upErr || !updated) {
                return { ok: false, correlation_id: correlationId, error: upErr?.message ?? "Update failed", status: 400 };
            }
            if (actionKey === APPROVE_ENROLLMENT_ACTION_KEY) {
                const updatedMd = (updated as { metadata?: Record<string, unknown> | null }).metadata;
                const enrollmentDate =
                    updatedMd &&
                    typeof updatedMd === "object" &&
                    !Array.isArray(updatedMd) &&
                    typeof updatedMd.enrollment_date === "string"
                        ? String(updatedMd.enrollment_date).trim().slice(0, 10)
                        : "";
                if (enrollmentDate) {
                    try {
                        await stampChildEnrollmentDatesIfBlank(
                            supabase,
                            ctx.orgId,
                            entityId,
                            enrollmentDate
                        );
                    } catch (e) {
                        console.error("[executeAdminAction] stampChildEnrollmentDatesIfBlank", e);
                    }
                    // Process-grain stamp (canonical). Opportunity metadata remains compat projection.
                    // Source marks this as approve-path bridge until paperwork-completion outcomes own it.
                    try {
                        await stampEnrollmentDateOnProcessInstances(supabase, {
                            orgId: ctx.orgId,
                            opportunityId: entityId,
                            enrollmentDate,
                            source: "compat_approve_enrollment",
                            actorUserId: ctx.userId,
                        });
                    } catch (e) {
                        console.error("[executeAdminAction] stampEnrollmentDateOnProcessInstances", e);
                    }
                }
            }
            const newStatusKey = (updated as { status_key?: string | null }).status_key ?? null;
            const metadata: Record<string, unknown> = {};
            const cust = (existing as { customer_id?: string | null }).customer_id;
            const pp = (existing as { primary_person_id?: string | null }).primary_person_id;
            const pc = (existing as { primary_contact_id?: string | null }).primary_contact_id;
            if (cust != null) metadata.customer_id = cust;
            if (pp != null) metadata.primary_person_id = pp;
            // LEGACY: contact-based identity (do not extend). TODO: migrate to person_id
            if (pc != null) metadata.fallback_contact_id = pc;
            try {
                await emitStatusChangedEvent({
                    supabase,
                    orgId: ctx.orgId,
                    entityType: "opportunities",
                    entityId,
                    oldStatusKey,
                    newStatusKey,
                    metadata: Object.keys(metadata).length ? metadata : undefined,
                    actorUserId: ctx.userId,
                });
            } catch (e) {
                console.error("[executeAdminAction] emitStatusChangedEvent", e);
            }
            return await withActionExecutedEmit(supabase, ctx, correlationId, actionKey, entityTypeRaw, entityId, {
                kind:
                    actionKey === "move_to_qualification"
                        ? "move_to_qualification"
                        : actionKey === APPROVE_ENROLLMENT_ACTION_KEY
                          ? APPROVE_ENROLLMENT_ACTION_KEY
                          : "update_status",
                entity: "opportunities",
                id: entityId,
                row: updated,
                ...(operationalEnrollmentHandoff
                    ? { operational_enrollment_handoff: operationalEnrollmentHandoff }
                    : {}),
            });
        }
        case "update_field": {
            if (table !== "opportunities") {
                return { ok: false, correlation_id: correlationId, error: "update_field v1 supports opportunities only", status: 400 };
            }
            if (!(await assertRowOrg(supabase, "opportunities", entityId, ctx.orgId)).ok) {
                return { ok: false, correlation_id: correlationId, error: "Not found", status: 404 };
            }
            const fieldKey = merged.field_key != null ? String(merged.field_key).trim() : "";
            if (!fieldKey || !Object.prototype.hasOwnProperty.call(merged, "value")) {
                return { ok: false, correlation_id: correlationId, error: "update_field requires field_key and value", status: 400 };
            }
            const allowed = new Set(["name"]);
            if (!allowed.has(fieldKey)) {
                return { ok: false, correlation_id: correlationId, error: "update_field: unsupported field_key for v1", status: 400 };
            }
            const value = merged.value;
            const _oppFieldPatch: Record<string, unknown> = { [fieldKey]: value };
            await normalizeOpportunityWritePayload(supabase, _oppFieldPatch, "executeAdminAction:update_field");
            const { data: updated, error: upErr } = await supabase
                .from("opportunities")
                .update(_oppFieldPatch)
                .eq("id", entityId)
                .eq("org_id", ctx.orgId)
                .select()
                .single();
            if (upErr || !updated) {
                return { ok: false, correlation_id: correlationId, error: upErr?.message ?? "Update failed", status: 400 };
            }
            return await withActionExecutedEmit(supabase, ctx, correlationId, actionKey, entityTypeRaw, entityId, {
                kind: "update_field",
                entity: "opportunities",
                id: entityId,
                row: updated,
            });
        }
        case "start_workflow": {
            const wfId = def.workflow_id;
            if (!wfId) {
                return { ok: false, correlation_id: correlationId, error: "Action has no workflow_id", status: 400 };
            }
            if (!(await assertRowOrg(supabase, "workflows", wfId, ctx.orgId)).ok) {
                return { ok: false, correlation_id: correlationId, error: "Workflow not found for org", status: 404 };
            }
            const { data: wfRow, error: wfErr } = await supabase
                .from("workflows")
                .select("id, event_type, entity_type")
                .eq("id", wfId)
                .single();
            if (wfErr || !wfRow) {
                return { ok: false, correlation_id: correlationId, error: "Workflow not found", status: 404 };
            }
            const wf = wfRow as { id: string; event_type: string; entity_type: string };
            const eventPayload: Record<string, unknown> = {
                ...(merged.event_payload && typeof merged.event_payload === "object" ? (merged.event_payload as object) : {}),
                event_type: wf.event_type,
                entity_type: wf.entity_type,
                org_id: ctx.orgId,
                occurred_at: new Date().toISOString(),
                opportunity: { id: entityId },
            };
            let eventId: string | null = null;
            try {
                eventId = await emitEvent({
                    org_id: ctx.orgId,
                    event_type: wf.event_type,
                    entity_type: wf.entity_type,
                    entity_id: entityId,
                    action_type: null,
                    occurred_at: eventPayload.occurred_at as string,
                    payload: eventPayload,
                });
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                return { ok: false, correlation_id: correlationId, error: `emitEvent failed: ${msg}`, status: 500 };
            }
            try {
                const run = await executeWorkflowRun(supabase, wf.id, eventPayload, {
                    event_id: eventId,
                    org_id: ctx.orgId,
                });
                return await withActionExecutedEmit(supabase, ctx, correlationId, actionKey, entityTypeRaw, entityId, {
                    kind: "start_workflow",
                    workflow_id: wf.id,
                    workflow_run_id: run.workflow_run_id,
                    run_status: run.status,
                });
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                return { ok: false, correlation_id: correlationId, error: msg, status: 500 };
            }
        }
        default:
            return { ok: false, correlation_id: correlationId, error: `Unsupported action_type: ${def.action_type}`, status: 400 };
    }
}
