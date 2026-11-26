/**
 * Enrollment Definition — the participant Projection (implements the engine port).
 *
 * Owns the Enrollment-specific joins: process_instances ⋈ opportunities (context: stage, status,
 * work unit) ⋈ customer_members (subject: is_active). Resolves the generic `scopeId` = the
 * opportunity's work_unit_id and fills the EnrollmentAttributes bag. The engine only sees the
 * ProcessParticipant[] this returns — it never learns these table names.
 *
 * The stitch is pure (tested directly); `load` is thin I/O around it. NOT wired to any consumer.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { PROCESS_INSTANCES_TABLE } from "@/lib/process/processInstances";
import {
    buildProcessParticipant,
    type ProcessParticipant,
    type ProcessParticipantProjection,
    type ProcessParticipantScope,
} from "@/lib/process/engine";
import {
    ENROLLMENT_PARTICIPATION_CONTRACT,
    type EnrollmentAttributes,
} from "./enrollmentContract";

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
};
type OppRow = {
    id: string;
    stage_key: string | null;
    status_key: string | null;
    work_unit_id: string | null;
    location_id: string | null;
};
type MemberRow = { id: string; is_active: boolean | null };
type OcmLocationRow = {
    opportunity_id: string;
    customer_member_id: string;
    location_id: string | null;
};

/**
 * Pure stitch: PI rows ⋈ opportunity context ⋈ customer_member subject → participants.
 *
 * Opportunity context is required (inner join). Orphan process_instances whose lead was
 * deleted must not inflate dashboard Family Leads / Pipeline Children while Work Views
 * (opportunity-grain queues) correctly show zero.
 */
export function buildEnrollmentParticipants(
    piRows: readonly PiRow[],
    opportunities: readonly OppRow[],
    members: readonly MemberRow[],
    ocmLocations: readonly OcmLocationRow[] = [],
    /**
     * OCM context id -> its Opportunity, for journeys anchored to an Enrollment Participation.
     *
     * Empty by default, which is exactly the historical behaviour: a context id that is already an
     * Opportunity id resolves to itself. Without it, every participation-anchored journey fails the
     * inner join below and vanishes from Family Leads, Pipeline Children and every Work View — the
     * same silent drop, one layer down.
     */
    opportunityIdByContextId: ReadonlyMap<string, string> = new Map(),
): ProcessParticipant<EnrollmentAttributes>[] {
    const oppById = new Map(opportunities.map((o) => [o.id, o]));
    const memberById = new Map(members.map((m) => [m.id, m]));
    const ocmLocationByPair = new Map(
        ocmLocations.map((row) => [`${row.opportunity_id}:${row.customer_member_id}`, row.location_id] as const),
    );
    const out: ProcessParticipant<EnrollmentAttributes>[] = [];
    for (const pi of piRows) {
        // The journey's Opportunity, whichever anchor it uses.
        const opportunityId = pi.context_id
            ? opportunityIdByContextId.get(pi.context_id) ?? pi.context_id
            : null;
        const opp = opportunityId ? oppById.get(opportunityId) : undefined;
        if (!opp) continue;
        const member = memberById.get(pi.subject_id);
        // Keyed by the OPPORTUNITY, which is what the OCM location rows are keyed by.
        const subjectLocationId =
            (opportunityId
                ? ocmLocationByPair.get(`${opportunityId}:${pi.subject_id}`)
                : null) ?? null;
        out.push(
            buildProcessParticipant<EnrollmentAttributes>(pi, {
                contextStageKey: opp.stage_key ?? null,
                scopeId: opp.work_unit_id ?? null,
                attributes: {
                    contextStatusKey: opp.status_key ?? null,
                    subjectActive: member?.is_active !== false,
                    waitlistRank: null,
                    contextLocationId: opp.location_id?.trim() || null,
                    subjectLocationId: subjectLocationId?.trim() || null,
                },
            }),
        );
    }
    return out;
}

/** Chunked `.in(...)` so large id sets never silently truncate at PostgREST limits. */
async function fetchIn<T>(
    supabase: SupabaseClient,
    table: string,
    columns: string,
    column: string,
    ids: readonly string[],
    orgId: string,
): Promise<T[]> {
    const unique = Array.from(new Set(ids)).filter(Boolean);
    if (!unique.length) return [];
    // Chunk small enough that the serialized `.in.(...)` GET stays under the server's URI limit. Ids
    // here are 36-char UUIDs (~37 chars each in the query), so 400 produced a ~15.6KB URL that the
    // gateway rejected with 414/"URI too long" — the WU-scoped metric resolve 500'd on a work unit
    // with 2400 opportunities, and because resolve batches keys, that one failure took the whole KPI
    // settlement down with it. 100 UUIDs ≈ 3.9KB, comfortably under any reasonable limit; the loop
    // already fetches every chunk, so correctness is unchanged.
    const CHUNK = 100;
    const out: T[] = [];
    for (let i = 0; i < unique.length; i += CHUNK) {
        const { data, error } = await supabase
            .from(table)
            .select(columns)
            .eq("org_id", orgId)
            .in(column, unique.slice(i, i + CHUNK));
        if (error) throw new Error(error.message);
        out.push(...((data ?? []) as T[]));
    }
    return out;
}

const PI_COLUMNS =
    "id, org_id, process_key, subject_type, subject_id, context_id, stage_key, state, close_reason_key";

