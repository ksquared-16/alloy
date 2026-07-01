/**
 * Child-grain enrollment_offers queue execution (Card 8).
 * Queries `opportunity_customer_members` directly — one queue row per child inquiry.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecordScopeConstraints } from "@/lib/admin/accessScope";
import type { NormalizedQueueEntry, NormalizedQueueDefinitionDocument } from "@/lib/config/queueDefinitionV2Runtime";
import { parseQueueFilterStub } from "@/lib/config/queueDefinitionV2Runtime";

export type EnrollmentOffersChildGrainFilterSpec = {
    child_lifecycle_statuses: string[];
};

export type EnrollmentOffersChildGrainContext = {
    enabled: true;
    queueEntry: NormalizedQueueEntry;
    filters: EnrollmentOffersChildGrainFilterSpec;
};

const DEFAULT_CHILD_LIFECYCLE_STATUSES = ["offer_pending", "enrolling"] as const;

/** Env rollback gate — set `ALLOY_QUEUE_ENROLLMENT_CHILD_GRAIN_DISABLED=1` to force v1 compat path. */
export function isEnrollmentChildGrainGloballyDisabled(): boolean {
    return process.env.ALLOY_QUEUE_ENROLLMENT_CHILD_GRAIN_DISABLED === "1";
}

export function parseEnrollmentOffersChildGrainFilters(entry: NormalizedQueueEntry): EnrollmentOffersChildGrainFilterSpec {
    let child_lifecycle_statuses: string[] = [...DEFAULT_CHILD_LIFECYCLE_STATUSES];

    for (const raw of entry.filters ?? []) {
        const stub = parseQueueFilterStub(raw);
        if (!stub.recognized) continue;
        const f = stub.raw;
        if (f == null || typeof f !== "object" || Array.isArray(f)) continue;
        const rec = f as Record<string, unknown>;
        if (rec.type === "child_lifecycle_status" && rec.operator === "in" && Array.isArray(rec.values)) {
            const vals = rec.values.filter((v): v is string => typeof v === "string" && v.trim() !== "");
            if (vals.length) child_lifecycle_statuses = vals;
        }
    }

    return { child_lifecycle_statuses };
}

export function resolveEnrollmentOffersChildGrainContext(params: {
    normalized: NormalizedQueueDefinitionDocument | null | undefined;
    executableQueueKey: string;
}): EnrollmentOffersChildGrainContext | null {
    if (isEnrollmentChildGrainGloballyDisabled()) return null;
    if (!params.normalized?.isV2) return null;

    const key = params.executableQueueKey.trim();
    const entry =
        params.normalized.queues.find((q) => q.key === key) ??
        params.normalized.queues.find((q) => q.domain === "enrollment_offers" && q.grain === "child" && q.key === "enrollment_offers") ??
        null;

    if (!entry || entry.grain !== "child") return null;
    if (entry.key !== "enrollment_offers") return null;

    return {
        enabled: true,
        queueEntry: entry,
        filters: parseEnrollmentOffersChildGrainFilters(entry),
    };
}

export function enrollmentOffersChildQueueRowId(opportunityId: string, ocmId: string): string {
    return `ocmrow:${opportunityId.trim()}:${ocmId.trim()}`;
}

export function readOpportunityIdFromChildGrainQueueRow(row: Record<string, unknown>): string {
    const explicit = typeof row.opportunity_id === "string" ? row.opportunity_id.trim() : "";
    if (explicit) return explicit;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (id.startsWith("ocmrow:")) {
        const parts = id.split(":");
        if (parts.length >= 3) return parts[1]!;
    }
    return id;
}

type OpportunityPreview = {
    id: string;
    name: string | null;
    title: string | null;
    status_key: string | null;
    customer_id: string | null;
    primary_person_id: string | null;
    primary_contact_id: string | null;
    work_unit_id: string | null;
    location_id: string | null;
    metadata: unknown;
    created_at: string | null;
    updated_at: string | null;
};

type CustomerMemberPreview = {
    id: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    dob: string | null;
    person_id: string | null;
    relationship: string | null;
    is_active: boolean | null;
};

export type ChildGrainOcmQueryRow = {
    id: string;
    org_id: string;
    opportunity_id: string;
    customer_member_id: string;
    outcome_status_key: string | null;
    desired_program_type: string | null;
    desired_schedule_type: string | null;
    updated_at: string | null;
    created_at: string | null;
    opportunities: OpportunityPreview | OpportunityPreview[];
    customer_members: CustomerMemberPreview | CustomerMemberPreview[] | null;
};

