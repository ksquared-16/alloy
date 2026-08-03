/**
 * Route a child participation-detail edit (program / room / site / schedule / start / notes) to the
 * correct owner by lifecycle — NEVER to OCM.
 *
 *   pre-materialization  → process_instances.metadata (draft/desired participation facts)
 *   post-materialization → the durable operational model (agreement + placement + schedule assignment)
 *
 * Keyed by the child subject (customer_member_id); the opportunity/context is resolved from the child's
 * enrollment process instance. Legacy OCM is read-only (never created, never written).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { getOperationalAgreementForMemberSite } from "@/lib/childcareOperational/enrollmentAgreementService";
import { getOperationalPlacementForAgreement } from "@/lib/childcareOperational/childPlacementService";
import { getOperationalScheduleAssignmentForAgreement } from "@/lib/childcareOperational/scheduleAssignmentService";

/** A daily time range persisted with the schedule draft. */
export type DailyHoursRange = { arrive: string; depart: string };

/** Participation facts an operator can edit inline. `outcome_status_key` (disposition) is NOT here. */
export type ChildParticipationPatch = {
    program_category_id?: string | null;
    /** Room = a location id (kept under the OCM-era column name for editor compatibility). */
    program_room_cohort_key?: string | null;
    location_id?: string | null;
    schedule_type?: string | null;
    /** Requested Start (family preferred) — not operational Start Date. */
    start_date?: string | null;
    notes?: string | null;
    /** Requested days/week when exact preferred weekdays are still unknown. */
    requested_days_per_week?: number | null;
    /** Schedule-draft extensions carried on the participation metadata (pre-materialization). */
    end_date?: string | null;
    weekdays?: number[] | null;
    scheduleTimes?: { default: DailyHoursRange | null; perDay: Record<string, DailyHoursRange> } | null;
};

export type ChildParticipationEditResult = {
    ok: boolean;
    routed: "process_instance" | "durable" | "none";
    process_instance_id?: string | null;
    agreement_id?: string | null;
    updated?: string[];
    error?: string;
};

const PARTICIPATION_KEYS: (keyof ChildParticipationPatch)[] = [
    "program_category_id",
    "program_room_cohort_key",
    "location_id",
    "schedule_type",
    "start_date",
    "notes",
    "requested_days_per_week",
];

/** Schedule-draft keys carried on participation metadata (pre-materialization only). */
const DRAFT_META_KEYS: (keyof ChildParticipationPatch)[] = ["end_date", "weekdays", "scheduleTimes"];

function cleanPatch(patch: ChildParticipationPatch): ChildParticipationPatch {
    const out: ChildParticipationPatch = {};
    for (const k of [...PARTICIPATION_KEYS, ...DRAFT_META_KEYS]) {
        if (k in patch) (out as Record<string, unknown>)[k] = patch[k] ?? null;
    }
    return out;
}

