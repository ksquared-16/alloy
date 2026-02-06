import type { SupabaseClient } from "@supabase/supabase-js";
import { getByPath, renderTemplate } from "@/lib/workflowTemplate";

function evaluateCondition(
    eventPayload: Record<string, unknown>,
    field: string,
    operator: string,
    value: string
): boolean {
    const actual = getByPath(eventPayload, field);
    const valStr = value;

    switch (operator) {
        case "exists":
            return actual != null && actual !== "";
        case "equals":
            if (actual == null) return valStr === "" || valStr === "null";
            return String(actual) === valStr || (typeof actual === "number" && parseFloat(valStr) === actual);
        case "not_equals":
            if (actual == null) return valStr !== "" && valStr !== "null";
            return String(actual) !== valStr;
        case "contains":
            return String(actual ?? "").includes(valStr);
        case "gt": {
            const n = Number(actual);
            const v = parseFloat(valStr);
            return !Number.isNaN(n) && !Number.isNaN(v) && n > v;
        }
        case "gte": {
            const n = Number(actual);
            const v = parseFloat(valStr);
            return !Number.isNaN(n) && !Number.isNaN(v) && n >= v;
        }
        case "lt": {
            const n = Number(actual);
            const v = parseFloat(valStr);
            return !Number.isNaN(n) && !Number.isNaN(v) && n < v;
        }
        case "lte": {
            const n = Number(actual);
            const v = parseFloat(valStr);
            return !Number.isNaN(n) && !Number.isNaN(v) && n <= v;
        }
        default:
            return String(actual) === valStr;
    }
}

const ENTITY_TABLES: Record<string, string> = {
    job: "jobs",
    jobs: "jobs",
    opportunity: "opportunities",
    opportunities: "opportunities",
    contact: "contacts",
    contacts: "contacts",
    customer: "customers",
    customers: "customers",
    schedule: "schedules",
    schedules: "schedules",
};

function resolveId(value: unknown, eventPayload: Record<string, unknown>): string | null {
    if (value == null) return null;
    const s = typeof value === "string" ? renderTemplate(value, eventPayload) : String(value);
    return s.trim() || null;
}

export interface WorkflowRunResult {
    ok: boolean;
    status: "completed" | "skipped" | "failed";
    workflow_run_id: string;
    error?: string;
    logs?: string[];
}

/**
 * Execute a workflow run: insert run row, evaluate conditions, execute actions.
 * Caller must pass a Supabase client (e.g. createAdminClient()).
 */
