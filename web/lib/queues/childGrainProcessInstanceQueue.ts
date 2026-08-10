/**
 * Read cutover (Slice A): child-grain enrollment queue rows sourced from `process_instances`
 * (the runtime owner) instead of `opportunity_customer_members` (OCM, legacy).
 *
 * process_instances is generic (no FK to opportunities/customer_members), so refs are resolved
 * explicitly and mapped to the existing OcmEnrollmentTrackQueryRow shape — the downstream row
 * builder is unchanged. OCM remains a temporary fallback (see queryOcmEnrollmentTrackRows).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import type { OcmEnrollmentTrackQueryRow } from "@/lib/queues/ocmEnrollmentTrackQueueBuilder";
import {
    piEffectiveStageKey,
    processInstanceBelongsToLane,
} from "@/lib/queues/enrollmentEffectiveStageMembership";
import { buildEnrollmentParticipants } from "@/lib/process/definitions/enrollment/enrollmentProjection";
import { isLiveEnrollmentParticipant } from "@/lib/process/definitions/enrollment/enrollmentSemantics";

type PiRow = {
    id: string;
    org_id: string;
    process_key: string;
    subject_type: string;
    subject_id: string;
    context_id: string | null;
    stage_key: string | null;
    state: string | null;
    close_reason_key: string | null;
    metadata: Record<string, unknown> | null;
    updated_at: string | null;
    created_at: string | null;
};

function metaStr(meta: Record<string, unknown> | null | undefined, key: string): string | null {
    const v = meta?.[key];
    return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Pure mapper: process_instance (+ resolved opportunity/customer_member/program category) → the
 * child-grain row shape the queue builder consumes. Exported for tests.
 */
export function mapProcessInstanceToTrackRow(
    pi: PiRow,
    opp: OcmEnrollmentTrackQueryRow["opportunities"] extends infer O ? (O extends Array<infer E> ? E : O) : never,
    cm: NonNullable<OcmEnrollmentTrackQueryRow["customer_members"]> extends Array<infer E> ? E : NonNullable<OcmEnrollmentTrackQueryRow["customer_members"]>,
    programCategory: { key?: string | null; label?: string | null } | null,
): OcmEnrollmentTrackQueryRow {
    return {
        // Row identity: use the process_instance id. During the OCM bridge the OCM id is preserved
        // in metadata.migrated_from_ocm_id for any consumer still keyed on it.
        id: (metaStr(pi.metadata, "migrated_from_ocm_id") ?? pi.id),
        org_id: pi.org_id,
        opportunity_id: pi.context_id ?? "",
        customer_member_id: pi.subject_id,
        outcome_status_key: pi.state,
        program_category_id: metaStr(pi.metadata, "program_category_id"),
        location_program_categories: programCategory,
        schedule_type: metaStr(pi.metadata, "schedule_type"),
        location_id: metaStr(pi.metadata, "location_id"),
        program_room_cohort_key: metaStr(pi.metadata, "program_room_cohort_key"),
        start_date: metaStr(pi.metadata, "start_date"),
        updated_at: pi.updated_at,
        created_at: pi.created_at,
        opportunities: opp,
        customer_members: cm,
        // process-instance provenance for downstream write-cutover + drawer resolution.
        _process_instance_id: pi.id,
        // The child's EFFECTIVE stage, carried explicitly. A consumer that reads the opportunity's
        // stage instead is right only while the child rides the family track — a branched child
        // (own `stage_key`) would be reported at its family's stage, which is the wrong answer and
        // was invisible while every consumer filtered to one lane at a time.
        _effective_stage_key: piEffectiveStageKey(
            pi.stage_key,
            (opp as { stage_key?: string | null } | null)?.stage_key ?? null,
        ),
    } as OcmEnrollmentTrackQueryRow & { _process_instance_id: string; _effective_stage_key: string | null };
}

const OPP_SELECT =
    "id, name, title, status_key, stage_key, customer_id, primary_person_id, primary_contact_id, work_unit_id, location_id, metadata, created_at, updated_at";
const CM_SELECT = "id, display_name, first_name, last_name, dob, person_id, relationship, is_active";
const PI_SELECT =
    "id, org_id, process_key, subject_type, subject_id, context_id, stage_key, state, close_reason_key, metadata, updated_at, created_at";

