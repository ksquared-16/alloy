import { createAdminClient } from "@/lib/supabaseAdmin";
import { validateQueueDefinition, type QueueConfig, type QueueDefinitionV1, type QueueFilter } from "@/lib/config/queueDefinitionSchema";
import type { QueueItemsResult, QueueOperationalCalendarMeta, QueueSummary } from "@/lib/queues/types";
import { workUnitScopeTotalFromSummaries } from "@/lib/workspace/workUnitQueueDerived";
import {
    fetchEffectiveStatusDefinitions,
    displayLabelsFromDefinitions,
    type StatusDefinitionRow,
} from "@/lib/admin/statusDefinitionsResolve";
import { formatTourDateTime } from "@/lib/enrollment/formatTourDateTime";
import { getOrgLocalTodayUtcBounds, type OrgLocalDayUtcBounds } from "@/lib/admin/orgLocalDayBounds";
import { fetchOperationalTimezoneForOrg, UTC_FALLBACK_IANA } from "@/lib/admin/timezoneContract";

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
    primary_person_id?: string | null;
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

type OperationalDayPlanContext = {
    dayBounds: OrgLocalDayUtcBounds;
    calendar_meta: QueueOperationalCalendarMeta;
};

function utcFallbackOperationalDayContext(refUtc: Date): OperationalDayPlanContext {
    const dayBounds = getOrgLocalTodayUtcBounds(UTC_FALLBACK_IANA, refUtc);
    return {
        dayBounds,
        calendar_meta: {
            calendar_type: "operational_day",
            timezone_effective: UTC_FALLBACK_IANA,
            timezone_source: "utc_fallback",
            day_start_utc: dayBounds.dayStartUtc.toISOString(),
            day_end_exclusive_utc: dayBounds.dayEndExclusiveUtc.toISOString(),
        },
    };
}

function planContextOrUtcFallback(ctx: OperationalDayPlanContext | undefined, refUtc: Date): OperationalDayPlanContext {
    return ctx ?? utcFallbackOperationalDayContext(refUtc);
}

async function resolveOperationalDayPlanContext(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    refUtc: Date
): Promise<OperationalDayPlanContext> {
    const { iana, source } = await fetchOperationalTimezoneForOrg(supabase as any, orgId);
    const dayBounds = getOrgLocalTodayUtcBounds(iana, refUtc);
    return {
        dayBounds,
        calendar_meta: {
            calendar_type: "operational_day",
            timezone_effective: iana,
            timezone_source: source,
            day_start_utc: dayBounds.dayStartUtc.toISOString(),
            day_end_exclusive_utc: dayBounds.dayEndExclusiveUtc.toISOString(),
        },
    };
}