export async function executeWorkflowRun(
    supabase: SupabaseClient,
    workflowId: string,
    eventPayload: Record<string, unknown>
): Promise<WorkflowRunResult> {
    const { data: workflow, error: wErr } = await supabase
        .from("workflows")
        .select("*")
        .eq("id", workflowId)
        .single();
    if (wErr || !workflow) {
        throw new Error("Workflow not found");
    }

    const runId = crypto.randomUUID();
    const startedAt = new Date().toISOString();

    const { error: runInsertErr } = await supabase.from("workflow_runs").insert({
        id: runId,
        workflow_id: workflowId,
        event_id: null,
        status: "running",
        error: null,
        started_at: startedAt,
        completed_at: null,
        event_payload: eventPayload,
    });
    if (runInsertErr) {
        throw new Error(runInsertErr.message);
    }

    const { data: conditions } = await supabase
        .from("workflow_conditions")
        .select("field, operator, value")
        .eq("workflow_id", workflowId);

    const allPass = (conditions ?? []).every(
        (c: { field: string; operator: string; value: string }) =>
            evaluateCondition(eventPayload, c.field, c.operator, c.value ?? "")
    );

    if (!allPass) {
        await supabase
            .from("workflow_runs")
            .update({ status: "skipped", completed_at: new Date().toISOString() })
            .eq("id", runId);
        return { ok: true, status: "skipped", workflow_run_id: runId };
    }

    const { data: actions } = await supabase
        .from("workflow_actions")
        .select("id, action_order, action_type, target_entity, payload")
        .eq("workflow_id", workflowId)
        .order("action_order", { ascending: true });

    const logs: string[] = [];

    try {
        for (const action of actions ?? []) {
            const pl = (action.payload as Record<string, unknown>) ?? {};
            switch (action.action_type) {
                case "create_message": {
                    const channel = pl.channel != null ? String(pl.channel) : "email";
                    const toValueRaw = pl.to_value != null ? String(pl.to_value) : "";
                    const bodyRaw = pl.body != null ? String(pl.body) : "";
                    const toValue = renderTemplate(toValueRaw, eventPayload);
                    const bodyText = renderTemplate(bodyRaw, eventPayload);
                    const contactId = resolveId(pl.contact_id, eventPayload);
                    const customerId = resolveId(pl.customer_id, eventPayload);
                    const opportunityId = resolveId(pl.opportunity_id, eventPayload);
                    const jobId = resolveId(pl.job_id, eventPayload);
                    const { error: msgErr } = await supabase.from("messages").insert({
                        customer_id: customerId,
                        contact_id: contactId,
                        opportunity_id: opportunityId,
                        job_id: jobId,
                        channel,
                        direction: "outbound",
                        from_value: null,
                        to_value: toValue,
                        body: bodyText,
                        status: "queued",
                        sent_at: null,
                        provider: null,
                        provider_message_id: null,
                        metadata: {
                            workflow_id: workflowId,
                            workflow_run_id: runId,
                            action_type: "create_message",
                            action_order: action.action_order,
                        },
                        related_entity_type: null,
                        related_entity_id: null,
                        workflow_run_id: runId,
                        error: null,
                    });
                    if (msgErr) throw new Error(`create_message: ${msgErr.message}`);
                    break;
                }
                case "update_entity": {
                    const entityType = pl.entity_type != null ? String(pl.entity_type) : "";
                    const entityIdPath = pl.entity_id != null ? String(pl.entity_id) : "";
                    const patch = pl.patch && typeof pl.patch === "object" ? (pl.patch as Record<string, unknown>) : {};
                    const table = ENTITY_TABLES[entityType];
                    if (!table) throw new Error(`update_entity: unknown entity_type ${entityType}`);
                    let entityId: string | null = null;
                    if (entityIdPath.startsWith("event.") || !entityIdPath.includes(".")) {
                        const path = entityIdPath.replace(/^event\./, "");
                        const resolved = path ? getByPath(eventPayload, path) : null;
                        entityId = resolved != null ? String(resolved) : null;
                    } else {
                        entityId = entityIdPath;
                    }
                    if (!entityId) throw new Error(`update_entity: could not resolve entity_id ${entityIdPath}`);
                    const { error: updErr } = await supabase.from(table).update(patch).eq("id", entityId);
                    if (updErr) throw new Error(`update_entity: ${updErr.message}`);
                    break;
                }
                case "log": {
                    const message = pl.message != null ? String(pl.message) : "";
                    logs.push(message);
                    break;
                }
                default:
                    logs.push(`Unknown action_type: ${action.action_type}`);
            }
        }

        const updateRun: { status: string; completed_at: string; error?: string | null; event_payload?: Record<string, unknown> } = {
            status: "completed",
            completed_at: new Date().toISOString(),
            error: null,
        };
        if (logs.length > 0) {
            updateRun.event_payload = { ...eventPayload, metadata: { ...((eventPayload.metadata as Record<string, unknown>) ?? {}), logs } };
        }
        await supabase.from("workflow_runs").update(updateRun).eq("id", runId);

        return {
            ok: true,
            status: "completed",
            workflow_run_id: runId,
            logs: logs.length > 0 ? logs : undefined,
        };
    } catch (actionErr: unknown) {
        const errMsg = actionErr instanceof Error ? actionErr.message : String(actionErr);
        await supabase
            .from("workflow_runs")
            .update({
                status: "failed",
                error: errMsg,
                completed_at: new Date().toISOString(),
            })
            .eq("id", runId);
        return {
            ok: false,
            status: "failed",
            workflow_run_id: runId,
            error: errMsg,
        };
    }
}
