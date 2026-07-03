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

type PiRow = {
    id: string;
    org_id: string;
    subject_id: string;
    context_id: string | null;
    stage_key: string | null;
    state: string | null;
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
    } as OcmEnrollmentTrackQueryRow & { _process_instance_id: string };
}

const OPP_SELECT =
    "id, name, title, status_key, stage_key, customer_id, primary_person_id, primary_contact_id, work_unit_id, location_id, metadata, created_at, updated_at";
const CM_SELECT = "id, display_name, first_name, last_name, dob, person_id, relationship, is_active";

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

    const { data: piData, error: piErr } = await params.supabase
        .from("process_instances")
        .select("id, org_id, subject_id, context_id, stage_key, state, metadata, updated_at, created_at")
        .eq("org_id", params.orgId)
        .eq("process_key", ENROLLMENT_PROCESS_KEY)
        .eq("stage_key", stageKey);
    if (piErr) throw new Error(`process_instances enrollment-track query failed: ${piErr.message}`);
    const piRows = (piData ?? []) as PiRow[];
    if (!piRows.length) return [];

    const contextIds = [...new Set(piRows.map((p) => p.context_id).filter((v): v is string => !!v))];
    const subjectIds = [...new Set(piRows.map((p) => p.subject_id).filter(Boolean))];
    const programCatIds = [
        ...new Set(piRows.map((p) => metaStr(p.metadata, "program_category_id")).filter((v): v is string => !!v)),
    ];

    // Resolve context opportunities AND filter to the work unit (inner-join semantics).
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

    const rows: OcmEnrollmentTrackQueryRow[] = [];
    for (const pi of piRows) {
        // Only include instances whose context opportunity is in this work unit.
        const opp = pi.context_id ? oppById.get(pi.context_id) : null;
        if (!opp) continue;
        const cm = cmById.get(pi.subject_id) ?? null;
        const catId = metaStr(pi.metadata, "program_category_id");
        const cat = catId ? catById.get(catId) ?? null : null;
        rows.push(
            mapProcessInstanceToTrackRow(
                pi,
                opp as OcmEnrollmentTrackQueryRow["opportunities"] as never,
                cm as never,
                cat,
            ),
        );
    }
    return rows;
}
