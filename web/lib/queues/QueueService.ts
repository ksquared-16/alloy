import { createAdminClient } from "@/lib/supabaseAdmin";
import { validateQueueDefinition, type QueueConfig, type QueueDefinitionV1, type QueueFilter } from "@/lib/config/queueDefinitionSchema";
import type {
    QueueItemsResult,
    QueueOperationalCalendarMeta,
    QueueSummary,
    QueueViewerTimezoneMeta,
} from "@/lib/queues/types";
import { workUnitScopeTotalFromSummaries, findAllRecordsQueueKey } from "@/lib/workspace/workUnitQueueDerived";
import { getQueueUiConfig, type QueueUiConfig } from "@/lib/ui-v2/queueUiConfig";
import {
    fetchEffectiveStatusDefinitions,
    fetchEffectiveStatusDefinitionsTagged,
    displayLabelsFromDefinitions,
    type StatusDefinitionRow,
    type StatusDefsResolveTelemetry,
} from "@/lib/admin/statusDefinitionsResolve";
import { logDbTiming, withDbTiming } from "@/lib/admin/dbQueryTiming";
import { TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS } from "@/lib/tours/constants";
import { formatOpportunityTourQueueDisplays } from "@/lib/tours/queue/opportunityQueueTourPreview";
import { approximateAgeMonthsFromDobIso, programLabelAndAgeGroupFromAgeMonths } from "@/lib/childcare/childCareProgramFromDob";
import { getOrgLocalTodayUtcBounds, type OrgLocalDayUtcBounds } from "@/lib/admin/orgLocalDayBounds";
import { fetchOperationalTimezoneForOrgWithCache, UTC_FALLBACK_IANA } from "@/lib/admin/timezoneContract";
import { formatDateTimeForUserDisplay } from "@/lib/adminFormatters";
import type { RecordScopeConstraints } from "@/lib/admin/accessScope";
import { applyRecordScopeConstraintsToQuery } from "@/lib/admin/accessScope";
import {
    LOCATION_DISPLAY_LABEL_SELECT,
    locationDisplayLabelFromRow,
    type LocationDisplayLabelRow,
} from "@/lib/admin/locationDisplayLabel";
import { resolveOpportunityAttentionConfigFromMetadata, type OpportunityAttentionResolvedConfig } from "@/lib/opportunities/opportunityAttentionConfig";
import {
    opportunityAttentionResultMatchesBucket,
    resolveNeedsAttentionBucketsWithPrecedence,
} from "@/lib/opportunities/needsAttentionBuckets";
import {
    createOpportunityAttentionResolverBatchContext,
    resolveOpportunityAttention,
    type OpportunityAttentionEntityInput,
    type OpportunityAttentionResult,
} from "@/lib/opportunities/opportunityAttentionResolver";
import { buildNeedsAttentionSuggestion } from "@/lib/agent/needsAttentionSuggestion/buildNeedsAttentionSuggestion";
import type { AttentionSuggestionQueuePreviewV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import { buildOperationalSummaryDeterministic, toOperationalSummaryQueuePreview } from "@/lib/ai/buildOperationalSummary";
import { childDesiredStartSummaryFromOcmRows } from "@/lib/ui-v2/childDesiredStartQueuePresentation";
import { DEFAULT_OPPORTUNITY_ATTENTION_RULES_V1 } from "@/lib/workspace/opportunityAttentionRules";
import { buildQueueServiceAttentionSemantics } from "@/lib/workspace/opportunityAttentionCountSemantics";
import { applyPlacementToOpportunityQueueRows } from "@/lib/orchestration/placement/applyPlacementToOpportunityQueueRows";
import type { WorkUnitPlacementQueueDiagnostics } from "@/lib/orchestration/placement/applyPlacementToOpportunityQueueRows";
import { resolvePlacementQueueConfig } from "@/lib/orchestration/placement/resolvePlacementQueueConfig";
import { sortNeedsAttentionFilteredRows } from "@/lib/queues/needsAttentionQueuePrioritySort";

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
    location_id?: string | null;
    quote_total?: number | string | null;
    estimated_price_cents?: number | string | null;
    monetary_value_cents?: number | string | null;
    created_at: string;
    updated_at: string;
    metadata?: Record<string, unknown> | null;
};

