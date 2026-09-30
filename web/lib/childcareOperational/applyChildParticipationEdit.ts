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
import { enrollmentContextIdsForOpportunities } from "@/lib/enrollment/completion/resolveEnrollmentJourneyContext";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { getOperationalAgreementForMemberSite } from "@/lib/childcareOperational/enrollmentAgreementService";
import { getOperationalPlacementForAgreement } from "@/lib/childcareOperational/childPlacementService";
import { getOperationalScheduleAssignmentForAgreement } from "@/lib/childcareOperational/scheduleAssignmentService";
import { applyCombinedParticipationChange } from "@/lib/childcareOperational/applyCombinedParticipationChange";
import { computeNextDayYmd } from "@/lib/childcareOperational/effectiveDating";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import { parseRequestedDaysPerWeekInput } from "@/lib/enrollment/requestedDaysPerWeek";

/** A daily time range persisted with the schedule draft. */
export type DailyHoursRange = { arrive: string; depart: string };

/**
 * Participation facts an operator can edit inline. `outcome_status_key` (disposition) is NOT here.
 *
 * ── THE SAME KEY MEANS TWO THINGS, DEPENDING ON MATERIALISATION ──
 *
 * This type is accepted in both routing branches, and several keys change meaning between them. That
 * is not cosmetic: before materialisation these are DRAFT DESIRE held on `process_instances.metadata`
 * and editing them in place is correct; after materialisation the same keys describe DURABLE
 * EFFECTIVE-DATED TRUTH, where `docs/platform/core/effective-dated-assignment-doctrine.md` requires a
 * successor record rather than an in-place edit.
 *
 * | Field | Draft meaning | Post-materialisation meaning | Operational change? |
 * |---|---|---|---|
 * | `program_category_id` | desired program | placement program | YES — supersede |
 * | `program_room_cohort_key` | desired room | placement `room_location_id` | YES — supersede |
 * | `location_id` | desired site | agreement + placement site | YES — supersede |
 * | `schedule_type` | desired pattern | assignment `schedule_pattern_id` | YES — supersede |
 * | `start_date` | family-requested start | **operational truth-interval start** | YES — supersede |
 * | `notes` | draft note | agreement metadata note | no — non-temporal |
 * | `requested_days_per_week` | requested days | requested days (not an interval) | no — non-temporal |
 * | `tuition_plan_id`, `quote_accepted` | commercial intent | commercial intent | no — not assignment truth |
 * | `end_date`, `weekdays`, `scheduleTimes` | schedule-draft extensions | **draft only** — not written durably | n/a |
 *
 * `start_date` is the one that most needs saying, because its old comment read "Requested Start
 * (family preferred) — not operational Start Date" without qualification. That is true of the draft
 * branch and false of the durable branch, where this key becomes the start of an asserted truth
 * interval — the single most consequential field in the whole patch.
 */
export type ChildParticipationPatch = {
    program_category_id?: string | null;
    /** Room = a location id (kept under the OCM-era column name for editor compatibility). */
    program_room_cohort_key?: string | null;
    location_id?: string | null;
    schedule_type?: string | null;
    /**
     * Draft: family-requested start. Post-materialisation: the OPERATIONAL truth-interval start on the
     * agreement and placement. See the table above — the two meanings are not interchangeable.
     */
    start_date?: string | null;
    notes?: string | null;
    /** Requested days/week when exact preferred weekdays are still unknown. */
    requested_days_per_week?: number | null;
    tuition_plan_id?: string | null;
    quote_accepted?: boolean | null;
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
    "tuition_plan_id",
    "quote_accepted",
];

/** Schedule-draft keys carried on participation metadata (pre-materialization only). */
const DRAFT_META_KEYS: (keyof ChildParticipationPatch)[] = ["end_date", "weekdays", "scheduleTimes"];

