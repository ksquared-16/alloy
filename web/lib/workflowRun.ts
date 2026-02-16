import type { SupabaseClient } from "@supabase/supabase-js";
import { getByPath, renderTemplate } from "@/lib/workflowTemplate";

/** Standard event payload shape; all entity keys optional. Do not crash if missing. */
export type WorkflowEventPayload = {
    event_type?: string;
    occurred_at?: string;
    org_id?: string | null;
    customer?: Record<string, unknown> | null;
    contact?: Record<string, unknown> | null;
    opportunity?: Record<string, unknown> | null;
    job?: Record<string, unknown> | null;
    schedule?: Record<string, unknown> | null;
    vendor?: Record<string, unknown> | null;
    [key: string]: unknown;
};

const CANONICAL_ENTITY_TYPES = ["customer", "contact", "job", "schedule", "opportunity", "vendor"] as const;

/**
 * Resolve job zip from payload for vendor matching. Tries schedule, job, opportunity, customer.
 * Returns 5-digit zip (strip non-digits, take first 5) or null.
 */
function getJobZip(payload: Record<string, unknown>): string | null {
    const schedule = payload.schedule as Record<string, unknown> | undefined;
    const job = payload.job as Record<string, unknown> | undefined;
    const opportunity = payload.opportunity as Record<string, unknown> | undefined;
    const customer = payload.customer as Record<string, unknown> | undefined;
    const raw =
        (schedule?.postal_code != null && String(schedule.postal_code).trim() !== "" ? String(schedule.postal_code).trim() : null) ??
        (schedule?.location != null && typeof schedule.location === "object" && (schedule.location as Record<string, unknown>)?.postal_code != null
            ? String((schedule.location as Record<string, unknown>).postal_code).trim()
            : null) ??
        (job?.postal_code != null && String(job.postal_code).trim() !== "" ? String(job.postal_code).trim() : null) ??
        (opportunity?.postal_code != null && String(opportunity.postal_code).trim() !== "" ? String(opportunity.postal_code).trim() : null) ??
        (customer?.postal_code != null && String(customer.postal_code).trim() !== "" ? String(customer.postal_code).trim() : null);
    if (raw == null || raw === "") return null;
    const digitsOnly = String(raw).replace(/\D/g, "");
    const five = digitsOnly.slice(0, 5);
    return five.length >= 5 ? five : null;
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
    vendor: "vendors",
    vendors: "vendors",
};

type ConditionRow = {
    target_entity?: string | null;
    field_path?: string | null;
    field?: string | null;
    operator?: string | null;
    value?: unknown;
    value_jsonb?: unknown;
    enabled?: boolean | null;
};

/** Normalize legacy field_path: for vendor entity, strip "vendor." prefix so path is relative to payload.vendor. */
function normalizeFieldPathForEntity(entityType: string, path: string): string {
    const p = path.trim();
    if (!p) return p;
    if ((entityType === "vendor" || entityType === "vendors") && p.startsWith("vendor.")) {
        return p.slice("vendor.".length).trim() || p;
    }
    return p;
}

function getConditionActual(payload: Record<string, unknown>, defaultEntityType: string | null, c: ConditionRow): unknown {
    const entityType = (c.target_entity ?? defaultEntityType ?? "job").trim() || "job";
    const entity = payload[entityType];
    const rawPath = (c.field_path ?? c.field ?? "").trim();
    const path = normalizeFieldPathForEntity(entityType, rawPath);
    if (path && entity != null && typeof entity === "object") {
        return getByPath(entity, path);
    }
    if (c.field && typeof c.field === "string" && c.field.trim()) {
        return getByPath(payload, c.field.trim());
    }
    return undefined;
}

function normalizeConditionValue(v: unknown): string | number | boolean | null | unknown[] {
    if (v === undefined || v === null) return null;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
    if (Array.isArray(v)) return v;
    if (typeof v === "object" && v !== null && "value" in (v as object)) return normalizeConditionValue((v as { value: unknown }).value);
    return String(v);
}

