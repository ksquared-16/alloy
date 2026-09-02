/**
 * Read cutover (Slice A): child-grain enrollment queue rows sourced from `process_instances`
 * (the runtime owner) instead of `opportunity_customer_members` (OCM, legacy).
 *
 * process_instances is generic (no FK to opportunities/customer_members), so refs are resolved
 * explicitly and mapped to the existing OcmEnrollmentTrackQueryRow shape — the downstream row
 * builder is unchanged. OCM remains a temporary fallback (see queryOcmEnrollmentTrackRows).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { withDbTiming } from "@/lib/admin/dbQueryTiming";
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
        /*
         * The Opportunity's OWN id — never `pi.context_id`.
         *
         * Once a journey anchors to its Enrollment Participation the context id is an OCM id, and
         * writing that here produces a row that looks entirely ordinary while pointing at the wrong
         * table. The resolved Opportunity is already in hand, so it answers for itself.
         */
        opportunity_id: String((opp as { id?: string } | null)?.id ?? ""),
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
// `persons` is embedded because it OWNS a person-backed child's identity (law 34). Without it the
// queue row title falls back to the `customer_members` mirror and can disagree with every other
// surface about the same child's name.
const CM_SELECT =
    "id, display_name, first_name, last_name, dob, person_id, relationship, is_active, persons(first_name, last_name, full_name, date_of_birth)";
const PI_SELECT =
    "id, org_id, process_key, subject_type, subject_id, context_id, stage_key, state, close_reason_key, metadata, updated_at, created_at";

type ResolvedRefs = {
    oppById: Map<string, Record<string, unknown>>;
    cmById: Map<string, Record<string, unknown>>;
    catById: Map<string, { key?: string | null; label?: string | null }>;
    /** OCM context id -> its Opportunity. Empty for journeys anchored to an Opportunity already. */
    opportunityIdByContextId: Map<string, string>;
};

/**
 * Resolve everything a set of process instances needs to become track rows: the CONTEXT opportunities,
 * the SUBJECT children, and the program categories.
 *
 * Opportunities are resolved by org + context id only — NOT by the stage work unit's
 * `opportunities.work_unit_id`. Child-grain membership is Effective Process Position
 * (`PI.stage_key ?? opportunity.stage_key`). After Move to Waitlist the family opportunity often
 * remains parked on the Lead work unit while participant PIs are `waitlist`; filtering context
 * opportunities to the Waitlist work unit dropped those children from Waitlist rows/pills.
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

    /*
     * A CONTEXT ID IS NOT ALWAYS AN OPPORTUNITY ID.
     *
     * Enrollment journeys anchor to the child's Enrollment Participation, so `context_id` is an OCM
     * id and looking it up in `opportunities` matches nothing. The row is then dropped by
     * `if (!opp) continue` below — silently, and for EVERY journey created after the convergence,
     * which would have emptied the child-grain Work Views without a single error anywhere.
     *
     * The participation knows its Opportunity, so it is resolved through the participation and the
     * rest of this function is unchanged. Context ids that really are Opportunity ids simply find no
     * participation and pass straight through, so journeys under the older anchor keep working.
     */
    /*
     * SERIAL DEPTH, NOT QUERY COST, OWNED THIS LEG.
     *
     * Measured on a 17-row Waitlist page: process_instances 66ms, then ocm_resolve 60ms ->
     * opportunities 58ms -> customer_members 66ms -> program_categories 58ms, all in a row for ~308ms.
     * Only ocm_resolve -> opportunities is a real dependency: `customer_members` is keyed by
     * `subject_id` and `location_program_categories` by `metadata.program_category_id`, and BOTH ids
     * come straight off `piRows`, which we already hold. They were waiting on a chain they are not
     * part of.
     *
     * So the OCM -> opportunity chain keeps its order and the two independent reads join it in
     * parallel. Same queries, same org scoping, same maps, same rows — only the waiting changes.
     */
    const opportunityIdByContextId = new Map<string, string>();
    const oppById = new Map<string, Record<string, unknown>>();
    const cmById = new Map<string, Record<string, unknown>>();
    const catById = new Map<string, { key?: string | null; label?: string | null }>();

    const contextChain = (async () => {
        if (contextIds.length) {
            const { data, error } = await withDbTiming("member.ocm_resolve", { n: contextIds.length }, async () =>
                params.supabase
                    .from("opportunity_customer_members")
                    .select("id, opportunity_id")
                    .eq("org_id", params.orgId)
                    .in("id", contextIds));
            if (error) throw new Error(`process-instance participation resolve failed: ${error.message}`);
            for (const r of data ?? []) {
                const row = r as { id: string; opportunity_id: string | null };
                // A context-free participation has no Opportunity. That is an ordinary answer, and it
                // leaves the journey with nothing for an opportunity-shaped queue row to be built from.
                if (row.opportunity_id) opportunityIdByContextId.set(String(row.id), String(row.opportunity_id));
            }
        }
        const resolvedOpportunityIds = [
            ...new Set(contextIds.map((id) => opportunityIdByContextId.get(id) ?? id)),
        ];

        if (resolvedOpportunityIds.length) {
            const { data, error } = await withDbTiming("member.opportunities", { n: resolvedOpportunityIds.length }, async () =>
                params.supabase
                    .from("opportunities")
                    .select(OPP_SELECT)
                    .eq("org_id", params.orgId)
                    .in("id", resolvedOpportunityIds));
            if (error) throw new Error(`process-instance opportunity resolve failed: ${error.message}`);
            for (const o of data ?? []) oppById.set(String((o as { id: string }).id), o as Record<string, unknown>);
        }
    })();

    const cmRead = (async () => {
        if (subjectIds.length) {
            const { data, error } = await withDbTiming("member.customer_members", { n: subjectIds.length }, async () =>
                params.supabase
                    .from("customer_members")
                    .select(CM_SELECT)
                    .eq("org_id", params.orgId)
                    .in("id", subjectIds));
            if (error) throw new Error(`process-instance customer_member resolve failed: ${error.message}`);
            for (const c of data ?? []) cmById.set(String((c as { id: string }).id), c as Record<string, unknown>);
        }
    })();

    const catRead = (async () => {
        if (programCatIds.length) {
            const { data } = await withDbTiming("member.program_categories", { n: programCatIds.length }, async () =>
                params.supabase
                    .from("location_program_categories")
                    .select("id, key, label")
                    .eq("org_id", params.orgId)
                    .in("id", programCatIds));
            for (const c of data ?? []) {
                const rec = c as { id: string; key?: string | null; label?: string | null };
                catById.set(String(rec.id), { key: rec.key, label: rec.label });
            }
        }
    })();

    // A failure in any leg must surface exactly as it did when they ran in sequence.
    await Promise.all([contextChain, cmRead, catRead]);

    return { oppById, cmById, catById, opportunityIdByContextId };
}

