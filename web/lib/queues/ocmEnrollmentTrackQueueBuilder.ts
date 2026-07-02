/**
 * Phase A — OCM enrollment-track queue row builder (Tour, Enrolling, Enrolled).
 * Legacy fallback when tracks_v1 is absent; builder routing handles configured processes.
 *
 * @see docs/sprints/06_2026/child_grain_queue_conversion_design.md
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecordScopeConstraints } from "@/lib/admin/accessScope";
import {
    enrollmentOffersChildQueueRowId,
    programKeyFromChildGrainOcmRow,
    type ChildGrainOcmQueryRow,
} from "@/lib/queues/childGrainEnrollmentQueue";
import { legacyChildTrackLaneForQueueKey, legacyOcmDispositionKeysForStage } from "@/lib/businessProcessTemplates/enrollmentLegacyCompat";
import type { ProcessChildTrackLaneContext } from "@/lib/businessProcesses/resolveChildTrackLaneFromMembership";
import { isChildGrainLaneBuildersEnabled } from "@/lib/queues/childGrainLanesFeatureFlag";
import type {
    QueueMembershipCountUnit,
    QueueMembershipLocationScopeSource,
} from "@/lib/lifecycle/queueMembershipV1";
import {
    applyOcmLocationScopeToQuery,
    filterOcmEnrollmentTrackRowsByLocationScope,
} from "@/lib/queues/queueMembershipLocationScope";
import { buildQueueRelevantCrmCompactChildren } from "@/lib/workUnits/filterQueueRelevantInquiryChildren";

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

export type OcmEnrollmentTrackQueryRow = ChildGrainOcmQueryRow & {
    location_id: string | null;
    program_room_cohort_key: string | null;
    start_date: string | null;
};

function readJoinedSingle<T extends { id?: string }>(value: T | T[] | null | undefined): T | null {
    if (value == null) return null;
    const single = Array.isArray(value) ? (value[0] ?? null) : value;
    return single?.id ? single : null;
}

function readOpportunity(row: OcmEnrollmentTrackQueryRow): OpportunityPreview {
    const o = readJoinedSingle(row.opportunities);
    if (!o?.id) {
        throw new Error(`ocm enrollment-track row missing opportunity join: ${row.id}`);
    }
    return o;
}

function readCustomerMember(row: OcmEnrollmentTrackQueryRow): CustomerMemberPreview | null {
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

function programLineFromOcm(row: OcmEnrollmentTrackQueryRow): string | null {
    const parts = [programKeyFromChildGrainOcmRow(row), row.schedule_type?.trim()].filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
}

function resolveOcmLaneLocationScopeSource(ctx: OcmEnrollmentTrackLaneContext): QueueMembershipLocationScopeSource {
    if (ctx.locationScopeSource) return ctx.locationScopeSource;
    return "ocm_site";
}

async function queryOcmEnrollmentTrackRows(params: {
    supabase: SupabaseClient;
    orgId: string;
    workUnitId: string;
    stageKey: string;
    dispositionKeys?: readonly string[];
    recordScopeConstraints: RecordScopeConstraints | null;
    locationScopeSource: QueueMembershipLocationScopeSource;
}): Promise<OcmEnrollmentTrackQueryRow[]> {
    const statusKeys =
        params.dispositionKeys?.length ?
            [...params.dispositionKeys]
        :   [...legacyOcmDispositionKeysForStage(params.stageKey)];
    if (!statusKeys.length) return [];
    let q = params.supabase
        .from("opportunity_customer_members")
        .select(
            `id, org_id, opportunity_id, customer_member_id, outcome_status_key,
            program_category_id, location_program_categories(key, label), schedule_type, location_id, program_room_cohort_key, start_date,
            updated_at, created_at,
            opportunities!inner (
                id, name, title, status_key, customer_id, primary_person_id, primary_contact_id, work_unit_id, location_id, metadata, created_at, updated_at
            ),
            customer_members (
                id, display_name, first_name, last_name, dob, person_id, relationship, is_active
            )`
        )
        .eq("org_id", params.orgId)
        .eq("opportunities.work_unit_id", params.workUnitId)
        .in("outcome_status_key", statusKeys);

    q = applyOcmLocationScopeToQuery(q, params.recordScopeConstraints, params.locationScopeSource);

    const { data, error } = await q;
    if (error) {
        throw new Error(`ocm enrollment-track query failed: ${error.message}`);
    }

    const rows = (data ?? []) as unknown as OcmEnrollmentTrackQueryRow[];
    return filterOcmEnrollmentTrackRowsByLocationScope(
        rows,
        params.recordScopeConstraints,
        params.locationScopeSource,
    );
}

function opportunityPreviewFromOcmRow(row: OcmEnrollmentTrackQueryRow) {
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

/** @deprecated Use ProcessChildTrackLaneContext — kept for import stability. */
export type OcmEnrollmentTrackLaneContext = ProcessChildTrackLaneContext;

export function resolveOcmEnrollmentTrackLaneContext(params: {
    executableQueueKey: string;
}): ProcessChildTrackLaneContext | null {
    if (!isChildGrainLaneBuildersEnabled(params.executableQueueKey)) return null;
    const legacy = legacyChildTrackLaneForQueueKey(params.executableQueueKey);
    if (!legacy) return null;
    return {
        ...legacy,
        membershipSource: "child_grain_flag",
        locationScopeSource: "ocm_site",
    };
}