function queueUsesOperationalCalendarDateFilter(queue: QueueConfig): boolean {
    return queue.filters.some((f) => f.type === "date" && (f.operator === "today" || f.operator === "past_due"));
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

function buildJobPlan(
    queue: QueueConfig,
    ctx?: OperationalDayPlanContext
): { ops: JobQueryPlanOp[]; sort: JobSortPlan[]; calendar_meta?: QueueOperationalCalendarMeta } {
    const refUtc = new Date();
    const resolved = planContextOrUtcFallback(ctx, refUtc);
    const useCalendarMeta = queueUsesOperationalCalendarDateFilter(queue);

    const ops: JobQueryPlanOp[] = [];
    for (const f of queue.filters) {
        ops.push(...jobFilterToOps(f, resolved.dayBounds));
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

    return { ops, sort, calendar_meta: useCalendarMeta ? resolved.calendar_meta : undefined };
}

function buildOpportunityPlan(
    queue: QueueConfig,
    now: Date = new Date(),
    ctx?: OperationalDayPlanContext
): { ops: OpportunityQueryPlanOp[]; sort: OpportunitySortPlan[]; calendar_meta?: QueueOperationalCalendarMeta } {
    const resolved = planContextOrUtcFallback(ctx, now);
    const useCalendarMeta = queueUsesOperationalCalendarDateFilter(queue);

    const ops: OpportunityQueryPlanOp[] = [];
    for (const f of queue.filters) {
        ops.push(...opportunityFilterToOps(f, now, resolved.dayBounds));
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

    return { ops, sort, calendar_meta: useCalendarMeta ? resolved.calendar_meta : undefined };
}

function jobFilterToOps(f: QueueFilter, dayBounds: OrgLocalDayUtcBounds): JobQueryPlanOp[] {
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
            const startIso = dayBounds.dayStartUtc.toISOString();
            const endExclusiveIso = dayBounds.dayEndExclusiveUtc.toISOString();
            if (f.operator === "today") {
                return [
                    { kind: "gte", column: f.field, value: startIso },
                    { kind: "range_lt", column: f.field, value: endExclusiveIso },
                ];
            }
            if (f.operator === "past_due") {
                // NOTE: for created_at this means "timestamp before start of org-local today". Same instant semantics as pre–Slice-3B, but the boundary is org TZ (not server-local midnight).
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

function ageLabelFromDob(dobIso: string): string | null {
    const ms = Date.parse(dobIso);
    if (!Number.isFinite(ms)) return null;
    const now = new Date();
    const dob = new Date(ms);
    if (Number.isNaN(dob.getTime()) || dob > now) return null;
    let years = now.getFullYear() - dob.getFullYear();
    let months = now.getMonth() - dob.getMonth();
    if (now.getDate() < dob.getDate()) months -= 1;
    if (months < 0) {
        years -= 1;
        months += 12;
    }
    if (years < 0) return null;
    if (years === 0) return `${Math.max(0, months)}mo`;
    return months > 0 ? `${years}y ${months}mo` : `${years}y`;
}

type OpportunityNeedsAttentionRow = {
    updated_at?: string | null;
    primary_person_id?: string | null;
    primary_contact_id?: string | null;
    customer_id?: string | null;
    status_key?: string | null;
    metadata?: Record<string, unknown> | null;
};

/** Enrollment funnel stages: stale >2d should surface in needs_attention (replaces legacy qualified/scheduled/booked). */
export const OPPORTUNITY_HIGH_VALUE_STALE_STATUS_KEY_SET = new Set([
    "tour_scheduled",
    "tour_completed",
    "application_in_progress",
    "ready_to_enroll",
]);

/**
 * PostgREST `or` list must not use `status_key.in.(a,b,c)` — commas inside `in.(...)` break the outer `or` list.
 * One `and(status_key.eq.<key>,updated_at.lt...)` per status (no quotes on keys; `eq.<token>` treats underscores as part of the value).
 */
function buildOpportunityHighValueStaleOrBranches(stale2dIso: string): string {
    return [...OPPORTUNITY_HIGH_VALUE_STALE_STATUS_KEY_SET]
        .sort()
        .map((k) => `and(status_key.eq.${k},updated_at.lt.${stale2dIso})`)
        .join(",");
}

function opportunityNeedsAttention(row: OpportunityNeedsAttentionRow, now: Date): boolean {
    const updatedAt = row.updated_at ? new Date(row.updated_at) : null;
    if (!updatedAt || Number.isNaN(updatedAt.getTime())) return false;

    // 1) stale: updated_at < now - 3 days
    if (updatedAt.getTime() < subtractDays(now, 3).getTime()) return true;

    // 2) missing data (enrollment demo is person-backed; legacy data may still use primary_contact_id)
    const pkg = row.metadata && typeof row.metadata.demo_seed_package === "string" ? String(row.metadata.demo_seed_package) : "";
    const isDemoV2 = pkg === "enrollment_pipeline_demo_v2";
    const hasPerson = row.primary_person_id != null && String(row.primary_person_id).trim() !== "";
    const hasLegacyContact = row.primary_contact_id != null && String(row.primary_contact_id).trim() !== "";
    const missingContactLike = isDemoV2 ? !hasPerson : !(hasPerson || hasLegacyContact);
    if (missingContactLike || row.customer_id == null) return true;

    // 3) value/readiness: active funnel status AND updated_at < now - 2 days
    const sk = (row.status_key ?? "").trim().toLowerCase();
    if (OPPORTUNITY_HIGH_VALUE_STALE_STATUS_KEY_SET.has(sk) && updatedAt.getTime() < subtractDays(now, 2).getTime()) {
        return true;
    }

    return false;
}

function opportunityNeedsAttentionReasonLabel(row: OpportunityNeedsAttentionRow, now: Date): string | null {
    const updatedAt = row.updated_at ? new Date(row.updated_at) : null;
    if (!updatedAt || Number.isNaN(updatedAt.getTime())) return null;
    const pkg = row.metadata && typeof row.metadata.demo_seed_package === "string" ? String(row.metadata.demo_seed_package) : "";
    const isDemoV2 = pkg === "enrollment_pipeline_demo_v2";
    const hasPerson = row.primary_person_id != null && String(row.primary_person_id).trim() !== "";
    const hasLegacyContact = row.primary_contact_id != null && String(row.primary_contact_id).trim() !== "";
    const missingContactLike = isDemoV2 ? !hasPerson : !(hasPerson || hasLegacyContact);
    if (missingContactLike || row.customer_id == null) return "Missing contact/customer";
    if (updatedAt.getTime() < subtractDays(now, 3).getTime()) return "Stale > 3 days";
    const sk = (row.status_key ?? "").trim().toLowerCase();
    if (OPPORTUNITY_HIGH_VALUE_STALE_STATUS_KEY_SET.has(sk) && updatedAt.getTime() < subtractDays(now, 2).getTime()) {
        return "High-value stale > 2 days";
    }
    return null;
}

/** Lines for CRM compact multi-child grouping (serialized as `_crm_compact_children` on queue rows). */
type OpportunityQueueCrmChildLine = {
    primary: string;
    secondary: string | null;
};

/** When ≥2 canonical children exists, CRM compact renders a stacked group instead of a single merged line. */
function buildStructuredCrmCompactChildren(joinChildNames: string[], inquiryChildren: unknown[]): OpportunityQueueCrmChildLine[] | undefined {
    if (joinChildNames.length >= 2) {
        return joinChildNames
            .map((full) => {
                const primary = full.trim();
                return primary ? { primary, secondary: null as string | null } : null;
            })
            .filter((x): x is OpportunityQueueCrmChildLine => x != null);
    }
    const icRaw = inquiryChildren.filter((x) => x != null && typeof x === "object");
    if (icRaw.length >= 2) {
        const out: OpportunityQueueCrmChildLine[] = [];
        for (const raw of icRaw) {
            const row = raw as Record<string, unknown>;
            const disp = typeof row.display_name === "string" ? row.display_name.trim() : "";
            const pl =
                typeof row.program_label === "string"
                    ? row.program_label.trim()
                    : typeof row.program_short === "string"
                      ? String(row.program_short).trim()
                      : "";
            const ag = typeof row.age_group === "string" ? row.age_group.trim() : "";
            const detail = [pl || null, ag || null].filter(Boolean).join(" · ") || null;
            const primary = (disp || detail || "").trim();
            if (!primary) continue;
            const secondary = disp && detail ? detail : null;
            out.push({ primary, secondary });
        }
        return out.length >= 2 ? out : undefined;
    }
    return undefined;
}

async function enrichOpportunityRows(params: {
    supabase: ReturnType<typeof createAdminClient>;
    orgId: string;
    rows: OpportunityRowPreview[];
    /** When set, skips duplicate status definition fetch (shared across queues in one summary request). */
    effectiveStatusDefs?: StatusDefinitionRow[];
    /**
     * `queue_preview`: skip enrolled-child / `opportunity_customer_members` join (drawer stays canonical).
     * `full`: include OCM join + child DOB resolution (queue item lists).
     */
    enrichment?: "full" | "queue_preview";
}): Promise<Array<Record<string, unknown>>> {
    const { supabase, orgId, rows, effectiveStatusDefs: preloadedDefs, enrichment = "full" } = params;
    const previewLite = enrichment === "queue_preview";
    if (!rows.length) return [];

    const tEnrich0 = Date.now();
    const nowForAttention = new Date();

    const customerIds = [...new Set(rows.map((r) => r.customer_id).filter((x): x is string => typeof x === "string" && x.trim() !== ""))];
    const personIds = [
        ...new Set(
            rows
                .map((r) => (r as unknown as { primary_person_id?: unknown }).primary_person_id)
                .filter((x): x is string => typeof x === "string" && x.trim() !== "")
        ),
    ];
    const contactIds = [
        ...new Set(
            rows
                .filter((r) => {
                    const pid = (r as unknown as { primary_person_id?: unknown }).primary_person_id;
                    const md = (r as unknown as { metadata?: Record<string, unknown> | null }).metadata ?? null;
                    const pkg = md && typeof md.demo_seed_package === "string" ? String(md.demo_seed_package) : "";
                    // Enrollment demo v2 must never use contacts.
                    if (pkg === "enrollment_pipeline_demo_v2") return false;
                    return !(typeof pid === "string" && pid.trim());
                })
                .map((r) => r.primary_contact_id)
                .filter((x): x is string => typeof x === "string" && x.trim() !== "")
        ),
    ];
    const opportunityIds = [...new Set(rows.map((r) => r.id).filter((x): x is string => typeof x === "string" && x.trim() !== ""))];

    const defsPromise =
        preloadedDefs != null
            ? Promise.resolve(preloadedDefs)
            : fetchEffectiveStatusDefinitions(supabase as any, orgId, "opportunities", { activeOnly: true });

    const tParallel0 = Date.now();
    const [personsRes, contactsRes, customersRes, ocmsRes, defs] = await Promise.all([
        personIds.length
            ? supabase
                .from("persons")
                .select("id, first_name, last_name, email, phone, date_of_birth")
                .eq("org_id", orgId)
                .in("id", personIds as any)
            : Promise.resolve({ data: [] as any[], error: null as any }),
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
        !previewLite && opportunityIds.length
            ? supabase
                .from("opportunity_customer_members")
                .select("opportunity_id, customer_members(display_name, dob, person_id)")
                .eq("org_id", orgId)
                .in("opportunity_id", opportunityIds as any)
            : Promise.resolve({ data: [] as any[], error: null as any }),
        defsPromise,
    ]);
    const parallelMainMs = Date.now() - tParallel0;

    const labelByKey = displayLabelsFromDefinitions(defs);

    const personById = new Map<string, any>();
    for (const p of (personsRes as any).data ?? []) personById.set(String(p.id), p);
    const contactById = new Map<string, any>();
    for (const c of (contactsRes as any).data ?? []) contactById.set(String(c.id), c);
    const customerById = new Map<string, any>();
    for (const c of (customersRes as any).data ?? []) customerById.set(String(c.id), c);

    const tChild0 = Date.now();
    // Child identity is canonical in `persons`. Prefer `persons.date_of_birth` and only
    // fall back to legacy/display `customer_members.dob` when needed.
    const childPersonIds: string[] = [];
    for (const row of (ocmsRes as any).data ?? []) {
        const cm = (row as any).customer_members;
        const pid = cm && typeof cm === "object" ? String((cm as any).person_id ?? "").trim() : "";
        if (pid) childPersonIds.push(pid);
    }
    const primaryPersonIdSet = new Set(personIds);
    const childPersonIdsToFetch = [...new Set(childPersonIds)].filter((id) => !primaryPersonIdSet.has(id));
    const { data: childPersons } =
        !previewLite && childPersonIdsToFetch.length > 0
            ? await supabase
                .from("persons")
                .select("id, date_of_birth")
                .eq("org_id", orgId)
                .in("id", childPersonIdsToFetch as any)
            : { data: [] as any[] };
    const childDobByPersonId = new Map<string, string>();
    for (const p of (childPersons ?? []) as any[]) {
        const id = String(p.id ?? "").trim();
        const dob = String(p.date_of_birth ?? "").trim();
        if (id && dob) childDobByPersonId.set(id, dob);
    }

    const childNamesByOppId = new Map<string, string[]>();
    for (const row of (ocmsRes as any).data ?? []) {
        const oppId = String((row as any).opportunity_id ?? "");
        if (!oppId) continue;
        const cm = (row as any).customer_members;
        const disp = cm && typeof cm === "object" ? String((cm as any).display_name ?? "").trim() : "";
        if (!disp) continue;
        const memberDob = cm && typeof cm === "object" ? String((cm as any).dob ?? "").trim() : "";
        const pid = cm && typeof cm === "object" ? String((cm as any).person_id ?? "").trim() : "";
        const canonicalDob = pid
            ? (childDobByPersonId.get(pid) ??
              String((personById.get(pid) as { date_of_birth?: string } | undefined)?.date_of_birth ?? "").trim())
            : "";
        const dob = canonicalDob || memberDob;
        const age = dob ? ageLabelFromDob(dob) : null;
        const label = age ? `${disp} (${age})` : disp;
        const list = childNamesByOppId.get(oppId) ?? [];
        list.push(label);
        childNamesByOppId.set(oppId, list);
    }
    const childResolutionMs = Date.now() - tChild0;

    const tMap0 = Date.now();
    const mapped = rows.map((r) => {
        const pid = (r as unknown as { primary_person_id?: string | null }).primary_person_id ?? null;
        const person = pid ? personById.get(pid) : null;
        const contact = r.primary_contact_id ? contactById.get(r.primary_contact_id) : null;
        const customer = r.customer_id ? customerById.get(r.customer_id) : null;
        const contactName =
            person && (String(person.first_name ?? "").trim() || String(person.last_name ?? "").trim())
                ? [person.first_name, person.last_name].filter(Boolean).join(" ").trim()
                : contact && (String(contact.first_name ?? "").trim() || String(contact.last_name ?? "").trim())
                    ? [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim()
                    : null;
        const contactEmail = (person?.email ?? contact?.email ?? null) as string | null;
        const contactPhone = (person?.phone ?? contact?.phone ?? null) as string | null;

        const md = (r.metadata ?? null) as Record<string, unknown> | null;
        const notes = typeof md?.notes === "string" ? md.notes : typeof md?.demo_note === "string" ? md.demo_note : null;
        const nextStepPreview = typeof md?.next_step === "string" ? md.next_step.trim() : null;

        const joinChildNames = childNamesByOppId.get(r.id) ?? [];
        const inquiryChildren = md && Array.isArray((md as { inquiry_children?: unknown }).inquiry_children)
            ? ((md as { inquiry_children: unknown[] }).inquiry_children ?? []).filter((x) => x && typeof x === "object")
            : [];

        let childDisplay: string | null = null;
        let programsDisplay: string | null = null;
        let programCombined: string | null = null;
        let desiredStart: string | null = null;
        let tourDate: string | null = null;
        let tourTime: string | null = null;

        if (joinChildNames.length > 0) {
            childDisplay = joinChildNames.join(" · ");
            const programLabel = typeof md?.program_label === "string" ? md.program_label : null;
            const ageGroup = typeof md?.age_group === "string" ? md.age_group.trim() : null;
            programCombined =
                [programLabel, ageGroup].filter((x): x is string => Boolean(x && x.trim())).join(" · ").trim() || programLabel;
            desiredStart = typeof md?.desired_start_date === "string" ? md.desired_start_date : null;
            tourDate = typeof md?.tour_date === "string" ? md.tour_date : null;
            tourTime = typeof md?.tour_time === "string" ? md.tour_time : null;
        } else if (inquiryChildren.length > 0) {
            const names: string[] = [];
            const programs: string[] = [];
            for (const raw of inquiryChildren) {
                const row = raw as Record<string, unknown>;
                const disp = typeof row.display_name === "string" ? row.display_name.trim() : "";
                if (disp) names.push(disp);
                const pl =
                    typeof row.program_label === "string"
                        ? row.program_label.trim()
                        : typeof row.program_short === "string"
                            ? String(row.program_short).trim()
                            : "";
                if (pl) programs.push(pl);
            }
            childDisplay = names.length ? names.join(" · ") : typeof md?.child_name === "string" ? md.child_name : null;
            const uniq = [...new Set(programs.filter(Boolean))];
            programsDisplay = uniq.length ? uniq.join(", ") : null;
            const firstAgeRow = inquiryChildren[0] as Record<string, unknown>;
            const ageGroup =
                typeof firstAgeRow.age_group === "string" ? firstAgeRow.age_group.trim() : "";
            programCombined =
                programsDisplay && ageGroup
                    ? `${programsDisplay} · ${ageGroup}`
                    : programsDisplay ?? (typeof md?.program_label === "string" ? md.program_label : null);
            desiredStart = typeof md?.desired_start_date === "string" ? md.desired_start_date : null;
            tourDate = typeof md?.tour_date === "string" ? md.tour_date : null;
            tourTime = typeof md?.tour_time === "string" ? md.tour_time : null;
        } else {
            const child = typeof md?.child_name === "string" ? md.child_name : null;
            const programLabel = typeof md?.program_label === "string" ? md.program_label : null;
            const ageGroup = typeof md?.age_group === "string" ? md.age_group.trim() : null;
            programCombined =
                [programLabel, ageGroup].filter((x): x is string => Boolean(x && x.trim())).join(" · ").trim() || programLabel;
            childDisplay = child;
            programsDisplay = programLabel;
            desiredStart = typeof md?.desired_start_date === "string" ? md.desired_start_date : null;
            tourDate = typeof md?.tour_date === "string" ? md.tour_date : null;
            tourTime = typeof md?.tour_time === "string" ? md.tour_time : null;
        }

        const sk = (r.status_key ?? "").trim();
        const statusDisplay = sk ? labelByKey.get(sk) ?? sk : null;

        const attentionReason = opportunityNeedsAttentionReasonLabel(r, nowForAttention);
        const tourContext = tourDate ? `Tour: ${formatTourDateTime(tourDate, tourTime).display}` : null;

        const crmCompactChildrenStructured = buildStructuredCrmCompactChildren(joinChildNames, inquiryChildren);

        return {
            ...r,
            title: r.name ?? null,
            _customer_name: customer?.name ?? null,
            _primary_contact_line: contactName ?? null,
            _primary_phone: contactPhone ?? null,
            _primary_email: contactEmail ?? null,
            _child_display_name: childDisplay,
            _crm_compact_children: crmCompactChildrenStructured,
            _requested_program: inquiryChildren.length > 0 ? programsDisplay ?? programCombined : programCombined,
            _desired_start_date: desiredStart,
            _tour_context: tourContext,
            _notes_preview: notes,
            _next_step_preview: nextStepPreview,
            _status_display: statusDisplay,
            _attention_reason_label: attentionReason,
        };
    });
    const mapMs = Date.now() - tMap0;
    const enrichMs = Date.now() - tEnrich0;
    if (enrichMs > 200) {
        console.warn("[queue-perf] enrichOpportunityRows", {
            org_id: orgId,
            row_count: rows.length,
            enrichment: previewLite ? "queue_preview" : "full",
            used_preloaded_defs: preloadedDefs != null,
            parallel_main_ms: parallelMainMs,
            child_resolution_ms: childResolutionMs,
            map_ms: mapMs,
            total_ms: enrichMs,
        });
    }
    return mapped;
}

function buildOpportunityNeedsAttentionOrExpr(now: Date): string {
    const stale3d = toIso(subtractDays(now, 3));
    const stale2d = toIso(subtractDays(now, 2));
    // PostgREST `or` grammar (used by tests / future SQL); enrollment `needs_attention` queue is evaluated in-memory instead.
    return [
        `updated_at.lt.${stale3d}`,
        "primary_contact_id.is.null",
        "customer_id.is.null",
        buildOpportunityHighValueStaleOrBranches(stale2d),
    ].join(",");
}

/**
 * PostgREST `.or(...)` pre-filter for the needs_attention workload: superset of rows that might pass
 * {@link opportunityNeedsAttention} (no false negatives). Extra rows are removed in-memory — reduces
 * rows scanned/sorted before the capped fetch.
 */
function buildOpportunityNeedsAttentionCandidateOrExpr(now: Date): string {
    const stale3d = toIso(subtractDays(now, 3));
    const stale2d = toIso(subtractDays(now, 2));
    return [
        `updated_at.lt.${stale3d}`,
        "customer_id.is.null",
        "primary_person_id.is.null",
        "primary_contact_id.is.null",
        buildOpportunityHighValueStaleOrBranches(stale2d),
    ].join(",");
}

/** Cap for in-memory needs_attention evaluation (avoids fragile nested `or`/`and` PostgREST URL parsing). */
const NEEDS_ATTENTION_OPPORTUNITY_FETCH_CAP = 5000;

/**
 * When queue summaries only need counts (department cards), use a smaller cap so we do not pull 5k rows
 * per work unit. Count may under-count if more opportunities match than this cap (same class as the 5k cap).
 */
const NEEDS_ATTENTION_COUNT_ONLY_FETCH_CAP = 800;

function sortOpportunityRowsByPlan(rows: OpportunityRowPreview[], sort: OpportunitySortPlan[]): OpportunityRowPreview[] {
    if (!rows.length) return rows;
    const plans = sort.length ? sort : [{ column: "updated_at", ascending: true }];
    return [...rows].sort((a, b) => {
        for (const p of plans) {
            const av = (a as Record<string, unknown>)[p.column];
            const bv = (b as Record<string, unknown>)[p.column];
            const as = av == null ? "" : String(av);
            const bs = bv == null ? "" : String(bv);
            if (as < bs) return p.ascending ? -1 : 1;
            if (as > bs) return p.ascending ? 1 : -1;
        }
        return 0;
    });
}

async function loadOpportunityNeedsAttentionRows(params: {
    supabase: ReturnType<typeof createAdminClient>;
    orgId: string;
    workUnitId: string;
    sort: OpportunitySortPlan[];
    now: Date;
    /** Default full cap; use {@link NEEDS_ATTENTION_COUNT_ONLY_FETCH_CAP} for count-only summaries. */
    fetchCap?: number;
}): Promise<OpportunityRowPreview[]> {
    const cap = params.fetchCap ?? NEEDS_ATTENTION_OPPORTUNITY_FETCH_CAP;
    const candidateOr = buildOpportunityNeedsAttentionCandidateOrExpr(params.now);
    let q = params.supabase
        .from("opportunities")
        .select("id, name, title, status_key, customer_id, primary_person_id, primary_contact_id, work_unit_id, metadata, created_at, updated_at")
        .eq("org_id", params.orgId)
        .eq("work_unit_id", params.workUnitId)
        .or(candidateOr) as any;
    const plans = params.sort.length ? params.sort : [{ column: "updated_at", ascending: true }];
    for (const p of plans) {
        q = q.order(p.column, { ascending: p.ascending });
    }
    const { data, error } = await q.limit(cap);
    if (error) {
        throw new QueueServiceError(error.message, 400, "DB_ERROR");
    }
    const rows = (data ?? []) as OpportunityRowPreview[];
    const filtered = rows.filter((r) => opportunityNeedsAttention(r, params.now));
    return sortOpportunityRowsByPlan(filtered, params.sort);
}

function opportunityFilterToOps(f: QueueFilter, now: Date, dayBounds: OrgLocalDayUtcBounds): OpportunityQueryPlanOp[] {
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
            const startIso = dayBounds.dayStartUtc.toISOString();
            const endExclusiveIso = dayBounds.dayEndExclusiveUtc.toISOString();
            if (f.operator === "today") {
                return [
                    { kind: "gte", column: f.field, value: startIso },
                    { kind: "range_lt", column: f.field, value: endExclusiveIso },
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

/** `planned` uses PostgreSQL planner estimates (faster on large tables; approximate). */
export type QueueCountAccuracy = "exact" | "planned";

function queueCountSelect(accuracy: QueueCountAccuracy | undefined): "exact" | "planned" {
    return accuracy === "planned" ? "planned" : "exact";
}

/** How many queue tabs get real counts on first paint (`priority` mode). */
export type QueueSummaryRequestMode = "all" | "priority" | "partial";

export type WorkUnitQueueSummariesResult = {
    queues: QueueSummary[];
    /** Present when `summaryMode=priority`: keys still on placeholder counts. */
    deferred_queue_keys?: string[];
    /**
     * Count for the all-records / primary scope lane only (same as work-unit landing and department "Total").
     * Null when that lane is deferred or missing from this payload.
     */
    work_unit_scope_total?: number | null;
    work_unit_scope_queue_key?: string | null;
};

function buildPriorityQueueKeySet(def: QueueDefinitionV1, focusKey: string | null | undefined, budget: number): Set<string> {
    const ordered = def.queues.map((q) => q.key);
    const set = new Set<string>();
    if (ordered.includes("needs_attention")) set.add("needs_attention");
    const focus = (focusKey ?? "").trim();
    if (focus && ordered.includes(focus)) set.add(focus);
    for (const k of ordered) {
        if (set.size >= budget) break;
        set.add(k);
    }
    return set;
}

function stubDeferredQueueSummary(q: QueueConfig, def: QueueDefinitionV1): QueueSummary {
    const et = def.entity_type === "job" ? "job" : "opportunity";
    return {
        key: q.key,
        label: q.label,
        description: q.description,
        entity_type: et,
        priority: q.priority ?? "standard",
        display: q.display ?? "list",
        count: 0,
        preview: [],
        counts_deferred: true,
    };
}

async function runPool<T>(factories: Array<() => Promise<T>>, poolSize: number): Promise<T[]> {
    const nFac = factories.length;
    if (nFac === 0) return [];
    const results: T[] = new Array(nFac);
    let cursor = 0;
    async function worker(): Promise<void> {
        while (true) {
            const i = cursor;
            cursor += 1;
            if (i >= nFac) return;
            results[i] = await factories[i]!();
        }
    }
    const workers = Math.min(Math.max(1, Math.floor(poolSize)), nFac);
    await Promise.all(Array.from({ length: workers }, () => worker()));
    return results;
}

export async function getWorkUnitQueueSummaries(params: {
    orgId: string;
    workUnitId: string;
    limit?: number;
    /**
     * When false, omit preview rows and skip enrichment (department KPI cards only need counts).
     * `needs_attention` uses a smaller row cap; count may under-count if more rows match than that cap.
     */
    includePreviews?: boolean;
    /** Optional label for [queue-perf] logs (e.g. department id). */
    perfTag?: string;
    /** Filtered queue head counts: `planned` is faster on large tables (estimate). */
    countAccuracy?: QueueCountAccuracy;
    /** `priority`: count hot tabs first, stub others (see deferred_queue_keys). `partial`: only count partialQueueKeys. */
    summaryMode?: QueueSummaryRequestMode;
    focusQueueKey?: string | null;
    priorityBudget?: number;
    partialQueueKeys?: Set<string>;
}): Promise<WorkUnitQueueSummariesResult> {
    const includePreviews = params.includePreviews !== false;
    const countSel = queueCountSelect(params.countAccuracy);
    const tW0 = Date.now();
    const supabase = createAdminClient();
    const refUtc = new Date();
    const tParallelBoot0 = Date.now();
    const [def, operationalDay] = await Promise.all([
        loadWorkUnitQueueDefinition({ orgId: params.orgId, workUnitId: params.workUnitId }),
        resolveOperationalDayPlanContext(supabase, params.orgId, refUtc),
    ]);
    const loadDefMs = Date.now() - tParallelBoot0;
    assertSupportedEntityType(def);

    const previewLimit = clampLimit(params.limit ?? 3, 1, 10);

    const summaryMode = params.summaryMode ?? "all";
    const priorityBudget = clampLimit(params.priorityBudget ?? 6, 1, 20);
    let activeKeySet: Set<string> | null = null;
    let deferredQueueKeys: string[] | undefined;
    if (summaryMode === "partial") {
        if (!params.partialQueueKeys || params.partialQueueKeys.size === 0) {
            return { queues: [] };
        }
        activeKeySet = params.partialQueueKeys;
    } else if (summaryMode === "priority") {
        activeKeySet = buildPriorityQueueKeySet(def, params.focusQueueKey ?? null, priorityBudget);
        deferredQueueKeys = def.queues.map((q) => q.key).filter((k) => !activeKeySet!.has(k));
    }

    let opportunityStatusDefsPromise: Promise<StatusDefinitionRow[]> | null = null;
    const sharedOpportunityStatusDefs = (): Promise<StatusDefinitionRow[]> => {
        if (!opportunityStatusDefsPromise) {
            opportunityStatusDefsPromise = fetchEffectiveStatusDefinitions(
                supabase as any,
                params.orgId,
                "opportunities",
                { activeOnly: true }
            );
        }
        return opportunityStatusDefsPromise;
    };

    const perQueueMs: Array<{
        key: string;
        count_ms: number;
        preview_ms: number;
        enrich_ms: number;
        needs_attention_load_ms: number;
        total_ms: number;
        rows_enriched: number;
    } | null> = new Array(def.queues.length).fill(null);

    const factories = def.queues.map((q, queueIndex) => async (): Promise<QueueSummary | null> => {
        if (activeKeySet != null && !activeKeySet.has(q.key)) {
            return null;
        }
        const qT0 = Date.now();
        let countMs = 0;
        let previewMs = 0;
        let enrichMs = 0;
        let needsAttentionLoadMs = 0;
        let rowsEnriched = 0;

        const finish = (summary: QueueSummary, calendar_meta?: QueueOperationalCalendarMeta): QueueSummary => {
            perQueueMs[queueIndex] = {
                key: q.key,
                count_ms: countMs,
                preview_ms: previewMs,
                enrich_ms: enrichMs,
                needs_attention_load_ms: needsAttentionLoadMs,
                total_ms: Date.now() - qT0,
                rows_enriched: rowsEnriched,
            };
            return calendar_meta ? { ...summary, calendar_meta } : summary;
        };

        if (def.entity_type === "job") {
            const { ops, sort, calendar_meta } = buildJobPlan(q, operationalDay);

            const countBase = () =>
                supabase
                    .from("jobs")
                    .select("id", { count: countSel, head: true })
                    .eq("org_id", params.orgId)
                    .eq("work_unit_id", params.workUnitId);

            if (!includePreviews) {
                const tC0 = Date.now();
                const countQ = applyOpsToJobQuery(countBase() as never, ops);
                const { count, error: countErr } = await countQ;
                countMs = Date.now() - tC0;
                if (countErr) {
                    throw new QueueServiceError(countErr.message, 400, "DB_ERROR");
                }
                return finish(
                    {
                        key: q.key,
                        label: q.label,
                        description: q.description,
                        entity_type: def.entity_type,
                        priority: q.priority ?? "standard",
                        display: q.display ?? "list",
                        count: count ?? 0,
                        preview: [],
                    },
                    calendar_meta
                );
            }

            const tParallel0 = Date.now();
            const countQ = applyOpsToJobQuery(countBase() as never, ops);
            const previewQ0 = supabase
                .from("jobs")
                .select("id, title, status_key, work_unit_id, assigned_vendor_id, created_at, updated_at")
                .eq("org_id", params.orgId)
                .eq("work_unit_id", params.workUnitId);
            const previewQ1 = applySortToJobQuery(applyOpsToJobQuery(previewQ0 as never, ops) as never, sort);
            const [countRes, previewRes] = await Promise.all([countQ, previewQ1.limit(previewLimit)]);
            const parallelMs = Date.now() - tParallel0;
            countMs = parallelMs;
            previewMs = parallelMs;
            const countErr = countRes.error;
            if (countErr) {
                throw new QueueServiceError(countErr.message, 400, "DB_ERROR");
            }
            const previewErr = previewRes.error;
            if (previewErr) {
                throw new QueueServiceError(previewErr.message, 400, "DB_ERROR");
            }
            const count = countRes.count;
            const preview = previewRes.data;

            return finish(
                {
                    key: q.key,
                    label: q.label,
                    description: q.description,
                    entity_type: def.entity_type,
                    priority: q.priority ?? "standard",
                    display: q.display ?? "list",
                    count: count ?? 0,
                    preview: (preview ?? []) as unknown[],
                },
                calendar_meta
            );
        }

        // opportunity
        let ops: OpportunityQueryPlanOp[] = [];
        let sort: OpportunitySortPlan[] = [];
        let calendar_meta: QueueOperationalCalendarMeta | undefined;
        try {
            const plan = buildOpportunityPlan(q, refUtc, operationalDay);
            ops = plan.ops;
            sort = plan.sort;
            calendar_meta = plan.calendar_meta;
        } catch (e) {
            if (e instanceof QueueServiceError && e.status === 501) {
                return finish(
                    {
                        key: q.key,
                        label: q.label,
                        description: q.description,
                        entity_type: def.entity_type,
                        priority: q.priority ?? "standard",
                        display: q.display ?? "list",
                        count: 0,
                        preview: [],
                    },
                    undefined
                );
            }
            throw e;
        }

        if (q.key === "needs_attention") {
            const tN0 = Date.now();
            let matched: OpportunityRowPreview[];
            let preloadStatusDefs: StatusDefinitionRow[] | undefined;
            if (includePreviews) {
                const loaded = await Promise.all([
                    loadOpportunityNeedsAttentionRows({
                        supabase,
                        orgId: params.orgId,
                        workUnitId: params.workUnitId,
                        sort,
                        now: refUtc,
                        fetchCap: undefined,
                    }),
                    sharedOpportunityStatusDefs(),
                ]);
                matched = loaded[0];
                preloadStatusDefs = loaded[1];
            } else {
                matched = await loadOpportunityNeedsAttentionRows({
                    supabase,
                    orgId: params.orgId,
                    workUnitId: params.workUnitId,
                    sort,
                    now: refUtc,
                    fetchCap: NEEDS_ATTENTION_COUNT_ONLY_FETCH_CAP,
                });
            }
            needsAttentionLoadMs = Date.now() - tN0;

            if (!includePreviews) {
                return finish(
                    {
                        key: q.key,
                        label: q.label,
                        description: q.description,
                        entity_type: def.entity_type,
                        priority: q.priority ?? "standard",
                        display: q.display ?? "list",
                        count: matched.length,
                        preview: [],
                    },
                    undefined
                );
            }

            const previewRows = matched.slice(0, previewLimit);
            rowsEnriched = previewRows.length;
            const tE0 = Date.now();
            const preview = await enrichOpportunityRows({
                supabase,
                orgId: params.orgId,
                rows: previewRows,
                effectiveStatusDefs: preloadStatusDefs,
                enrichment: "queue_preview",
            });
            enrichMs = Date.now() - tE0;

            return finish(
                {
                    key: q.key,
                    label: q.label,
                    description: q.description,
                    entity_type: def.entity_type,
                    priority: q.priority ?? "standard",
                    display: q.display ?? "list",
                    count: matched.length,
                    preview: preview as unknown[],
                },
                undefined
            );
        }

        const oppCountBase = () =>
            supabase
                .from("opportunities")
                .select("id", { count: countSel, head: true })
                .eq("org_id", params.orgId)
                .eq("work_unit_id", params.workUnitId);

        if (!includePreviews) {
            const tC0 = Date.now();
            const countQ = applyOpsToJobQuery(oppCountBase() as never, ops);
            const { count, error: countErr } = await countQ;
            countMs = Date.now() - tC0;
            if (countErr) {
                throw new QueueServiceError(countErr.message, 400, "DB_ERROR");
            }
            return finish(
                {
                    key: q.key,
                    label: q.label,
                    description: q.description,
                    entity_type: def.entity_type,
                    priority: q.priority ?? "standard",
                    display: q.display ?? "list",
                    count: count ?? 0,
                    preview: [],
                },
                calendar_meta
            );
        }

        const tParallelOpp0 = Date.now();
        const countQ = applyOpsToJobQuery(oppCountBase() as never, ops);
        const previewQ0 = supabase
            .from("opportunities")
            .select("id, name, title, status_key, customer_id, primary_person_id, primary_contact_id, work_unit_id, metadata, created_at, updated_at")
            .eq("org_id", params.orgId)
            .eq("work_unit_id", params.workUnitId);
        const previewQ1 = applySortToJobQuery(applyOpsToJobQuery(previewQ0 as never, ops) as never, sort);
        const [countRes, previewRes, effectiveStatusDefs] = await Promise.all([
            countQ,
            previewQ1.limit(previewLimit),
            sharedOpportunityStatusDefs(),
        ]);
        const parallelOppMs = Date.now() - tParallelOpp0;
        countMs = parallelOppMs;
        previewMs = parallelOppMs;
        if (countRes.error) {
            throw new QueueServiceError(countRes.error.message, 400, "DB_ERROR");
        }
        if (previewRes.error) {
            throw new QueueServiceError(previewRes.error.message, 400, "DB_ERROR");
        }
        const count = countRes.count;
        const previewRaw = previewRes.data;
        const previewRows = (previewRaw ?? []) as OpportunityRowPreview[];
        rowsEnriched = previewRows.length;
        const tE0 = Date.now();
        const preview = await enrichOpportunityRows({
            supabase,
            orgId: params.orgId,
            rows: previewRows,
            effectiveStatusDefs,
            enrichment: "queue_preview",
        });
        enrichMs = Date.now() - tE0;

        return finish(
            {
                key: q.key,
                label: q.label,
                description: q.description,
                entity_type: def.entity_type,
                priority: q.priority ?? "standard",
                display: q.display ?? "list",
                count: count ?? 0,
                preview: preview as unknown[],
            },
            calendar_meta
        );
    });

    const rowResults = await Promise.all(factories.map((f) => f()));
    const totalMs = Date.now() - tW0;
    console.log("[queue-opt]", { phase: "summary", duration_ms: totalMs, work_unit_id: params.workUnitId });
    const queuesDetailed = perQueueMs.filter(Boolean);
    const rowsEnrichedTotal = queuesDetailed.reduce((a, r) => a + (r?.rows_enriched ?? 0), 0);
    if (totalMs > 300) {
        console.warn("[queue-perf] getWorkUnitQueueSummaries", {
            work_unit_id: params.workUnitId,
            tag: params.perfTag,
            include_previews: includePreviews,
            count_accuracy: countSel,
            summary_mode: summaryMode,
            queue_count: def.queues.length,
            load_def_ms: loadDefMs,
            total_ms: totalMs,
            rows_enriched_total: rowsEnrichedTotal,
            queues: queuesDetailed,
            deferred_queue_keys: deferredQueueKeys,
        });
    }
    if (summaryMode === "partial") {
        return { queues: rowResults.filter((x): x is QueueSummary => x != null) };
    }

    const summaries: QueueSummary[] = def.queues.map((q, i) => {
        const r = rowResults[i];
        if (r) return r;
        return stubDeferredQueueSummary(q, def);
    });

    const scopeMeta = workUnitScopeTotalFromSummaries(def, summaries);
    const scopePayload = {
        work_unit_scope_total: scopeMeta.total,
        work_unit_scope_queue_key: scopeMeta.queueKey,
    };
    return deferredQueueKeys?.length ? { queues: summaries, deferred_queue_keys: deferredQueueKeys, ...scopePayload } : { queues: summaries, ...scopePayload };
}

const DEPARTMENT_WU_SUMMARY_CONCURRENCY = 3;

export type DepartmentWorkUnitQueueSummaryRow = {
    id: string;
    queues: QueueSummary[];
    /** All-records / primary lane count — not a sum of all tabs. */
    work_unit_scope_total?: number | null;
    work_unit_scope_queue_key?: string | null;
    error?: string;
};

/**
 * All queue summaries for each work unit in a department (one round trip from the browser).
 * Per–work-unit failures are isolated so other units still return.
 */
export async function getDepartmentWorkUnitQueueSummaries(params: {
    orgId: string;
    departmentId: string;
    /** Preview rows per queue (same semantics as GET .../queues limit). */
    limit?: number;
    workUnitConcurrency?: number;
    /** When false, counts only (faster department cards). */
    includePreviews?: boolean;
    /** Head counts for status/filter queues: `planned` uses PostgreSQL estimates (faster). */
    countAccuracy?: QueueCountAccuracy;
}): Promise<{ work_units: DepartmentWorkUnitQueueSummaryRow[] }> {
    const includePreviews = params.includePreviews !== false;
    const countAccuracy = params.countAccuracy;
    const supabase = createAdminClient();
    const { data: rows, error } = await supabase
        .from("work_units")
        .select("id")
        .eq("org_id", params.orgId)
        .eq("department_id", params.departmentId)
        .order("sort_order", { ascending: true });

    if (error) {
        throw new QueueServiceError(error.message, 400, "DB_ERROR");
    }

    const ids = (rows ?? []).map((r) => String((r as { id: string }).id ?? "").trim()).filter(Boolean);
    const previewLimit = clampLimit(params.limit ?? 50, 1, 100);
    const wuConc = clampLimit(params.workUnitConcurrency ?? DEPARTMENT_WU_SUMMARY_CONCURRENCY, 1, 8);

    const tBatch0 = Date.now();
    const factories = ids.map(
        (workUnitId) => async (): Promise<DepartmentWorkUnitQueueSummaryRow> => {
            const tWu0 = Date.now();
            try {
                const { queues, work_unit_scope_total, work_unit_scope_queue_key } = await getWorkUnitQueueSummaries({
                    orgId: params.orgId,
                    workUnitId,
                    limit: previewLimit,
                    includePreviews,
                    perfTag: `dept:${params.departmentId}`,
                    countAccuracy,
                });
                const ms = Date.now() - tWu0;
                console.warn("[queue-perf] getDepartmentWorkUnitQueueSummaries work_unit", {
                    ms,
                    department_id: params.departmentId,
                    work_unit_id: workUnitId,
                    include_previews: includePreviews,
                    count_accuracy: countAccuracy ?? "exact",
                    queue_count: queues.length,
                });
                return {
                    id: workUnitId,
                    queues,
                    work_unit_scope_total: work_unit_scope_total ?? null,
                    work_unit_scope_queue_key: work_unit_scope_queue_key ?? null,
                };
            } catch (e) {
                const msg =
                    e instanceof QueueServiceError
                        ? e.message
                        : e instanceof Error && e.message
                          ? e.message
                          : "Queue summaries failed";
                return { id: workUnitId, queues: [], error: msg };
            }
        }
    );

    const work_units = await runPool(factories, wuConc);
    const batchMs = Date.now() - tBatch0;
    if (batchMs > 400) {
        console.warn("[queue-perf] getDepartmentWorkUnitQueueSummaries batch", {
            total_ms: batchMs,
            department_id: params.departmentId,
            work_unit_count: ids.length,
            include_previews: includePreviews,
            count_accuracy: countAccuracy ?? "exact",
        });
    }
    return { work_units };
}

export async function getWorkUnitQueueItems(params: {
    orgId: string;
    workUnitId: string;
    queueKey: string;
    limit?: number;
    offset?: number;
    /** `planned` uses estimate counts (faster). Default exact. */
    countAccuracy?: QueueCountAccuracy;
    /** Skip COUNT query; list still returns `limit` rows. UI should fall back to tab/summary totals. */
    omitTotalCount?: boolean;
}): Promise<QueueItemsResult> {
    const tSvc0 = Date.now();
    const supabase = createAdminClient();
    const refUtc = new Date();
    const tBoot0 = Date.now();
    const [def, operationalDay] = await Promise.all([
        loadWorkUnitQueueDefinition({ orgId: params.orgId, workUnitId: params.workUnitId }),
        resolveOperationalDayPlanContext(supabase, params.orgId, refUtc),
    ]);
    const loadDefMs = Date.now() - tBoot0;
    assertSupportedEntityType(def);
    const q = findQueueByKey(def, params.queueKey);

    const effectiveLimit = clampLimit(params.limit ?? q.limit ?? 50, 1, 200);
    const effectiveOffset = clampLimit(params.offset ?? 0, 0, 1000000);
    const omitTotal = params.omitTotalCount === true;
    const countSel = omitTotal ? null : queueCountSelect(params.countAccuracy);

    if (def.entity_type === "job") {
        const { ops, sort, calendar_meta } = buildJobPlan(q, operationalDay);

        const itemsBase = supabase
            .from("jobs")
            .select("id, title, status_key, work_unit_id, assigned_vendor_id, created_at, updated_at")
            .eq("org_id", params.orgId)
            .eq("work_unit_id", params.workUnitId);

        const itemsQ0 = applySortToJobQuery(applyOpsToJobQuery(itemsBase as never, ops) as never, sort);
        const itemsPromise = itemsQ0.range(effectiveOffset, effectiveOffset + effectiveLimit - 1);

        if (omitTotal) {
            const { data, error } = await itemsPromise;
            if (error) {
                throw new QueueServiceError(error.message, 400, "DB_ERROR");
            }
            const ms = Date.now() - tSvc0;
            console.log("[queue-opt]", { phase: "rows", duration_ms: ms, queue_key: q.key, entity: "job" });
            if (ms > 250) {
                console.warn("[queue-perf] getWorkUnitQueueItems job", { ms, load_def_ms: loadDefMs, omit_total: true, queue_key: q.key });
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
                total: 0,
                limit: effectiveLimit,
                offset: effectiveOffset,
                total_omitted: true,
                ...(calendar_meta ? { calendar_meta } : {}),
            };
        }

        const countBase = supabase
            .from("jobs")
            .select("id", { count: countSel!, head: true })
            .eq("org_id", params.orgId)
            .eq("work_unit_id", params.workUnitId);
        const countQ = applyOpsToJobQuery(countBase as never, ops);

        const [{ count, error: countErr }, { data, error }] = await Promise.all([countQ, itemsPromise]);
        if (countErr) {
            throw new QueueServiceError(countErr.message, 400, "DB_ERROR");
        }
        if (error) {
            throw new QueueServiceError(error.message, 400, "DB_ERROR");
        }

        const ms = Date.now() - tSvc0;
        console.log("[queue-opt]", { phase: "rows", duration_ms: ms, queue_key: q.key, entity: "job" });
        if (ms > 250) {
            console.warn("[queue-perf] getWorkUnitQueueItems job", {
                ms,
                load_def_ms: loadDefMs,
                queue_key: q.key,
                count_accuracy: countSel,
            });
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
            ...(calendar_meta ? { calendar_meta } : {}),
        };
    }

    // opportunity
    const { ops, sort, calendar_meta } = buildOpportunityPlan(q, refUtc, operationalDay);

    const oppStatusDefsPromise = fetchEffectiveStatusDefinitions(supabase as any, params.orgId, "opportunities", { activeOnly: true });

    if (params.queueKey === "needs_attention") {
        const tNa0 = Date.now();
        const [matched, effectiveStatusDefs] = await Promise.all([
            loadOpportunityNeedsAttentionRows({
                supabase,
                orgId: params.orgId,
                workUnitId: params.workUnitId,
                sort,
                now: refUtc,
            }),
            oppStatusDefsPromise,
        ]);
        const naLoadMs = Date.now() - tNa0;
        const slice = matched.slice(effectiveOffset, effectiveOffset + effectiveLimit);
        const tEn0 = Date.now();
        const items = await enrichOpportunityRows({
            supabase,
            orgId: params.orgId,
            rows: slice,
            effectiveStatusDefs,
            enrichment: "full",
        });
        const enrichMs = Date.now() - tEn0;
        const ms = Date.now() - tSvc0;
        console.log("[queue-opt]", { phase: "rows", duration_ms: ms, queue_key: q.key, entity: "opportunity" });
        if (ms > 250) {
            console.warn("[queue-perf] getWorkUnitQueueItems opportunity needs_attention", {
                ms,
                load_def_ms: loadDefMs,
                na_load_ms: naLoadMs,
                enrich_ms: enrichMs,
                row_count: slice.length,
            });
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
            items: items as unknown[],
            total: matched.length,
            limit: effectiveLimit,
            offset: effectiveOffset,
        };
    }

    const itemsBase = supabase
        .from("opportunities")
        .select("id, name, status_key, customer_id, primary_person_id, primary_contact_id, metadata, created_at, updated_at")
        .eq("org_id", params.orgId)
        .eq("work_unit_id", params.workUnitId);

    const itemsQ0 = applySortToJobQuery(applyOpsToJobQuery(itemsBase as never, ops) as never, sort);
    const itemsPromise = itemsQ0.range(effectiveOffset, effectiveOffset + effectiveLimit - 1);

    if (omitTotal) {
        const [{ data: raw, error }, effectiveStatusDefs] = await Promise.all([itemsPromise, oppStatusDefsPromise]);
        if (error) {
            throw new QueueServiceError(error.message, 400, "DB_ERROR");
        }
        const itemRows = (raw ?? []) as OpportunityRowPreview[];
        const tEn0 = Date.now();
        const items = await enrichOpportunityRows({
            supabase,
            orgId: params.orgId,
            rows: itemRows,
            effectiveStatusDefs,
            enrichment: "full",
        });
        const enrichMs = Date.now() - tEn0;
        const ms = Date.now() - tSvc0;
        console.log("[queue-opt]", { phase: "rows", duration_ms: ms, queue_key: q.key, entity: "opportunity" });
        if (ms > 250) {
            console.warn("[queue-perf] getWorkUnitQueueItems opportunity", {
                ms,
                load_def_ms: loadDefMs,
                enrich_ms: enrichMs,
                row_count: itemRows.length,
                omit_total: true,
                queue_key: q.key,
               });
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
            items: items as unknown[],
            total: 0,
            limit: effectiveLimit,
            offset: effectiveOffset,
            total_omitted: true,
            ...(calendar_meta ? { calendar_meta } : {}),
        };
    }

    const countBase = supabase
        .from("opportunities")
        .select("id", { count: countSel!, head: true })
        .eq("org_id", params.orgId)
        .eq("work_unit_id", params.workUnitId);
    const countQ = applyOpsToJobQuery(countBase as never, ops);

    const [{ count, error: countErr }, { data: raw, error }, effectiveStatusDefs] = await Promise.all([
        countQ,
        itemsPromise,
        oppStatusDefsPromise,
    ]);
    if (countErr) {
        throw new QueueServiceError(countErr.message, 400, "DB_ERROR");
    }
    if (error) {
        throw new QueueServiceError(error.message, 400, "DB_ERROR");
    }
    const itemRows = (raw ?? []) as OpportunityRowPreview[];
    const tEn0 = Date.now();
    const items = await enrichOpportunityRows({
        supabase,
        orgId: params.orgId,
        rows: itemRows,
        effectiveStatusDefs,
        enrichment: "full",
    });
    const enrichMs = Date.now() - tEn0;
    const ms = Date.now() - tSvc0;
    console.log("[queue-opt]", { phase: "rows", duration_ms: ms, queue_key: q.key, entity: "opportunity" });
    if (ms > 250) {
        console.warn("[queue-perf] getWorkUnitQueueItems opportunity", {
            ms,
            load_def_ms: loadDefMs,
            enrich_ms: enrichMs,
            row_count: itemRows.length,
            queue_key: q.key,
            count_accuracy: countSel,
        });
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
        items: items as unknown[],
        total: count ?? 0,
        limit: effectiveLimit,
        offset: effectiveOffset,
        ...(calendar_meta ? { calendar_meta } : {}),
    };
}

export const __testing = {
    buildJobPlan,
    buildOpportunityPlan,
    buildOpportunityNeedsAttentionOrExpr,
    buildOpportunityNeedsAttentionCandidateOrExpr,
    opportunityNeedsAttention,
    findQueueByKey,
    assertSupportedEntityType,
};