function readJoinedSingle<T extends { id?: string }>(value: T | T[] | null | undefined): T | null {
    if (value == null) return null;
    const single = Array.isArray(value) ? (value[0] ?? null) : value;
    return single?.id ? single : null;
}

function readOpportunity(row: ChildGrainOcmQueryRow): OpportunityPreview {
    const o = readJoinedSingle(row.opportunities);
    if (!o?.id) {
        throw new Error(`enrollment child-grain row missing opportunity join: ${row.id}`);
    }
    return o;
}

function readCustomerMember(row: ChildGrainOcmQueryRow): CustomerMemberPreview | null {
    return readJoinedSingle(row.customer_members);
}

function readCustomerMemberDisplayName(cm: CustomerMemberPreview | null): string {
    if (!cm) return "Child";
    const display = cm.display_name?.trim();
    if (display) return display;
    const parts = [cm.first_name?.trim(), cm.last_name?.trim()].filter(Boolean);
    if (parts.length) return parts.join(" ");
    return "Child";
}

function programLineFromOcm(row: ChildGrainOcmQueryRow): string | null {
    const parts = [row.desired_program_type?.trim(), row.desired_schedule_type?.trim()].filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
}

function applyRecordScopeToOpportunityJoinQuery<T extends { in: (col: string, vals: string[]) => T }>(
    q: T,
    constraints: RecordScopeConstraints | null
): T {
    if (!constraints) return q;
    if (constraints.workUnitIds?.length) {
        q = q.in("opportunities.work_unit_id", constraints.workUnitIds);
    }
    if (constraints.locationIds?.length) {
        q = q.in("opportunities.location_id", constraints.locationIds);
    }
    return q;
}

async function queryEnrollmentOffersOcmRows(params: {
    supabase: SupabaseClient;
    orgId: string;
    workUnitId: string;
    filters: EnrollmentOffersChildGrainFilterSpec;
    recordScopeConstraints: RecordScopeConstraints | null;
}): Promise<ChildGrainOcmQueryRow[]> {
    let q = params.supabase
        .from("opportunity_customer_members")
        .select(
            `id, org_id, opportunity_id, customer_member_id, outcome_status_key, desired_program_type, desired_schedule_type, updated_at, created_at,
            opportunities!inner (
                id, name, title, status_key, customer_id, primary_person_id, primary_contact_id, work_unit_id, location_id, metadata, created_at, updated_at
            ),
            customer_members (
                id, display_name, first_name, last_name, dob, person_id, relationship, is_active
            )`
        )
        .eq("org_id", params.orgId)
        .eq("opportunities.work_unit_id", params.workUnitId)
        .in("outcome_status_key", params.filters.child_lifecycle_statuses);

    q = applyRecordScopeToOpportunityJoinQuery(q, params.recordScopeConstraints);

    const { data, error } = await q;
    if (error) {
        throw new Error(`enrollment child-grain query failed: ${error.message}`);
    }

    return (data ?? []) as unknown as ChildGrainOcmQueryRow[];
}

function opportunityPreviewFromOcmRow(row: ChildGrainOcmQueryRow) {
    const o = readOpportunity(row);
    return {
        id: o.id,
        name: o.name,
        title: o.title,
        status_key: o.status_key,
        customer_id: o.customer_id,
        primary_person_id: o.primary_person_id,
        primary_contact_id: o.primary_contact_id,
        work_unit_id: o.work_unit_id,
        location_id: o.location_id,
        metadata: o.metadata,
        created_at: o.created_at ?? "",
        updated_at: o.updated_at ?? "",
    };
}

export type ChildGrainEnrollmentLoadResult = {
    items: Array<Record<string, unknown>>;
    total: number;
    enrichmentSubtimings?: {
        parallel_wall_ms: number;
        persons_ms: number;
        contacts_ms: number;
        customers_ms: number;
        customer_members_ms: number;
        defs_resolve_ms: number;
        child_persons_ms: number;
        map_ms: number;
    };
};