async function loadEnrollmentParticipants(
    supabase: SupabaseClient,
    scope: ProcessParticipantScope,
): Promise<ProcessParticipant<EnrollmentAttributes>[]> {
    const orgId = scope.orgId;
    const scopeId = scope.scopeId?.trim() || null;

    let piRows: PiRow[];
    let opportunities: OppRow[];
    /** OCM context id -> its Opportunity, filled by whichever branch below runs. */
    const opportunityIdByContextId = new Map<string, string>();

    if (scopeId) {
        // Work-unit scope must NOT mean "only opportunities parked on this work_unit_id".
        // After Move to Waitlist, families often remain on the Lead WU while child PIs are
        // waitlist — child-grain queues already resolve by effective stage. Pipeline Children /
        // active_leads must use the same authorized Enrollment population: opportunities in the
        // SAME DEPARTMENT as the scoped work unit (process footprint), not a single WU park.
        const { data: wuRow, error: wuErr } = await supabase
            .from("work_units")
            .select("id, department_id")
            .eq("org_id", orgId)
            .eq("id", scopeId)
            .maybeSingle();
        if (wuErr) throw new Error(wuErr.message);
        const departmentId =
            wuRow && typeof (wuRow as { department_id?: unknown }).department_id === "string"
                ? String((wuRow as { department_id: string }).department_id).trim()
                : null;

        let workUnitIds: string[] = [scopeId];
        if (departmentId) {
            const { data: deptUnits, error: deptWuErr } = await supabase
                .from("work_units")
                .select("id")
                .eq("org_id", orgId)
                .eq("department_id", departmentId);
            if (deptWuErr) throw new Error(deptWuErr.message);
            const ids = (deptUnits ?? [])
                .map((r) => (typeof (r as { id?: unknown }).id === "string" ? String((r as { id: string }).id) : ""))
                .filter(Boolean);
            if (ids.length) workUnitIds = ids;
        }

        const { data: oppData, error: oppErr } = await supabase
            .from("opportunities")
            .select("id, stage_key, status_key, work_unit_id, location_id")
            .eq("org_id", orgId)
            .in("work_unit_id", workUnitIds);
        if (oppErr) throw new Error(oppErr.message);
        opportunities = (oppData ?? []) as OppRow[];
        if (!opportunities.length) return [];
        /*
         * Journeys are found by BOTH anchors.
         *
         * Fetching by Opportunity id alone stopped finding anything the moment Enrollment journeys
         * began anchoring to the child's Enrollment Participation — and the failure is a shorter
         * list, not an error, so a Work View would simply have looked empty.
         */
        const scopedParticipations = await fetchIn<{ id: string; opportunity_id: string | null }>(
            supabase,
            "opportunity_customer_members",
            "id, opportunity_id",
            "opportunity_id",
            opportunities.map((o) => o.id),
            orgId,
        );
        for (const row of scopedParticipations) {
            if (row.opportunity_id) opportunityIdByContextId.set(String(row.id), String(row.opportunity_id));
        }
        piRows = (
            await fetchIn<PiRow>(
                supabase,
                PROCESS_INSTANCES_TABLE,
                PI_COLUMNS,
                "context_id",
                [...opportunities.map((o) => o.id), ...scopedParticipations.map((r) => String(r.id))],
                orgId,
            )
        ).filter((pi) => pi.process_key === ENROLLMENT_PROCESS_KEY);
    } else {
        const { data: piData, error: piErr } = await supabase
            .from(PROCESS_INSTANCES_TABLE)
            .select(PI_COLUMNS)
            .eq("org_id", orgId)
            .eq("process_key", ENROLLMENT_PROCESS_KEY);
        if (piErr) throw new Error(piErr.message);
        piRows = (piData ?? []) as PiRow[];
        // Resolve participation anchors to their Opportunity BEFORE loading opportunities, or the
        // journeys that use them find no context and are dropped by the inner join.
        const contextIds = [...new Set(piRows.map((pi) => pi.context_id ?? "").filter(Boolean))];
        const contextParticipations = await fetchIn<{ id: string; opportunity_id: string | null }>(
            supabase,
            "opportunity_customer_members",
            "id, opportunity_id",
            "id",
            contextIds,
            orgId,
        );
        for (const row of contextParticipations) {
            if (row.opportunity_id) opportunityIdByContextId.set(String(row.id), String(row.opportunity_id));
        }
        opportunities = await fetchIn<OppRow>(
            supabase,
            "opportunities",
            "id, stage_key, status_key, work_unit_id, location_id",
            "id",
            contextIds.map((id) => opportunityIdByContextId.get(id) ?? id),
            orgId,
        );
    }

    if (!piRows.length) return [];
    const members = await fetchIn<MemberRow>(
        supabase,
        "customer_members",
        "id, is_active",
        "id",
        piRows.map((pi) => pi.subject_id),
        orgId,
    );
    const ocmLocations = await fetchIn<OcmLocationRow>(
        supabase,
        "opportunity_customer_members",
        "opportunity_id, customer_member_id, location_id",
        "opportunity_id",
        opportunities.map((o) => o.id),
        orgId,
    );
    return buildEnrollmentParticipants(piRows, opportunities, members, ocmLocations, opportunityIdByContextId);
}

/** The Enrollment projection — contract + loader, satisfying the engine port. */
export const enrollmentProjection: ProcessParticipantProjection<EnrollmentAttributes> = {
    contract: ENROLLMENT_PARTICIPATION_CONTRACT,
    load: loadEnrollmentParticipants,
};