function cleanPatch(patch: ChildParticipationPatch): ChildParticipationPatch | { error: string } {
    const out: ChildParticipationPatch = {};
    for (const k of [...PARTICIPATION_KEYS, ...DRAFT_META_KEYS]) {
        if (!(k in patch)) continue;
        if (k === "requested_days_per_week") {
            const parsed = parseRequestedDaysPerWeekInput(patch.requested_days_per_week);
            if (!parsed.ok) return { error: parsed.error };
            out.requested_days_per_week = parsed.value;
            continue;
        }
        (out as Record<string, unknown>)[k] = patch[k] ?? null;
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
    const cleaned = cleanPatch(args.patch);
    if ("error" in cleaned) return { ok: false, routed: "none", error: cleaned.error };
    const patch = cleaned;
    if (!Object.keys(patch).length) return { ok: true, routed: "none", updated: [] };
    const nowIso = new Date().toISOString();

    // Resolve the child's enrollment process instance (subject = child; context = lead). No OCM.
    let piQuery = supabase
        .from("process_instances")
        .select("id, context_id, metadata")
        .eq("org_id", args.orgId)
        .eq("process_key", ENROLLMENT_PROCESS_KEY)
        .eq("subject_id", args.customerMemberId);
    /*
     * Scoping to an Opportunity must not exclude the journeys that belong to it. A journey anchored
     * to the child's Enrollment Participation carries an OCM id here, so an equality on the
     * Opportunity id matched nothing and the edit failed with `no_enrollment_process_instance` —
     * loud, but wrong: the journey was there.
     */
    if (args.opportunityId) {
        const { contextIds } = await enrollmentContextIdsForOpportunities(supabase, args.orgId, [
            args.opportunityId,
        ]);
        piQuery = piQuery.in("context_id", contextIds);
    }
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

    /*
     * POST-MATERIALISATION: EFFECTIVE-DATED TRUTH IS SUPERSEDED, NEVER PATCHED.
     *
     * This block used to UPDATE `child_placements` (program, room, start_date) and
     * `schedule_assignments` (pattern) in place, and emit no change event. That is the bypass the
     * effective-dating doctrine forbids: the prior interval stopped being true without ever being
     * closed, no successor recorded what became true instead, and a partner that had already
     * synchronised the row was never told. A silent divergence is worse than a visible failure.
     *
     * Both halves now go through the canonical command, whose persistence is ONE
     * `apply_participation_operational_change` transaction and whose events fire after the commit. When
     * a single edit touches both, it is one transaction - not two service calls that can half-succeed.
     */
    const placementFieldsTouched =
        "program_category_id" in patch || "program_room_cohort_key" in patch || "start_date" in patch;
    const scheduleFieldTouched = "schedule_type" in patch && !!patch.schedule_type;

    if (placementFieldsTouched || scheduleFieldTouched) {
        const plc = await getOperationalPlacementForAgreement(supabase, args.orgId, agreement.id);

        let assignmentChange: { startDate: string; schedulePatternId: string } | undefined;
        if (scheduleFieldTouched) {
            const sched = await getOperationalScheduleAssignmentForAgreement(
                supabase,
                args.orgId,
                agreement.id
            );
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
                assignmentChange = {
                    // A schedule change with no operator-chosen date takes effect from the next day, so
                    // the superseded interval is non-empty. Superseding with today's date would be
                    // legal, but it would assert that the old schedule never applied today, which is
                    // false - the child was on it this morning.
                    startDate:
                        typeof patch.start_date === "string" && patch.start_date
                            ? patch.start_date
                            : computeNextDayYmd(todayYmd),
                    schedulePatternId: patternId,
                };
            }
        }

        let placementChange:
            | {
                  startDate: string;
                  programCategoryId?: string | null;
                  roomLocationId?: string | null;
                  reasonKey?: string | null;
              }
            | undefined;
        if (plc && placementFieldsTouched) {
            placementChange = {
                startDate:
                    typeof patch.start_date === "string" && patch.start_date
                        ? patch.start_date
                        : computeNextDayYmd(todayYmd),
                reasonKey: "operator_change",
            };
            // Only fields the operator actually named are sent. An absent key means "leave it as the
            // prior row had it"; an explicit null means "clear it". The primitive distinguishes them.
            if ("program_category_id" in patch) {
                placementChange.programCategoryId =
                    (patch.program_category_id as string | null) ?? null;
            }
            if ("program_room_cohort_key" in patch) {
                placementChange.roomLocationId =
                    (patch.program_room_cohort_key as string | null) ?? null;
            }
        }

        if (placementChange || assignmentChange) {
            try {
                const change = await applyCombinedParticipationChange(supabase, {
                    orgId: args.orgId,
                    enrollmentAgreementId: agreement.id,
                    todayYmd,
                    actorUserId: args.actorUserId ?? null,
                    sourceKey: "operator",
                    placement: placementChange,
                    assignment: assignmentChange,
                });
                if (change.placement) {
                    if (placementChange?.programCategoryId !== undefined) {
                        updated.push("placement.program_category_id");
                    }
                    if (placementChange?.roomLocationId !== undefined) {
                        updated.push("placement.room_location_id");
                    }
                    updated.push("placement.start_date");
                }
                if (change.assignment) updated.push("schedule_assignment.schedule_pattern_id");
            } catch (e) {
                const message =
                    e instanceof OperationalEnrollmentServiceError
                        ? e.message
                        : e instanceof Error
                          ? e.message
                          : "participation change failed";
                return { ok: false, routed: "durable", agreement_id: agreement.id, error: message };
            }
        }
    }

    return { ok: true, routed: "durable", agreement_id: agreement.id, process_instance_id: pi.id, updated };
}