function buildChildGrainRowFromOcm(
    row: ChildGrainOcmQueryRow,
    enrichedOpp: Record<string, unknown> | null
): Record<string, unknown> {
    const opp = readOpportunity(row);
    const cm = readCustomerMember(row);
    const childDisplayName = readCustomerMemberDisplayName(cm);
    const programLine = programLineFromOcm(row);
    const lifecycleStatus = row.outcome_status_key?.trim() || null;
    const base = enrichedOpp ?? (opportunityPreviewFromOcmRow(row) as Record<string, unknown>);

    return {
        ...base,
        id: enrollmentOffersChildQueueRowId(row.opportunity_id, row.id),
        opportunity_id: row.opportunity_id,
        opportunity_customer_member_id: row.id,
        customer_member_id: row.customer_member_id,
        row_grain: "child",
        queue_grain: "child",
        child_lifecycle_status: lifecycleStatus,
        opportunity_status_key: opp.status_key,
        _child_display_name: childDisplayName,
        _crm_compact_children: [
            {
                primary: childDisplayName,
                secondary: programLine,
            },
        ],
        _child_lifecycle_grain_row: {
            row_projection: "opportunity_customer_member",
            opportunity_customer_member_id: row.id,
            opportunity_id: row.opportunity_id,
            customer_member_id: row.customer_member_id,
            child_display_name: childDisplayName,
            family_display_name: typeof base.name === "string" ? base.name : opp.name ?? "Family",
            child_lifecycle_status: lifecycleStatus,
            opportunity_status_key: opp.status_key,
            program_line: programLine,
        },
    };
}

export async function countEnrollmentOffersChildGrainItems(params: {
    supabase: SupabaseClient;
    orgId: string;
    workUnitId: string;
    ctx: EnrollmentOffersChildGrainContext;
    recordScopeConstraints: RecordScopeConstraints | null;
    recordScopeImpossible?: boolean;
}): Promise<number> {
    if (params.recordScopeImpossible) return 0;
    const rows = await queryEnrollmentOffersOcmRows({
        supabase: params.supabase,
        orgId: params.orgId,
        workUnitId: params.workUnitId,
        filters: params.ctx.filters,
        recordScopeConstraints: params.recordScopeConstraints,
    });
    return rows.length;
}

export async function loadChildGrainEnrollmentQueueItems(params: {
    supabase: SupabaseClient;
    orgId: string;
    workUnitId: string;
    ctx: EnrollmentOffersChildGrainContext;
    recordScopeConstraints: RecordScopeConstraints | null;
    recordScopeImpossible?: boolean;
    limit: number;
    offset: number;
    enrichOpportunityRows: (rows: Array<ReturnType<typeof opportunityPreviewFromOcmRow>>) => Promise<{
        rows: Array<Record<string, unknown>>;
        queueListSubtimings?: ChildGrainEnrollmentLoadResult["enrichmentSubtimings"];
    }>;
}): Promise<ChildGrainEnrollmentLoadResult> {
    if (params.recordScopeImpossible) {
        return { items: [], total: 0 };
    }

    const matched = await queryEnrollmentOffersOcmRows({
        supabase: params.supabase,
        orgId: params.orgId,
        workUnitId: params.workUnitId,
        filters: params.ctx.filters,
        recordScopeConstraints: params.recordScopeConstraints,
    });

    const total = matched.length;

    const sorted = [...matched].sort((a, b) => {
        const ua = a.updated_at ?? readOpportunity(a).updated_at ?? "";
        const ub = b.updated_at ?? readOpportunity(b).updated_at ?? "";
        return String(ub).localeCompare(String(ua));
    });

    const page = sorted.slice(params.offset, params.offset + params.limit);
    if (!page.length) {
        return { items: [], total };
    }

    const oppById = new Map<string, ReturnType<typeof opportunityPreviewFromOcmRow>>();
    for (const row of page) {
        const oid = row.opportunity_id;
        if (!oppById.has(oid)) {
            oppById.set(oid, opportunityPreviewFromOcmRow(row));
        }
    }

    const enrichedPack = await params.enrichOpportunityRows([...oppById.values()]);
    const enrichedByOppId = new Map<string, Record<string, unknown>>();
    for (const row of enrichedPack.rows) {
        const id = typeof row.id === "string" ? row.id.trim() : "";
        if (id) enrichedByOppId.set(id, row);
    }

    const items = page.map((row) =>
        buildChildGrainRowFromOcm(row, enrichedByOppId.get(row.opportunity_id) ?? null)
    );

    return {
        items,
        total,
        enrichmentSubtimings: enrichedPack.queueListSubtimings,
    };
}

/** @internal test export */
export const __testing = {
    parseEnrollmentOffersChildGrainFilters,
    resolveEnrollmentOffersChildGrainContext,
    buildChildGrainRowFromOcm,
    readCustomerMemberDisplayName,
    enrollmentOffersChildQueueRowId,
};
