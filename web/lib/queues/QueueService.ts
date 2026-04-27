import { createAdminClient } from "@/lib/supabaseAdmin";
import { validateQueueDefinition, type QueueConfig, type QueueDefinitionV1, type QueueFilter } from "@/lib/config/queueDefinitionSchema";
import type { QueueItemsResult, QueueSummary } from "@/lib/queues/types";
import { fetchEffectiveStatusDefinitions, displayLabelsFromDefinitions } from "@/lib/admin/statusDefinitionsResolve";

type JobRowPreview = {
    id: string;
    title: string | null;
    status_key: string | null;
    work_unit_id: string | null;
    assigned_vendor_id: string | null;
    created_at: string;
    updated_at: string;
};

type OpportunityRowPreview = {
    id: string;
    name: string | null;
    title?: string | null;
    status_key: string | null;
    customer_id: string | null;
    primary_contact_id: string | null;
    work_unit_id: string | null;
    created_at: string;
    updated_at: string;
    metadata?: Record<string, unknown> | null;
};

export class QueueServiceError extends Error {
    status: number;
    code: string;
    constructor(message: string, status: number, code: string) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

const JOB_FIELD_ALLOWLIST = new Set(["status_key", "assigned_vendor_id", "work_unit_id", "created_at"] as const);
const JOB_SORT_ALLOWLIST = new Set(["created_at", "updated_at", "status_key"] as const);
const JOB_DATE_FIELD_ALLOWLIST = new Set(["created_at"] as const);

const OPPORTUNITY_FIELD_ALLOWLIST = new Set(["status_key", "created_at", "updated_at"] as const);
const OPPORTUNITY_SORT_ALLOWLIST = new Set(["updated_at", "created_at", "status_key", "name"] as const);
const OPPORTUNITY_DATE_FIELD_ALLOWLIST = new Set(["created_at", "updated_at"] as const);

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

function getStoredQueueDefinitionVersion(raw: unknown): number | null {
    if (!isPlainObject(raw)) return null;
    const v = raw.version;
    return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function loadQueueDefinitionOrThrow(raw: unknown): QueueDefinitionV1 {
    try {
        const validated = validateQueueDefinition(raw);
        return validated;
    } catch {
        throw new QueueServiceError("Work unit queue_definition is not QueueDefinitionV1", 400, "INVALID_QUEUE_DEFINITION");
    }
}

function findQueueByKey(def: QueueDefinitionV1, queueKey: string): QueueConfig {
    const q = def.queues.find((x) => x.key === queueKey);
    if (!q) {
        throw new QueueServiceError(`Unknown queue key: ${queueKey}`, 404, "UNKNOWN_QUEUE_KEY");
    }
    return q;
}

function assertSupportedEntityType(def: QueueDefinitionV1) {
    if (def.entity_type === "job") return;
    if (def.entity_type === "opportunity") return;
    throw new QueueServiceError(`QueueService does not support entity_type: ${def.entity_type}`, 501, "NOT_IMPLEMENTED");
}

function startOfTodayServerLocal(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

type JobQueryPlanOp =
    | { kind: "eq"; column: string; value: unknown }
    | { kind: "gt"; column: string; value: unknown }
    | { kind: "lt"; column: string; value: unknown }
    | { kind: "in"; column: string; values: string[] }
    | { kind: "is_null"; column: string }
    | { kind: "gte"; column: string; value: string }
    | { kind: "range_lt"; column: string; value: string }
    | { kind: "or"; expr: string };

type JobSortPlan = { column: string; ascending: boolean };

type OpportunityQueryPlanOp = JobQueryPlanOp;
type OpportunitySortPlan = { column: string; ascending: boolean };

function buildJobPlan(queue: QueueConfig): { ops: JobQueryPlanOp[]; sort: JobSortPlan[] } {
    const ops: JobQueryPlanOp[] = [];

    for (const f of queue.filters) {
        ops.push(...jobFilterToOps(f));
    }

    const sort: JobSortPlan[] = [];
    if (queue.sort) {
        for (const s of queue.sort) {
            if (!JOB_SORT_ALLOWLIST.has(s.field as (typeof JOB_SORT_ALLOWLIST extends Set<infer T> ? T : never))) {
                throw new QueueServiceError(`Unsupported job sort field: ${s.field}`, 400, "UNSUPPORTED_SORT_FIELD");
            }
            sort.push({ column: s.field, ascending: s.direction === "asc" });
        }
    } else {
        sort.push({ column: "updated_at", ascending: false });
    }

    return { ops, sort };
}

function buildOpportunityPlan(
    queue: QueueConfig,
    now: Date = new Date()
): { ops: OpportunityQueryPlanOp[]; sort: OpportunitySortPlan[] } {
    const ops: OpportunityQueryPlanOp[] = [];
    for (const f of queue.filters) {
        ops.push(...opportunityFilterToOps(f, now));
    }

    const sort: OpportunitySortPlan[] = [];
    if (queue.sort) {
        for (const s of queue.sort) {
            if (
                !OPPORTUNITY_SORT_ALLOWLIST.has(
                    s.field as (typeof OPPORTUNITY_SORT_ALLOWLIST extends Set<infer T> ? T : never)
                )
            ) {
                throw new QueueServiceError(
                    `Unsupported opportunity sort field: ${s.field}`,
                    400,
                    "UNSUPPORTED_SORT_FIELD"
                );
            }
            sort.push({ column: s.field, ascending: s.direction === "asc" });
        }
    } else {
        sort.push({ column: "updated_at", ascending: false });
    }

    return { ops, sort };
}

function jobFilterToOps(f: QueueFilter): JobQueryPlanOp[] {
    switch (f.type) {
        case "status": {
            // jobs.status_key IN (...)
            if (f.operator !== "in") {
                throw new QueueServiceError(`Unsupported status operator: ${String((f as { operator?: unknown }).operator)}`, 400, "UNSUPPORTED_OPERATOR");
            }
            const values = (f.values ?? []).filter((x) => typeof x === "string" && x.trim() !== "");
            return [{ kind: "in", column: "status_key", values }];
        }
        case "assignment": {
            if (f.operator === "is_null") {
                return [{ kind: "is_null", column: "assigned_vendor_id" }];
            }
            if (f.operator === "equals") {
                return [{ kind: "eq", column: "assigned_vendor_id", value: f.value }];
            }
            throw new QueueServiceError(`Unsupported assignment operator: ${String((f as { operator?: unknown }).operator)}`, 400, "UNSUPPORTED_OPERATOR");
        }
        case "date": {
            if (!JOB_DATE_FIELD_ALLOWLIST.has(f.field as (typeof JOB_DATE_FIELD_ALLOWLIST extends Set<infer T> ? T : never))) {
                throw new QueueServiceError(`Unsupported job date field: ${f.field}`, 400, "UNSUPPORTED_DATE_FIELD");
            }
            const start = startOfTodayServerLocal();
            const startIso = start.toISOString();
            if (f.operator === "today") {
                const end = new Date(start);
                end.setDate(end.getDate() + 1);
                const endIso = end.toISOString();
                return [
                    { kind: "gte", column: f.field, value: startIso },
                    { kind: "range_lt", column: f.field, value: endIso },
                ];
            }
            if (f.operator === "past_due") {
                // NOTE: for created_at this means "created before today". For future due-date fields, this will tighten.
                return [{ kind: "lt", column: f.field, value: startIso }];
            }
            throw new QueueServiceError(`Unsupported date operator: ${String((f as { operator?: unknown }).operator)}`, 400, "UNSUPPORTED_OPERATOR");
        }
        case "field": {
            if (!JOB_FIELD_ALLOWLIST.has(f.field_key as (typeof JOB_FIELD_ALLOWLIST extends Set<infer T> ? T : never))) {
                throw new QueueServiceError(`Unsupported job field: ${f.field_key}`, 400, "UNSUPPORTED_FIELD");
            }
            const col = f.field_key;
            if (f.operator === "eq") return [{ kind: "eq", column: col, value: f.value }];
            if (f.operator === "gt") return [{ kind: "gt", column: col, value: f.value }];
            if (f.operator === "lt") return [{ kind: "lt", column: col, value: f.value }];
            throw new QueueServiceError(`Unsupported field operator: ${String((f as { operator?: unknown }).operator)}`, 400, "UNSUPPORTED_OPERATOR");
        }
        case "exception": {
            throw new QueueServiceError("exception filter evaluation is not implemented", 501, "NOT_IMPLEMENTED");
        }
        default: {
            const _exhaustive: never = f;
            return _exhaustive;
        }
    }
}

function subtractDays(now: Date, days: number): Date {
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function toIso(d: Date): string {
    return d.toISOString();
}

type OpportunityNeedsAttentionRow = {
    updated_at?: string | null;
    primary_contact_id?: string | null;
    customer_id?: string | null;
    status_key?: string | null;
};

function opportunityNeedsAttention(row: OpportunityNeedsAttentionRow, now: Date): boolean {
    const updatedAt = row.updated_at ? new Date(row.updated_at) : null;
    if (!updatedAt || Number.isNaN(updatedAt.getTime())) return false;

    // 1) stale: updated_at < now - 3 days
    if (updatedAt.getTime() < subtractDays(now, 3).getTime()) return true;

    // 2) missing data: primary_contact_id IS NULL OR customer_id IS NULL
    if (row.primary_contact_id == null || row.customer_id == null) return true;

    // 3) value/readiness: status_key in ('qualified','scheduled','booked') AND updated_at < now - 2 days
    const sk = (row.status_key ?? "").trim().toLowerCase();
    if ((sk === "qualified" || sk === "scheduled" || sk === "booked") && updatedAt.getTime() < subtractDays(now, 2).getTime()) {
        return true;
    }

    return false;
}

function opportunityNeedsAttentionReasonLabel(row: OpportunityNeedsAttentionRow, now: Date): string | null {
    const updatedAt = row.updated_at ? new Date(row.updated_at) : null;
    if (!updatedAt || Number.isNaN(updatedAt.getTime())) return null;
    if (row.primary_contact_id == null || row.customer_id == null) return "Missing contact/customer";
    if (updatedAt.getTime() < subtractDays(now, 3).getTime()) return "Stale > 3 days";
    const sk = (row.status_key ?? "").trim().toLowerCase();
    if ((sk === "qualified" || sk === "scheduled" || sk === "booked") && updatedAt.getTime() < subtractDays(now, 2).getTime()) {
        return "High-value stale > 2 days";
    }
    return null;
}

async function enrichOpportunityRows(params: {
    supabase: ReturnType<typeof createAdminClient>;
    orgId: string;
    rows: OpportunityRowPreview[];
}): Promise<Array<Record<string, unknown>>> {
    const { supabase, orgId, rows } = params;
    if (!rows.length) return [];

    const contactIds = [...new Set(rows.map((r) => r.primary_contact_id).filter((x): x is string => typeof x === "string" && x.trim() !== ""))];
    const customerIds = [...new Set(rows.map((r) => r.customer_id).filter((x): x is string => typeof x === "string" && x.trim() !== ""))];

    const [contactsRes, customersRes, defs] = await Promise.all([
        contactIds.length
            ? supabase
                  .from("contacts")
                  .select("id, first_name, last_name, email, phone, customer_id")
                  .eq("org_id", orgId)
                  .in("id", contactIds as any)
            : Promise.resolve({ data: [] as any[], error: null as any }),
        customerIds.length
            ? supabase.from("customers").select("id, name").eq("org_id", orgId).in("id", customerIds as any)
            : Promise.resolve({ data: [] as any[], error: null as any }),
        fetchEffectiveStatusDefinitions(supabase as any, orgId, "opportunities", { activeOnly: true }),
    ]);

    const labelByKey = displayLabelsFromDefinitions(defs);

    const contactById = new Map<string, any>();
    for (const c of (contactsRes as any).data ?? []) contactById.set(String(c.id), c);
    const customerById = new Map<string, any>();
    for (const c of (customersRes as any).data ?? []) customerById.set(String(c.id), c);

    return rows.map((r) => {
        const contact = r.primary_contact_id ? contactById.get(r.primary_contact_id) : null;
        const customer = r.customer_id ? customerById.get(r.customer_id) : null;
        const contactName =
            contact && (String(contact.first_name ?? "").trim() || String(contact.last_name ?? "").trim())
                ? [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim()
                : null;

        const md = (r.metadata ?? null) as Record<string, unknown> | null;
        const child = typeof md?.child_name === "string" ? md.child_name : null;
        const program = typeof md?.program_label === "string" ? md.program_label : null;
        const desiredStart = typeof md?.desired_start_date === "string" ? md.desired_start_date : null;
        const tourDate = typeof md?.tour_date === "string" ? md.tour_date : null;
        const notes = typeof md?.notes === "string" ? md.notes : typeof md?.demo_note === "string" ? md.demo_note : null;

        const sk = (r.status_key ?? "").trim();
        const statusDisplay = sk ? labelByKey.get(sk) ?? sk : null;

        const attentionReason = opportunityNeedsAttentionReasonLabel(r, new Date());
        const tourContext = tourDate ? `Tour: ${tourDate}` : null;

        return {
            ...r,
            title: r.name ?? null,
            _customer_name: customer?.name ?? null,
            _primary_contact_line: contactName ?? null,
            _primary_phone: contact?.phone ?? null,
            _primary_email: contact?.email ?? null,
            _child_display_name: child,
            _requested_program: program,
            _desired_start_date: desiredStart,
            _tour_context: tourContext,
            _notes_preview: notes,
            _status_display: statusDisplay,
            _attention_reason_label: attentionReason,
        };
    });
}

function buildOpportunityNeedsAttentionOrExpr(now: Date): string {
    const stale3d = toIso(subtractDays(now, 3));
    const stale2d = toIso(subtractDays(now, 2));
    // PostgREST `or` grammar:
    // - "a.eq.1,b.is.null,and(x.eq.1,y.lt.2)"
    // This implements: stale OR missing customer OR missing contact OR (high-value status AND stale2d).
    return [
        `updated_at.lt.${stale3d}`,
        "primary_contact_id.is.null",
        "customer_id.is.null",
        `and(status_key.in.(qualified,scheduled,booked),updated_at.lt.${stale2d})`,
    ].join(",");
}

function opportunityFilterToOps(f: QueueFilter, now: Date): OpportunityQueryPlanOp[] {
    switch (f.type) {
        case "status": {
            if (f.operator !== "in") {
                throw new QueueServiceError(
                    `Unsupported status operator: ${String((f as { operator?: unknown }).operator)}`,
                    400,
                    "UNSUPPORTED_OPERATOR"
                );
            }
            const values = (f.values ?? []).filter((x) => typeof x === "string" && x.trim() !== "");
            return [{ kind: "in", column: "status_key", values }];
        }
        case "field": {
            if (
                !OPPORTUNITY_FIELD_ALLOWLIST.has(
                    f.field_key as (typeof OPPORTUNITY_FIELD_ALLOWLIST extends Set<infer T> ? T : never)
                )
            ) {
                throw new QueueServiceError(`Unsupported opportunity field: ${f.field_key}`, 400, "UNSUPPORTED_FIELD");
            }
            const col = f.field_key;
            if (f.operator === "eq") return [{ kind: "eq", column: col, value: f.value }];
            if (f.operator === "gt") return [{ kind: "gt", column: col, value: f.value }];
            if (f.operator === "lt") return [{ kind: "lt", column: col, value: f.value }];
            throw new QueueServiceError(
                `Unsupported field operator: ${String((f as { operator?: unknown }).operator)}`,
                400,
                "UNSUPPORTED_OPERATOR"
            );
        }
        case "date": {
            if (
                !OPPORTUNITY_DATE_FIELD_ALLOWLIST.has(
                    f.field as (typeof OPPORTUNITY_DATE_FIELD_ALLOWLIST extends Set<infer T> ? T : never)
                )
            ) {
                throw new QueueServiceError(`Unsupported opportunity date field: ${f.field}`, 400, "UNSUPPORTED_DATE_FIELD");
            }
            const start = startOfTodayServerLocal();
            const startIso = start.toISOString();
            if (f.operator === "today") {
                const end = new Date(start);
                end.setDate(end.getDate() + 1);
                const endIso = end.toISOString();
                return [
                    { kind: "gte", column: f.field, value: startIso },
                    { kind: "range_lt", column: f.field, value: endIso },
                ];
            }
            if (f.operator === "past_due") {
                return [{ kind: "lt", column: f.field, value: startIso }];
            }
            throw new QueueServiceError(
                `Unsupported date operator: ${String((f as { operator?: unknown }).operator)}`,
                400,
                "UNSUPPORTED_OPERATOR"
            );
        }
        case "exception": {
            if (f.operator !== "exists") {
                throw new QueueServiceError(
                    `Unsupported exception operator: ${String((f as { operator?: unknown }).operator)}`,
                    400,
                    "UNSUPPORTED_OPERATOR"
                );
            }
            // Minimal needs-attention v1: stale OR missing data OR high-value stale.
            return [{ kind: "or", expr: buildOpportunityNeedsAttentionOrExpr(now) }];
        }
        case "assignment": {
            throw new QueueServiceError("assignment filter is not supported for opportunities", 400, "UNSUPPORTED_FILTER");
        }
        default: {
            const _exhaustive: never = f;
            return _exhaustive;
        }
    }
}

function applyOpsToJobQuery(
    q: any,
    ops: JobQueryPlanOp[]
) {
    let out = q;
    for (const op of ops) {
        switch (op.kind) {
            case "eq":
                out = out.eq(op.column, op.value);
                break;
            case "gt":
                out = out.gt(op.column, op.value as never);
                break;
            case "lt":
                out = out.lt(op.column, op.value as never);
                break;
            case "in":
                out = out.in(op.column, op.values as never);
                break;
            case "is_null":
                out = out.is(op.column, null);
                break;
            case "gte":
                out = out.gte(op.column, op.value as never);
                break;
            case "range_lt":
                out = out.lt(op.column, op.value as never);
                break;
            case "or":
                out = out.or(op.expr);
                break;
        }
    }
    return out;
}

function applySortToJobQuery(
    q: any,
    sort: JobSortPlan[]
) {
    let out = q;
    for (const s of sort) {
        out = out.order(s.column, { ascending: s.ascending });
    }
    return out;
}

async function loadWorkUnitQueueDefinition(params: { orgId: string; workUnitId: string }): Promise<QueueDefinitionV1> {
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("work_units")
        .select("id, org_id, queue_definition")
        .eq("id", params.workUnitId)
        .eq("org_id", params.orgId)
        .maybeSingle();

    if (error) {
        throw new QueueServiceError(error.message, 400, "DB_ERROR");
    }
    if (!data) {
        throw new QueueServiceError("Work unit not found", 404, "NOT_FOUND");
    }

    const raw = (data as { queue_definition?: unknown }).queue_definition;
    const storedVersion = getStoredQueueDefinitionVersion(raw);
    if (raw == null || (isPlainObject(raw) && Object.keys(raw).length === 0)) {
        throw new QueueServiceError("Work unit has no queue_definition configured", 400, "MISSING_QUEUE_DEFINITION");
    }
    if (storedVersion !== null && storedVersion !== 1) {
        throw new QueueServiceError("Unsupported stored queue_definition version", 400, "UNSUPPORTED_VERSION");
    }
    return loadQueueDefinitionOrThrow(raw);
}

function clampLimit(n: number, min: number, max: number): number {
    const v = Math.floor(Number.isFinite(n) ? n : min);
    if (v < min) return min;
    if (v > max) return max;
    return v;
}

export async function getWorkUnitQueueSummaries(params: {
    orgId: string;
    workUnitId: string;
    limit?: number;
}): Promise<QueueSummary[]> {
    const def = await loadWorkUnitQueueDefinition({ orgId: params.orgId, workUnitId: params.workUnitId });
    assertSupportedEntityType(def);

    const supabase = createAdminClient();

    const out: QueueSummary[] = [];
    const previewLimit = clampLimit(params.limit ?? 3, 1, 10);

    for (const q of def.queues) {
        if (def.entity_type === "job") {
            const { ops, sort } = buildJobPlan(q);

            const base = supabase
                .from("jobs")
                .select("id", { count: "exact", head: true })
                .eq("org_id", params.orgId)
                .eq("work_unit_id", params.workUnitId);

            const countQ = applyOpsToJobQuery(base as never, ops);
            const { count, error: countErr } = await countQ;
            if (countErr) {
                throw new QueueServiceError(countErr.message, 400, "DB_ERROR");
            }

            const previewQ0 = supabase
                .from("jobs")
                .select("id, title, status_key, work_unit_id, assigned_vendor_id, created_at, updated_at")
                .eq("org_id", params.orgId)
                .eq("work_unit_id", params.workUnitId);
            const previewQ1 = applySortToJobQuery(applyOpsToJobQuery(previewQ0 as never, ops) as never, sort);
            const { data: preview, error: previewErr } = await previewQ1.limit(previewLimit);
            if (previewErr) {
                throw new QueueServiceError(previewErr.message, 400, "DB_ERROR");
            }

            out.push({
                key: q.key,
                label: q.label,
                description: q.description,
                entity_type: def.entity_type,
                priority: q.priority ?? "standard",
                display: q.display ?? "list",
                count: count ?? 0,
                preview: (preview ?? []) as unknown[],
            });
            continue;
        }

        // opportunity
        let ops: OpportunityQueryPlanOp[] = [];
        let sort: OpportunitySortPlan[] = [];
        try {
            const plan = buildOpportunityPlan(q);
            ops = plan.ops;
            sort = plan.sort;
        } catch (e) {
            if (e instanceof QueueServiceError && e.status === 501) {
                out.push({
                    key: q.key,
                    label: q.label,
                    description: q.description,
                    entity_type: def.entity_type,
                    priority: q.priority ?? "standard",
                    display: q.display ?? "list",
                    count: 0,
                    preview: [],
                });
                continue;
            }
            throw e;
        }

        const base = supabase
            .from("opportunities")
            .select("id", { count: "exact", head: true })
            .eq("org_id", params.orgId)
            .eq("work_unit_id", params.workUnitId);

        const countQ = applyOpsToJobQuery(base as never, ops);
        const { count, error: countErr } = await countQ;
        if (countErr) {
            throw new QueueServiceError(countErr.message, 400, "DB_ERROR");
        }

        const previewQ0 = supabase
            .from("opportunities")
            .select("id, name, title, status_key, customer_id, primary_contact_id, work_unit_id, metadata, created_at, updated_at")
            .eq("org_id", params.orgId)
            .eq("work_unit_id", params.workUnitId);
        const previewQ1 = applySortToJobQuery(applyOpsToJobQuery(previewQ0 as never, ops) as never, sort);
        const { data: previewRaw, error: previewErr } = await previewQ1.limit(previewLimit);
        if (previewErr) {
            throw new QueueServiceError(previewErr.message, 400, "DB_ERROR");
        }
        const previewRows = (previewRaw ?? []) as OpportunityRowPreview[];
        const preview = await enrichOpportunityRows({ supabase, orgId: params.orgId, rows: previewRows });

        out.push({
            key: q.key,
            label: q.label,
            description: q.description,
            entity_type: def.entity_type,
            priority: q.priority ?? "standard",
            display: q.display ?? "list",
            count: count ?? 0,
            preview: preview as unknown[],
        });
    }

    return out;
}

export async function getWorkUnitQueueItems(params: {
    orgId: string;
    workUnitId: string;
    queueKey: string;
    limit?: number;
    offset?: number;
}): Promise<QueueItemsResult> {
    const def = await loadWorkUnitQueueDefinition({ orgId: params.orgId, workUnitId: params.workUnitId });
    assertSupportedEntityType(def);
    const q = findQueueByKey(def, params.queueKey);

    const supabase = createAdminClient();

    const effectiveLimit = clampLimit(params.limit ?? q.limit ?? 50, 1, 200);
    const effectiveOffset = clampLimit(params.offset ?? 0, 0, 1000000);

    if (def.entity_type === "job") {
        const { ops, sort } = buildJobPlan(q);

        const countBase = supabase
            .from("jobs")
            .select("id", { count: "exact", head: true })
            .eq("org_id", params.orgId)
            .eq("work_unit_id", params.workUnitId);
        const countQ = applyOpsToJobQuery(countBase as never, ops);
        const { count, error: countErr } = await countQ;
        if (countErr) {
            throw new QueueServiceError(countErr.message, 400, "DB_ERROR");
        }

        const itemsBase = supabase
            .from("jobs")
            .select("id, title, status_key, work_unit_id, assigned_vendor_id, created_at, updated_at")
            .eq("org_id", params.orgId)
            .eq("work_unit_id", params.workUnitId);

        const itemsQ0 = applySortToJobQuery(applyOpsToJobQuery(itemsBase as never, ops) as never, sort);
        const { data, error } = await itemsQ0.range(effectiveOffset, effectiveOffset + effectiveLimit - 1);
        if (error) {
            throw new QueueServiceError(error.message, 400, "DB_ERROR");
        }

        return {
            queue: {
                key: q.key,
                label: q.label,
                description: q.description,
                entity_type: def.entity_type,
                priority: q.priority ?? "standard",
                display: q.display ?? "list",
            },
            items: (data ?? []) as unknown[],
            total: count ?? 0,
            limit: effectiveLimit,
            offset: effectiveOffset,
        };
    }

    // opportunity
    const { ops, sort } = buildOpportunityPlan(q);

    const countBase = supabase
        .from("opportunities")
        .select("id", { count: "exact", head: true })
        .eq("org_id", params.orgId)
        .eq("work_unit_id", params.workUnitId);
    const countQ = applyOpsToJobQuery(countBase as never, ops);
    const { count, error: countErr } = await countQ;
    if (countErr) {
        throw new QueueServiceError(countErr.message, 400, "DB_ERROR");
    }

    const itemsBase = supabase
        .from("opportunities")
        .select("id, name, title, status_key, customer_id, primary_contact_id, work_unit_id, metadata, created_at, updated_at")
        .eq("org_id", params.orgId)
        .eq("work_unit_id", params.workUnitId);

    const itemsQ0 = applySortToJobQuery(applyOpsToJobQuery(itemsBase as never, ops) as never, sort);
    const { data: raw, error } = await itemsQ0.range(effectiveOffset, effectiveOffset + effectiveLimit - 1);
    if (error) {
        throw new QueueServiceError(error.message, 400, "DB_ERROR");
    }
    const itemRows = (raw ?? []) as OpportunityRowPreview[];
    const items = await enrichOpportunityRows({ supabase, orgId: params.orgId, rows: itemRows });

    return {
        queue: {
            key: q.key,
            label: q.label,
            description: q.description,
            entity_type: def.entity_type,
            priority: q.priority ?? "standard",
            display: q.display ?? "list",
        },
        items: items as unknown[],
        total: count ?? 0,
        limit: effectiveLimit,
        offset: effectiveOffset,
    };
}

export const __testing = {
    buildJobPlan,
    buildOpportunityPlan,
    buildOpportunityNeedsAttentionOrExpr,
    opportunityNeedsAttention,
    findQueueByKey,
    assertSupportedEntityType,
};