export async function applyChildParticipationEdit(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        customerMemberId: string;
        /** Optional — narrows to a specific lead when a child is on more than one. */
        opportunityId?: string | null;
        patch: ChildParticipationPatch;
        actorUserId?: string | null;
        todayYmd?: string;
    },
): Promise<ChildParticipationEditResult> {
    const patch = cleanPatch(args.patch);
    if (!Object.keys(patch).length) return { ok: true, routed: "none", updated: [] };
    const nowIso = new Date().toISOString();

    // Resolve the child's enrollment process instance (subject = child; context = lead). No OCM.
    let piQuery = supabase
        .from("process_instances")
        .select("id, context_id, metadata")
        .eq("org_id", args.orgId)
        .eq("process_key", ENROLLMENT_PROCESS_KEY)
        .eq("subject_id", args.customerMemberId);
    if (args.opportunityId) piQuery = piQuery.eq("context_id", args.opportunityId);
    const { data: piRows, error: piErr } = await piQuery.order("created_at", { ascending: false }).limit(1);
    if (piErr) return { ok: false, routed: "none", error: piErr.message };
    const pi = (piRows ?? [])[0] as { id: string; context_id: string | null; metadata: Record<string, unknown> | null } | undefined;
    if (!pi) return { ok: false, routed: "none", error: "no_enrollment_process_instance" };

    const meta = (pi.metadata ?? {}) as Record<string, unknown>;
    const siteId = (patch.location_id ?? (meta.location_id as string | null) ?? null) || null;

    // Materialized? An operational agreement for (child, site) means durable owns the facts.
    const agreement = siteId
        ? await getOperationalAgreementForMemberSite(supabase, args.orgId, args.customerMemberId, siteId)
        : null;

    if (!agreement) {
        // Pre-materialization → merge into process-instance metadata (draft participation facts,
        // incl. the schedule-draft extensions: end date, weekdays, per-day times).
        const nextMeta: Record<string, unknown> = { ...meta };
        const updated: string[] = [];
        for (const k of [...PARTICIPATION_KEYS, ...DRAFT_META_KEYS]) {
            if (k in patch) {
                nextMeta[k] = patch[k];
                updated.push(k);
            }
        }
        const { error } = await supabase
            .from("process_instances")
            .update({ metadata: nextMeta, updated_at: nowIso })
            .eq("id", pi.id)
            .eq("org_id", args.orgId);
        if (error) return { ok: false, routed: "process_instance", process_instance_id: pi.id, error: error.message };
        return { ok: true, routed: "process_instance", process_instance_id: pi.id, updated };
    }

    // Post-materialization → durable model. Inline edits are in-place corrections of the CURRENT operational
    // rows (effective-dated transfers remain a separate durable action). Never touches OCM.
    const updated: string[] = [];
    const todayYmd = args.todayYmd ?? nowIso.slice(0, 10);

    // Agreement: site / start / notes (+ billing/funding via metadata) live on the relationship header.
    const agrPatch: Record<string, unknown> = {};
    if ("start_date" in patch) agrPatch.start_date = patch.start_date;
    if ("location_id" in patch && patch.location_id) agrPatch.site_location_id = patch.location_id;
    if ("notes" in patch) agrPatch.metadata = { ...((agreement.metadata as Record<string, unknown>) ?? {}), notes: patch.notes };
    if (Object.keys(agrPatch).length) {
        agrPatch.updated_at = nowIso;
        const { error } = await supabase.from("child_enrollment_agreements").update(agrPatch).eq("id", agreement.id).eq("org_id", args.orgId);
        if (error) return { ok: false, routed: "durable", agreement_id: agreement.id, error: error.message };
        updated.push(...Object.keys(agrPatch).filter((k) => k !== "updated_at").map((k) => `agreement.${k}`));
    }

    // Placement: program / room / site / start on the current operational placement.
    const plc = await getOperationalPlacementForAgreement(supabase, args.orgId, agreement.id);
    if (plc) {
        const plcPatch: Record<string, unknown> = {};
        if ("program_category_id" in patch) plcPatch.program_category_id = patch.program_category_id;
        if ("program_room_cohort_key" in patch) plcPatch.room_location_id = patch.program_room_cohort_key;
        if ("start_date" in patch) plcPatch.start_date = patch.start_date;
        if (Object.keys(plcPatch).length) {
            plcPatch.updated_at = nowIso;
            const { error } = await supabase.from("child_placements").update(plcPatch).eq("id", plc.id).eq("org_id", args.orgId);
            if (error) return { ok: false, routed: "durable", agreement_id: agreement.id, error: error.message };
            updated.push(...Object.keys(plcPatch).filter((k) => k !== "updated_at").map((k) => `placement.${k}`));
        }
    }

    // Schedule assignment: resolve the pattern for the edited schedule_type, update the current assignment.
    if ("schedule_type" in patch && patch.schedule_type) {
        const sched = await getOperationalScheduleAssignmentForAgreement(supabase, args.orgId, agreement.id);
        const { data: pat } = await supabase
            .from("schedule_patterns")
            .select("id")
            .eq("org_id", args.orgId)
            .eq("site_location_id", agreement.site_location_id)
            .or(`schedule_type_key.eq.${patch.schedule_type},key.eq.${patch.schedule_type}`)
            .limit(1)
            .maybeSingle();
        const patternId = (pat as { id?: string } | null)?.id ?? null;
        if (sched && patternId) {
            const { error } = await supabase.from("schedule_assignments").update({ schedule_pattern_id: patternId, updated_at: nowIso }).eq("id", sched.id).eq("org_id", args.orgId);
            if (error) return { ok: false, routed: "durable", agreement_id: agreement.id, error: error.message };
            updated.push("schedule_assignment.schedule_pattern_id");
        }
    }

    return { ok: true, routed: "durable", agreement_id: agreement.id, process_instance_id: pi.id, updated };
}
