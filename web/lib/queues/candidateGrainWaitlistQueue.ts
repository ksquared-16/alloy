/**
 * Candidate-grain waitlist queue execution (Card 6).
 * Queries `placement_candidates` directly; reuses Phase 2 placement projection for row shape.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    stageKeyFromLifecycleWorkUnitMetadata,
    type LifecycleStageWorkUnitMetadata,
} from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { resolveLifecycleStageQueuePresentationMode } from "@/lib/lifecycle/lifecycleStageQueuePresentation";
import { resolveLifecycleVisibilityStatusKeys } from "@/lib/lifecycle/lifecycleVisibilityEvaluator";
import { countLifecycleOpportunityRecordsForWorkUnit } from "@/lib/lifecycle/lifecycleOpportunityQueueScope";
import { queueStatusKeysFromQueueConfig } from "@/lib/lifecycle/lifecycleQueueTrace";
import type { RecordScopeConstraints } from "@/lib/admin/accessScope";
import { applyRecordScopeConstraintsToQuery } from "@/lib/admin/accessScope";
import {
    loadQueueDefinitionBundle,
    type NormalizedQueueEntry,
    type NormalizedQueueDefinitionDocument,
} from "@/lib/config/queueDefinitionV2Runtime";
import { parseQueueFilterStub } from "@/lib/config/queueDefinitionV2Runtime";
import { applyPlacementV2ToOpportunityQueueRows } from "@/lib/orchestration/placement/applyPlacementV2ToOpportunityQueueRows";
import { bulkLoadPlacementCandidatesByOpportunity } from "@/lib/orchestration/placement/bulkLoadPlacementCandidatesByOpportunity";
import { filterPlacementCandidateBundlesForQueueDisplay } from "@/lib/orchestration/placement/filterPlacementCandidateBundlesForQueueDisplay";
import { TIER_GENERAL_WAITLIST_BUCKET } from "@/lib/orchestration/placement/placementBucketLabels";
import { loadPlacementEvaluationHouseholdContext } from "@/lib/orchestration/placement/loadPlacementEvaluationHouseholdContext";
import {
    expandOpportunityRowsToPlacementCandidateRows,
    type ExpandToPlacementCandidateRowsResult,
} from "@/lib/orchestration/placement/placementWaitlistCandidateRowProjection";
import { resolvePlacementQueueConfig } from "@/lib/orchestration/placement/resolvePlacementQueueConfig";
import { loadLocationProgramCategoriesForOrg } from "@/lib/locations/loadLocationProgramCategoriesForOrg";
import { sortPlacementCandidateQueueRows } from "@/lib/orchestration/placement/sortPlacementCandidateQueueRows";
import { assignWaitlistCandidateRuntimePositions } from "@/lib/orchestration/placement/waitlistCandidateRuntimePosition";
import type { PlacementCandidateStatus } from "@/lib/orchestration/placement/placementCandidateTypes";
import { PLACEMENT_CANDIDATE_STATUSES } from "@/lib/orchestration/placement/placementCandidateTypes";
import type {
    QueueMembershipCountUnit,
    QueueMembershipLocationScopeSource,
} from "@/lib/lifecycle/queueMembershipV1";
import {
    applyWaitlistCandidateLocationScopeToQuery,
    filterWaitlistCandidateRowsByLocationScope,
    passesSubjectLocationScope,
    resolveCandidateRowSubjectLocationId,
} from "@/lib/queues/queueMembershipLocationScope";

export type WaitlistCandidateGrainFilterSpec = {
    candidate_statuses: PlacementCandidateStatus[];
    child_lifecycle_statuses: string[] | null;
};

export type WaitlistCandidateGrainContext = {
    enabled: true;
    queueEntry: NormalizedQueueEntry;
    filters: WaitlistCandidateGrainFilterSpec;
    placementQueueKey: string;
    countUnit?: QueueMembershipCountUnit;
    membershipSource?: "builder" | "child_grain_flag";
    locationScopeSource?: QueueMembershipLocationScopeSource | null;
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
    const waitlistLane =
        entry.domain === "waitlist" ||
        (key.startsWith("lifecycle_") && entry.grain === "candidate");
    if (!waitlistLane) return null;

    return {
        enabled: true,
        queueEntry: entry,
        filters: parseWaitlistCandidateGrainFilters(entry),
        placementQueueKey: resolveWaitlistPlacementConfigQueueKey(entry),
        locationScopeSource: "placement_site",
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
    site_id: string | null;
    wait_since: string | null;
    program_room_cohort_key: string | null;
    program_room_group_label: string | null;
    opportunity_customer_member_id: string | null;
    opportunities: CandidateOpportunityPreview | CandidateOpportunityPreview[];
    opportunity_customer_members: { outcome_status_key: string | null } | { outcome_status_key: string | null }[] | null;
};

function resolveWaitlistLaneLocationScopeSource(ctx: WaitlistCandidateGrainContext): QueueMembershipLocationScopeSource {
    return ctx.locationScopeSource ?? "placement_site";
}

function passesWaitlistCandidateLocationScope(
    row: CandidateQueryRow,
    constraints: RecordScopeConstraints | null,
    scopeSource: QueueMembershipLocationScopeSource = "placement_site",
): boolean {
    const opp = readCandidateOpportunity(row);
    return passesSubjectLocationScope({
        subjectLocationId: resolveCandidateRowSubjectLocationId({
            siteId: row.site_id,
            opportunityLocationId: opp.location_id,
            scopeSource,
        }),
        recordScopeConstraints: constraints,
    });
}

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

export const SYNTHETIC_WAITLIST_CANDIDATE_ID_PREFIX = "synthetic-waitlist:";

export type LifecycleWaitlistQueryContext = {
    use_lifecycle_visibility: boolean;
    lifecycle_stage_key: string | null;
    status_keys: string[];
};

export function resolveLifecycleWaitlistQueryContext(params: {
    workUnitMetadata?: unknown | null;
    queueDefinition?: unknown | null;
}): LifecycleWaitlistQueryContext {
    const stageKey = stageKeyFromLifecycleWorkUnitMetadata(params.workUnitMetadata ?? null);
    const isWaitlist =
        Boolean(stageKey) && resolveLifecycleStageQueuePresentationMode(stageKey!) === "waitlist_candidate";
    const status_keys = isWaitlist
        ? resolveLifecycleVisibilityStatusKeys({
              workUnitMetadata: params.workUnitMetadata,
              queueDefinition: params.queueDefinition,
          })
        : [];
    return {
        use_lifecycle_visibility: isWaitlist && status_keys.length > 0,
        lifecycle_stage_key: stageKey,
        status_keys,
    };
}

export function logLifecycleWaitlistResolutionTrace(detail: Record<string, unknown>): void {
    if (process.env.NODE_ENV === "production") return;
    console.info("[lifecycle-waitlist-resolution]", detail);
}

function syntheticWaitlistCandidateRow(
    opp: CandidateOpportunityPreview,
    orgId: string
): CandidateQueryRow {
    return {
        id: `${SYNTHETIC_WAITLIST_CANDIDATE_ID_PREFIX}${opp.id}`,
        org_id: orgId,
        opportunity_id: opp.id,
        status: "active",
        site_id: null,
        wait_since: opp.updated_at ?? opp.created_at,
        program_room_cohort_key: null,
        program_room_group_label: null,
        opportunity_customer_member_id: null,
        opportunities: opp,
        opportunity_customer_members: null,
    };
}

async function queryLifecycleVisibleWaitlistOpportunities(params: {
    supabase: SupabaseClient;
    orgId: string;
    statusKeys: readonly string[];
    recordScopeConstraints: RecordScopeConstraints | null;
}): Promise<CandidateOpportunityPreview[]> {
    if (!params.statusKeys.length) return [];
    let q = params.supabase
        .from("opportunities")
        .select(
            "id, name, title, status_key, customer_id, primary_person_id, primary_contact_id, work_unit_id, location_id, metadata, created_at, updated_at"
        )
        .eq("org_id", params.orgId)
        .in("status_key", [...params.statusKeys]);
    if (params.recordScopeConstraints) {
        q = applyRecordScopeConstraintsToQuery(q as never, params.recordScopeConstraints) as typeof q;
    }
    const { data, error } = await q;
    if (error) {
        throw new Error(`lifecycle waitlist opportunity visibility query failed: ${error.message}`);
    }
    return (data ?? []) as CandidateOpportunityPreview[];
}

function queueDefinitionStatusKeysForTrace(queueDefinition: unknown | null): string[] {
    if (queueDefinition == null) return [];
    try {
        const bundle = loadQueueDefinitionBundle(queueDefinition);
        const keys: string[] = [];
        for (const q of bundle.def.queues) {
            keys.push(...queueStatusKeysFromQueueConfig(q as import("@/lib/config/queueDefinitionSchema").QueueConfig));
        }
        return [...new Set(keys.map((k) => k.trim().toLowerCase()).filter(Boolean))];
    } catch {
        return [];
    }
}

function waitlistRowMatchesMatchedSet(
    row: Record<string, unknown>,
    candidateIdSet: Set<string>,
    opportunityIdSet: Set<string>
): boolean {
    const oppId =
        typeof row.opportunity_id === "string"
            ? row.opportunity_id.trim()
            : typeof row.id === "string" && row.id.startsWith(SYNTHETIC_WAITLIST_CANDIDATE_ID_PREFIX)
              ? row.id.slice(SYNTHETIC_WAITLIST_CANDIDATE_ID_PREFIX.length)
              : "";
    if (oppId && opportunityIdSet.has(oppId)) return true;
    const proj = row._placement_waitlist_row as { placement_candidate_id?: string } | undefined;
    const cid = proj?.placement_candidate_id?.trim();
    if (cid && candidateIdSet.has(cid)) return true;
    const id = typeof row.id === "string" ? row.id : "";
    if (id.startsWith("pcrow:")) {
        const parts = id.split(":");
        return parts.length >= 3 && candidateIdSet.has(parts[2]!);
    }
    if (id.startsWith(SYNTHETIC_WAITLIST_CANDIDATE_ID_PREFIX)) {
        const synOpp = id.slice(SYNTHETIC_WAITLIST_CANDIDATE_ID_PREFIX.length);
        return opportunityIdSet.has(synOpp);
    }
    return false;
}

async function queryWaitlistCandidates(params: {
    supabase: SupabaseClient;
    orgId: string;
    workUnitId: string;
    workUnitKey?: string | null;
    workUnitName?: string | null;
    departmentId?: string | null;
    filters: WaitlistCandidateGrainFilterSpec;
    recordScopeConstraints: RecordScopeConstraints | null;
    locationScopeSource: QueueMembershipLocationScopeSource;
    workUnitMetadata?: unknown | null;
    queueDefinition?: unknown | null;
    executableQueueKey?: string | null;
}): Promise<CandidateQueryRow[]> {
    const lifecycleCtx = resolveLifecycleWaitlistQueryContext({
        workUnitMetadata: params.workUnitMetadata,
        queueDefinition: params.queueDefinition,
    });
    const useLifecycleVisibilityScope = lifecycleCtx.use_lifecycle_visibility;
    const lifecycleStatusKeys = lifecycleCtx.status_keys;

    let candidateRows: CandidateQueryRow[] = [];
    let lifecycleVisibleOpps: CandidateOpportunityPreview[] = [];
    let lifecycleVisibilityOppCount: number | null = null;

    if (useLifecycleVisibilityScope) {
        lifecycleVisibleOpps = await queryLifecycleVisibleWaitlistOpportunities({
            supabase: params.supabase,
            orgId: params.orgId,
            statusKeys: lifecycleStatusKeys,
            recordScopeConstraints: params.recordScopeConstraints,
        });
        const oppIds = lifecycleVisibleOpps.map((o) => o.id).filter(Boolean);
        if (params.departmentId && lifecycleStatusKeys.length) {
            try {
                const counts = await countLifecycleOpportunityRecordsForWorkUnit({
                    supabase: params.supabase,
                    orgId: params.orgId,
                    departmentId: params.departmentId,
                    lifecycleWorkUnitId: params.workUnitId,
                    statusKeys: lifecycleStatusKeys,
                });
                lifecycleVisibilityOppCount = counts.matching_by_status;
            } catch {
                lifecycleVisibilityOppCount = lifecycleVisibleOpps.length;
            }
        } else {
            lifecycleVisibilityOppCount = lifecycleVisibleOpps.length;
        }

        if (oppIds.length) {
            let q = params.supabase
                .from("placement_candidates")
                .select(
                    `id, org_id, opportunity_id, status, site_id, wait_since, program_room_cohort_key, program_room_group_label, opportunity_customer_member_id,
            opportunities!inner (
                id, name, title, status_key, customer_id, primary_person_id, primary_contact_id, work_unit_id, location_id, metadata, created_at, updated_at
            ),
            opportunity_customer_members ( outcome_status_key )`
                )
                .eq("org_id", params.orgId)
                .in("opportunity_id", oppIds)
                .in("status", params.filters.candidate_statuses);
            q = applyWaitlistCandidateLocationScopeToQuery(
                q,
                params.recordScopeConstraints,
                params.locationScopeSource,
            );
            const { data, error } = await q;
            if (error) {
                throw new Error(`waitlist candidate-grain query failed: ${error.message}`);
            }
            candidateRows = (data ?? []) as unknown as CandidateQueryRow[];
        }

        const oppsWithCandidate = new Set(candidateRows.map((r) => r.opportunity_id));
        for (const opp of lifecycleVisibleOpps) {
            if (!oppsWithCandidate.has(opp.id)) {
                candidateRows.push(syntheticWaitlistCandidateRow(opp, params.orgId));
            }
        }
    } else {
        let q = params.supabase
            .from("placement_candidates")
            .select(
                `id, org_id, opportunity_id, status, site_id, wait_since, program_room_cohort_key, program_room_group_label, opportunity_customer_member_id,
            opportunities!inner (
                id, name, title, status_key, customer_id, primary_person_id, primary_contact_id, work_unit_id, location_id, metadata, created_at, updated_at
            ),
            opportunity_customer_members ( outcome_status_key )`
            )
            .eq("org_id", params.orgId)
            .in("status", params.filters.candidate_statuses)
            .eq("opportunities.work_unit_id", params.workUnitId);
        q = applyWaitlistCandidateLocationScopeToQuery(
            q,
            params.recordScopeConstraints,
            params.locationScopeSource,
        );
        const { data, error } = await q;
        if (error) {
            throw new Error(`waitlist candidate-grain query failed: ${error.message}`);
        }
        candidateRows = (data ?? []) as unknown as CandidateQueryRow[];
    }

    const locationFiltered = filterWaitlistCandidateRowsByLocationScope(
        candidateRows,
        params.recordScopeConstraints,
        params.locationScopeSource,
    );

    const filtered = locationFiltered
        .filter((r) => passesChildLifecycleFilter(r, params.filters.child_lifecycle_statuses));

    const meta =
        params.workUnitMetadata != null &&
        typeof params.workUnitMetadata === "object" &&
        !Array.isArray(params.workUnitMetadata)
            ? (params.workUnitMetadata as LifecycleStageWorkUnitMetadata)
            : null;

    logLifecycleWaitlistResolutionTrace({
        department_id: params.departmentId ?? null,
        waitlist_work_unit_id: params.workUnitId,
        waitlist_work_unit_key: params.workUnitKey ?? null,
        waitlist_work_unit_name: params.workUnitName ?? null,
        lifecycle_stage_key: lifecycleCtx.lifecycle_stage_key ?? meta?.lifecycle_stage_key ?? null,
        queue_keys_in_definition: params.queueDefinition
            ? (() => {
                  try {
                      return loadQueueDefinitionBundle(params.queueDefinition).normalized.queues.map((q) => ({
                          key: q.key,
                          grain: q.grain,
                          domain: q.domain,
                      }));
                  } catch {
                      return [];
                  }
              })()
            : [],
        fetched_queue_key: params.executableQueueKey ?? null,
        queue_definition_status_keys: queueDefinitionStatusKeysForTrace(params.queueDefinition ?? null),
        metadata_status_keys: meta?.status_keys ?? [],
        lifecycle_status_keys_used: lifecycleStatusKeys,
        loader_selected: useLifecycleVisibilityScope ? "candidate_grain_lifecycle_bridge" : "candidate_grain_assignment_home",
        grain_selected: "candidate",
        lifecycle_visibility_opportunity_count: lifecycleVisibilityOppCount,
        placement_candidate_rows_before_filters: candidateRows.length,
        returned_candidate_rows: filtered.length,
        synthetic_opportunity_rows: filtered.filter((r) =>
            r.id.startsWith(SYNTHETIC_WAITLIST_CANDIDATE_ID_PREFIX)
        ).length,
        requires_work_unit_assignment: !useLifecycleVisibilityScope,
        exclusion_notes:
            filtered.length < (lifecycleVisibilityOppCount ?? 0)
                ? "child_lifecycle_or_location_scope_may_exclude_rows"
                : null,
    });

    return filtered;
}

export async function countWaitlistCandidateGrainItems(params: {
    supabase: SupabaseClient;
    orgId: string;
    workUnitId: string;
    ctx: WaitlistCandidateGrainContext;
    recordScopeConstraints: RecordScopeConstraints | null;
    recordScopeImpossible?: boolean;
    workUnitMetadata?: unknown | null;
    queueDefinition?: unknown | null;
    departmentId?: string | null;
    workUnitKey?: string | null;
    workUnitName?: string | null;
    executableQueueKey?: string | null;
}): Promise<number> {
    if (params.recordScopeImpossible) return 0;
    const rows = await queryWaitlistCandidates({
        supabase: params.supabase,
        orgId: params.orgId,
        workUnitId: params.workUnitId,
        workUnitKey: params.workUnitKey,
        workUnitName: params.workUnitName,
        departmentId: params.departmentId,
        filters: params.ctx.filters,
        recordScopeConstraints: params.recordScopeConstraints,
        locationScopeSource: resolveWaitlistLaneLocationScopeSource(params.ctx),
        workUnitMetadata: params.workUnitMetadata,
        queueDefinition: params.queueDefinition,
        executableQueueKey: params.executableQueueKey ?? params.ctx.queueEntry.key,
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
    queueDefinition?: unknown | null;
    departmentId?: string | null;
    workUnitKey?: string | null;
    workUnitName?: string | null;
    executableQueueKey?: string | null;
    nowMs: number;
    /** When true, skip placement V2 projection for list preview (`queue_reveal`). */
    skipPlacementProjection?: boolean;
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
        workUnitKey: params.workUnitKey,
        workUnitName: params.workUnitName,
        departmentId: params.departmentId,
        filters: params.ctx.filters,
        recordScopeConstraints: params.recordScopeConstraints,
        locationScopeSource: resolveWaitlistLaneLocationScopeSource(params.ctx),
        workUnitMetadata: params.workUnitMetadata,
        queueDefinition: params.queueDefinition,
        executableQueueKey: params.executableQueueKey ?? params.ctx.queueEntry.key,
    });

    const total = matched.length;
    const candidateIdSet = new Set(
        matched.map((r) => r.id).filter((id) => !id.startsWith(SYNTHETIC_WAITLIST_CANDIDATE_ID_PREFIX))
    );
    const matchedOpportunityIdSet = new Set(matched.map((r) => r.opportunity_id));

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

    const skipPlacementProjection = params.skipPlacementProjection === true;
    const locationProgramCategories = await loadLocationProgramCategoriesForOrg(
        params.supabase,
        params.orgId
    );
    const waitlistCategoryContext = { categories: locationProgramCategories };

    let shadowMode = true;
    let placementDiagnostics: WaitlistCandidateGrainLoadResult["placementDiagnostics"] = null;
    let expandedRows: Array<Record<string, unknown>> = [];

    if (placementResolved.status === "enabled" && placementResolved.engine_version === "v2") {
        const candidatesByOpportunityId = await bulkLoadPlacementCandidatesByOpportunity({
            supabase: params.supabase,
            orgId: params.orgId,
            opportunityIds,
            activeOnly: false,
        });

        const householdFactsByCustomerId = await loadPlacementEvaluationHouseholdContext({
            supabase: params.supabase,
            orgId: params.orgId,
            candidatesByOpportunityId,
        });

        shadowMode = skipPlacementProjection ? true : placementResolved.options.shadow_mode;
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
            householdFactsByCustomerId,
            v1FallbackForEmpty: true,
        });
        const expanded = expandOpportunityRowsToPlacementCandidateRows(v2Out.rows, {
            householdFactsByCustomerId,
        });
        expandedRows = expanded.rows.filter((row) =>
            waitlistRowMatchesMatchedSet(row, candidateIdSet, matchedOpportunityIdSet)
        );
        placementDiagnostics = v2Out.diagnostics;
        expandedRows = sortPlacementCandidateQueueRows(expandedRows, shadowMode, waitlistCategoryContext);
        assignWaitlistCandidateRuntimePositions(expandedRows, shadowMode, waitlistCategoryContext);
    } else {
        const candidatesByOpportunityId = await bulkLoadPlacementCandidatesByOpportunity({
            supabase: params.supabase,
            orgId: params.orgId,
            opportunityIds,
            activeOnly: false,
        });

        const householdFactsByCustomerId = await loadPlacementEvaluationHouseholdContext({
            supabase: params.supabase,
            orgId: params.orgId,
            candidatesByOpportunityId,
        });

        const oppRows = opportunityIds
            .map((id) => enrichedByOppId.get(id))
            .filter((r): r is Record<string, unknown> => r != null);

        const revealRows = oppRows.map((row) => {
            const oppId = typeof row.id === "string" ? row.id.trim() : "";
            const bundles = filterPlacementCandidateBundlesForQueueDisplay(
                candidatesByOpportunityId.get(oppId) ?? []
            );
            return {
                ...row,
                _placement_priority_v2: {
                    projection_mode: "family_row",
                    evaluated: true,
                    shadow_mode: true,
                    candidates: bundles.map((b) => ({
                        placement_candidate_id: b.candidate.id,
                        child_display_name: b.child_display_name,
                        program_room_cohort_key: b.candidate.program_room_cohort_key,
                        program_room_group_label: b.candidate.program_room_group_label,
                        bucket: TIER_GENERAL_WAITLIST_BUCKET,
                        sort_tuple: [] as Array<string | number | null>,
                        link_mode: b.link_mode,
                        /*
                         * ── AN OPERATOR'S PIN MUST AT LEAST BE VISIBLE ──
                         *
                         * This was hardcoded `[]`, so `rowHasManualPinOverride` could only ever return
                         * false on the child-grain waitlist — which is why a stored pin was neither
                         * applied NOR explained: `runtime_position_precedence_note` ("Ranked below
                         * manually adjusted row(s)") was unreachable by construction. Measured live:
                         * Wrigley pinned to ordinal 1, rendering at 2/12, precedenceNote `none`.
                         *
                         * The bundle has carried this all along. Carrying it through changes NO
                         * ordering — `sort_tuple` on this projection stays empty, so nothing is
                         * re-sorted — it only lets the surface say that a manual adjustment is in play.
                         *
                         * The pin's ordering EFFECT still requires the evaluated projection (this path
                         * emits an empty sort tuple, so there is no tuple for a manual precedence to be
                         * spliced into). That is a deliberate placement-behaviour change and is carried
                         * as the remaining half of law 36.
                         */
                        active_override_kinds: b.active_overrides.map((o) => o.override_kind),
                        is_synthetic_fallback: b.candidate.is_synthetic_fallback === true,
                        wait_since: b.candidate.wait_since,
                    })),
                    family_rollup: {
                        bucket: TIER_GENERAL_WAITLIST_BUCKET,
                        sort_tuple: [] as Array<string | number | null>,
                        candidate_count: bundles.length,
                    },
                },
            };
        });

        const expanded = expandOpportunityRowsToPlacementCandidateRows(revealRows, {
            householdFactsByCustomerId,
        });
        expandedRows = expanded.rows.filter((row) =>
            waitlistRowMatchesMatchedSet(row, candidateIdSet, matchedOpportunityIdSet)
        );
        shadowMode = true;
        expandedRows = sortPlacementCandidateQueueRows(expandedRows, shadowMode, waitlistCategoryContext);
        assignWaitlistCandidateRuntimePositions(expandedRows, shadowMode, waitlistCategoryContext);
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
    resolveLifecycleWaitlistQueryContext,
    passesChildLifecycleFilter,
    passesWaitlistCandidateLocationScope,
    waitlistRowMatchesMatchedSet,
    syntheticWaitlistCandidateRow,
    readOcmOutcomeStatus,
};
