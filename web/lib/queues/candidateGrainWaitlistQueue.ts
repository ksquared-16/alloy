/**
 * Candidate-grain waitlist queue execution (Card 6).
 * Queries `placement_candidates` directly; reuses Phase 2 placement projection for row shape.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { applyRecordScopeConstraintsToQuery, type RecordScopeConstraints } from "@/lib/admin/accessScope";
import type { NormalizedQueueEntry, NormalizedQueueDefinitionDocument } from "@/lib/config/queueDefinitionV2Runtime";
import { parseQueueFilterStub } from "@/lib/config/queueDefinitionV2Runtime";
import { applyPlacementV2ToOpportunityQueueRows } from "@/lib/orchestration/placement/applyPlacementV2ToOpportunityQueueRows";
import { bulkLoadPlacementCandidatesByOpportunity } from "@/lib/orchestration/placement/bulkLoadPlacementCandidatesByOpportunity";
import {
    expandOpportunityRowsToPlacementCandidateRows,
    type ExpandToPlacementCandidateRowsResult,
} from "@/lib/orchestration/placement/placementWaitlistCandidateRowProjection";
import { resolvePlacementQueueConfig } from "@/lib/orchestration/placement/resolvePlacementQueueConfig";
import { sortPlacementCandidateQueueRows } from "@/lib/orchestration/placement/sortPlacementCandidateQueueRows";
import type { PlacementCandidateStatus } from "@/lib/orchestration/placement/placementCandidateTypes";
import { PLACEMENT_CANDIDATE_STATUSES } from "@/lib/orchestration/placement/placementCandidateTypes";

export type WaitlistCandidateGrainFilterSpec = {
    candidate_statuses: PlacementCandidateStatus[];
    child_lifecycle_statuses: string[] | null;
};

export type WaitlistCandidateGrainContext = {
    enabled: true;
    queueEntry: NormalizedQueueEntry;
    filters: WaitlistCandidateGrainFilterSpec;
    placementQueueKey: string;
};

const DEFAULT_CANDIDATE_STATUSES = ["active", "paused"] as const satisfies readonly PlacementCandidateStatus[];

const PLACEMENT_CANDIDATE_STATUS_SET = new Set<string>(PLACEMENT_CANDIDATE_STATUSES);

function parseCandidateStatuses(values: unknown[]): PlacementCandidateStatus[] {
    const vals = values
        .filter((v): v is string => typeof v === "string" && v.trim() !== "")
        .map((v) => v.trim())
        .filter((v): v is PlacementCandidateStatus => PLACEMENT_CANDIDATE_STATUS_SET.has(v));
    return vals.length ? vals : [...DEFAULT_CANDIDATE_STATUSES];
}

/** Env rollback gate — set `ALLOY_QUEUE_WAITLIST_CANDIDATE_GRAIN_DISABLED=1` to force v1 compat path. */
export function isWaitlistCandidateGrainGloballyDisabled(): boolean {
    return process.env.ALLOY_QUEUE_WAITLIST_CANDIDATE_GRAIN_DISABLED === "1";
}

export function parseWaitlistCandidateGrainFilters(entry: NormalizedQueueEntry): WaitlistCandidateGrainFilterSpec {
    let candidate_statuses: PlacementCandidateStatus[] = [...DEFAULT_CANDIDATE_STATUSES];
    let child_lifecycle_statuses: string[] | null = null;

    for (const raw of entry.filters ?? []) {
        const stub = parseQueueFilterStub(raw);
        if (!stub.recognized) continue;
        const f = stub.raw;
        if (f == null || typeof f !== "object" || Array.isArray(f)) continue;
        const rec = f as Record<string, unknown>;
        if (rec.type === "candidate_status" && rec.operator === "in" && Array.isArray(rec.values)) {
            candidate_statuses = parseCandidateStatuses(rec.values);
        }
        if (rec.type === "child_lifecycle_status" && rec.operator === "in" && Array.isArray(rec.values)) {
            const vals = rec.values.filter((v): v is string => typeof v === "string" && v.trim() !== "");
            if (vals.length) child_lifecycle_statuses = vals;
        }
    }

    return { candidate_statuses, child_lifecycle_statuses };
}

