import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { emitStatusChangedEvent } from "@/lib/admin/emitStatusChangedEvent";
import { assertAllowedStatusKey } from "@/lib/admin/statusDefinitionsResolve";
import { validateStatusTransition } from "@/lib/admin/statusTransitionRules";
import { emitEvent } from "@/lib/emitEvent";
import { executeWorkflowRun } from "@/lib/workflowRun";

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

/**
 * Server-side action executor (v1). Does not replace domain PATCH routes — reuses org checks + status bridge.
 */
export async function executeAdminAction(
    supabase: SupabaseClient,
    ctx: { orgId: string; userId?: string },
    input: ExecuteAdminActionInput
): Promise<ExecuteAdminActionResult> {
    void ctx.userId;
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
                    .select("status_key, customer_id, primary_contact_id, metadata")
                    .eq("id", entityId)
                    .eq("org_id", ctx.orgId)
                    .maybeSingle();
                if (!existing) {
                    return { ok: false, correlation_id: correlationId, error: "Not found", status: 404 };
                }
                const oldStatusKey = (existing as { status_key?: string | null }).status_key ?? null;
                const md = ((existing as { metadata?: Record<string, unknown> | null }).metadata ?? null) as Record<string, unknown> | null;
                const transition = await validateStatusTransition({
                    supabase,
                    orgId: ctx.orgId,
                    entityType: "opportunities",
                    entityId,
                    departmentId: input.context?.department_id ?? null,
                    workUnitId: input.context?.work_unit_id ?? null,
                    actionKey: actionKey,
                    fromStatusKey: oldStatusKey,
                    toStatusKey: afterUpdateStatusKey,
                    currentMetadata: md,
                    payload: merged,
                });
                if (!transition.ok) {
                    return { ok: false, correlation_id: correlationId, error: transition.message, status: 400 };
                }
                const { data: updated, error: upErr } = await supabase
                    .from("opportunities")
                    .update({ status_key: afterUpdateStatusKey })
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
                const pc = (existing as { primary_contact_id?: string | null }).primary_contact_id;
                if (cust != null) metadata.customer_id = cust;
                if (pc != null) metadata.primary_contact_id = pc;
                try {
                    await emitStatusChangedEvent({
                        supabase,
                        orgId: ctx.orgId,
                        entityType: "opportunities",
                        entityId,
                        oldStatusKey,
                        newStatusKey,
                        metadata: Object.keys(metadata).length ? metadata : undefined,
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
                    .select("status_key, customer_id, primary_contact_id, metadata")
                    .eq("id", entityId)
                    .eq("org_id", ctx.orgId)
                    .maybeSingle();
                if (!existing) {
                    return { ok: false, correlation_id: correlationId, error: "Not found", status: 404 };
                }

                const oldStatusKey = (existing as { status_key?: string | null }).status_key ?? null;
                const md = ((existing as { metadata?: Record<string, unknown> | null }).metadata ?? null) as Record<string, unknown> | null;
                const nextMd: Record<string, unknown> = { ...(md && typeof md === "object" ? md : {}) };

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
                    departmentId: input.context?.department_id ?? null,
                    workUnitId: input.context?.work_unit_id ?? null,
                    actionKey: actionKey,
                    fromStatusKey: oldStatusKey,
                    toStatusKey: statusKey,
                    currentMetadata: md,
                    payload: merged,
                });
                if (!transition.ok) {
                    return { ok: false, correlation_id: correlationId, error: transition.message, status: 400 };
                }

                const { data: updated, error: upErr } = await supabase
                    .from("opportunities")
                    .update({ status_key: statusKey, metadata: nextMd })
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
                const pc = (existing as { primary_contact_id?: string | null }).primary_contact_id;
                if (cust != null) metadata.customer_id = cust;
                if (pc != null) metadata.primary_contact_id = pc;
                try {
                    await emitStatusChangedEvent({
                        supabase,
                        orgId: ctx.orgId,
                        entityType: "opportunities",
                        entityId,
                        oldStatusKey,
                        newStatusKey,
                        metadata: Object.keys(metadata).length ? metadata : undefined,
                    });
                } catch (e) {
                    console.error("[executeAdminAction] emitStatusChangedEvent (open_form.submit:update_status)", e);
                }

                return {
                    ok: true,
                    correlation_id: correlationId,
                    execution_result: { kind: "update_status", status_key: statusKey, ...(updatedRow ? { row: updatedRow } : {}) },
                };
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
            // Canonical scheduling entities will come later; for now keep it in metadata.
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
                    const { data: mdUpdated } = await supabase
                        .from("opportunities")
                        .update({ metadata: nextMd })
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
                return {
                    ok: true,
                    correlation_id: correlationId,
                    execution_result: {
                        kind: "start_workflow",
                        workflow_id: wf.id,
                        workflow_run_id: run.workflow_run_id,
                        run_status: run.status,
                        ...(updatedRow ? { row: updatedRow } : {}),
                    },
                };
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
            return {
                ok: true,
                correlation_id: correlationId,
                execution_result: { kind: "navigate", href },
            };
        }
        case "external_link": {
            const href = merged.href != null ? String(merged.href) : "";
            if (!href) {
                return { ok: false, correlation_id: correlationId, error: "external_link requires payload.href", status: 400 };
            }
            return {
                ok: true,
                correlation_id: correlationId,
                execution_result: { kind: "external_link", href },
            };
        }
        case "open_drawer": {
            const drawer = merged.drawer && typeof merged.drawer === "object" ? (merged.drawer as Record<string, unknown>) : {};
            const entityType = String(drawer.entityType ?? "opportunities").trim();
            const defaultSurface = drawer.defaultSurface != null ? String(drawer.defaultSurface) : null;
            return {
                ok: true,
                correlation_id: correlationId,
                execution_result: {
                    kind: "open_drawer",
                    drawer: { entityType, id: entityId, defaultSurface },
                },
            };
        }
        case "ui_intent": {
            return {
                ok: true,
                correlation_id: correlationId,
                execution_result: { kind: "ui_intent", intent: merged.intent ?? merged, context: input.context ?? {} },
            };
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
                .select("status_key, customer_id, primary_contact_id, metadata")
                .eq("id", entityId)
                .eq("org_id", ctx.orgId)
                .maybeSingle();
            if (!existing) {
                return { ok: false, correlation_id: correlationId, error: "Not found", status: 404 };
            }
            const oldStatusKey = (existing as { status_key?: string | null }).status_key ?? null;
            const md = ((existing as { metadata?: Record<string, unknown> | null }).metadata ?? null) as Record<string, unknown> | null;
            const transition = await validateStatusTransition({
                supabase,
                orgId: ctx.orgId,
                entityType: "opportunities",
                entityId,
                departmentId: input.context?.department_id ?? null,
                workUnitId: input.context?.work_unit_id ?? null,
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
            const pc = (existing as { primary_contact_id?: string | null }).primary_contact_id;
            if (cust != null) metadata.customer_id = cust;
            if (pc != null) metadata.primary_contact_id = pc;
            try {
                await emitStatusChangedEvent({
                    supabase,
                    orgId: ctx.orgId,
                    entityType: "opportunities",
                    entityId,
                    oldStatusKey,
                    newStatusKey,
                    metadata: Object.keys(metadata).length ? metadata : undefined,
                });
            } catch (e) {
                console.error("[executeAdminAction] emitStatusChangedEvent", e);
            }
            return {
                ok: true,
                correlation_id: correlationId,
                execution_result: { kind: "update_status", entity: "opportunities", id: entityId, row: updated },
            };
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
            const { data: updated, error: upErr } = await supabase
                .from("opportunities")
                .update({ [fieldKey]: value })
                .eq("id", entityId)
                .eq("org_id", ctx.orgId)
                .select()
                .single();
            if (upErr || !updated) {
                return { ok: false, correlation_id: correlationId, error: upErr?.message ?? "Update failed", status: 400 };
            }
            return {
                ok: true,
                correlation_id: correlationId,
                execution_result: { kind: "update_field", entity: "opportunities", id: entityId, row: updated },
            };
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
                return {
                    ok: true,
                    correlation_id: correlationId,
                    execution_result: {
                        kind: "start_workflow",
                        workflow_id: wf.id,
                        workflow_run_id: run.workflow_run_id,
                        run_status: run.status,
                    },
                };
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                return { ok: false, correlation_id: correlationId, error: msg, status: 500 };
            }
        }
        default:
            return { ok: false, correlation_id: correlationId, error: `Unsupported action_type: ${def.action_type}`, status: 400 };
    }
}