export function buildOcmEnrollmentTrackQueueRow(
    row: OcmEnrollmentTrackQueryRow,
    enrichedOpp: Record<string, unknown> | null,
    lane: ProcessChildTrackLaneContext,
): Record<string, unknown> {
    const opp = readOpportunity(row);
    const cm = readCustomerMember(row);
    const childDisplayName = readCustomerMemberDisplayName(cm);
    const programLine = programLineFromOcm(row);
    const lifecycleStatus = row.outcome_status_key?.trim() || null;
    const base = enrichedOpp ?? (opportunityPreviewFromOcmRow(row) as Record<string, unknown>);
    const ocmLocationId = row.location_id?.trim() || null;
    const oppLocationId = opp.location_id?.trim() || null;

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
            enrollment_track_stage_key: lane.stageKey,
            enrollment_track_stage_label: lane.stageLabel,
        _child_display_name: childDisplayName,
        _crm_compact_children: buildQueueRelevantCrmCompactChildren({
            row: {
                ...base,
                _inquiry_children:
                    base._inquiry_children ??
                    (base.metadata != null &&
                    typeof base.metadata === "object" &&
                    !Array.isArray(base.metadata)
                        ? (base.metadata as { inquiry_children?: unknown }).inquiry_children
                        : undefined),
            },
            activeSubjectId: row.id,
            activeDisplayName: childDisplayName,
            activeProgramLine: programLine,
            dispositionKeys: lane.dispositionKeys,
        }),
        _queue_lane_disposition_keys: lane.dispositionKeys ?? null,
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
            enrollment_track_stage_key: lane.stageKey,
        },
        _ocm_enrollment_track_row: {
            opportunity_customer_member_id: row.id,
            opportunity_id: row.opportunity_id,
            stage_key: lane.stageKey,
            stage_label: lane.stageLabel,
            disposition_keys: lane.dispositionKeys ?? null,
            outcome_status_key: lifecycleStatus,
            location_id: ocmLocationId,
            program_room_cohort_key: row.program_room_cohort_key?.trim() || null,
            program_key: programKeyFromChildGrainOcmRow(row),
            program_category_id: row.program_category_id?.trim() || null,
            schedule_type: row.schedule_type?.trim() || null,
            start_date: row.start_date?.trim() || null,
        },
        // Per-subject placement hints for honest QueueRowContext (Phase A).
        _row_subject_placement: {
            location_id: ocmLocationId ?? oppLocationId,
            program_key: programKeyFromChildGrainOcmRow(row),
            room_id: row.program_room_cohort_key?.trim() || null,
            schedule_key: row.schedule_type?.trim() || null,
        },
    };
}

export type OcmEnrollmentTrackLoadResult = {
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

export async function countOcmEnrollmentTrackQueueItems(params: {
    supabase: SupabaseClient;
    orgId: string;
    workUnitId: string;
    ctx: OcmEnrollmentTrackLaneContext;
    recordScopeConstraints: RecordScopeConstraints | null;
    recordScopeImpossible?: boolean;
}): Promise<number> {
    if (params.recordScopeImpossible) return 0;
    const locationScopeSource = resolveOcmLaneLocationScopeSource(params.ctx);
    const rows = await queryOcmEnrollmentTrackRows({
        supabase: params.supabase,
        orgId: params.orgId,
        workUnitId: params.workUnitId,
        stageKey: params.ctx.stageKey,
        dispositionKeys: params.ctx.dispositionKeys,
        recordScopeConstraints: params.recordScopeConstraints,
        locationScopeSource,
    });
    return rows.length;
}

export async function loadOcmEnrollmentTrackQueueItems(params: {
    supabase: SupabaseClient;
    orgId: string;
    workUnitId: string;
    ctx: OcmEnrollmentTrackLaneContext;
    recordScopeConstraints: RecordScopeConstraints | null;
    recordScopeImpossible?: boolean;
    limit: number;
    offset: number;
    enrichOpportunityRows: (
        rows: Array<ReturnType<typeof opportunityPreviewFromOcmRow>>,
    ) => Promise<{
        rows: Array<Record<string, unknown>>;
        queueListSubtimings?: OcmEnrollmentTrackLoadResult["enrichmentSubtimings"];
    }>;
}): Promise<OcmEnrollmentTrackLoadResult> {
    if (params.recordScopeImpossible) {
        return { items: [], total: 0 };
    }

    const locationScopeSource = resolveOcmLaneLocationScopeSource(params.ctx);
    const matched = await queryOcmEnrollmentTrackRows({
        supabase: params.supabase,
        orgId: params.orgId,
        workUnitId: params.workUnitId,
        stageKey: params.ctx.stageKey,
        dispositionKeys: params.ctx.dispositionKeys,
        recordScopeConstraints: params.recordScopeConstraints,
        locationScopeSource,
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
        buildOcmEnrollmentTrackQueueRow(row, enrichedByOppId.get(row.opportunity_id) ?? null, params.ctx),
    );

    return {
        items,
        total,
        enrichmentSubtimings: enrichedPack.queueListSubtimings,
    };
}

/** @internal test export */
export const __testing = {
    buildOcmEnrollmentTrackQueueRow,
    queryOcmEnrollmentTrackRows,
    resolveOcmEnrollmentTrackLaneContext,
};
