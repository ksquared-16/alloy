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
type OppRow = { id: string; stage_key: string | null; status_key: string | null; work_unit_id: string | null };
type MemberRow = { id: string; is_active: boolean | null };

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
): ProcessParticipant<EnrollmentAttributes>[] {
    const oppById = new Map(opportunities.map((o) => [o.id, o]));
    const memberById = new Map(members.map((m) => [m.id, m]));
    const out: ProcessParticipant<EnrollmentAttributes>[] = [];
    for (const pi of piRows) {
        const opp = pi.context_id ? oppById.get(pi.context_id) : undefined;
        if (!opp) continue;
        const member = memberById.get(pi.subject_id);
        out.push(
            buildProcessParticipant<EnrollmentAttributes>(pi, {
                contextStageKey: opp.stage_key ?? null,
                scopeId: opp.work_unit_id ?? null,
                attributes: {
                    contextStatusKey: opp.status_key ?? null,
                    subjectActive: member?.is_active !== false,
                    waitlistRank: null,
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

    if (scopeId) {
        // Scope at the source: this work unit's opportunities, then their enrollment instances.
        const { data: oppData, error: oppErr } = await supabase
            .from("opportunities")
            .select("id, stage_key, status_key, work_unit_id")
            .eq("org_id", orgId)
            .eq("work_unit_id", scopeId);
        if (oppErr) throw new Error(oppErr.message);
        opportunities = (oppData ?? []) as OppRow[];
        if (!opportunities.length) return [];
        piRows = (
            await fetchIn<PiRow>(supabase, PROCESS_INSTANCES_TABLE, PI_COLUMNS, "context_id", opportunities.map((o) => o.id), orgId)
        ).filter((pi) => pi.process_key === ENROLLMENT_PROCESS_KEY);
    } else {
        const { data: piData, error: piErr } = await supabase
            .from(PROCESS_INSTANCES_TABLE)
            .select(PI_COLUMNS)
            .eq("org_id", orgId)
            .eq("process_key", ENROLLMENT_PROCESS_KEY);
        if (piErr) throw new Error(piErr.message);
        piRows = (piData ?? []) as PiRow[];
        opportunities = await fetchIn<OppRow>(
            supabase,
            "opportunities",
            "id, stage_key, status_key, work_unit_id",
            "id",
            piRows.map((pi) => pi.context_id ?? "").filter(Boolean),
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
    return buildEnrollmentParticipants(piRows, opportunities, members);
}

/** The Enrollment projection — contract + loader, satisfying the engine port. */
export const enrollmentProjection: ProcessParticipantProjection<EnrollmentAttributes> = {
    contract: ENROLLMENT_PARTICIPATION_CONTRACT,
    load: loadEnrollmentParticipants,
};