type ResolvedRefs = {
    oppById: Map<string, Record<string, unknown>>;
    cmById: Map<string, Record<string, unknown>>;
    catById: Map<string, { key?: string | null; label?: string | null }>;
};

/**
 * Resolve everything a set of process instances needs to become track rows: the CONTEXT opportunities
 * (filtered to the work unit — inner-join semantics, so an instance whose context is elsewhere simply
 * has no opportunity here), the SUBJECT children, and the program categories.
 *
 * Shared by both membership rules below. The rules differ in which instances they admit; what a child
 * row is made of does not, and two copies of this resolution would be two answers to that.
 */
async function resolveTrackRowRefs(params: {
    supabase: SupabaseClient;
    orgId: string;
    workUnitId: string;
    piRows: readonly PiRow[];
}): Promise<ResolvedRefs> {
    const contextIds = [...new Set(params.piRows.map((p) => p.context_id).filter((v): v is string => !!v))];
    const subjectIds = [...new Set(params.piRows.map((p) => p.subject_id).filter(Boolean))];
    const programCatIds = [
        ...new Set(
            params.piRows.map((p) => metaStr(p.metadata, "program_category_id")).filter((v): v is string => !!v),
        ),
    ];

    const oppById = new Map<string, Record<string, unknown>>();
    if (contextIds.length) {
        const { data, error } = await params.supabase
            .from("opportunities")
            .select(OPP_SELECT)
            .eq("org_id", params.orgId)
            .eq("work_unit_id", params.workUnitId)
            .in("id", contextIds);
        if (error) throw new Error(`process-instance opportunity resolve failed: ${error.message}`);
        for (const o of data ?? []) oppById.set(String((o as { id: string }).id), o as Record<string, unknown>);
    }

    const cmById = new Map<string, Record<string, unknown>>();
    if (subjectIds.length) {
        const { data, error } = await params.supabase
            .from("customer_members")
            .select(CM_SELECT)
            .eq("org_id", params.orgId)
            .in("id", subjectIds);
        if (error) throw new Error(`process-instance customer_member resolve failed: ${error.message}`);
        for (const c of data ?? []) cmById.set(String((c as { id: string }).id), c as Record<string, unknown>);
    }

    const catById = new Map<string, { key?: string | null; label?: string | null }>();
    if (programCatIds.length) {
        const { data } = await params.supabase
            .from("location_program_categories")
            .select("id, key, label")
            .eq("org_id", params.orgId)
            .in("id", programCatIds);
        for (const c of data ?? []) {
            const rec = c as { id: string; key?: string | null; label?: string | null };
            catById.set(String(rec.id), { key: rec.key, label: rec.label });
        }
    }

    return { oppById, cmById, catById };
}

/** Map one admitted instance + its in-scope opportunity into a track row. */
function toTrackRow(pi: PiRow, opp: Record<string, unknown>, refs: ResolvedRefs): OcmEnrollmentTrackQueryRow {
    const cm = refs.cmById.get(pi.subject_id) ?? null;
    const catId = metaStr(pi.metadata, "program_category_id");
    const cat = catId ? refs.catById.get(catId) ?? null : null;
    return mapProcessInstanceToTrackRow(
        pi,
        opp as OcmEnrollmentTrackQueryRow["opportunities"] as never,
        cm as never,
        cat,
    );
}

/**
 * Query enrollment child-grain rows from process_instances for a stage, scoped to a work unit
 * (via the context opportunity). Returns [] when no instances exist (caller may fall back to OCM).
 */