/** Parallel phase wall + per-branch elapsed (branches overlap; sums may exceed `enrichment_ms`). */
export type QueueListEnrichmentSubtimingsMs = {
    parallel_wall_ms: number;
    persons_ms: number;
    contacts_ms: number;
    customers_ms: number;
    customer_members_ms: number;
    defs_resolve_ms: number;
    child_persons_ms: number;
    map_ms: number;
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

/** JSONB often stores explicit null for omitted optional strings; summaries use undefined-only optionals. */
function queueSummaryOptionalString(v: string | null | undefined): string | undefined {
    return v ?? undefined;
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

/** Status keys declared on lane filters — passed to placement cohort overlap checks when present. */
function opportunityQueueStatusKeysAllowed(queue: QueueConfig): string[] | undefined {
    const keys = new Set<string>();
    for (const f of queue.filters) {
        if (f.type === "status" && f.operator === "in") {
            for (const v of f.values ?? []) {
                if (typeof v === "string" && v.trim()) keys.add(v.trim());
            }
        }
    }
    if (keys.size === 0) return undefined;
    return [...keys];
}

function attachPlacementToEnrichedOpportunityItems(params: {
    enrichedRows: Array<Record<string, unknown>>;
    workUnitId: string;
    queueKey: string;
    queueConfig: QueueConfig;
    departmentMetadata: unknown | null;
    workUnitMetadata: unknown | null;
    nowMs: number;
}): { rows: Array<Record<string, unknown>>; diagnostics: WorkUnitPlacementQueueDiagnostics | null } {
    const resolved = resolvePlacementQueueConfig({
        departmentMetadata: params.departmentMetadata,
        workUnitMetadata: params.workUnitMetadata,
        queue_key: params.queueKey,
    });
    if (resolved.status !== "enabled") {
        return { rows: params.enrichedRows, diagnostics: null };
    }
    const statusKeysAllowed = opportunityQueueStatusKeysAllowed(params.queueConfig);
    const out = applyPlacementToOpportunityQueueRows({
        rows: params.enrichedRows,
        placement: resolved,
        ctx: {
            workUnitId: params.workUnitId,
            queueKey: params.queueKey,
            nowMs: params.nowMs,
            statusKeysAllowed,
        },
    });
    return { rows: out.rows, diagnostics: out.diagnostics };
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

function queueListRelationFetchPlan(ui: QueueUiConfig): {
    persons: boolean;
    contacts: boolean;
    customers: boolean;
    customerMembers: boolean;
} {
    const fields = ui.row_preview.fields;
    const isCrm = ui.row_preview.variant === "crm_compact";
    const wants = (k: (typeof fields)[number]) => fields.includes(k);
    const wantsContact = wants("primary_contact") || wants("phone") || wants("email");
    const wantsHousehold = wants("child_name") || wants("program");
    return {
        persons: isCrm || wantsContact,
        contacts: isCrm || wantsContact,
        customers: isCrm || wantsContact || wantsHousehold,
        customerMembers: isCrm && wantsHousehold,
    };
}

async function resolveOperationalDayPlanContextWithTelemetry(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    refUtc: Date
): Promise<{ ctx: OperationalDayPlanContext; cacheHit: boolean }> {
    const tz = await fetchOperationalTimezoneForOrgWithCache(supabase as never, orgId);
    const dayBounds = getOrgLocalTodayUtcBounds(tz.iana, refUtc);
    return {
        ctx: {
            dayBounds,
            calendar_meta: {
                calendar_type: "operational_day",
                timezone_effective: tz.iana,
                timezone_source: tz.source,
                day_start_utc: dayBounds.dayStartUtc.toISOString(),
                day_end_exclusive_utc: dayBounds.dayEndExclusiveUtc.toISOString(),
            },
        },
        cacheHit: tz.cacheHit,
    };
}

async function resolveOperationalDayPlanContext(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    refUtc: Date
): Promise<OperationalDayPlanContext> {
    return (await resolveOperationalDayPlanContextWithTelemetry(supabase, orgId, refUtc)).ctx;
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
export type OpportunitySortPlan = { column: string; ascending: boolean };

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

function subtractHours(now: Date, hours: number): Date {
    return new Date(now.getTime() - hours * 60 * 60 * 1000);
}

/** Default min lifecycle stale window (hours) for PostgREST prefilter supersets — matches v1 thresholds floor. */
function defaultMinLifecycleStaleHours(): number {
    const th = DEFAULT_OPPORTUNITY_ATTENTION_RULES_V1.thresholdsHours;
    return Math.floor(
        Math.min(th.stale_new_inquiry, th.stale_qualified, th.stale_quote_followup, th.missing_quote_after_execution)
    );
}

function minLifecycleStaleHoursFromResolvedConfig(thresholdsHours: OpportunityAttentionResolvedConfig["thresholdsHours"]): number {
    return Math.floor(
        Math.min(
            thresholdsHours.stale_new_inquiry,
            thresholdsHours.stale_qualified,
            thresholdsHours.stale_quote_followup,
            thresholdsHours.missing_quote_after_execution
        )
    );
}

function truncateAttentionSuggestionQueueWhyLine(text: string, maxChars: number): string {
    const t = text.trim();
    if (t.length <= maxChars) return t;
    if (maxChars < 2) return "…";
    return `${t.slice(0, maxChars - 1)}…`;
}

export function opportunityPreviewToResolverEntity(row: OpportunityRowPreview): OpportunityAttentionEntityInput {
    const md = row.metadata;
    return {
        id: row.id,
        status_key: row.status_key,
        created_at: row.created_at ?? null,
        updated_at: row.updated_at ?? null,
        metadata:
            md && typeof md === "object" && !Array.isArray(md) ? (md as Record<string, unknown>) : null,
        customer_id: row.customer_id,
        primary_person_id: row.primary_person_id ?? null,
        primary_contact_id: row.primary_contact_id ?? null,
        quote_total: row.quote_total ?? null,
        estimated_price_cents: row.estimated_price_cents ?? null,
        monetary_value_cents: row.monetary_value_cents ?? null,
    };
}

/** Queue preview only — prepend timestamp when `metadata.notes_at` is set (instant in DB → wall clock in viewer TZ). */
function formatQueueNotePreview(
    notesRaw: string | null | undefined,
    notesAtRaw: unknown,
    displayTimeZoneIana: string
): string | null {
    const stripLeadingTimestampLike = (raw: string): string => {
        let s = raw.trim();
        if (!s) return s;
        // Normalize common double-time artifacts before stripping.
        // e.g. "05/03/2026 5:00 PM · 3:28 PM — Note" → "05/03/2026 5:00 PM — Note"
        s = s.replace(
            /^(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s+(?:AM|PM))\s+·\s+\d{1,2}:\d{2}\s+(?:AM|PM)\s+—\s+/i,
            "$1 — "
        );
        // Remove "h:mm AM/PM — " prefix.
        s = s.replace(/^\d{1,2}:\d{2}\s*(?:AM|PM)\s+—\s+/i, "");
        // Remove "MM/DD/YYYY h:mm AM/PM — " prefix.
        s = s.replace(/^\d{1,2}\/\d{1,2}\/\d{4},?\s+\d{1,2}:\d{2}\s+(?:AM|PM)\s+—\s+/i, "");
        // Remove "MM/DD/YYYY — " prefix.
        s = s.replace(/^\d{1,2}\/\d{1,2}\/\d{4}\s+—\s+/i, "");
        return s.trim();
    };

    const text = typeof notesRaw === "string" ? stripLeadingTimestampLike(notesRaw) : "";
    if (!text) return null;
    const at = typeof notesAtRaw === "string" ? notesAtRaw.trim() : "";
    if (!at) return text;
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) return `${at.length > 16 ? at.slice(0, 16) : at} — ${text}`;
    const ts = formatDateTimeForUserDisplay(d, displayTimeZoneIana).replace(",", "").replace(/\s+/g, " ").trim();
    return `${ts} — ${text}`;
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

/** `/customer_members` rows that represent active household children (queue CRM compact). */
type CustomerMemberChildInput = {
    customer_id: string;
    display_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    dob?: string | null;
    person_id?: string | null;
    metadata?: Record<string, unknown> | null;
};

function opportunityProgramLineFromMetadata(md: Record<string, unknown> | null): string | null {
    if (!md) return null;
    const programLabel = typeof md.program_label === "string" ? md.program_label.trim() : "";
    const ageGroup = typeof md.age_group === "string" ? md.age_group.trim() : "";
    if (!programLabel) return null;
    if (programLabel.includes("—")) return programLabel;
    const combined = [programLabel, ageGroup].filter(Boolean).join(" · ").trim();
    return combined || programLabel;
}

/** CRM compact Program column / per-child `secondary`: `program_label` only (not age_band duplication in the name column). */
function opportunityProgramLabelOnlyFromMetadata(md: Record<string, unknown> | null): string | null {
    if (!md) return null;
    const programLabel = typeof md.program_label === "string" ? md.program_label.trim() : "";
    return programLabel || null;
}

function isActiveChildCustomerMemberRow(row: Record<string, unknown>): boolean {
    const rel = String(row.relationship ?? "").trim().toLowerCase();
    if (rel !== "child") return false;
    return row.is_active === true;
}

function displayBaseNameForCustomerMember(m: CustomerMemberChildInput): string {
    const d = String(m.display_name ?? "").trim();
    if (d) return d;
    const fn = String(m.first_name ?? "").trim();
    const ln = String(m.last_name ?? "").trim();
    return [fn, ln].filter(Boolean).join(" ").trim();
}

function programSecondaryForCustomerMemberChild(
    m: CustomerMemberChildInput,
    childDobByPersonId: Map<string, string>,
    personById: Map<string, { date_of_birth?: string | null }>
): string | null {
    const meta = m.metadata && typeof m.metadata === "object" && !Array.isArray(m.metadata) ? m.metadata : null;
    const fromMetaPl = meta && typeof meta.program_label === "string" ? meta.program_label.trim() : "";
    const fromMetaAg = meta && typeof meta.age_group === "string" ? meta.age_group.trim() : "";
    if (fromMetaPl) {
        if (fromMetaPl.includes("—")) return fromMetaPl;
        if (fromMetaAg) return `${fromMetaPl} · ${fromMetaAg}`;
        return fromMetaPl;
    }

    const pid = String(m.person_id ?? "").trim();
    const memberDob = String(m.dob ?? "").trim();
    const canonicalDob = pid
        ? (childDobByPersonId.get(pid) ?? String(personById.get(pid)?.date_of_birth ?? "").trim())
        : "";
    const dob = canonicalDob || memberDob;
    if (!dob) return null;
    const months = approximateAgeMonthsFromDobIso(dob);
    if (months == null) return null;
    const { program_label, age_group } = programLabelAndAgeGroupFromAgeMonths(months);
    const ag = typeof age_group === "string" ? age_group.trim() : "";
    return ag ? `${program_label} · ${age_group}` : program_label;
}

/**
 * One `_crm_compact_children` line per active child member; `secondary` is per-child program (member metadata or DOB-derived).
 */
function baseNameFromCrmChildPrimary(primary: string): string {
    const s = primary.trim().replace(/\s+/g, " ");
    const idx = s.lastIndexOf(" (");
    return (idx === -1 ? s : s.slice(0, idx)).trim().toLowerCase();
}

function inquiryProgramSecondaryFromRow(raw: unknown): string | null {
    const row = raw as Record<string, unknown>;
    const pl = typeof row.program_label === "string" ? row.program_label.trim() : "";
    const ag = typeof row.age_group === "string" ? row.age_group.trim() : "";
    if (pl) {
        if (pl.includes("—")) return pl;
        if (ag) return `${pl} · ${ag}`;
        return pl;
    }
    return null;
}

/** When the drawer saves `metadata.inquiry_children`, prefer those program lines for queue preview (matched by child display name). */
function mergeInquiryChildrenIntoMemberStructuredLines(
    lines: { primary: string; secondary: string | null }[],
    inquiryChildren: unknown[]
): { primary: string; secondary: string | null }[] {
    if (!lines.length || !inquiryChildren.length) return lines;
    const byDisplay = new Map<string, string>();
    for (const raw of inquiryChildren) {
        const row = raw as Record<string, unknown>;
        const disp =
            typeof row.display_name === "string" ? row.display_name.trim().replace(/\s+/g, " ").toLowerCase() : "";
        const sec = inquiryProgramSecondaryFromRow(raw);
        if (disp && sec) byDisplay.set(disp, sec);
    }
    if (!byDisplay.size) return lines;
    return lines.map((line) => {
        const key = baseNameFromCrmChildPrimary(line.primary);
        const hit = byDisplay.get(key);
        return hit ? { primary: line.primary, secondary: hit } : line;
    });
}

function buildCrmCompactStructuredLinesFromCustomerMembers(
    members: CustomerMemberChildInput[],
    childDobByPersonId: Map<string, string>,
    personById: Map<string, { date_of_birth?: string | null }>
): { primary: string; secondary: string | null }[] {
    const withLabels: { primary: string; secondary: string | null; sort: string }[] = [];
    for (const m of members) {
        const base = displayBaseNameForCustomerMember(m);
        if (!base) continue;
        const pid = String(m.person_id ?? "").trim();
        const memberDob = String(m.dob ?? "").trim();
        const canonicalDob = pid
            ? (childDobByPersonId.get(pid) ?? String(personById.get(pid)?.date_of_birth ?? "").trim())
            : "";
        const dob = canonicalDob || memberDob;
        const age = dob ? ageLabelFromDob(dob) : null;
        const primary = age ? `${base} (${age})` : base;
        const secondary = programSecondaryForCustomerMemberChild(m, childDobByPersonId, personById);
        withLabels.push({ primary, secondary, sort: primary.toLowerCase() });
    }
    withLabels.sort((a, b) => a.sort.localeCompare(b.sort));
    return withLabels.map((w) => ({ primary: w.primary, secondary: w.secondary }));
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

/** Never surface in needs_attention — terminal or handled in primary pipeline lanes. */
const NEEDS_ATTENTION_EXCLUDED_STATUS_KEYS = new Set(["lost", "enrolled", "new_inquiry"]);

/** Mid-funnel rows where a quiet record for 7+ days usually means a dropped follow-up. */
const NEEDS_ATTENTION_STALE_7D_STATUS_KEYS = new Set([
    "contact_attempted",
    "contacted",
    "waitlisted",
    "enrolling",
]);

function opportunityMetadataRecord(row: OpportunityNeedsAttentionRow): Record<string, unknown> | null {
    const m = row.metadata;
    if (!m || typeof m !== "object" || Array.isArray(m)) return null;
    return m as Record<string, unknown>;
}

function parseMetadataInstantMs(md: Record<string, unknown> | null, key: string): number | null {
    if (!md) return null;
    const v = md[key];
    if (typeof v !== "string") return null;
    const t = Date.parse(v.trim());
    return Number.isFinite(t) ? t : null;
}

function parseTourDateYmdUtcMs(raw: unknown): number | null {
    if (typeof raw !== "string") return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
    if (!m) return null;
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function opportunityNeedsAttention(row: OpportunityNeedsAttentionRow, now: Date): boolean {
    const updatedAt = row.updated_at ? new Date(row.updated_at) : null;
    if (!updatedAt || Number.isNaN(updatedAt.getTime())) return false;
    const sk = (row.status_key ?? "").trim().toLowerCase();
    if (NEEDS_ATTENTION_EXCLUDED_STATUS_KEYS.has(sk)) return false;

    const md = opportunityMetadataRecord(row);

    // 1) Explicit follow-up date passed (metadata; enrollment drawer / seeds).
    const nfu = parseMetadataInstantMs(md, "next_follow_up_at");
    if (nfu != null && nfu < now.getTime()) return true;

    // 2) Tour window passed while still scheduled (confirm / complete tour).
    if (sk === "tour_scheduled") {
        const tourMs = md ? parseTourDateYmdUtcMs(md.tour_date) : null;
        const startTodayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
        if (tourMs != null && tourMs < startTodayUtc) return true;
    }

    // 3) High-value funnel stale >2d (tour / application momentum).
    if (OPPORTUNITY_HIGH_VALUE_STALE_STATUS_KEY_SET.has(sk) && updatedAt.getTime() < subtractDays(now, 2).getTime()) {
        return true;
    }

    // 4) Mid-funnel stale >7d (replaces broad 3d sweep that over-flagged).
    if (NEEDS_ATTENTION_STALE_7D_STATUS_KEYS.has(sk) && updatedAt.getTime() < subtractDays(now, 7).getTime()) {
        return true;
    }

    // 5) Data quality — never for excluded statuses (handled above).
    const pkg = md && typeof md.demo_seed_package === "string" ? String(md.demo_seed_package) : "";
    const isDemoV2 = pkg === "enrollment_pipeline_demo_v2";
    const hasPerson = row.primary_person_id != null && String(row.primary_person_id).trim() !== "";
    const hasLegacyContact = row.primary_contact_id != null && String(row.primary_contact_id).trim() !== "";
    const missingContactLike = isDemoV2 ? !hasPerson : !(hasPerson || hasLegacyContact);
    if (missingContactLike || row.customer_id == null) return true;

    return false;
}

function opportunityNeedsAttentionReasonLabel(row: OpportunityNeedsAttentionRow, now: Date): string | null {
    const updatedAt = row.updated_at ? new Date(row.updated_at) : null;
    if (!updatedAt || Number.isNaN(updatedAt.getTime())) return null;
    const sk = (row.status_key ?? "").trim().toLowerCase();
    if (NEEDS_ATTENTION_EXCLUDED_STATUS_KEYS.has(sk)) return null;

    const md = opportunityMetadataRecord(row);
    const nfu = parseMetadataInstantMs(md, "next_follow_up_at");
    if (nfu != null && nfu < now.getTime()) return "Follow-up date passed";

    if (sk === "tour_scheduled") {
        const tourMs = md ? parseTourDateYmdUtcMs(md.tour_date) : null;
        const startTodayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
        if (tourMs != null && tourMs < startTodayUtc) return "Tour date passed — follow up";
    }

    if (OPPORTUNITY_HIGH_VALUE_STALE_STATUS_KEY_SET.has(sk) && updatedAt.getTime() < subtractDays(now, 2).getTime()) {
        return "High-value stale > 2 days";
    }
    if (NEEDS_ATTENTION_STALE_7D_STATUS_KEYS.has(sk) && updatedAt.getTime() < subtractDays(now, 7).getTime()) {
        return "Stale > 7 days";
    }

    const pkg = md && typeof md.demo_seed_package === "string" ? String(md.demo_seed_package) : "";
    const isDemoV2 = pkg === "enrollment_pipeline_demo_v2";
    const hasPerson = row.primary_person_id != null && String(row.primary_person_id).trim() !== "";
    const hasLegacyContact = row.primary_contact_id != null && String(row.primary_contact_id).trim() !== "";
    const missingContactLike = isDemoV2 ? !hasPerson : !(hasPerson || hasLegacyContact);
    if (missingContactLike || row.customer_id == null) return "Missing contact/customer";

    return null;
}

/** Structured lines for CRM compact child/program columns (`_crm_compact_children` on queue rows). */
type OpportunityQueueCrmChildLine = {
    primary: string;
    secondary: string | null;
};

/**
 * One row per child for CRM compact. Emits 2+ rows when stacking; **also 1 row** for single enrolled/inquiry
 * child so queue preview (which may skip OCM join) still gets a structured primary for the Child column.
 */
function buildStructuredCrmCompactChildren(joinChildNames: string[], inquiryChildren: unknown[]): OpportunityQueueCrmChildLine[] | undefined {
    if (joinChildNames.length >= 2) {
        return joinChildNames
            .map((full) => {
                const primary = full.trim();
                return primary ? { primary, secondary: null as string | null } : null;
            })
            .filter((x): x is OpportunityQueueCrmChildLine => x != null);
    }
    if (joinChildNames.length === 1) {
        const primary = joinChildNames[0]!.trim();
        return primary ? [{ primary, secondary: null }] : undefined;
    }
    const icRaw = inquiryChildren.filter((x) => x != null && typeof x === "object");
    const lineFromInquiryRow = (raw: unknown): OpportunityQueueCrmChildLine | null => {
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
        if (!primary) return null;
        const secondary = disp && detail ? detail : null;
        return { primary, secondary };
    };
    if (icRaw.length >= 2) {
        const out: OpportunityQueueCrmChildLine[] = [];
        for (const raw of icRaw) {
            const line = lineFromInquiryRow(raw);
            if (line) out.push(line);
        }
        return out.length >= 2 ? out : undefined;
    }
    if (icRaw.length === 1) {
        const line = lineFromInquiryRow(icRaw[0]);
        return line ? [line] : undefined;
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
     * CRM compact children always load from `customer_members` (relationship `child`, `is_active`)
     * via `opportunities.customer_id`. `enrichment` still controls other payload shaping / perf logging.
     */
    enrichment?: "full" | "queue_preview" | "queue_list";
    /**
     * When `queue_list`, narrows relational batch queries from work-unit CRM row preview config (`ui.row_preview`)
     * so basic lanes skip heavy joins. Omit for previews / drawer paths (full hydrate).
     */
    relationFetchPlan?: {
        persons: boolean;
        contacts: boolean;
        customers: boolean;
        customerMembers: boolean;
    };
    /** User → org → UTC for `_notes_preview` / `_tour_context` (Timezone Contract v1). */
    viewerDisplayTimeZoneIana?: string;
    /**
     * When set (opportunity `needs_attention` lane), attention fields use {@link resolveOpportunityAttention}
     * with caller-resolved defs + config (`config` must be computed once per request/work unit).
     */
    opportunityAttentionResolution?: {
        defs: StatusDefinitionRow[];
        config: OpportunityAttentionResolvedConfig;
        nowMs: number;
    } | null;
}): Promise<{ rows: Array<Record<string, unknown>>; queueListSubtimings?: QueueListEnrichmentSubtimingsMs }> {
    const {
        supabase,
        orgId,
        rows,
        effectiveStatusDefs: preloadedDefs,
        enrichment = "full",
        relationFetchPlan,
        viewerDisplayTimeZoneIana: viewerTzRaw,
        opportunityAttentionResolution,
    } = params;
    const displayTz = typeof viewerTzRaw === "string" && viewerTzRaw.trim() ? viewerTzRaw.trim() : UTC_FALLBACK_IANA;
    const previewLite = enrichment === "queue_preview" || enrichment === "queue_list";
    if (!rows.length) {
        return { rows: [] };
    }

    const plan = relationFetchPlan ?? {
        persons: true,
        contacts: true,
        customers: true,
        customerMembers: true,
    };

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

    const emptyRel = Promise.resolve({ data: [] as any[], error: null as any });

    const opportunityIds = [...new Set(rows.map((r) => String(r.id ?? "").trim()).filter(Boolean))];

    const tParallel0 = Date.now();
    const locationIds = [
        ...new Set(
            rows
                .map((r) => (r as { location_id?: unknown }).location_id)
                .filter((x): x is string => typeof x === "string" && x.trim() !== "")
        ),
    ];

    const [personsTimed, contactsTimed, customersTimed, membersTimed, defsTimed, tourBookingsTimed, locationsTimed, ocmDesiredStartTimed] =
        await Promise.all([
        plan.persons && personIds.length
            ? timedAwait(
                  supabase
                      .from("persons")
                      .select("id, first_name, last_name, email, phone, date_of_birth")
                      .eq("org_id", orgId)
                      .in("id", personIds as any)
              )
            : timedAwait(emptyRel),
        plan.contacts && contactIds.length
            ? timedAwait(
                  supabase
                      .from("contacts")
                      .select("id, first_name, last_name, email, phone, customer_id")
                      .eq("org_id", orgId)
                      .in("id", contactIds as any)
              )
            : timedAwait(emptyRel),
        plan.customers && customerIds.length
            ? timedAwait(supabase.from("customers").select("id, name").eq("org_id", orgId).in("id", customerIds as any))
            : timedAwait(emptyRel),
        plan.customerMembers && customerIds.length
            ? timedAwait(
                  supabase
                      .from("customer_members")
                      .select("customer_id, display_name, first_name, last_name, dob, person_id, relationship, is_active, metadata")
                      .eq("org_id", orgId)
                      .eq("relationship", "child")
                      .eq("is_active", true)
                      .in("customer_id", customerIds as any)
              )
            : timedAwait(emptyRel),
        preloadedDefs != null
            ? timedAwait(Promise.resolve(preloadedDefs))
            : timedAwait(fetchEffectiveStatusDefinitions(supabase as any, orgId, "opportunities", { activeOnly: true })),
        opportunityIds.length > 0
            ? timedAwait(
                  supabase
                      .from("tour_bookings")
                      .select("opportunity_id, start_at, timezone, status_key")
                      .eq("org_id", orgId)
                      .in("opportunity_id", opportunityIds as any)
                      .in("status_key", [...TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS] as any)
              )
            : timedAwait(emptyRel),
        locationIds.length
            ? timedAwait(
                  supabase
                      .from("locations")
                      .select(LOCATION_DISPLAY_LABEL_SELECT)
                      .eq("org_id", orgId)
                      .in("id", locationIds as any)
              )
            : timedAwait(emptyRel),
        opportunityIds.length
            ? timedAwait(
                  supabase
                      .from("opportunity_customer_members")
                      .select("opportunity_id, desired_start_date")
                      .eq("org_id", orgId)
                      .in("opportunity_id", opportunityIds as any)
              )
            : timedAwait(emptyRel),
    ]);
    const parallelMainMs = Date.now() - tParallel0;

    const locationLabelById = new Map<string, string>();
    const locationRows = (locationsTimed.v as { data?: unknown[] | null }).data;
    for (const raw of Array.isArray(locationRows) ? locationRows : []) {
        const row = raw as { id?: string } & LocationDisplayLabelRow;
        const id = String(row.id ?? "").trim();
        if (!id) continue;
        const label = locationDisplayLabelFromRow(row);
        if (label) locationLabelById.set(id, label);
    }

    const ocmDesiredStartByOpportunityId = new Map<string, { desired_start_date?: string | null }[]>();
    for (const raw of (ocmDesiredStartTimed.v as { data?: unknown[] | null }).data ?? []) {
        const row = raw as { opportunity_id?: string; desired_start_date?: string | null };
        const oid = String(row.opportunity_id ?? "").trim();
        if (!oid) continue;
        const list = ocmDesiredStartByOpportunityId.get(oid) ?? [];
        list.push({ desired_start_date: row.desired_start_date ?? null });
        ocmDesiredStartByOpportunityId.set(oid, list);
    }

    const tourBookingByOppId = new Map<string, { start_at: string; timezone: string }>();
    for (const raw of (tourBookingsTimed.v as any).data ?? []) {
        const row = raw as Record<string, unknown>;
        const oid = String(row.opportunity_id ?? "").trim();
        const sa = String(row.start_at ?? "");
        const tz = String(row.timezone ?? "UTC");
        if (!oid || !sa) continue;
        const prev = tourBookingByOppId.get(oid);
        const t = Date.parse(sa);
        const pt = prev ? Date.parse(prev.start_at) : NaN;
        if (!prev || (Number.isFinite(t) && (!Number.isFinite(pt) || t > pt))) {
            tourBookingByOppId.set(oid, { start_at: sa, timezone: tz });
        }
    }

    const personsRes = personsTimed.v;
    const contactsRes = contactsTimed.v;
    const customersRes = customersTimed.v;
    const customerMembersRes = membersTimed.v;
    const defs = defsTimed.v;

    logDbTiming("enrichOpportunityRows.parallel_main", parallelMainMs, {
        orgId,
        row_count: rows.length,
        enrichment,
    });

    const labelByKey = displayLabelsFromDefinitions(defs);

    const personById = new Map<string, any>();
    for (const p of (personsRes as any).data ?? []) personById.set(String(p.id), p);
    const contactById = new Map<string, any>();
    for (const c of (contactsRes as any).data ?? []) contactById.set(String(c.id), c);
    const customerById = new Map<string, any>();
    for (const c of (customersRes as any).data ?? []) customerById.set(String(c.id), c);

    const tChild0 = Date.now();
    // Child DOB: prefer `persons.date_of_birth` when `customer_members.person_id` is set,
    // else `customer_members.dob`.
    const activeChildrenByCustomerId = new Map<string, CustomerMemberChildInput[]>();
    for (const raw of (customerMembersRes as any).data ?? []) {
        if (!isActiveChildCustomerMemberRow(raw as Record<string, unknown>)) continue;
        const cid = String((raw as any).customer_id ?? "").trim();
        if (!cid) continue;
        const m: CustomerMemberChildInput = {
            customer_id: cid,
            display_name: (raw as any).display_name,
            first_name: (raw as any).first_name,
            last_name: (raw as any).last_name,
            dob: (raw as any).dob,
            person_id: (raw as any).person_id,
            metadata: (raw as any).metadata && typeof (raw as any).metadata === "object" ? (raw as any).metadata : null,
        };
        const list = activeChildrenByCustomerId.get(cid) ?? [];
        list.push(m);
        activeChildrenByCustomerId.set(cid, list);
    }

    const childPersonIds: string[] = [];
    for (const members of activeChildrenByCustomerId.values()) {
        for (const m of members) {
            const p = String(m.person_id ?? "").trim();
            if (p) childPersonIds.push(p);
        }
    }
    const primaryPersonIdSet = new Set(personIds);
    const childPersonIdsToFetch =
        plan.customerMembers && activeChildrenByCustomerId.size > 0
            ? [...new Set(childPersonIds)].filter((id) => !primaryPersonIdSet.has(id))
            : [];
    const childPersons =
        childPersonIdsToFetch.length > 0
            ? await withDbTiming(
                  "persons.child_dob_batch",
                  { orgId, n: childPersonIdsToFetch.length },
                  async () => {
                      const { data } = await supabase
                          .from("persons")
                          .select("id, date_of_birth")
                          .eq("org_id", orgId)
                          .in("id", childPersonIdsToFetch as any);
                      return data ?? [];
                  }
              )
            : ([] as any[]);
    const childDobByPersonId = new Map<string, string>();
    for (const p of (childPersons ?? []) as any[]) {
        const id = String(p.id ?? "").trim();
        const dob = String(p.date_of_birth ?? "").trim();
        if (id && dob) childDobByPersonId.set(id, dob);
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
        const notesRaw = typeof md?.notes === "string" ? md.notes : typeof md?.demo_note === "string" ? md.demo_note : null;
        const notesPreview = formatQueueNotePreview(notesRaw, md?.notes_at, displayTz);
        const nextStepPreview = typeof md?.next_step === "string" ? md.next_step.trim() : null;

        const customerIdStr = r.customer_id ? String(r.customer_id).trim() : "";
        const activeMemberChildren = customerIdStr ? activeChildrenByCustomerId.get(customerIdStr) ?? [] : [];
        const inquiryChildren = md && Array.isArray((md as { inquiry_children?: unknown }).inquiry_children)
            ? ((md as { inquiry_children: unknown[] }).inquiry_children ?? []).filter((x) => x && typeof x === "object")
            : [];

        let childDisplay: string | null = null;
        let programsDisplay: string | null = null;
        let programCombined: string | null = opportunityProgramLineFromMetadata(md);
        let desiredStart: string | null = null;

        let structuredFromMembers: ReturnType<typeof buildCrmCompactStructuredLinesFromCustomerMembers> | null = null;

        if (activeMemberChildren.length > 0) {
            structuredFromMembers = buildCrmCompactStructuredLinesFromCustomerMembers(
                activeMemberChildren,
                childDobByPersonId,
                personById
            );
            childDisplay =
                structuredFromMembers.length > 0 ? structuredFromMembers.map((line) => line.primary).join(" · ") : null;
            const secondaryParts = structuredFromMembers
                .map((line) => (typeof line.secondary === "string" ? line.secondary.trim() : ""))
                .filter(Boolean);
            programsDisplay = [...new Set(secondaryParts)].join(" · ") || (typeof md?.program_label === "string" ? md.program_label.trim() : null);
            if (inquiryChildren.length) {
                structuredFromMembers = mergeInquiryChildrenIntoMemberStructuredLines(structuredFromMembers, inquiryChildren);
                const secondaryAfterInquiry = structuredFromMembers
                    .map((line) => (typeof line.secondary === "string" ? line.secondary.trim() : ""))
                    .filter(Boolean);
                programsDisplay =
                    [...new Set(secondaryAfterInquiry)].join(" · ") ||
                    (typeof md?.program_label === "string" ? md.program_label.trim() : null);
            }
            desiredStart = typeof md?.desired_start_date === "string" ? md.desired_start_date : null;
        } else if (inquiryChildren.length > 0) {
            const names: string[] = [];
            const programs: string[] = [];
            for (const raw of inquiryChildren) {
                const icRow = raw as Record<string, unknown>;
                const disp = typeof icRow.display_name === "string" ? icRow.display_name.trim() : "";
                if (disp) names.push(disp);
                const pl =
                    typeof icRow.program_label === "string"
                        ? icRow.program_label.trim()
                        : typeof icRow.program_short === "string"
                            ? String(icRow.program_short).trim()
                            : "";
                if (pl) programs.push(pl);
            }
            childDisplay = names.length ? names.join(" · ") : null;
            const uniq = [...new Set(programs.filter(Boolean))];
            programsDisplay = uniq.length ? uniq.join(", ") : null;
            const firstAgeRow = inquiryChildren[0] as Record<string, unknown>;
            const ageGroup =
                typeof firstAgeRow.age_group === "string" ? firstAgeRow.age_group.trim() : "";
            programCombined =
                programsDisplay && ageGroup
                    ? `${programsDisplay} · ${ageGroup}`
                    : programsDisplay ?? opportunityProgramLineFromMetadata(md);
            desiredStart = typeof md?.desired_start_date === "string" ? md.desired_start_date : null;
        } else {
            childDisplay = null;
            programsDisplay = typeof md?.program_label === "string" ? md.program_label.trim() : null;
            programCombined = opportunityProgramLineFromMetadata(md);
            desiredStart = typeof md?.desired_start_date === "string" ? md.desired_start_date : null;
        }

        const oppIdForTour = String(r.id ?? "").trim();
        const bookingTour = oppIdForTour ? tourBookingByOppId.get(oppIdForTour) ?? null : null;
        const { tourQueueDisplay, tourContext } = formatOpportunityTourQueueDisplays(md, bookingTour, displayTz);

        const sk = (r.status_key ?? "").trim();
        const statusDisplay = sk ? labelByKey.get(sk) ?? sk : null;

        let attentionReasonLabel: string | null;
        let attentionReasonCode: string | null = null;
        let attentionSeverity: "critical" | "high" | "medium" | "low" | null = null;
        let attentionExtras: Record<string, unknown> = {};
        if (opportunityAttentionResolution) {
            const attn = resolveOpportunityAttention({
                opportunity: opportunityPreviewToResolverEntity(r),
                defs: opportunityAttentionResolution.defs,
                config: opportunityAttentionResolution.config,
                nowMs: opportunityAttentionResolution.nowMs,
                optionalSignals: null,
            });
            attentionReasonCode = attn.primary_reason?.code ?? null;
            attentionReasonLabel = attn.primary_reason?.label ?? null;
            attentionSeverity = attn.primary_reason?.severity ?? null;
            const sug = buildNeedsAttentionSuggestion({
                opportunity: {
                    id: String(r.id),
                    status_key: r.status_key ?? null,
                    metadata:
                        r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)
                            ? (r.metadata as Record<string, unknown>)
                            : null,
                    primary_display_name: (customer?.name ?? r.name ?? "").trim() || null,
                },
                attention: attn,
                activity: null,
                nowIso: new Date(opportunityAttentionResolution.nowMs).toISOString(),
            });
            const suggestionPreview: AttentionSuggestionQueuePreviewV1 | null = sug
                ? {
                      next_label: sug.next_action.label,
                      why_line: truncateAttentionSuggestionQueueWhyLine(sug.reasoning.summary, 140),
                  }
                : null;
            const opSummary = buildOperationalSummaryDeterministic({
                attention: attn,
                suggestion: sug,
                nowIso: new Date(opportunityAttentionResolution.nowMs).toISOString(),
            });
            const operationalSummaryPreview = opSummary ? toOperationalSummaryQueuePreview(opSummary) : null;
            attentionExtras = {
                _needs_attention: attn.needs_attention,
                _attention_priority_score: attn.priority_score,
                _attention_waiting_bucket: attn.waiting.bucket,
                _attention_reasons_detail: attn.reasons,
                _attention_priority_breakdown: attn.priority_breakdown,
                ...(suggestionPreview ? { _attention_suggestion_preview: suggestionPreview } : {}),
                ...(operationalSummaryPreview ? { _operational_summary_preview: operationalSummaryPreview } : {}),
            };
        } else {
            attentionReasonLabel = opportunityNeedsAttentionReasonLabel(r, nowForAttention);
        }

        const structuredFromInquiry = buildStructuredCrmCompactChildren([], inquiryChildren);
        const crmCompactChildrenStructured =
            structuredFromMembers && structuredFromMembers.length > 0
                ? structuredFromMembers
                : structuredFromInquiry && structuredFromInquiry.length > 0
                  ? structuredFromInquiry
                  : childDisplay?.trim()
                    ? [{ primary: childDisplay.trim(), secondary: programCombined }]
                    : undefined;

        const locId = (r as { location_id?: string | null }).location_id;
        const locationLabel = locId ? locationLabelById.get(String(locId)) ?? null : null;

        const oppIdStr = String(r.id ?? "").trim();
        const childDesiredStartSummary = childDesiredStartSummaryFromOcmRows(
            ocmDesiredStartByOpportunityId.get(oppIdStr) ?? []
        );

        return {
            ...r,
            title: r.name ?? null,
            _location_label: locationLabel,
            _customer_name: customer?.name ?? null,
            _primary_contact_line: contactName ?? null,
            _primary_phone: contactPhone ?? null,
            _primary_email: contactEmail ?? null,
            _child_display_name: childDisplay,
            _crm_compact_children: crmCompactChildrenStructured,
            _requested_program: programsDisplay ?? programCombined,
            _desired_start_date: desiredStart,
            _child_desired_start_summary: childDesiredStartSummary,
            _tour_context: tourContext,
            _tour_queue_display: tourQueueDisplay,
            _notes_preview: notesPreview,
            _next_step_preview: nextStepPreview,
            _status_display: statusDisplay,
            _attention_reason_label: attentionReasonLabel,
            ...(opportunityAttentionResolution
                ? {
                      _attention_reason: attentionReasonCode,
                      _attention_severity: attentionSeverity,
                      ...attentionExtras,
                  }
                : {}),
        };
    });
    const mapMs = Date.now() - tMap0;
    const enrichMs = Date.now() - tEnrich0;
    const queueListSubtimings: QueueListEnrichmentSubtimingsMs | undefined =
        enrichment === "queue_list"
            ? {
                  parallel_wall_ms: parallelMainMs,
                  persons_ms: personsTimed.ms,
                  contacts_ms: contactsTimed.ms,
                  customers_ms: customersTimed.ms,
                  customer_members_ms: membersTimed.ms,
                  defs_resolve_ms: defsTimed.ms,
                  child_persons_ms: childResolutionMs,
                  map_ms: mapMs,
              }
            : undefined;
    if (enrichMs > 200) {
        console.warn("[queue-perf] enrichOpportunityRows", {
            org_id: orgId,
            row_count: rows.length,
            enrichment: previewLite ? (enrichment === "queue_list" ? "queue_list" : "queue_preview") : "full",
            used_preloaded_defs: preloadedDefs != null,
            parallel_main_ms: parallelMainMs,
            child_resolution_ms: childResolutionMs,
            map_ms: mapMs,
            total_ms: enrichMs,
            queue_list_subtimings_ms: queueListSubtimings,
        });
    }
    return { rows: mapped, queueListSubtimings };
}

function buildOpportunityNeedsAttentionOrExpr(now: Date, minLifecycleStaleHours: number = defaultMinLifecycleStaleHours()): string {
    const stale7d = toIso(subtractDays(now, 7));
    const stale2d = toIso(subtractDays(now, 2));
    const nowIso = toIso(now);
    const todayYmd = now.toISOString().slice(0, 10);
    const lifecycleStaleCut = toIso(subtractHours(now, minLifecycleStaleHours));
    // PostgREST `or` grammar (used by tests / future SQL); enrollment `needs_attention` queue is evaluated in-memory instead.
    const waitBucketBranches = [
        "waiting_on_family",
        "waiting_on_staff",
        "waiting_on_documents",
        "waiting_on_payment",
        "blocked_internal",
        "blocked_external",
    ].map((b) => `metadata->enrollment_operational->>wait_bucket.eq.${b}`);
    return [
        `updated_at.lt.${stale7d}`,
        `updated_at.lt.${lifecycleStaleCut}`,
        `created_at.lt.${lifecycleStaleCut}`,
        "primary_contact_id.is.null",
        "customer_id.is.null",
        buildOpportunityHighValueStaleOrBranches(stale2d),
        `metadata->>next_follow_up_at.lt.${nowIso}`,
        `metadata->>commitment_due_at.lt.${nowIso}`,
        `and(status_key.eq.tour_scheduled,metadata->>tour_date.lt.${todayYmd})`,
        ...waitBucketBranches,
    ].join(",");
}

/**
 * PostgREST `.or(...)` pre-filter for the needs_attention workload: superset of rows that might pass
 * resolver membership (lifecycle stale uses the configured hour thresholds). Extra rows are removed in-memory —
 * reduces rows scanned/sorted before the capped fetch.
 */
function buildOpportunityNeedsAttentionCandidateOrExpr(now: Date, minLifecycleStaleHours: number = defaultMinLifecycleStaleHours()): string {
    const stale7d = toIso(subtractDays(now, 7));
    const stale2d = toIso(subtractDays(now, 2));
    const nowIso = toIso(now);
    const todayYmd = now.toISOString().slice(0, 10);
    const lifecycleStaleCut = toIso(subtractHours(now, minLifecycleStaleHours));
    const waitBucketBranches = [
        "waiting_on_family",
        "waiting_on_staff",
        "waiting_on_documents",
        "waiting_on_payment",
        "blocked_internal",
        "blocked_external",
    ].map((b) => `metadata->enrollment_operational->>wait_bucket.eq.${b}`);
    return [
        `updated_at.lt.${stale7d}`,
        `updated_at.lt.${lifecycleStaleCut}`,
        `created_at.lt.${lifecycleStaleCut}`,
        "customer_id.is.null",
        "primary_person_id.is.null",
        "primary_contact_id.is.null",
        buildOpportunityHighValueStaleOrBranches(stale2d),
        `metadata->>next_follow_up_at.lt.${nowIso}`,
        `metadata->>commitment_due_at.lt.${nowIso}`,
        `and(status_key.eq.tour_scheduled,metadata->>tour_date.lt.${todayYmd})`,
        ...waitBucketBranches,
    ].join(",");
}

/** Cap for in-memory needs_attention evaluation (avoids fragile nested `or`/`and` PostgREST URL parsing). */
export const NEEDS_ATTENTION_OPPORTUNITY_FETCH_CAP = 5000;

const NEEDS_ATTENTION_OPPORTUNITY_SELECT_DEFAULT =
    "id, name, status_key, quote_total, estimated_price_cents, monetary_value_cents, customer_id, primary_person_id, primary_contact_id, work_unit_id, location_id, metadata, created_at, updated_at";

/** Dept bucket / count paths — same resolver fields, smaller row payload. */
export const NEEDS_ATTENTION_OPPORTUNITY_SELECT_RESOLVER_MINIMAL =
    "id, status_key, quote_total, estimated_price_cents, monetary_value_cents, customer_id, primary_person_id, primary_contact_id, metadata, created_at, updated_at";

/**
 * When queue summaries only need counts (department cards), use a smaller cap so we do not pull 5k rows
 * per work unit. Count may under-count if more opportunities match than this cap (same class as the 5k cap).
 */
export const NEEDS_ATTENTION_COUNT_ONLY_FETCH_CAP = 800;

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

export async function loadOpportunityNeedsAttentionRows(params: {
    supabase: ReturnType<typeof createAdminClient>;
    orgId: string;
    workUnitId: string;
    sort: OpportunitySortPlan[];
    now: Date;
    opportunityStatusDefs: StatusDefinitionRow[];
    /** Resolved once per work-unit request — shared by prefilter, membership filter, and enrichment. */
    attentionConfig: OpportunityAttentionResolvedConfig;
    /** Default full cap; use {@link NEEDS_ATTENTION_COUNT_ONLY_FETCH_CAP} for count-only summaries. */
    fetchCap?: number;
    recordScopeConstraints?: RecordScopeConstraints | null;
    /** Smaller SELECT for bucket/count paths that only run the attention resolver. */
    columnSelect?: "default" | "resolver_minimal";
    perf?: { query_ms?: number; resolver_ms?: number };
}): Promise<{
    filtered: OpportunityRowPreview[];
    raw_candidates_fetched: number;
    fetch_cap: number;
    /** One resolver pass per fetched row — reuse for bucket merge / bucket filters. */
    resolved_by_id: Record<string, OpportunityAttentionResult>;
}> {
    const cap = params.fetchCap ?? NEEDS_ATTENTION_OPPORTUNITY_FETCH_CAP;
    const attentionConfig = params.attentionConfig;
    const minLifecycleH = minLifecycleStaleHoursFromResolvedConfig(attentionConfig.thresholdsHours);
    const candidateOr = buildOpportunityNeedsAttentionCandidateOrExpr(params.now, minLifecycleH);
    const nowMs = params.now.getTime();
    const selectCols: string =
        params.columnSelect === "resolver_minimal"
            ? NEEDS_ATTENTION_OPPORTUNITY_SELECT_RESOLVER_MINIMAL
            : NEEDS_ATTENTION_OPPORTUNITY_SELECT_DEFAULT;
    let q = params.supabase
        .from("opportunities")
        .select(selectCols)
        .eq("org_id", params.orgId)
        .eq("work_unit_id", params.workUnitId)
        .or(candidateOr) as any;
    if (params.recordScopeConstraints) {
        q = applyRecordScopeConstraintsToQuery(q, params.recordScopeConstraints);
    }
    const plans = params.sort.length ? params.sort : [{ column: "updated_at", ascending: true }];
    for (const p of plans) {
        q = q.order(p.column, { ascending: p.ascending });
    }
    const tQuery0 = Date.now();
    const { data, error } = await q.limit(cap);
    if (params.perf) params.perf.query_ms = Date.now() - tQuery0;
    if (error) {
        throw new QueueServiceError(error.message, 400, "DB_ERROR");
    }
    const rawRows = (data ?? []) as OpportunityRowPreview[];
    const batch = createOpportunityAttentionResolverBatchContext(
        params.opportunityStatusDefs,
        attentionConfig,
        nowMs
    );
    const tResolver0 = Date.now();
    const attentionByRowId = new Map<string, OpportunityAttentionResult>();
    const resolved_by_id: Record<string, OpportunityAttentionResult> = {};
    const filtered: OpportunityRowPreview[] = [];
    for (const r of rawRows) {
        const attention = resolveOpportunityAttention({
            opportunity: opportunityPreviewToResolverEntity(r),
            defs: params.opportunityStatusDefs,
            config: attentionConfig,
            nowMs,
            optionalSignals: null,
            batch,
        });
        resolved_by_id[String(r.id)] = attention;
        if (!attention.needs_attention) continue;
        attentionByRowId.set(String(r.id), attention);
        filtered.push(r);
    }
    if (params.perf) params.perf.resolver_ms = Date.now() - tResolver0;
    return {
        filtered: sortNeedsAttentionFilteredRows(filtered, attentionByRowId, params.sort),
        raw_candidates_fetched: rawRows.length,
        fetch_cap: cap,
        resolved_by_id,
    };
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

type WorkUnitQueueDefinitionCacheEntry = {
    at: number;
    def: QueueDefinitionV1;
    revision: string | null;
    /** `work_units.metadata` — feeds opportunity attention resolver config (same TTL as definition). */
    workUnitMetadata: unknown | null;
    departmentId: string | null;
};
const WU_QUEUE_DEF_CACHE = new Map<string, WorkUnitQueueDefinitionCacheEntry>();
const WU_QUEUE_DEF_TTL_MS = 90_000;
const WU_QUEUE_DEF_CACHE_ENABLED = process.env.NODE_ENV !== "test";

async function loadWorkUnitQueueDefinitionWithMeta(params: { orgId: string; workUnitId: string }): Promise<{
    def: QueueDefinitionV1;
    cacheHit: boolean;
    workUnitMetadata: unknown | null;
    departmentId: string | null;
}> {
    const cacheKey = `wudef:v2:${params.orgId}:${params.workUnitId}`;
    const now = Date.now();
    if (WU_QUEUE_DEF_CACHE_ENABLED) {
        const hit = WU_QUEUE_DEF_CACHE.get(cacheKey);
        if (hit && now - hit.at < WU_QUEUE_DEF_TTL_MS) {
            return {
                def: hit.def,
                cacheHit: true,
                workUnitMetadata: hit.workUnitMetadata ?? null,
                departmentId: hit.departmentId ?? null,
            };
        }
    }
    const supabase = createAdminClient();
    const { data, error } = await withDbTiming(
        "work_units.queue_definition_row",
        { orgId: params.orgId, workUnitId: params.workUnitId },
            async () =>
                supabase
                    .from("work_units")
                    .select("id, org_id, department_id, queue_definition, metadata, updated_at")
                    .eq("id", params.workUnitId)
                    .eq("org_id", params.orgId)
                    .maybeSingle()
    );

    if (error) {
        throw new QueueServiceError(error.message, 400, "DB_ERROR");
    }
    if (!data) {
        throw new QueueServiceError("Work unit not found", 404, "NOT_FOUND");
    }

    const raw = (data as { queue_definition?: unknown }).queue_definition;
    const revision =
        typeof (data as { updated_at?: unknown }).updated_at === "string"
            ? String((data as { updated_at: string }).updated_at)
            : null;
    const storedVersion = getStoredQueueDefinitionVersion(raw);
    if (raw == null || (isPlainObject(raw) && Object.keys(raw).length === 0)) {
        throw new QueueServiceError("Work unit has no queue_definition configured", 400, "MISSING_QUEUE_DEFINITION");
    }
    if (storedVersion !== null && storedVersion !== 1) {
        throw new QueueServiceError("Unsupported stored queue_definition version", 400, "UNSUPPORTED_VERSION");
    }
    const def = loadQueueDefinitionOrThrow(raw);
    const workUnitMetadata = (data as { metadata?: unknown | null }).metadata ?? null;
    const departmentIdRaw = (data as { department_id?: unknown }).department_id;
    const departmentId =
        typeof departmentIdRaw === "string" && departmentIdRaw.trim() ? departmentIdRaw.trim() : null;
    if (WU_QUEUE_DEF_CACHE_ENABLED) {
        WU_QUEUE_DEF_CACHE.set(cacheKey, { at: now, def, revision, workUnitMetadata, departmentId });
    }
    return { def, cacheHit: false, workUnitMetadata, departmentId };
}

async function loadWorkUnitQueueDefinition(params: { orgId: string; workUnitId: string }): Promise<QueueDefinitionV1> {
    return (await loadWorkUnitQueueDefinitionWithMeta(params)).def;
}

function clampLimit(n: number, min: number, max: number): number {
    const v = Math.floor(Number.isFinite(n) ? n : min);
    if (v < min) return min;
    if (v > max) return max;
    return v;
}

/** Wall time for a branch when run in parallel with `Promise.all` of wrapped promises starting together. */
async function timedBranch<T>(p: Promise<T>): Promise<{ value: T; ms: number }> {
    const t0 = Date.now();
    const value = await p;
    return { value, ms: Date.now() - t0 };
}

async function timedAwait<T>(p: PromiseLike<T>): Promise<{ ms: number; v: T }> {
    const t0 = Date.now();
    const v = await p;
    return { ms: Date.now() - t0, v };
}

type PgList = { data: unknown; error: { message: string } | null };
type PgCount = { count: number | null; error: { message: string } | null };

/** `planned` uses PostgreSQL planner estimates (faster on large tables; approximate). */
export type QueueCountAccuracy = "exact" | "planned";

/** Timing breakdown emitted with {@link getWorkUnitQueueItems} (`[perf.queue.rows]` merges auth + serialization in the route). */
export type QueueRowsPerfBreakdown = {
    load_def_ms: number;
    operational_day_ms: number;
    base_query_ms: number;
    count_ms: number;
    status_defs_ms: number;
    enrichment_ms: number;
    service_total_ms: number;
    /**
     * True when status definitions were satisfied without running the uncached merge on this request
     * (process map or Next `unstable_cache`). Null for job entity rows route.
     */
    status_defs_cache_hit: boolean | null;
    /** Resolver sub-timings and cache flags for opportunity queues; null for jobs. */
    status_defs_resolve: StatusDefsResolveTelemetry | null;
    queue_def_cache_hit: boolean | null;
    operational_day_cache_hit: boolean | null;
    enrichment_subtimings_ms: QueueListEnrichmentSubtimingsMs | null;
};

export type WorkUnitQueueItemsWithPerf = {
    result: QueueItemsResult;
    rowsPerf: QueueRowsPerfBreakdown;
};

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
    /** Echo of viewer wall-clock zone used when `includePreviews` built CRM strings (QA / devtools). */
    viewer_timezone?: QueueViewerTimezoneMeta;
};

function buildPriorityQueueKeySet(def: QueueDefinitionV1, focusKey: string | null | undefined, budget: number): Set<string> {
    const ordered = def.queues.map((q) => q.key);
    const set = new Set<string>();
    const ui = getQueueUiConfig(def);
    const primaryLane = findAllRecordsQueueKey(def, ui);
    if (primaryLane) set.add(primaryLane);
    for (const q of def.queues) {
        if (q.key.trim().toLowerCase() === "needs_attention") {
            set.add(q.key);
            break;
        }
    }
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
        description: queueSummaryOptionalString(q.description),
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

export type QueueSummariesSharedBootstrap = {
    operationalDay: OperationalDayPlanContext;
    opportunityStatusDefs: StatusDefinitionRow[];
};

/** One operational-day + opportunity status-def fetch per dept bootstrap / batch. */
export async function buildQueueSummariesSharedBootstrap(orgId: string): Promise<QueueSummariesSharedBootstrap> {
    const supabase = createAdminClient();
    const refUtc = new Date();
    const [operationalDay, opportunityStatusDefs] = await Promise.all([
        resolveOperationalDayPlanContext(supabase, orgId, refUtc),
        fetchEffectiveStatusDefinitions(supabase as never, orgId, "opportunities", { activeOnly: true }),
    ]);
    return { operationalDay, opportunityStatusDefs };
}

export async function getWorkUnitQueueSummaries(params: {
    orgId: string;
    workUnitId: string;
    /**
     * When set (e.g. dept operational bootstrap already loaded `work_units.queue_definition`),
     * skip the per-request work_units row fetch.
     */
    preloadedQueueDefinition?: {
        queue_definition: unknown;
        workUnitMetadata?: unknown | null;
        departmentId?: string | null;
    };
    limit?: number;
    /**
     * When false, omit preview rows and skip enrichment (department KPI cards only need counts).
     * Opportunity `needs_attention` uses a capped candidate fetch (see `opportunity_needs_attention_semantics`
     * on the returned summary and `docs/system/workspace-system.md`).
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
    /** Department batch: reuse one operational-day + opportunity status-def fetch per request. */
    sharedBootstrap?: QueueSummariesSharedBootstrap;
    /** Viewer IANA for opportunity preview enrichment (notes/tour lines). */
    viewerDisplayTimeZone?: QueueViewerTimezoneMeta;
    /** Site/department filters for job & opportunity queue rows (admin access scope). */
    recordScopeConstraints?: RecordScopeConstraints | null;
    /** Restricted viewer scope could not resolve any rows — return zeroed summaries (never org-wide). */
    recordScopeImpossible?: boolean;
}): Promise<WorkUnitQueueSummariesResult> {
    const includePreviews = params.includePreviews !== false;
    const countSel = queueCountSelect(params.countAccuracy);
    const tW0 = Date.now();
    const supabase = createAdminClient();
    const scopeFilter = params.recordScopeConstraints ?? null;
    const refUtc = new Date();
    const sharedBootstrap = params.sharedBootstrap;
    const viewerTimeZoneMeta = params.viewerDisplayTimeZone;
    const viewerPreviewIana = viewerTimeZoneMeta?.iana?.trim() ? viewerTimeZoneMeta.iana.trim() : UTC_FALLBACK_IANA;
    const viewerTimeZonePayload = viewerTimeZoneMeta ? { viewer_timezone: viewerTimeZoneMeta } : {};
    const tParallelBoot0 = Date.now();
    const preloaded = params.preloadedQueueDefinition;
    const operationalDayPromise = sharedBootstrap
        ? Promise.resolve(sharedBootstrap.operationalDay)
        : resolveOperationalDayPlanContext(supabase, params.orgId, refUtc);

    let def: QueueDefinitionV1;
    let workUnitMetadata: unknown | null;
    let operationalDay: OperationalDayPlanContext;
    if (preloaded?.queue_definition != null) {
        operationalDay = await operationalDayPromise;
        def = loadQueueDefinitionOrThrow(preloaded.queue_definition);
        workUnitMetadata = preloaded.workUnitMetadata ?? null;
    } else {
        const [loaded, od] = await Promise.all([
            loadWorkUnitQueueDefinitionWithMeta({ orgId: params.orgId, workUnitId: params.workUnitId }),
            operationalDayPromise,
        ]);
        def = loaded.def;
        workUnitMetadata = loaded.workUnitMetadata;
        operationalDay = od;
    }
    const loadDefMs = Date.now() - tParallelBoot0;
    assertSupportedEntityType(def);

    if (params.recordScopeImpossible === true) {
        const et = def.entity_type === "job" ? "job" : "opportunity";
        const summaries: QueueSummary[] = def.queues.map((q) => ({
            key: q.key,
            label: q.label,
            description: queueSummaryOptionalString(q.description),
            entity_type: et,
            priority: q.priority ?? "standard",
            display: q.display ?? "list",
            count: 0,
            preview: [],
        }));
        const scopeMeta = workUnitScopeTotalFromSummaries(def, summaries);
        const totalMsImp = Date.now() - tW0;
        console.log("[queue-opt]", { phase: "summary_impossible", duration_ms: totalMsImp, work_unit_id: params.workUnitId });
        return { queues: summaries, ...scopeMeta, ...viewerTimeZonePayload };
    }

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
        if (sharedBootstrap?.opportunityStatusDefs) {
            return Promise.resolve(sharedBootstrap.opportunityStatusDefs);
        }
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
            const scopedCountBase = () =>
                scopeFilter ? (applyRecordScopeConstraintsToQuery(countBase() as never, scopeFilter) as any) : countBase();

            if (!includePreviews) {
                const tC0 = Date.now();
                const countQ = applyOpsToJobQuery(scopedCountBase() as never, ops);
                const { count, error: countErr } = await countQ;
                countMs = Date.now() - tC0;
                if (countErr) {
                    throw new QueueServiceError(countErr.message, 400, "DB_ERROR");
                }
                return finish(
                    {
                        key: q.key,
                        label: q.label,
                        description: queueSummaryOptionalString(q.description),
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
            const countQ = applyOpsToJobQuery(scopedCountBase() as never, ops);
            const previewQ0 = supabase
                .from("jobs")
                .select("id, title, status_key, work_unit_id, assigned_vendor_id, created_at, updated_at")
                .eq("org_id", params.orgId)
                .eq("work_unit_id", params.workUnitId);
            const previewQ0Scoped = scopeFilter ? applyRecordScopeConstraintsToQuery(previewQ0 as never, scopeFilter) : (previewQ0 as never);
            const previewQ1 = applySortToJobQuery(applyOpsToJobQuery(previewQ0Scoped as never, ops) as never, sort);
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
                    description: queueSummaryOptionalString(q.description),
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
                        description: queueSummaryOptionalString(q.description),
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
            const attentionConfigResolved = resolveOpportunityAttentionConfigFromMetadata(workUnitMetadata ?? null);
            const tN0 = Date.now();
            let preloadStatusDefs: StatusDefinitionRow[] | undefined;
            preloadStatusDefs = await sharedOpportunityStatusDefs();
            const needsAttentionLoadOut = await loadOpportunityNeedsAttentionRows({
                supabase,
                orgId: params.orgId,
                workUnitId: params.workUnitId,
                sort,
                now: refUtc,
                opportunityStatusDefs: preloadStatusDefs,
                attentionConfig: attentionConfigResolved,
                fetchCap: includePreviews ? undefined : NEEDS_ATTENTION_COUNT_ONLY_FETCH_CAP,
                recordScopeConstraints: scopeFilter,
            });
            const matched = needsAttentionLoadOut.filtered;
            const opportunity_needs_attention_semantics = buildQueueServiceAttentionSemantics({
                candidateFetchCap: needsAttentionLoadOut.fetch_cap,
                rawCandidatesFetched: needsAttentionLoadOut.raw_candidates_fetched,
                fetchMode: includePreviews ? "list_cap" : "summary_cap",
            });
            needsAttentionLoadMs = Date.now() - tN0;

            if (!includePreviews) {
                return finish(
                    {
                        key: q.key,
                        label: q.label,
                        description: queueSummaryOptionalString(q.description),
                        entity_type: def.entity_type,
                        priority: q.priority ?? "standard",
                        display: q.display ?? "list",
                        count: matched.length,
                        preview: [],
                        opportunity_needs_attention_semantics,
                    },
                    undefined
                );
            }

            const previewRows = matched.slice(0, previewLimit);
            rowsEnriched = previewRows.length;
            const tE0 = Date.now();
            const { rows: preview } = await enrichOpportunityRows({
                supabase,
                orgId: params.orgId,
                rows: previewRows,
                effectiveStatusDefs: preloadStatusDefs,
                enrichment: "queue_preview",
                viewerDisplayTimeZoneIana: viewerPreviewIana,
                opportunityAttentionResolution: {
                    defs: preloadStatusDefs,
                    config: attentionConfigResolved,
                    nowMs: refUtc.getTime(),
                },
            });
            enrichMs = Date.now() - tE0;

            return finish(
                {
                    key: q.key,
                    label: q.label,
                    description: queueSummaryOptionalString(q.description),
                    entity_type: def.entity_type,
                    priority: q.priority ?? "standard",
                    display: q.display ?? "list",
                    count: matched.length,
                    preview: preview as unknown[],
                    opportunity_needs_attention_semantics,
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
        const oppScopedCountBase = () =>
            scopeFilter ? (applyRecordScopeConstraintsToQuery(oppCountBase() as never, scopeFilter) as any) : oppCountBase();

        if (!includePreviews) {
            const tC0 = Date.now();
            const countQ = applyOpsToJobQuery(oppScopedCountBase() as never, ops);
            const { count, error: countErr } = await countQ;
            countMs = Date.now() - tC0;
            if (countErr) {
                throw new QueueServiceError(countErr.message, 400, "DB_ERROR");
            }
            return finish(
                {
                    key: q.key,
                    label: q.label,
                    description: queueSummaryOptionalString(q.description),
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
        const countQ = applyOpsToJobQuery(oppScopedCountBase() as never, ops);
        const previewQ0 = supabase
            .from("opportunities")
            .select("id, name, title, status_key, customer_id, primary_person_id, primary_contact_id, work_unit_id, location_id, metadata, created_at, updated_at")
            .eq("org_id", params.orgId)
            .eq("work_unit_id", params.workUnitId);
        const previewQ0Scoped = scopeFilter ? applyRecordScopeConstraintsToQuery(previewQ0 as never, scopeFilter) : (previewQ0 as never);
        const previewQ1 = applySortToJobQuery(applyOpsToJobQuery(previewQ0Scoped as never, ops) as never, sort);
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
        const { rows: preview } = await enrichOpportunityRows({
            supabase,
            orgId: params.orgId,
            rows: previewRows,
            effectiveStatusDefs,
            enrichment: "queue_preview",
            viewerDisplayTimeZoneIana: viewerPreviewIana,
        });
        enrichMs = Date.now() - tE0;

        return finish(
            {
                key: q.key,
                label: q.label,
                description: queueSummaryOptionalString(q.description),
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
        return { queues: rowResults.filter((x): x is QueueSummary => x != null), ...viewerTimeZonePayload };
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
    return deferredQueueKeys?.length
        ? { queues: summaries, deferred_queue_keys: deferredQueueKeys, ...scopePayload, ...viewerTimeZonePayload }
        : { queues: summaries, ...scopePayload, ...viewerTimeZonePayload };
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
    /**
     * When set (e.g. dept operational bootstrap), skip re-querying work_units for this department.
     */
    workUnitIds?: string[];
    /** Preloaded rows from dept bootstrap — avoids per-WU `queue_definition` refetch. */
    workUnitPreloadById?: ReadonlyMap<
        string,
        { queue_definition?: unknown; metadata?: unknown | null; department_id?: string | null }
    >;
    /** Preview rows per queue (same semantics as GET .../queues limit). */
    limit?: number;
    workUnitConcurrency?: number;
    /** When false, counts only (faster department cards). */
    includePreviews?: boolean;
    /** Head counts for status/filter queues: `planned` uses PostgreSQL estimates (faster). */
    countAccuracy?: QueueCountAccuracy;
    /** Default `priority` for department cards (exact all-tab counts are deferred). */
    summaryMode?: QueueSummaryRequestMode;
    focusQueueKey?: string | null;
    priorityBudget?: number;
    viewerDisplayTimeZone?: QueueViewerTimezoneMeta;
    /** Scope layer could not resolve any jobs/opps (restricted user). */
    recordScopeImpossible?: boolean;
    /** Site/department filters for job & opportunity queue rows. */
    recordScopeConstraints?: RecordScopeConstraints | null;
}): Promise<{ work_units: DepartmentWorkUnitQueueSummaryRow[] }> {
    const includePreviews = params.includePreviews !== false;
    const countAccuracy = params.countAccuracy;
    const summaryMode = params.summaryMode ?? "priority";
    const priorityBudget =
        params.priorityBudget !== undefined ? clampLimit(params.priorityBudget, 1, 20) : undefined;
    const supabase = createAdminClient();
    const refUtc = new Date();

    const presetIds = (params.workUnitIds ?? [])
        .map((id) => String(id ?? "").trim())
        .filter(Boolean);
    const skipWuListQuery = presetIds.length > 0;

    const [wuListRes, operationalDay, opportunityStatusDefs] = await Promise.all([
        skipWuListQuery
            ? Promise.resolve({ data: null as null, error: null as null })
            : supabase
                  .from("work_units")
                  .select("id")
                  .eq("org_id", params.orgId)
                  .eq("department_id", params.departmentId)
                  .order("sort_order", { ascending: true }),
        resolveOperationalDayPlanContext(supabase, params.orgId, refUtc),
        fetchEffectiveStatusDefinitions(supabase as any, params.orgId, "opportunities", { activeOnly: true }),
    ]);

    if (!skipWuListQuery) {
        const { error } = wuListRes;
        if (error) {
            throw new QueueServiceError(error.message, 400, "DB_ERROR");
        }
    }

    const sharedBootstrap: QueueSummariesSharedBootstrap = { operationalDay, opportunityStatusDefs };
    const recordScopeImpossible = params.recordScopeImpossible === true;
    const recordScopeConstraints = params.recordScopeConstraints ?? null;

    const ids = skipWuListQuery
        ? presetIds
        : (wuListRes.data ?? []).map((r) => String((r as { id: string }).id ?? "").trim()).filter(Boolean);
    if (!ids.length) {
        return { work_units: [] };
    }
    const previewLimit = clampLimit(params.limit ?? 50, 1, 100);
    const wuConc = clampLimit(params.workUnitConcurrency ?? DEPARTMENT_WU_SUMMARY_CONCURRENCY, 1, 8);

    const tBatch0 = Date.now();
    const factories = ids.map(
        (workUnitId) => async (): Promise<DepartmentWorkUnitQueueSummaryRow> => {
            const tWu0 = Date.now();
            try {
                const preload = params.workUnitPreloadById?.get(workUnitId);
                const { queues, work_unit_scope_total, work_unit_scope_queue_key } = await getWorkUnitQueueSummaries({
                    orgId: params.orgId,
                    workUnitId,
                    limit: previewLimit,
                    includePreviews,
                    perfTag: `dept:${params.departmentId}`,
                    countAccuracy,
                    summaryMode: summaryMode === "all" ? undefined : summaryMode,
                    focusQueueKey: params.focusQueueKey ?? null,
                    priorityBudget,
                    sharedBootstrap,
                    viewerDisplayTimeZone: params.viewerDisplayTimeZone,
                    recordScopeImpossible,
                    recordScopeConstraints,
                    preloadedQueueDefinition:
                        preload?.queue_definition != null
                            ? {
                                  queue_definition: preload.queue_definition,
                                  workUnitMetadata: preload.metadata ?? null,
                                  departmentId: preload.department_id ?? null,
                              }
                            : undefined,
                });
                const ms = Date.now() - tWu0;
                console.warn("[queue-perf] getDepartmentWorkUnitQueueSummaries work_unit", {
                    ms,
                    department_id: params.departmentId,
                    work_unit_id: workUnitId,
                    include_previews: includePreviews,
                    count_accuracy: countAccuracy ?? "exact",
                    summary_mode: summaryMode,
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
            summary_mode: summaryMode,
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
    /** Scope layer could not resolve any jobs/opps (restricted user). */
    recordScopeImpossible?: boolean;
    /** Site/department filters for job & opportunity queue rows. */
    recordScopeConstraints?: RecordScopeConstraints | null;
    viewerDisplayTimeZone?: QueueViewerTimezoneMeta;
    /**
     * When `queueKey === "needs_attention"`, filter rows to those matching the configured bucket’s
     * `reason_codes` ({@link resolveNeedsAttentionBucketsWithPrecedence}).
     */
    attentionBucketKey?: string | null;
}): Promise<WorkUnitQueueItemsWithPerf> {
    const tSvc0 = Date.now();
    const supabase = createAdminClient();
    const viewerTzMeta = params.viewerDisplayTimeZone;
    const viewerPreviewIana = viewerTzMeta?.iana?.trim() ? viewerTzMeta.iana.trim() : UTC_FALLBACK_IANA;
    const refUtc = new Date();

    const [defTimed, opsTimed] = await Promise.all([
        timedBranch(loadWorkUnitQueueDefinitionWithMeta({ orgId: params.orgId, workUnitId: params.workUnitId })),
        timedBranch(resolveOperationalDayPlanContextWithTelemetry(supabase, params.orgId, refUtc)),
    ]);
    const queueDefCacheHit = defTimed.value.cacheHit;
    const def = defTimed.value.def;
    const workUnitMetadata = defTimed.value.workUnitMetadata ?? null;
    const workUnitDepartmentId = defTimed.value.departmentId;
    const opportunityAttentionConfigResolved =
        def.entity_type === "opportunity"
            ? resolveOpportunityAttentionConfigFromMetadata(workUnitMetadata)
            : null;
    const operationalDay = opsTimed.value.ctx;
    const operationalDayCacheHit = opsTimed.value.cacheHit;
    const load_def_ms = defTimed.ms;
    const operational_day_ms = opsTimed.ms;

    assertSupportedEntityType(def);
    const q = findQueueByKey(def, params.queueKey);
    const rowListUi = getQueueUiConfig(def);
    const queueListRelationPlan = queueListRelationFetchPlan(rowListUi);

    const scopeFilter = params.recordScopeConstraints ?? null;

    const finalize = (
        queueItems: QueueItemsResult,
        timings: Omit<QueueRowsPerfBreakdown, "service_total_ms">
    ): WorkUnitQueueItemsWithPerf => ({
        result: {
            ...queueItems,
            ...(viewerTzMeta ? { viewer_timezone: viewerTzMeta } : {}),
        },
        rowsPerf: {
            ...timings,
            service_total_ms: Date.now() - tSvc0,
        },
    });

    if (params.recordScopeImpossible === true) {
        const effectiveLimit0 = clampLimit(params.limit ?? q.limit ?? 50, 1, 200);
        const effectiveOffset0 = clampLimit(params.offset ?? 0, 0, 1000000);
        const omitTotal0 = params.omitTotalCount === true;
        return finalize(
            {
                queue: {
                    key: q.key,
                    label: q.label,
                    description: queueSummaryOptionalString(q.description),
                    entity_type: def.entity_type,
                    priority: q.priority ?? "standard",
                    display: q.display ?? "list",
                },
                items: [],
                total: 0,
                limit: effectiveLimit0,
                offset: effectiveOffset0,
                ...(omitTotal0 ? { total_omitted: true } : {}),
            },
            {
                load_def_ms,
                operational_day_ms,
                base_query_ms: 0,
                count_ms: 0,
                status_defs_ms: 0,
                enrichment_ms: 0,
                status_defs_cache_hit: null,
                status_defs_resolve: null,
                queue_def_cache_hit: queueDefCacheHit,
                operational_day_cache_hit: operationalDayCacheHit,
                enrichment_subtimings_ms: null,
            }
        );
    }

    const effectiveLimit = clampLimit(params.limit ?? q.limit ?? 50, 1, 200);
    const effectiveOffset = clampLimit(params.offset ?? 0, 0, 1000000);
    const omitTotal = params.omitTotalCount === true;
    const countSel = omitTotal ? null : queueCountSelect(params.countAccuracy);

    let departmentMetadata: unknown | null = null;
    if (def.entity_type === "opportunity" && workUnitDepartmentId) {
        const { data: dRow, error: dErr } = await supabase
            .from("departments")
            .select("metadata")
            .eq("id", workUnitDepartmentId)
            .eq("org_id", params.orgId)
            .maybeSingle();
        if (dErr) {
            throw new QueueServiceError(dErr.message, 400, "DB_ERROR");
        }
        departmentMetadata = (dRow as { metadata?: unknown } | null)?.metadata ?? null;
    }

    if (def.entity_type === "job") {
        const { ops, sort, calendar_meta } = buildJobPlan(q, operationalDay);

        let itemsBase = supabase
            .from("jobs")
            .select("id, title, status_key, work_unit_id, assigned_vendor_id, created_at, updated_at")
            .eq("org_id", params.orgId)
            .eq("work_unit_id", params.workUnitId);
        if (scopeFilter) itemsBase = applyRecordScopeConstraintsToQuery(itemsBase, scopeFilter);

        const itemsQ0 = applySortToJobQuery(applyOpsToJobQuery(itemsBase as never, ops) as never, sort);
        const itemsPromise = itemsQ0.range(effectiveOffset, effectiveOffset + effectiveLimit - 1);

        if (omitTotal) {
            const { value: itemsRes, ms: baseQueryMs } = await timedBranch(itemsPromise as Promise<PgList>);
            const { data, error } = itemsRes;
            if (error) {
                throw new QueueServiceError(error.message, 400, "DB_ERROR");
            }
            return finalize(
                {
                    queue: {
                        key: q.key,
                        label: q.label,
                        description: queueSummaryOptionalString(q.description),
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
                },
                {
                    load_def_ms,
                    operational_day_ms,
                    base_query_ms: baseQueryMs,
                    count_ms: 0,
                    status_defs_ms: 0,
                    enrichment_ms: 0,
                    status_defs_cache_hit: null,
                    status_defs_resolve: null,
                    queue_def_cache_hit: queueDefCacheHit,
                    operational_day_cache_hit: operationalDayCacheHit,
                    enrichment_subtimings_ms: null,
                }
            );
        }

        let countBase = supabase
            .from("jobs")
            .select("id", { count: countSel!, head: true })
            .eq("org_id", params.orgId)
            .eq("work_unit_id", params.workUnitId);
        if (scopeFilter) countBase = applyRecordScopeConstraintsToQuery(countBase, scopeFilter);
        const countQ = applyOpsToJobQuery(countBase as never, ops);

        const [{ value: countRes, ms: countMs }, { value: itemsRes, ms: baseQueryMs }] = await Promise.all([
            timedBranch(countQ as Promise<PgCount>),
            timedBranch(itemsPromise as Promise<PgList>),
        ]);
        const { count, error: countErr } = countRes;
        const { data, error } = itemsRes;
        if (countErr) {
            throw new QueueServiceError(countErr.message, 400, "DB_ERROR");
        }
        if (error) {
            throw new QueueServiceError(error.message, 400, "DB_ERROR");
        }

        return finalize(
            {
                queue: {
                    key: q.key,
                    label: q.label,
                    description: queueSummaryOptionalString(q.description),
                    entity_type: def.entity_type,
                    priority: q.priority ?? "standard",
                    display: q.display ?? "list",
                },
                items: (data ?? []) as unknown[],
                total: count ?? 0,
                limit: effectiveLimit,
                offset: effectiveOffset,
                ...(calendar_meta ? { calendar_meta } : {}),
            },
            {
                load_def_ms,
                operational_day_ms,
                base_query_ms: baseQueryMs,
                count_ms: countMs,
                status_defs_ms: 0,
                enrichment_ms: 0,
                status_defs_cache_hit: null,
                status_defs_resolve: null,
                queue_def_cache_hit: queueDefCacheHit,
                operational_day_cache_hit: operationalDayCacheHit,
                enrichment_subtimings_ms: null,
            }
        );
    }

    /** Opportunity statuses: parallel with queries; keyed by canonical entity type via resolver normalization. */
    const oppStatusDefsPromise = fetchEffectiveStatusDefinitionsTagged(supabase as never, params.orgId, def.entity_type, {
        activeOnly: true,
    });

    // opportunity entity
    const { ops, sort, calendar_meta } = buildOpportunityPlan(q, refUtc, operationalDay);

    if (params.queueKey === "needs_attention") {
        const attentionConfigResolved = opportunityAttentionConfigResolved!;
        const { value: statusPack, ms: statusDefsMs } = await timedBranch(oppStatusDefsPromise);
        const effectiveStatusDefs = statusPack.rows;
        const statusDefsCacheHit = statusPack.combinedCacheHit;

        const { value: attentionLoadPack, ms: naLoadMs } = await timedBranch(
            loadOpportunityNeedsAttentionRows({
                supabase,
                orgId: params.orgId,
                workUnitId: params.workUnitId,
                sort,
                now: refUtc,
                opportunityStatusDefs: effectiveStatusDefs,
                attentionConfig: attentionConfigResolved,
                recordScopeConstraints: scopeFilter,
            })
        );
        let matched = attentionLoadPack.filtered;
        const bucketKeyFilter = (params.attentionBucketKey ?? "").trim();
        if (bucketKeyFilter) {
            const buckets = resolveNeedsAttentionBucketsWithPrecedence(workUnitMetadata, departmentMetadata);
            const bucketCfg = buckets.find((b) => b.enabled && b.key === bucketKeyFilter);
            if (bucketCfg) {
                matched = matched.filter((r) =>
                    opportunityAttentionResultMatchesBucket(
                        attentionLoadPack.resolved_by_id[String(r.id)] ??
                            resolveOpportunityAttention({
                                opportunity: opportunityPreviewToResolverEntity(r),
                                defs: effectiveStatusDefs,
                                config: attentionConfigResolved,
                                nowMs: refUtc.getTime(),
                                optionalSignals: null,
                            }),
                        bucketCfg,
                    ),
                );
            }
        }
        const opportunity_needs_attention_semantics = buildQueueServiceAttentionSemantics({
            candidateFetchCap: attentionLoadPack.fetch_cap,
            rawCandidatesFetched: attentionLoadPack.raw_candidates_fetched,
            fetchMode: "list_cap",
        });
        const slice = matched.slice(effectiveOffset, effectiveOffset + effectiveLimit);
        const tEn0 = Date.now();
        const { rows: enrichedRows, queueListSubtimings } = await enrichOpportunityRows({
            supabase,
            orgId: params.orgId,
            rows: slice,
            effectiveStatusDefs,
            enrichment: "queue_list",
            relationFetchPlan: queueListRelationPlan,
            viewerDisplayTimeZoneIana: viewerPreviewIana,
            opportunityAttentionResolution: {
                defs: effectiveStatusDefs,
                config: attentionConfigResolved,
                nowMs: refUtc.getTime(),
            },
        });
        const enrichment_ms = Date.now() - tEn0;
        const placementPack = attachPlacementToEnrichedOpportunityItems({
            enrichedRows: enrichedRows as Array<Record<string, unknown>>,
            workUnitId: params.workUnitId,
            queueKey: params.queueKey,
            queueConfig: q,
            departmentMetadata,
            workUnitMetadata,
            nowMs: refUtc.getTime(),
        });
        return finalize(
            {
                queue: {
                    key: q.key,
                    label: q.label,
                    description: queueSummaryOptionalString(q.description),
                    entity_type: def.entity_type,
                    priority: q.priority ?? "standard",
                    display: q.display ?? "list",
                },
                items: placementPack.rows as unknown[],
                total: matched.length,
                limit: effectiveLimit,
                offset: effectiveOffset,
                opportunity_needs_attention_semantics,
                ...(placementPack.diagnostics ? { placement_projection_diagnostics: placementPack.diagnostics } : {}),
            },
            {
                load_def_ms,
                operational_day_ms,
                base_query_ms: naLoadMs,
                count_ms: 0,
                status_defs_ms: statusDefsMs,
                enrichment_ms,
                status_defs_cache_hit: statusDefsCacheHit,
                status_defs_resolve: statusPack.telemetry,
                queue_def_cache_hit: queueDefCacheHit,
                operational_day_cache_hit: operationalDayCacheHit,
                enrichment_subtimings_ms: queueListSubtimings ?? null,
            }
        );
    }

    const itemsBaseRaw = supabase
        .from("opportunities")
        .select("id, name, status_key, customer_id, primary_person_id, primary_contact_id, location_id, metadata, created_at, updated_at")
        .eq("org_id", params.orgId)
        .eq("work_unit_id", params.workUnitId);

    const itemsBase = scopeFilter ? applyRecordScopeConstraintsToQuery(itemsBaseRaw, scopeFilter) : itemsBaseRaw;

    const itemsQ0 = applySortToJobQuery(applyOpsToJobQuery(itemsBase as never, ops) as never, sort);
    const itemsPromise = itemsQ0.range(effectiveOffset, effectiveOffset + effectiveLimit - 1);

    if (omitTotal) {
        const [{ value: itemsRes, ms: baseQueryMs }, { value: statusPack, ms: statusDefsMs }] = await Promise.all([
            timedBranch(itemsPromise as Promise<PgList>),
            timedBranch(oppStatusDefsPromise),
        ]);
        const effectiveStatusDefs = statusPack.rows;
        const statusDefsCacheHit = statusPack.combinedCacheHit;
        const { data: raw, error } = itemsRes;
        if (error) {
            throw new QueueServiceError(error.message, 400, "DB_ERROR");
        }
        const itemRows = (raw ?? []) as OpportunityRowPreview[];
        const tEn0 = Date.now();
        const { rows: enrichedRows, queueListSubtimings } = await enrichOpportunityRows({
            supabase,
            orgId: params.orgId,
            rows: itemRows,
            effectiveStatusDefs,
            enrichment: "queue_list",
            relationFetchPlan: queueListRelationPlan,
            viewerDisplayTimeZoneIana: viewerPreviewIana,
            opportunityAttentionResolution: opportunityAttentionConfigResolved
                ? {
                      defs: effectiveStatusDefs,
                      config: opportunityAttentionConfigResolved,
                      nowMs: refUtc.getTime(),
                  }
                : undefined,
        });
        const enrichment_ms = Date.now() - tEn0;
        const placementPackOmit = attachPlacementToEnrichedOpportunityItems({
            enrichedRows: enrichedRows as Array<Record<string, unknown>>,
            workUnitId: params.workUnitId,
            queueKey: params.queueKey,
            queueConfig: q,
            departmentMetadata,
            workUnitMetadata,
            nowMs: refUtc.getTime(),
        });
        return finalize(
            {
                queue: {
                    key: q.key,
                    label: q.label,
                    description: queueSummaryOptionalString(q.description),
                    entity_type: def.entity_type,
                    priority: q.priority ?? "standard",
                    display: q.display ?? "list",
                },
                items: placementPackOmit.rows as unknown[],
                total: 0,
                limit: effectiveLimit,
                offset: effectiveOffset,
                total_omitted: true,
                ...(calendar_meta ? { calendar_meta } : {}),
                ...(placementPackOmit.diagnostics ? { placement_projection_diagnostics: placementPackOmit.diagnostics } : {}),
            },
            {
                load_def_ms,
                operational_day_ms,
                base_query_ms: baseQueryMs,
                count_ms: 0,
                status_defs_ms: statusDefsMs,
                enrichment_ms,
                status_defs_cache_hit: statusDefsCacheHit,
                status_defs_resolve: statusPack.telemetry,
                queue_def_cache_hit: queueDefCacheHit,
                operational_day_cache_hit: operationalDayCacheHit,
                enrichment_subtimings_ms: queueListSubtimings ?? null,
            }
        );
    }

    const countBaseRaw = supabase
        .from("opportunities")
        .select("id", { count: countSel!, head: true })
        .eq("org_id", params.orgId)
        .eq("work_unit_id", params.workUnitId);
    const countBase = scopeFilter ? applyRecordScopeConstraintsToQuery(countBaseRaw, scopeFilter) : countBaseRaw;
    const countQ = applyOpsToJobQuery(countBase as never, ops);

    const [{ value: countRes, ms: countMs }, { value: itemsRes, ms: baseQueryMs }, { value: statusPack, ms: statusDefsMs }] =
        await Promise.all([
            timedBranch(countQ as Promise<PgCount>),
            timedBranch(itemsPromise as Promise<PgList>),
            timedBranch(oppStatusDefsPromise),
        ]);
    const { count, error: countErr } = countRes;
    const { data: raw, error } = itemsRes;
    if (countErr) {
        throw new QueueServiceError(countErr.message, 400, "DB_ERROR");
    }
    if (error) {
        throw new QueueServiceError(error.message, 400, "DB_ERROR");
    }
    const effectiveStatusDefs = statusPack.rows;
    const statusDefsCacheHit = statusPack.combinedCacheHit;
    const itemRows = (raw ?? []) as OpportunityRowPreview[];
    const tEn0 = Date.now();
    const { rows: enrichedRows, queueListSubtimings } = await enrichOpportunityRows({
        supabase,
        orgId: params.orgId,
        rows: itemRows,
        effectiveStatusDefs,
        enrichment: "queue_list",
        relationFetchPlan: queueListRelationPlan,
        viewerDisplayTimeZoneIana: viewerPreviewIana,
        opportunityAttentionResolution: opportunityAttentionConfigResolved
            ? {
                  defs: effectiveStatusDefs,
                  config: opportunityAttentionConfigResolved,
                  nowMs: refUtc.getTime(),
              }
            : undefined,
    });
    const enrichment_ms = Date.now() - tEn0;

    const placementPackFull = attachPlacementToEnrichedOpportunityItems({
        enrichedRows: enrichedRows as Array<Record<string, unknown>>,
        workUnitId: params.workUnitId,
        queueKey: params.queueKey,
        queueConfig: q,
        departmentMetadata,
        workUnitMetadata,
        nowMs: refUtc.getTime(),
    });

    return finalize(
        {
            queue: {
                key: q.key,
                label: q.label,
                description: queueSummaryOptionalString(q.description),
                entity_type: def.entity_type,
                priority: q.priority ?? "standard",
                display: q.display ?? "list",
            },
            items: placementPackFull.rows as unknown[],
            total: count ?? 0,
            limit: effectiveLimit,
            offset: effectiveOffset,
            ...(calendar_meta ? { calendar_meta } : {}),
            ...(placementPackFull.diagnostics ? { placement_projection_diagnostics: placementPackFull.diagnostics } : {}),
        },
        {
            load_def_ms,
            operational_day_ms,
            base_query_ms: baseQueryMs,
            count_ms: countMs,
            status_defs_ms: statusDefsMs,
            enrichment_ms,
            status_defs_cache_hit: statusDefsCacheHit,
            status_defs_resolve: statusPack.telemetry,
            queue_def_cache_hit: queueDefCacheHit,
            operational_day_cache_hit: operationalDayCacheHit,
            enrichment_subtimings_ms: queueListSubtimings ?? null,
        }
    );
}

export const __testing = {
    buildJobPlan,
    buildOpportunityPlan,
    buildOpportunityNeedsAttentionOrExpr,
    buildOpportunityNeedsAttentionCandidateOrExpr,
    opportunityNeedsAttention,
    findQueueByKey,
    assertSupportedEntityType,
    opportunityQueueStatusKeysAllowed,
    attachPlacementToEnrichedOpportunityItems,
    opportunityProgramLineFromMetadata,
    isActiveChildCustomerMemberRow,
    buildCrmCompactStructuredLinesFromCustomerMembers,
    displayBaseNameForCustomerMember,
    ageLabelFromDob,
    opportunityProgramLabelOnlyFromMetadata,
};