function evaluateCondition(
    payload: Record<string, unknown>,
    defaultEntityType: string | null,
    c: ConditionRow
): boolean {
    if (c.enabled === false) return true;
    const actual = getConditionActual(payload, defaultEntityType, c);
    const rawVal = c.value_jsonb !== undefined && c.value_jsonb !== null ? c.value_jsonb : c.value;
    const val = normalizeConditionValue(rawVal);
    const operator = (c.operator ?? "eq").trim().toLowerCase();

    switch (operator) {
        case "is_null":
            return actual == null || actual === "";
        case "not_null":
            return actual != null && actual !== "";
        case "eq":
        case "equals":
            if (actual == null) return val === null || val === "" || val === "null";
            if (typeof val === "string" && (val === "" || val === "null")) return actual == null;
            return String(actual) === String(val) || (typeof actual === "number" && typeof val === "number" && actual === val);
        case "neq":
        case "not_equals":
            if (actual == null) return val !== null && val !== "" && val !== "null";
            return String(actual) !== String(val);
        case "contains": {
            if (Array.isArray(actual)) {
                const v = val != null ? String(val) : "";
                return actual.some((x) => String(x) === v);
            }
            return String(actual ?? "").includes(String(val ?? ""));
        }
        case "gt": {
            const n = Number(actual);
            const v = typeof val === "number" ? val : parseFloat(String(val));
            return !Number.isNaN(n) && !Number.isNaN(v) && n > v;
        }
        case "lt": {
            const n = Number(actual);
            const v = typeof val === "number" ? val : parseFloat(String(val));
            return !Number.isNaN(n) && !Number.isNaN(v) && n < v;
        }
        case "gte": {
            const n = Number(actual);
            const v = typeof val === "number" ? val : parseFloat(String(val));
            return !Number.isNaN(n) && !Number.isNaN(v) && n >= v;
        }
        case "lte": {
            const n = Number(actual);
            const v = typeof val === "number" ? val : parseFloat(String(val));
            return !Number.isNaN(n) && !Number.isNaN(v) && n <= v;
        }
        case "in": {
            const arr = Array.isArray(val) ? val : (typeof val === "string" ? [val] : []);
            const actualStr = actual != null ? String(actual) : "";
            return arr.some((x) => String(x) === actualStr);
        }
        case "not_in": {
            const arr = Array.isArray(val) ? val : (typeof val === "string" ? [val] : []);
            const actualStr = actual != null ? String(actual) : "";
            return !arr.some((x) => String(x) === actualStr);
        }
        case "exists":
            return actual != null && actual !== "";
        case "overlaps": {
            const actualArr = Array.isArray(actual) ? actual : [];
            const valArr = Array.isArray(val) ? val : (val != null ? [val] : []);
            return actualArr.some((a) => valArr.some((v) => String(a) === String(v)));
        }
        default:
            return String(actual) === String(val);
    }
}

function resolveId(value: unknown, eventPayload: Record<string, unknown>): string | null {
    if (value == null) return null;
    const s = typeof value === "string" ? renderTemplate(value, eventPayload) : String(value);
    return s.trim() || null;
}

/** Single resolved recipient for send_message (contact_id and/or to_phone/to_email). */
type ResolvedRecipient = { contact_id?: string | null; to_phone?: string | null; to_email?: string | null };

/** Recipient spec from send_message payload.recipients[]. */
type RecipientSpec = {
    type?: string;
    source?: string;
    path?: string;
    vendor_id_path?: string;
    role_in?: string[];
    max?: number;
};