/**
 * The Opportunity a journey's context points at — through the participation when that is the anchor.
 *
 * One helper rather than the expression repeated at each membership rule, because the two rules
 * admitting different instances is deliberate and them disagreeing about what a context IS is not.
 */
function resolveContextOpportunity(pi: PiRow, refs: ResolvedRefs): Record<string, unknown> | null {
    if (!pi.context_id) return null;
    const opportunityId = refs.opportunityIdByContextId.get(pi.context_id) ?? pi.context_id;
    return refs.oppById.get(opportunityId) ?? null;
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
    const { data: piData, error: piErr } = await withDbTiming("member.process_instances", { stage: stageKey }, async () =>
        params.supabase
            .from("process_instances")
            .select(PI_SELECT)
            .eq("org_id", params.orgId)
            .eq("process_key", ENROLLMENT_PROCESS_KEY)
            .or(`stage_key.eq.${stageKey},stage_key.is.null`));
    if (piErr) throw new Error(`process_instances enrollment-track query failed: ${piErr.message}`);
    const piRows = (piData ?? []) as PiRow[];
    if (!piRows.length) return [];

    const refs = await resolveTrackRowRefs({ ...params, piRows });

    const rows: OcmEnrollmentTrackQueryRow[] = [];
    for (const pi of piRows) {
        // Context opportunity must resolve (org-scoped). Lane membership is effective stage — not
        // whether the family opportunity is still parked on this stage work unit.
        const opp = resolveContextOpportunity(pi, refs);
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

    // In-scope instances only (context opportunity resolved in-org), then the
    // Definition's own liveness gate over the canonical participant shape.
    const inScope = piRows.filter((pi) => resolveContextOpportunity(pi, refs) !== null);
    if (!inScope.length) return [];

    const participants = buildEnrollmentParticipants(
        inScope,
        inScope.map((pi) => {
            const opp = resolveContextOpportunity(pi, refs)!;
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
        [],
        refs.opportunityIdByContextId,
    );
    const live = new Set(participants.filter(isLiveEnrollmentParticipant).map((p) => p.participantId));

    const rows: OcmEnrollmentTrackQueryRow[] = [];
    for (const pi of inScope) {
        if (!live.has(pi.id)) continue;
        rows.push(toTrackRow(pi, resolveContextOpportunity(pi, refs)!, refs));
    }
    return rows;
}
