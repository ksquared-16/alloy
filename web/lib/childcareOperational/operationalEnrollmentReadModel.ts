import type { SupabaseClient } from "@supabase/supabase-js";
import {
    getAgreementById,
    getOperationalAgreementForMemberSite,
} from "@/lib/childcareOperational/enrollmentAgreementService";
import { getOperationalPlacementForAgreement } from "@/lib/childcareOperational/childPlacementService";
import { getOperationalScheduleAssignmentForAgreement } from "@/lib/childcareOperational/scheduleAssignmentService";
import type {
    ChildEnrollmentAgreementRow,
    ChildPlacementRow,
    ProgramCategoryLabelRow,
    ScheduleAssignmentRow,
    SchedulePatternRow,
} from "@/lib/childcareOperational/enrollmentOperationalTypes";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import { isPlacementOperationalStatus } from "@/lib/childcareOperational/enrollmentOperationalStatus";

export type OperationalEnrollmentWarningCode =
    | "missing_placement"
    | "missing_schedule_assignment"
    | "schedule_pattern_unresolved"
    | "agreement_ending"
    | "agreement_ended";

export type OperationalEnrollmentDisplayLabels = {
    site: string | null;
    program: string | null;
    room: string | null;
    schedule: string | null;
};

export type OperationalEnrollmentReadModel = {
    agreement: ChildEnrollmentAgreementRow | null;
    placement: ChildPlacementRow | null;
    scheduleAssignment: ScheduleAssignmentRow | null;
    schedulePattern: SchedulePatternRow | null;
    labels: OperationalEnrollmentDisplayLabels;
    warnings: OperationalEnrollmentWarningCode[];
};

function formatWeekdays(weekdays: number[]): string {
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return weekdays
        .slice()
        .sort((a, b) => a - b)
        .map((d) => names[d] ?? String(d))
        .join(", ");
}

async function resolveLocationLabel(
    supabase: SupabaseClient,
    orgId: string,
    locationId: string | null | undefined
): Promise<string | null> {
    if (!locationId) return null;
    const { data } = await supabase
        .from("locations")
        .select("label")
        .eq("org_id", orgId)
        .eq("id", locationId)
        .maybeSingle();
    const label = (data as { label?: string | null } | null)?.label;
    return label != null ? String(label).trim() || null : null;
}

async function resolveProgramLabel(
    supabase: SupabaseClient,
    orgId: string,
    programCategoryId: string | null | undefined
): Promise<string | null> {
    if (!programCategoryId) return null;
    const { data } = await supabase
        .from("location_program_categories")
        .select("label, key")
        .eq("org_id", orgId)
        .eq("id", programCategoryId)
        .maybeSingle();
    if (!data) return null;
    const row = data as ProgramCategoryLabelRow;
    return row.label?.trim() || row.key?.trim() || null;
}

async function loadSchedulePattern(
    supabase: SupabaseClient,
    orgId: string,
    patternId: string | null | undefined
): Promise<SchedulePatternRow | null> {
    if (!patternId) return null;
    const { data, error } = await supabase
        .from("schedule_patterns")
        .select("*")
        .eq("org_id", orgId)
        .eq("id", patternId)
        .maybeSingle();
    if (error) {
        throw new OperationalEnrollmentServiceError("db_error", error.message);
    }
    return data ? (data as SchedulePatternRow) : null;
}

function buildWarnings(
    agreement: ChildEnrollmentAgreementRow | null,
    placement: ChildPlacementRow | null,
    scheduleAssignment: ScheduleAssignmentRow | null,
    schedulePattern: SchedulePatternRow | null
): OperationalEnrollmentWarningCode[] {
    const warnings: OperationalEnrollmentWarningCode[] = [];
    if (!agreement) return warnings;

    if (agreement.status === "ending") {
        warnings.push("agreement_ending");
    }
    if (agreement.status === "ended") {
        warnings.push("agreement_ended");
    }

    if (
        agreement.status !== "canceled" &&
        agreement.status !== "ended" &&
        !placement
    ) {
        warnings.push("missing_placement");
    }

    if (
        agreement.status !== "canceled" &&
        agreement.status !== "ended" &&
        !scheduleAssignment
    ) {
        warnings.push("missing_schedule_assignment");
    }

    if (scheduleAssignment && !schedulePattern) {
        warnings.push("schedule_pattern_unresolved");
    }

    const meta = agreement.metadata ?? {};
    if (meta.schedule_pattern_unresolved === true) {
        warnings.push("schedule_pattern_unresolved");
    }

    return warnings;
}