/** Placement config may still list legacy lane keys (`waitlisted`). */
export function resolveWaitlistPlacementConfigQueueKey(entry: NormalizedQueueEntry): string {
    if (entry.aliases.includes("waitlisted")) return "waitlisted";
    return entry.key;
}

export function resolveWaitlistCandidateGrainContext(params: {
    normalized: NormalizedQueueDefinitionDocument | null | undefined;
    executableQueueKey: string;
}): WaitlistCandidateGrainContext | null {
    if (isWaitlistCandidateGrainGloballyDisabled()) return null;
    if (!params.normalized?.isV2) return null;

    const key = params.executableQueueKey.trim();
    const entry =
        params.normalized.queues.find((q) => q.key === key) ??
        params.normalized.queues.find((q) => q.domain === "waitlist" && q.grain === "candidate") ??
        null;

    if (!entry || entry.grain !== "candidate") return null;
    if (entry.key !== "waitlist" && entry.domain !== "waitlist") return null;

    return {
        enabled: true,
        queueEntry: entry,
        filters: parseWaitlistCandidateGrainFilters(entry),
        placementQueueKey: resolveWaitlistPlacementConfigQueueKey(entry),
    };
}

type CandidateOpportunityPreview = {
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

type CandidateQueryRow = {
    id: string;
    org_id: string;
    opportunity_id: string;
    status: string;
    wait_since: string | null;
    program_room_cohort_key: string | null;
    program_room_group_label: string | null;
    opportunity_customer_member_id: string | null;
    opportunities: CandidateOpportunityPreview | CandidateOpportunityPreview[];
    opportunity_customer_members: { outcome_status_key: string | null } | { outcome_status_key: string | null }[] | null;
};

function readCandidateOpportunity(row: CandidateQueryRow): CandidateOpportunityPreview {
    const o = row.opportunities;
    const single = Array.isArray(o) ? (o[0] ?? null) : o;
    if (!single?.id) {
        throw new Error(`waitlist candidate-grain row missing opportunity join: ${row.id}`);
    }
    return single;
}

function readOcmOutcomeStatus(row: CandidateQueryRow): string | null {
    const ocm = row.opportunity_customer_members;
    if (ocm == null) return null;
    const single = Array.isArray(ocm) ? (ocm[0] ?? null) : ocm;
    const sk = single?.outcome_status_key;
    return typeof sk === "string" && sk.trim() ? sk.trim() : null;
}

function passesChildLifecycleFilter(row: CandidateQueryRow, allowed: string[] | null): boolean {
    if (!allowed?.length) return true;
    const ocmStatus = readOcmOutcomeStatus(row);
    if (ocmStatus == null) return true;
    return allowed.includes(ocmStatus);
}

function opportunityPreviewFromCandidateRow(row: CandidateQueryRow) {
    const o = readCandidateOpportunity(row);
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

async function queryWaitlistCandidates(params: {
    supabase: SupabaseClient;
    orgId: string;
    workUnitId: string;
    filters: WaitlistCandidateGrainFilterSpec;
    recordScopeConstraints: RecordScopeConstraints | null;
}): Promise<CandidateQueryRow[]> {
    let q = params.supabase
        .from("placement_candidates")
        .select(
            `id, org_id, opportunity_id, status, wait_since, program_room_cohort_key, program_room_group_label, opportunity_customer_member_id,
            opportunities!inner (
                id, name, title, status_key, customer_id, primary_person_id, primary_contact_id, work_unit_id, location_id, metadata, created_at, updated_at
            ),
            opportunity_customer_members ( outcome_status_key )`
        )
        .eq("org_id", params.orgId)
        .eq("opportunities.work_unit_id", params.workUnitId)
        .in("status", params.filters.candidate_statuses);

    if (params.recordScopeConstraints) {
        q = applyRecordScopeConstraintsToQuery(q, params.recordScopeConstraints);
    }

    const { data, error } = await q;
    if (error) {
        throw new Error(`waitlist candidate-grain query failed: ${error.message}`);
    }

    const rows = (data ?? []) as unknown as CandidateQueryRow[];
    return rows.filter((r) => passesChildLifecycleFilter(r, params.filters.child_lifecycle_statuses));
}

export async function countWaitlistCandidateGrainItems(params: {
    supabase: SupabaseClient;
    orgId: string;
    workUnitId: string;
    ctx: WaitlistCandidateGrainContext;
    recordScopeConstraints: RecordScopeConstraints | null;
    recordScopeImpossible?: boolean;
}): Promise<number> {
    if (params.recordScopeImpossible) return 0;
    const rows = await queryWaitlistCandidates({
        supabase: params.supabase,
        orgId: params.orgId,
        workUnitId: params.workUnitId,
        filters: params.ctx.filters,
        recordScopeConstraints: params.recordScopeConstraints,
    });
    return rows.length;
}

export type WaitlistCandidateGrainLoadResult = {
    items: Array<Record<string, unknown>>;
    total: number;
    placementDiagnostics: import("@/lib/orchestration/placement/applyPlacementToOpportunityQueueRows").WorkUnitPlacementQueueDiagnostics | null;
    expansion: ExpandToPlacementCandidateRowsResult | null;
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
    shadow_mode: boolean;
};

export async function loadWaitlistCandidateGrainQueueItems(params: {
    supabase: SupabaseClient;
    orgId: string;
    workUnitId: string;
    ctx: WaitlistCandidateGrainContext;
    recordScopeConstraints: RecordScopeConstraints | null;
    recordScopeImpossible?: boolean;
    limit: number;
    offset: number;
    departmentMetadata: unknown | null;
    workUnitMetadata: unknown | null;
    nowMs: number;
    enrichOpportunityRows: (rows: Array<ReturnType<typeof opportunityPreviewFromCandidateRow>>) => Promise<{
        rows: Array<Record<string, unknown>>;
        queueListSubtimings?: WaitlistCandidateGrainLoadResult["enrichmentSubtimings"];
    }>;
}): Promise<WaitlistCandidateGrainLoadResult> {
    if (params.recordScopeImpossible) {
        return { items: [], total: 0, placementDiagnostics: null, expansion: null, shadow_mode: true };
    }

    const matched = await queryWaitlistCandidates({
        supabase: params.supabase,
        orgId: params.orgId,
        workUnitId: params.workUnitId,
        filters: params.ctx.filters,
        recordScopeConstraints: params.recordScopeConstraints,
    });

    const total = matched.length;
    const candidateIdSet = new Set(matched.map((r) => r.id));

    const sorted = [...matched].sort((a, b) => {
        const wa = a.wait_since ?? readCandidateOpportunity(a).updated_at ?? "";
        const wb = b.wait_since ?? readCandidateOpportunity(b).updated_at ?? "";
        return String(wa).localeCompare(String(wb));
    });

    const page = sorted.slice(params.offset, params.offset + params.limit);
    if (!page.length) {
        return { items: [], total, placementDiagnostics: null, expansion: null, shadow_mode: true };
    }

    const oppById = new Map<string, ReturnType<typeof opportunityPreviewFromCandidateRow>>();
    for (const row of page) {
        if (!oppById.has(row.opportunity_id)) {
            oppById.set(row.opportunity_id, opportunityPreviewFromCandidateRow(row));
        }
    }
    const opportunityIds = [...oppById.keys()];

    const enrichedPack = await params.enrichOpportunityRows([...oppById.values()]);
    const enrichedByOppId = new Map<string, Record<string, unknown>>();
    for (const row of enrichedPack.rows) {
        const id = typeof row.id === "string" ? row.id.trim() : "";
        if (id) enrichedByOppId.set(id, row);
    }

    const placementResolved = resolvePlacementQueueConfig({
        departmentMetadata: params.departmentMetadata,
        workUnitMetadata: params.workUnitMetadata,
        queue_key: params.ctx.placementQueueKey,
    });

    const candidatesByOpportunityId = await bulkLoadPlacementCandidatesByOpportunity({
        supabase: params.supabase,
        orgId: params.orgId,
        opportunityIds,
        activeOnly: false,
    });

    let shadowMode = true;
    let placementDiagnostics: WaitlistCandidateGrainLoadResult["placementDiagnostics"] = null;
    let expandedRows: Array<Record<string, unknown>> = [];

    if (placementResolved.status === "enabled" && placementResolved.engine_version === "v2") {
        shadowMode = placementResolved.options.shadow_mode;
        const oppRows = opportunityIds
            .map((id) => enrichedByOppId.get(id))
            .filter((r): r is Record<string, unknown> => r != null);

        const v2Out = applyPlacementV2ToOpportunityQueueRows({
            rows: oppRows,
            placement: { ...placementResolved, engine_version: "v2" },
            ctx: {
                workUnitId: params.workUnitId,
                queueKey: params.ctx.placementQueueKey,
                nowMs: params.nowMs,
            },
            candidatesByOpportunityId,
            v1FallbackForEmpty: true,
        });
        const expanded = expandOpportunityRowsToPlacementCandidateRows(v2Out.rows);
        expandedRows = expanded.rows.filter((row) => {
            const proj = row._placement_waitlist_row as { placement_candidate_id?: string } | undefined;
            const cid = proj?.placement_candidate_id?.trim();
            if (cid && candidateIdSet.has(cid)) return true;
            const id = typeof row.id === "string" ? row.id : "";
            if (id.startsWith("pcrow:")) {
                const parts = id.split(":");
                return parts.length >= 3 && candidateIdSet.has(parts[2]!);
            }
            return false;
        });
        placementDiagnostics = v2Out.diagnostics;
        expandedRows = sortPlacementCandidateQueueRows(expandedRows, shadowMode);
    } else {
        expandedRows = page.map((row) => {
            const opp = enrichedByOppId.get(row.opportunity_id) ?? (opportunityPreviewFromCandidateRow(row) as Record<string, unknown>);
            const ocmStatus = readOcmOutcomeStatus(row);
            return {
                ...opp,
                id: `pcrow:${row.opportunity_id}:${row.id}`,
                opportunity_id: row.opportunity_id,
                row_grain: "candidate",
                placement_candidate_id: row.id,
                opportunity_customer_member_id: row.opportunity_customer_member_id,
                child_lifecycle_status: ocmStatus,
                candidate_status: row.status,
                _placement_waitlist_row: {
                    row_projection: "placement_candidate",
                    placement_candidate_id: row.id,
                    opportunity_id: row.opportunity_id,
                    child_display_name: "Child",
                    family_display_name: typeof opp.name === "string" ? opp.name : "Family",
                    program_room_cohort_key: row.program_room_cohort_key ?? "",
                    program_room_group_label: row.program_room_group_label ?? "",
                    bucket: "unknown",
                    sibling_context: {
                        has_siblings_on_waitlist: false,
                        sibling_candidate_count: 0,
                        sibling_cohorts: [],
                        link_mode: "independent",
                    },
                    placement_priority_v2: {
                        placement_candidate_id: row.id,
                        program_room_cohort_key: row.program_room_cohort_key ?? "",
                        bucket: "unknown",
                        sort_tuple: [],
                        link_mode: "independent",
                        active_override_kinds: [],
                    },
                    shadow_mode: true,
                },
            };
        });
    }

    for (const row of expandedRows) {
        row.row_grain = "candidate";
        row.queue_grain = "candidate";
        row.candidate_status = row.candidate_status ?? row.status;
    }

    return {
        items: expandedRows,
        total,
        placementDiagnostics,
        expansion: null,
        enrichmentSubtimings: enrichedPack.queueListSubtimings,
        shadow_mode: shadowMode,
    };
}

/** @internal test export */
export const __testing = {
    parseWaitlistCandidateGrainFilters,
    resolveWaitlistCandidateGrainContext,
    passesChildLifecycleFilter,
    readOcmOutcomeStatus,
};