export async function queryEnrollmentProcessInstanceTrackRows(params: {
    supabase: SupabaseClient;
    orgId: string;
    workUnitId: string;
    stageKey: string;
}): Promise<OcmEnrollmentTrackQueryRow[]> {
    const stageKey = params.stageKey.trim();
    if (!stageKey) return [];

    // Membership is by EFFECTIVE stage (PI.stage_key ?? opportunity.stage_key), the same rule the
    // engine/metrics use. Fetch instances at this stage OR with no own stage (riding the family
    // track); the in-code filter below keeps only those whose effective stage matches this lane, so
    // a freshly-created child (null stage) surfaces in its household's stage lane (e.g. Lead).
    const { data: piData, error: piErr } = await params.supabase
        .from("process_instances")
        .select(PI_SELECT)
        .eq("org_id", params.orgId)
        .eq("process_key", ENROLLMENT_PROCESS_KEY)
        .or(`stage_key.eq.${stageKey},stage_key.is.null`);
    if (piErr) throw new Error(`process_instances enrollment-track query failed: ${piErr.message}`);
    const piRows = (piData ?? []) as PiRow[];
    if (!piRows.length) return [];

    const refs = await resolveTrackRowRefs({ ...params, piRows });

    const rows: OcmEnrollmentTrackQueryRow[] = [];
    for (const pi of piRows) {
        // Only include instances whose context opportunity is in this work unit.
        const opp = pi.context_id ? refs.oppById.get(pi.context_id) : null;
        if (!opp) continue;
        // Effective-stage membership: keep only children whose PI.stage_key ?? opp.stage_key == lane.
        const oppStageKey = typeof opp.stage_key === "string" ? opp.stage_key : null;
        if (!processInstanceBelongsToLane({ piStageKey: pi.stage_key, contextStageKey: oppStageKey, laneStageKey: stageKey })) {
            continue;
        }
        rows.push(toTrackRow(pi, opp, refs));
    }
    return rows;
}

/**
 * PARTICIPATION MEMBERSHIP — every child with a LIVE enrollment participation in this work unit,
 * whatever stage they are at.
 *
 * This is the other membership rule, and it is not "the stage rule run over every stage". A
 * stage-independent lens asks a different question: not "who is at stage X" but "whose enrollment
 * journey is still running". Enumerating stages would answer the first question repeatedly and still
 * get the second one wrong — it would admit a child whose instance is CLOSED but whose family case
 * still sits in an active stage.
 *
 * The predicate is NOT redefined here. `isLiveEnrollmentParticipant` is the Enrollment Definition's
 * ratified gate (instance open · subject active · context not closed), and this is its first
 * consumer. Membership belongs to the Business Process; the queue only asks.
 *
 * Effective stage still travels with each row (`_effective_stage_key`) — for DISPLAY, not membership.
 */
export async function queryEnrollmentProcessInstanceParticipationRows(params: {
    supabase: SupabaseClient;
    orgId: string;
    workUnitId: string;
}): Promise<OcmEnrollmentTrackQueryRow[]> {
    const { data: piData, error: piErr } = await params.supabase
        .from("process_instances")
        .select(PI_SELECT)
        .eq("org_id", params.orgId)
        .eq("process_key", ENROLLMENT_PROCESS_KEY);
    if (piErr) throw new Error(`process_instances enrollment-participation query failed: ${piErr.message}`);
    const piRows = (piData ?? []) as PiRow[];
    if (!piRows.length) return [];

    const refs = await resolveTrackRowRefs({ ...params, piRows });

    // In-scope instances only (context opportunity resolved inside this work unit), then the
    // Definition's own liveness gate over the canonical participant shape.
    const inScope = piRows.filter((pi) => pi.context_id && refs.oppById.has(pi.context_id));
    if (!inScope.length) return [];

    const participants = buildEnrollmentParticipants(
        inScope,
        inScope.map((pi) => {
            const opp = refs.oppById.get(pi.context_id!)!;
            return {
                id: String(opp.id),
                stage_key: typeof opp.stage_key === "string" ? opp.stage_key : null,
                status_key: typeof opp.status_key === "string" ? opp.status_key : null,
                work_unit_id: typeof opp.work_unit_id === "string" ? opp.work_unit_id : null,
                location_id: typeof opp.location_id === "string" ? opp.location_id : null,
            };
        }),
        [...refs.cmById.values()].map((cm) => ({
            id: String(cm.id),
            is_active: typeof cm.is_active === "boolean" ? cm.is_active : null,
        })),
    );
    const live = new Set(participants.filter(isLiveEnrollmentParticipant).map((p) => p.participantId));

    const rows: OcmEnrollmentTrackQueryRow[] = [];
    for (const pi of inScope) {
        if (!live.has(pi.id)) continue;
        rows.push(toTrackRow(pi, refs.oppById.get(pi.context_id!)!, refs));
    }
    return rows;
}