/**
 * The three LOOKED-UP labels. Split from the schedule label deliberately: these are the only part
 * of the label set that costs a round trip, and none of them reads the schedule pattern.
 */
async function resolveLookedUpLabels(
    supabase: SupabaseClient,
    orgId: string,
    agreement: ChildEnrollmentAgreementRow | null,
    placement: ChildPlacementRow | null
): Promise<Pick<OperationalEnrollmentDisplayLabels, "site" | "program" | "room">> {
    /*
     * THREE INDEPENDENT LOOKUPS, RESOLVED TOGETHER.
     *
     * The site label reads the AGREEMENT's location, the program and room labels read the
     * PLACEMENT's category and room. None consumes another's result, so the serial `await` chain
     * bought nothing but three round trips in sequence.
     */
    const [siteLabel, programLabel, roomLabel] = await Promise.all([
        agreement ? resolveLocationLabel(supabase, orgId, agreement.site_location_id) : Promise.resolve(null),
        placement ? resolveProgramLabel(supabase, orgId, placement.program_category_id) : Promise.resolve(null),
        placement ? resolveLocationLabel(supabase, orgId, placement.room_location_id) : Promise.resolve(null),
    ]);
    return { site: siteLabel, program: programLabel, room: roomLabel };
}

/** The schedule label is a pure format of the pattern row — no read, so it never gated the others. */
function composeLabels(
    lookedUp: Pick<OperationalEnrollmentDisplayLabels, "site" | "program" | "room">,
    schedulePattern: SchedulePatternRow | null
): OperationalEnrollmentDisplayLabels {
    let scheduleLabel: string | null = null;
    if (schedulePattern) {
        const weekdays = formatWeekdays(schedulePattern.weekdays ?? []);
        scheduleLabel = weekdays
            ? `${schedulePattern.label} (${weekdays})`
            : schedulePattern.label;
    }

    return {
        site: lookedUp.site,
        program: lookedUp.program,
        room: lookedUp.room,
        schedule: scheduleLabel,
    };
}