async function resolveRecipients(
    supabase: SupabaseClient,
    payload: Record<string, unknown>,
    recipients: RecipientSpec[],
    logs: string[]
): Promise<ResolvedRecipient[]> {
    const out: ResolvedRecipient[] = [];
    const seen = new Set<string>();

    for (const r of recipients ?? []) {
        const source = (r.source ?? "payload").toLowerCase();
        const type = (r.type ?? "").toLowerCase();

        if (source === "payload" && r.path) {
            const id = getByPath(payload, r.path.trim());
            const contactId = id != null ? String(id) : null;
            if (contactId) {
                const key = `c:${contactId}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    out.push({ contact_id: contactId });
                }
            } else {
                logs.push(`send_message: payload path ${r.path} resolved to empty`);
            }
            continue;
        }

        if (source === "query" && (type === "contacts_by_vendor" || type === "vendor_contacts") && r.vendor_id_path) {
            const vendorId = getByPath(payload, r.vendor_id_path.trim());
            if (vendorId == null) {
                logs.push(`send_message: vendor_id_path ${r.vendor_id_path} empty`);
                continue;
            }
            const vid = String(vendorId);
            let list: { id: string; phone?: string | null; email?: string | null }[];
            const roleIn = r.role_in ?? ["primary"];
            if (roleIn.length > 0) {
                const { data } = await supabase
                    .from("contacts")
                    .select("id, phone, email")
                    .eq("vendor_id", vid)
                    .in("vendor_contact_role", roleIn);
                list = (data ?? []) as { id: string; phone?: string | null; email?: string | null }[];
            } else {
                const { data } = await supabase
                    .from("contacts")
                    .select("id, phone, email")
                    .eq("vendor_id", vid);
                list = (data ?? []) as { id: string; phone?: string | null; email?: string | null }[];
            }
            for (const c of list) {
                const key = `c:${c.id}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    out.push({ contact_id: c.id, to_phone: c.phone ?? undefined, to_email: c.email ?? undefined });
                }
            }
            continue;
        }

        if (source === "resolver" && type === "job_qualified_vendors") {
            const job = payload.job as Record<string, unknown> | undefined;
            const jobId = job && typeof job === "object" && job.id != null ? String(job.id) : null;
            const max = typeof r.max === "number" ? r.max : 25;
            const orgId = payload.org_id != null ? String(payload.org_id) : null;
            if (!job || typeof job !== "object") {
                logs.push("send_message: job_qualified_vendors resolver requires job in payload");
                continue;
            }
            if (!orgId) {
                logs.push("send_message: job_qualified_vendors resolver requires org_id in payload");
                continue;
            }
            const jobVerticalId = (job.vertical_id ?? (job as { verticalId?: string; _job_vertical?: { id?: string } }).verticalId ?? (job as { _job_vertical?: { id?: string } })._job_vertical?.id) != null
                ? String(job.vertical_id ?? (job as { verticalId?: string; _job_vertical?: { id?: string } }).verticalId ?? (job as { _job_vertical?: { id?: string } })._job_vertical?.id)
                : null;
            if (!jobVerticalId) {
                console.warn("[WORKFLOW] job_qualified_vendors: missing job vertical", { jobId, orgId });
                logs.push("send_message: job_qualified_vendors requires job vertical; skipping (fail closed)");
                continue;
            }
            const jobZip = getJobZip(payload);
            if (!jobZip) {
                console.warn("[WORKFLOW] job_qualified_vendors: missing job zip; using vertical-only", { jobId, orgId, jobVerticalId });
                logs.push("send_message: job_qualified_vendors no jobZip; using vertical-only match");
            }
            const { data: vvRows } = await supabase
                .from("vendor_verticals")
                .select("vendor_id")
                .eq("vertical_id", jobVerticalId);
            const vendorIdsInVertical = (vvRows ?? []) as { vendor_id: string }[];
            const vendorIdSet = new Set(vendorIdsInVertical.map((row) => row.vendor_id));
            if (vendorIdSet.size === 0) {
                logs.push("job_qualified_vendors: no vendors in vertical");
                console.log("[WORKFLOW] job_qualified_vendors resolved", { jobId, orgId, jobZip: jobZip ?? null, jobVerticalId, count: 0 });
                continue;
            }
            const { data: statusRow } = await supabase.from("vendor_statuses").select("id").eq("key", "approved").maybeSingle();
            const approvedStatusId = (statusRow as { id?: string } | null)?.id ?? null;
            let vendorsQuery = supabase
                .from("vendors")
                .select("id, primary_contact_id, service_area_zip_codes")
                .eq("org_id", orgId)
                .in("id", Array.from(vendorIdSet))
                .limit(500);
            if (approvedStatusId) {
                vendorsQuery = vendorsQuery.eq("vendor_status_id", approvedStatusId);
            }
            const { data: approvedVendors } = await vendorsQuery;
            let list = (approvedVendors ?? []) as { id: string; primary_contact_id?: string | null; service_area_zip_codes?: string[] | null }[];
            if (jobZip) {
                list = list.filter((v) => {
                    const zips = v.service_area_zip_codes;
                    if (!zips || !Array.isArray(zips)) return false;
                    return zips.some((z) => String(z).replace(/\D/g, "").slice(0, 5) === jobZip);
                });
            }
            const contactIds: string[] = [];
            for (const v of list.slice(0, max)) {
                if (v.primary_contact_id) {
                    const key = `c:${v.primary_contact_id}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        contactIds.push(v.primary_contact_id);
                    }
                }
            }
            for (const cid of contactIds) {
                out.push({ contact_id: cid });
            }
            console.log("[WORKFLOW] job_qualified_vendors resolved", { jobId, orgId, jobZip: jobZip ?? null, jobVerticalId, count: contactIds.length });
            logs.push(`job_qualified_vendors: resolved count=${contactIds.length}`);
            continue;
        }

        logs.push(`send_message: unknown recipient type/source ${type}/${source}`);
    }

    return out;
}

async function ensureContactPhoneEmail(supabase: SupabaseClient, r: ResolvedRecipient): Promise<ResolvedRecipient> {
    if (r.contact_id && (!r.to_phone && !r.to_email)) {
        const { data: c } = await supabase.from("contacts").select("phone, email").eq("id", r.contact_id).single();
        if (c) {
            return { ...r, to_phone: (c as { phone?: string }).phone ?? null, to_email: (c as { email?: string }).email ?? null };
        }
        return r;
    }
    return r;
}

export interface WorkflowRunResult {
    ok: boolean;
    status: "completed" | "skipped" | "failed";
    workflow_run_id: string;
    error?: string;
    logs?: string[];
}

/**
 * Enrich payload.vendor with vendor_status (id, key, label), vendor_vertical_ids, vendor_vertical_keys (slugs), vendor_vertical_names
 * so conditions like vendor_status.key and vendor_vertical_keys can be evaluated without extra DB in the condition loop.
 * Schema: vendor_statuses has id, key, label (no name); verticals has slug, name.
 */
async function enrichVendorPayload(supabase: SupabaseClient, payload: WorkflowEventPayload): Promise<void> {
    const vendor = payload.vendor;
    if (!vendor || typeof vendor !== "object") return;
    const vendorId = (vendor as { id?: string }).id;
    if (!vendorId) return;

    const statusId = (vendor as { vendor_status_id?: string | null }).vendor_status_id;
    if (statusId) {
        const { data: vs, error: _vsErr } = await supabase
            .from("vendor_statuses")
            .select("id, key, label")
            .eq("id", statusId)
            .maybeSingle();
        const row = vs as { id: string; key: string; label: string } | null;
        (vendor as Record<string, unknown>).vendor_status = row ? { id: row.id, key: row.key, label: row.label } : null;
    } else {
        (vendor as Record<string, unknown>).vendor_status = null;
    }

    const { data: vvRows } = await supabase
        .from("vendor_verticals")
        .select("vertical_id")
        .eq("vendor_id", vendorId);
    const verticalIds = ((vvRows ?? []) as { vertical_id: string }[]).map((r) => r.vertical_id);
    (vendor as Record<string, unknown>).vendor_vertical_ids = verticalIds;

    if (verticalIds.length > 0) {
        const { data: vertRows } = await supabase
            .from("verticals")
            .select("id, slug, name")
            .in("id", verticalIds);
        const keys: string[] = [];
        const names: string[] = [];
        for (const v of vertRows ?? []) {
            const r = v as { id: string; slug?: string | null; name?: string | null };
            keys.push(r.slug ?? r.id);
            names.push(r.name ?? r.id);
        }
        (vendor as Record<string, unknown>).vendor_vertical_keys = keys;
        (vendor as Record<string, unknown>).vendor_vertical_names = names;
    } else {
        (vendor as Record<string, unknown>).vendor_vertical_keys = [];
        (vendor as Record<string, unknown>).vendor_vertical_names = [];
    }
}

/**
 * Execute a workflow run: insert run row, evaluate conditions, execute actions.
 * Event payload should include event_type, occurred_at, org_id, and entity keys (customer, contact, job, schedule, opportunity, vendor) when available.
 */
export async function executeWorkflowRun(
    supabase: SupabaseClient,
    workflowId: string,
    eventPayload: Record<string, unknown>
): Promise<WorkflowRunResult> {
    const payload: WorkflowEventPayload = {
        event_type: (eventPayload.event_type as string) ?? "",
        occurred_at: (eventPayload.occurred_at as string) ?? new Date().toISOString(),
        org_id: (eventPayload.org_id as string) ?? null,
        customer: (eventPayload.customer as Record<string, unknown>) ?? null,
        contact: (eventPayload.contact as Record<string, unknown>) ?? null,
        opportunity: (eventPayload.opportunity as Record<string, unknown>) ?? null,
        job: (eventPayload.job as Record<string, unknown>) ?? null,
        schedule: (eventPayload.schedule as Record<string, unknown>) ?? null,
        vendor: (eventPayload.vendor as Record<string, unknown>) ?? null,
        ...eventPayload,
    };

    await enrichVendorPayload(supabase, payload);

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
    const defaultEntityType = (workflow as { entity_type?: string }).entity_type ?? null;

    const { error: runInsertErr } = await supabase.from("workflow_runs").insert({
        id: runId,
        workflow_id: workflowId,
        event_id: null,
        status: "running",
        error: null,
        started_at: startedAt,
        completed_at: null,
        event_payload: payload,
    });
    if (runInsertErr) {
        throw new Error(runInsertErr.message);
    }

    const { data: conditions } = await supabase
        .from("workflow_conditions")
        .select("target_entity, field_path, field, operator, value, value_jsonb, enabled")
        .eq("workflow_id", workflowId);

    const allPass = (conditions ?? []).every((c: ConditionRow) => {
        try {
            return evaluateCondition(payload, defaultEntityType, c);
        } catch {
            return false;
        }
    });

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
    const orgId = payload.org_id ?? null;

    try {
        for (const action of actions ?? []) {
            const pl = (action.payload as Record<string, unknown>) ?? {};
            const actionTargetEntity = (action.target_entity ?? defaultEntityType ?? "job") as string;
            const table = ENTITY_TABLES[actionTargetEntity];

            switch (action.action_type) {
                case "create_message": {
                    const channel = pl.channel != null ? String(pl.channel) : "email";
                    const toValueRaw = pl.to_value != null ? String(pl.to_value) : "";
                    const bodyRaw = pl.body != null ? String(pl.body) : "";
                    const toValue = renderTemplate(toValueRaw, payload);
                    const bodyText = renderTemplate(bodyRaw, payload);
                    const contactId = resolveId(pl.contact_id, payload);
                    const customerId = resolveId(pl.customer_id, payload);
                    const opportunityId = resolveId(pl.opportunity_id, payload);
                    const jobId = resolveId(pl.job_id, payload);
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
                case "send_message": {
                    const channel = (pl.channel ?? "sms") as string;
                    const template = (pl.template ?? pl.body ?? "") as string;
                    const recipients = (pl.recipients ?? []) as RecipientSpec[];
                    const dedupeKey = (pl.dedupe_key ?? "") as string;
                    const bodyText = renderTemplate(template, payload);
                    const resolved = await resolveRecipients(supabase, payload, recipients, logs);
                    const deduped: ResolvedRecipient[] = [];
                    const seenKey = new Set<string>();
                    for (const r of resolved) {
                        const key = r.contact_id ? `c:${r.contact_id}` : `p:${r.to_phone ?? ""}:e:${r.to_email ?? ""}`;
                        if (seenKey.has(key)) continue;
                        seenKey.add(key);
                        deduped.push(r);
                    }
                    for (const r of deduped) {
                        const filled = await ensureContactPhoneEmail(supabase, r);
                        const toPhone = filled.to_phone ?? null;
                        const toEmail = filled.to_email ?? null;
                        const { error: outErr } = await supabase.from("messages_outbox").insert({
                            org_id: orgId,
                            workflow_run_id: runId,
                            channel,
                            to_contact_id: filled.contact_id ?? null,
                            to_phone: toPhone,
                            to_email: toEmail,
                            body: bodyText,
                            status: "queued",
                            dedupe_key: dedupeKey || null,
                        });
                        if (outErr) {
                            if (dedupeKey && String(outErr).includes("duplicate")) {
                                logs.push(`send_message: skipped duplicate dedupe_key=${dedupeKey}`);
                            } else {
                                throw new Error(`send_message outbox: ${outErr.message}`);
                            }
                        }
                    }
                    logs.push(`send_message: queued ${deduped.length} recipient(s)`);
                    break;
                }
                case "update_entity": {
                    const entityType = (pl.entity_type ?? pl.target_entity ?? actionTargetEntity) as string;
                    const entityIdPath = pl.entity_id != null ? String(pl.entity_id) : "";
                    const patch = pl.patch && typeof pl.patch === "object" ? (pl.patch as Record<string, unknown>) : {};
                    const tableName = ENTITY_TABLES[entityType];
                    if (!tableName) {
                        logs.push(`update_entity: unknown entity_type ${entityType}, skipping`);
                        break;
                    }
                    let entityId: string | null = null;
                    if (entityIdPath && (entityIdPath.startsWith("event.") || entityIdPath.includes("."))) {
                        const path = entityIdPath.replace(/^event\./, "");
                        const resolved = path ? getByPath(payload, path) : null;
                        entityId = resolved != null ? String(resolved) : null;
                    } else if (entityIdPath) {
                        entityId = entityIdPath;
                    }
                    if (!entityId) {
                        const entityFromPayload = payload[entityType];
                        entityId = entityFromPayload && typeof entityFromPayload === "object" && entityFromPayload !== null && "id" in entityFromPayload
                            ? String((entityFromPayload as { id: unknown }).id)
                            : null;
                    }
                    if (!entityId) {
                        logs.push(`update_entity: could not resolve entity_id for ${entityType}, skipping`);
                        break;
                    }
                    const { error: updErr } = await supabase.from(tableName).update(patch).eq("id", entityId);
                    if (updErr) throw new Error(`update_entity: ${updErr.message}`);
                    break;
                }
                case "log": {
                    const message = pl.message != null ? String(pl.message) : "";
                    logs.push(renderTemplate(message, payload));
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
            updateRun.event_payload = { ...payload, metadata: { ...((payload.metadata as Record<string, unknown>) ?? {}), logs } };
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
            logs: logs.length > 0 ? logs : undefined,
        };
    }
}
