import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { emitStatusChangedEvent } from "@/lib/admin/emitStatusChangedEvent";
import { assertAllowedStatusKey } from "@/lib/admin/statusDefinitionsResolve";
import { validateStatusTransition } from "@/lib/admin/statusTransitionRules";
import { emitEvent } from "@/lib/emitEvent";
import { findOrCreatePersonInOrgWithMeta } from "@/lib/persons/findOrCreatePersonInOrg";
import { normalizeOpportunityWritePayload } from "@/lib/opportunityIdentity";
import { executeWorkflowRun } from "@/lib/workflowRun";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { accessScopeRestrictsData, assertEntityDrawerRecordReadable } from "@/lib/admin/accessScope";

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
    | { ok: false; correlation_id: string; error: string; status: number };

function mergePayload(
    schemaDefaults: Record<string, unknown> | null | undefined,
    body: Record<string, unknown> | undefined
): Record<string, unknown> {
    const a = schemaDefaults && typeof schemaDefaults === "object" ? schemaDefaults : {};
    const b = body && typeof body === "object" ? body : {};
    return { ...a, ...b };
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
    const entityId = String(input.entityId ?? "").trim();
    const entityTypeRaw = String(input.entityType ?? "").trim();
    if (!actionKey || !entityId || !entityTypeRaw) {
        return { ok: false, correlation_id: correlationId, error: "action_key, entity_type, and entity_id are required", status: 400 };
    }

    const table = mapEntityToTable(entityTypeRaw);
    if (!table) {
        return { ok: false, correlation_id: correlationId, error: "Unsupported entity_type", status: 400 };
    }

    const def = await findDefinitionForOrg(supabase, ctx.orgId, actionKey);
    if (!def) {
        return { ok: false, correlation_id: correlationId, error: "Unknown or inactive action", status: 404 };
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
        const okTarget = await assertEntityDrawerRecordReadable(supabase, ctx.orgId, scopeDim, table, entityId);
        if (!okTarget) {
            return { ok: false, correlation_id: correlationId, error: "Not found", status: 404 };
        }
    }

    const merged = mergePayload(def.payload_schema, input.payload);

    switch (def.action_type) {
        case "open_form": {
            const formKey = merged.form_key != null ? String(merged.form_key).trim() : "";
            if (!formKey) {
                return { ok: false, correlation_id: correlationId, error: "open_form requires payload_schema.form_key", status: 400 };
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

            if (formKey === "add_related_person") {
                const firstName = merged.first_name != null ? String(merged.first_name).trim() : "";
                const lastName = merged.last_name != null ? String(merged.last_name).trim() : "";
                const email = merged.email != null ? String(merged.email).trim() : "";
                const phone = merged.phone != null ? String(merged.phone).trim() : "";
                const roleTypeRaw = merged.role_type != null ? String(merged.role_type).trim() : "";
                const roleType = roleTypeRaw || "primary_contact";

                if (!firstName || !lastName) {
                    return { ok: false, correlation_id: correlationId, error: "Missing required field: first_name/last_name", status: 400 };
                }

                let customerId: string | null = null;
                const entityNorm = String(entityTypeRaw).trim().toLowerCase();
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
                    customerId = (opp as { customer_id?: string | null }).customer_id ?? null;
                } else if (entityNorm === "customer" || entityNorm === "customers") {
                    customerId = entityId;
                } else {
                    return { ok: false, correlation_id: correlationId, error: "add_related_person supports opportunity or customer entities only", status: 400 };
                }

                if (!customerId) {
                    return { ok: false, correlation_id: correlationId, error: "Record is not linked to a household/customer yet", status: 400 };
                }

                // Create or find a person (dedupe by email/phone when provided; else insert new).
                const foundOrCreated = await findOrCreatePersonInOrgWithMeta(supabase, {
                    email: email || null,
                    phone: phone || null,
                    first_name: firstName,
                    last_name: lastName,
                    org_id: ctx.orgId,
                });
                let personId: string | null = foundOrCreated?.id ?? null;
                if (!personId) {
                    const { data: created, error } = await supabase
                        .from("persons")
                        .insert({
                            org_id: ctx.orgId,
                            first_name: firstName,
                            last_name: lastName,
                            email: email || null,
                            phone: phone || null,
                        })
                        .select("id")
                        .single();
                    if (error || !created) {
                        return { ok: false, correlation_id: correlationId, error: error?.message ?? "Failed to create person", status: 400 };
                    }
                    personId = (created as { id: string }).id;
                }

                // Link person to customer via existing relationship table.
                const { data: existingLink } = await supabase
                    .from("customer_persons")
                    .select("id")
                    .eq("org_id", ctx.orgId)
                    .eq("customer_id", customerId)
                    .eq("person_id", personId)
                    .eq("role_type", roleType)
                    .maybeSingle();
                if (existingLink?.id) {
                    return await withActionExecutedEmit(supabase, ctx, correlationId, actionKey, entityTypeRaw, entityId, {
                        kind: "add_related_person",
                        customer_id: customerId,
                        person_id: personId,
                        customer_person_id: (existingLink as { id: string }).id,
                        existed: true,
                    });
                }

                const { data: insertedLink, error: linkErr } = await supabase
                    .from("customer_persons")
                    .insert({
                        org_id: ctx.orgId,
                        customer_id: customerId,
                        person_id: personId,
                        role_type: roleType,
                        is_primary: false,
                        metadata: {},
                    })
                    .select("id")
                    .single();
                if (linkErr || !insertedLink) {
                    if (linkErr?.code === "23505") {
                        return await withActionExecutedEmit(supabase, ctx, correlationId, actionKey, entityTypeRaw, entityId, {
                            kind: "add_related_person",
                            customer_id: customerId,
                            person_id: personId,
                            existed: true,
                        });
                    }
                    return { ok: false, correlation_id: correlationId, error: linkErr?.message ?? "Failed to link person to customer", status: 400 };
                }

                return await withActionExecutedEmit(supabase, ctx, correlationId, actionKey, entityTypeRaw, entityId, {
                    kind: "add_related_person",
                    customer_id: customerId,
                    person_id: personId,
                    customer_person_id: (insertedLink as { id: string }).id,
                    existed: false,
                });
            }

            if (formKey === "add_family_member") {
                const firstName = merged.first_name != null ? String(merged.first_name).trim() : "";
                const lastName = merged.last_name != null ? String(merged.last_name).trim() : "";
                const email = merged.email != null ? String(merged.email).trim() : "";
                const phone = merged.phone != null ? String(merged.phone).trim() : "";
                const roleTypeRaw = merged.role_type != null ? String(merged.role_type).trim() : "";
                const roleType = roleTypeRaw || "family_member";

                if (!firstName || !lastName) {
                    return { ok: false, correlation_id: correlationId, error: "Missing required field: first_name/last_name", status: 400 };
                }

                const entityNorm = String(entityTypeRaw).trim().toLowerCase();
                if (entityNorm !== "opportunity" && entityNorm !== "opportunities") {
                    return { ok: false, correlation_id: correlationId, error: "add_family_member supports opportunity entities only", status: 400 };
                }

                const { data: opp } = await supabase
                    .from("opportunities")
                    .select("id, org_id")
                    .eq("id", entityId)
                    .eq("org_id", ctx.orgId)
                    .maybeSingle();
                if (!opp) {
                    return { ok: false, correlation_id: correlationId, error: "Not found", status: 404 };
                }

                const foundOrCreated = await findOrCreatePersonInOrgWithMeta(supabase, {
                    email: email || null,
                    phone: phone || null,
                    first_name: firstName,
                    last_name: lastName,
                    org_id: ctx.orgId,
                });
                let personId: string | null = foundOrCreated?.id ?? null;
                if (!personId) {
                    const { data: created, error } = await supabase
                        .from("persons")
                        .insert({
                            org_id: ctx.orgId,
                            first_name: firstName,
                            last_name: lastName,
                            email: email || null,
                            phone: phone || null,
                        })
                        .select("id")
                        .single();
                    if (error || !created) {
                        return { ok: false, correlation_id: correlationId, error: error?.message ?? "Failed to create person", status: 400 };
                    }
                    personId = (created as { id: string }).id;
                }

                const { data: existingRow } = await supabase
                    .from("opportunity_persons")
                    .select("id")
                    .eq("org_id", ctx.orgId)
                    .eq("opportunity_id", entityId)
                    .eq("person_id", personId)
                    .maybeSingle();
                if (existingRow?.id) {
                    return await withActionExecutedEmit(supabase, ctx, correlationId, actionKey, entityTypeRaw, entityId, {
                        kind: "add_family_member",
                        opportunity_id: entityId,
                        person_id: personId,
                        opportunity_person_id: (existingRow as { id: string }).id,
                        existed: true,
                    });
                }

                const { data: insertedOppPerson, error: oppPersonErr } = await supabase
                    .from("opportunity_persons")
                    .insert({
                        org_id: ctx.orgId,
                        opportunity_id: entityId,
                        person_id: personId,
                        role_type: roleType,
                        metadata: {},
                    })
                    .select("id")
                    .single();
                if (oppPersonErr || !insertedOppPerson) {
                    if (oppPersonErr?.code === "23505") {
                        return await withActionExecutedEmit(supabase, ctx, correlationId, actionKey, entityTypeRaw, entityId, {
                            kind: "add_family_member",
                            opportunity_id: entityId,
                            person_id: personId,
                            existed: true,
                        });
                    }
                    return {
                        ok: false,
                        correlation_id: correlationId,
                        error: oppPersonErr?.message ?? "Failed to link person to opportunity",
                        status: 400,
                    };
                }

                return await withActionExecutedEmit(supabase, ctx, correlationId, actionKey, entityTypeRaw, entityId, {
                    kind: "add_family_member",
                    opportunity_id: entityId,
                    person_id: personId,
                    opportunity_person_id: (insertedOppPerson as { id: string }).id,
                    existed: false,
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
                    error: "open_form v1 supports submit_action_type=start_workflow or update_status",
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
            // `tour_bookings` is scheduling SoT (Tour Scheduling V1); this path stays legacy metadata + workflow.
            // TODO (Card 6): converge schedule_tour / action UI onto `createTourBooking` so CRM mirror is driven from bookings.
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
            if (!(await assertRowOrg(supabase, "opportunities", entityId, ctx.orgId)).ok) {
                return { ok: false, correlation_id: correlationId, error: "Not found", status: 404 };
            }
            const statusKey = merged.status_key != null ? String(merged.status_key).trim() : "";
            if (!statusKey) {
                return { ok: false, correlation_id: correlationId, error: "update_status requires payload_schema.status_key", status: 400 };
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
                toStatusKey: statusKey,
                currentMetadata: md,
                payload: merged,
            });
            if (!transition.ok) {
                return { ok: false, correlation_id: correlationId, error: transition.message, status: 400 };
            }
            const updates: Record<string, unknown> = { status_key: statusKey };
            if (merged.lost_reason != null) {
                updates.lost_reason = String(merged.lost_reason);
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
                kind: "update_status",
                entity: "opportunities",
                id: entityId,
                row: updated,
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