export async function buildOperationalEnrollmentReadModelForAgreement(
    supabase: SupabaseClient,
    orgId: string,
    agreementId: string
): Promise<OperationalEnrollmentReadModel> {
    /*
     * SEVEN SERIAL ROUND TRIPS BECAME THREE DEPENDENT STAGES.
     *
     * Measured on deployed c619afee/d88755c8, n=11 warm J5 samples: `durableFacts` was the longest
     * of the three overlay legs in 11/11, at P50 556ms against placementLabeled 0ms and
     * processInstances 106ms, and it explained the overlay wall exactly — residual P50 0ms. The
     * children input was ONE, so this is not the per-child fan-out the enclosing comment describes;
     * it is a single agreement costing 556ms, and the cost is the shape of this function.
     *
     * The dependencies are narrow. `getOperationalPlacementForAgreement` and
     * `getOperationalScheduleAssignmentForAgreement` are keyed by `agreementId` ALONE — neither
     * reads the agreement row — so the only true edges are schedulePattern needing the schedule
     * assignment, and the labels needing agreement + placement + pattern. Everything else was
     * sequential by habit.
     *
     * THE EARLY RETURN MOVES, AND THAT IS THE ONE BEHAVIOURAL TRADE. Previously a missing agreement
     * short-circuited before the placement and assignment reads; now those two are already in
     * flight. The returned model is byte-identical either way — this branch has always produced the
     * empty model — so the trade is two speculative reads on a branch `resolveDurableFactsForChildren`
     * reaches only when its own agreements query found nothing, against four fewer serial round
     * trips on the path that is actually measured.
     */
    const [agreement, placement, scheduleAssignment] = await Promise.all([
        getAgreementById(supabase, orgId, agreementId),
        getOperationalPlacementForAgreement(supabase, orgId, agreementId),
        getOperationalScheduleAssignmentForAgreement(supabase, orgId, agreementId),
    ]);
    if (!agreement) {
        return {
            agreement: null,
            placement: null,
            scheduleAssignment: null,
            schedulePattern: null,
            labels: { site: null, program: null, room: null, schedule: null },
            warnings: [],
        };
    }

    /*
     * THE PATTERN READ AND THE LABEL READS ARE THE SAME STAGE, NOT TWO.
     *
     * `buildLabels` took `schedulePattern` and so was awaited after `loadSchedulePattern` — but its
     * three round trips never read it. Only `scheduleLabel` does, and that is a pure format of a row
     * already in hand. The pattern read was gating three lookups that do not depend on it.
     *
     * Measured n=24 on deployed staging: `children_overlay_durable_facts_ms` P50 360ms owned the
     * overlay wall (P50 360ms) in 9/12 sampled switches, with `overlay_children_in` P50 = 1 — one
     * child, so this is chain DEPTH, not per-child fan-out. Four dependent stages at the ~90ms
     * round trip this deployment measures everywhere else (`customer_lookup` 113, `primary_person_hydrate`
     * 106, `process_instances` 104, `ocm_members_batch` 120) is exactly the 360ms observed.
     *
     * Three stages become two. Same reads, same results, one less round trip in sequence.
     */
    const [schedulePattern, lookedUpLabels] = await Promise.all([
        scheduleAssignment
            ? loadSchedulePattern(supabase, orgId, scheduleAssignment.schedule_pattern_id)
            : Promise.resolve(null),
        resolveLookedUpLabels(supabase, orgId, agreement, placement),
    ]);

    const labels = composeLabels(lookedUpLabels, schedulePattern);
    const warnings = buildWarnings(agreement, placement, scheduleAssignment, schedulePattern);

    return {
        agreement,
        placement,
        scheduleAssignment,
        schedulePattern,
        labels,
        warnings,
    };
}

export async function buildOperationalEnrollmentReadModelForMemberSite(
    supabase: SupabaseClient,
    orgId: string,
    customerMemberId: string,
    siteLocationId: string
): Promise<OperationalEnrollmentReadModel> {
    const agreement = await getOperationalAgreementForMemberSite(
        supabase,
        orgId,
        customerMemberId,
        siteLocationId
    );

    if (!agreement) {
        return {
            agreement: null,
            placement: null,
            scheduleAssignment: null,
            schedulePattern: null,
            labels: { site: null, program: null, room: null, schedule: null },
            warnings: [],
        };
    }

    return buildOperationalEnrollmentReadModelForAgreement(supabase, orgId, agreement.id);
}

/** Prefer most recent terminal agreement when no operational row exists (history display). */
export async function getLatestAgreementForMemberSite(
    supabase: SupabaseClient,
    orgId: string,
    customerMemberId: string,
    siteLocationId: string
): Promise<ChildEnrollmentAgreementRow | null> {
    const operational = await getOperationalAgreementForMemberSite(
        supabase,
        orgId,
        customerMemberId,
        siteLocationId
    );
    if (operational) return operational;

    const { data, error } = await supabase
        .from("child_enrollment_agreements")
        .select("*")
        .eq("org_id", orgId)
        .eq("customer_member_id", customerMemberId)
        .eq("site_location_id", siteLocationId)
        .in("status", ["ended", "canceled"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        throw new OperationalEnrollmentServiceError("db_error", error.message);
    }
    return data ? (data as ChildEnrollmentAgreementRow) : null;
}

export function isCurrentOperationalPlacement(placement: ChildPlacementRow | null): boolean {
    return placement != null && isPlacementOperationalStatus(placement.status);
}
