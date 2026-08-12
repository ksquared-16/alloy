/**
 * Place-a-Child options — a THIN I/O adapter over the `placement.room_fit`
 * Operational Calculation.
 *
 * This module owns NO eligibility or ranking policy. It (1) loads effective
 * configuration + operational facts — candidate rooms with their configured age
 * band and active state, the child's DOB, and the per-room occupancy/capacity/
 * schedule signals from the existing expectation engine (preview = execution:
 * the SAME `buildScheduleExpectations` execution uses) — then (2) hands them to
 * the registered `placement.room_fit` calculation, which applies hard eligibility
 * (age as of the effective date, program, site, room active, schedule/day,
 * capacity) BEFORE ranking and returns a typed, verdict-free result with
 * provenance. Placement/Scheduling merely MAP that result into option rows and
 * let the surface label the top-ranked eligible entry "Recommended".
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    buildScheduleExpectations,
    type ExpectationWarning,
} from "@/lib/childcareOperational/expectations/buildScheduleExpectations";
import {
    loadOperationalExpectationInputs,
    type OperationalExpectationInputs,
} from "@/lib/childcareOperational/expectations/loadOperationalExpectationInputs";
import { loadExpectationAgeGroups } from "@/lib/childcareOperational/expectations/resolveExpectationAgeGroups";
import type { ExpectedOccupancyEntry } from "@/lib/childcareOperational/expectations/scheduleExpectationCore";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import { resolveCalculation } from "@/lib/operationalCalculations/runtime";
import {
    PLACEMENT_ROOM_FIT,
    ageBoundToMonths,
    ageInMonthsAsOf,
    type RoomAgeBandMonths,
    type RoomFitCandidate,
    type RoomFitEntry,
} from "@/lib/operationalCalculations/families/placement";

export type PlacementOptionClassification = "recommended" | "eligible" | "blocked";

export type PlacementOption = {
    roomId: string;
    roomName: string | null;
    classification: PlacementOptionClassification;
    /** One plain line of why (fit reason or the excluding cause) — from the calculation. */
    reason: string;
    beforePeakOccupancy: number;
    afterPeakOccupancy: number;
    blockers: string[];
};

// ---------------------------------------------------------------------------
// Fact computation (preview = execution) — occupancy + engine eligibility signals
// ---------------------------------------------------------------------------

/** Blocking warning codes the expectation engine produces per candidate room. */
const BLOCKING_WARNING_CODES = new Set<ExpectationWarning["code"]>([
    "capacity_exceeded",
    "age_group_ineligible",
    "schedule_type_ineligible",
    "pattern_weekday_outside_operating_window",
    "days_policy_violation",
]);

function peakOccupancyForRoom(occupancy: readonly ExpectedOccupancyEntry[], roomId: string): number {
    let peak = 0;
    for (const o of occupancy) {
        if (o.roomLocationId === roomId && o.childCount > peak) peak = o.childCount;
    }
    return peak;
}

/** Per-room engine signals, classified from the blocking warnings for that room. */
type RoomEngineFacts = {
    roomId: string;
    roomName: string | null;
    beforePeakOccupancy: number;
    afterPeakOccupancy: number;
    capacityExceeded: boolean;
    scheduleEligible: boolean;
    withinOperatingWindow: boolean;
    ageGroupIneligible: boolean;
    programMatch: boolean;
    continuity: boolean;
};

/**
 * Rooms this child already occupies — the continuity signal (effective-dated).
 */
function continuityRoomIdsForChild(
    placements: OperationalExpectationInputs["placements"],
    childAgreementId: string,
): Set<string> {
    const ids = new Set<string>();
    for (const p of placements) {
        if (p.enrollment_agreement_id === childAgreementId && p.room_location_id) ids.add(p.room_location_id);
    }
    return ids;
}

export type BuildRoomEngineFactsArgs = {
    inputs: OperationalExpectationInputs;
    childAgreementId: string;
    programCategoryId: string | null;
    patternId: string;
    patternWeekdays: number[];
    scheduleTypeKey: string;
    candidateRooms: { id: string; name: string | null }[];
    dateStart: string;
    dateEnd: string;
};

/**
 * Inject the hypothetical child into each candidate room and re-run the SAME
 * builder execution uses — yielding occupancy-after + the classified eligibility
 * signals per room. This is FACT computation only; no eligibility verdict or
 * ranking is decided here (that is `placement.room_fit`).
 */
export function buildRoomEngineFacts(args: BuildRoomEngineFactsArgs): RoomEngineFacts[] {
    const { inputs, childAgreementId } = args;

    const programAgeGroupId =
        args.programCategoryId != null ? inputs.ageGroupByProgramCategoryId?.[args.programCategoryId] ?? null : null;
    const ageGroupByRoom = inputs.ageGroupByRoomLocationId ?? {};
    const continuityRoomIds = continuityRoomIdsForChild(inputs.placements, childAgreementId);

    const patternsById = new Map(inputs.patternsById);
    if (!patternsById.has(args.patternId)) {
        patternsById.set(args.patternId, { id: args.patternId, weekdays: args.patternWeekdays, schedule_type_key: args.scheduleTypeKey });
    }

    const baseline = buildScheduleExpectations({
        dateStart: args.dateStart,
        dateEnd: args.dateEnd,
        agreements: inputs.agreements,
        placements: inputs.placements,
        assignments: inputs.assignments,
        patternsById,
        config: inputs.config,
        ageGroupByRoomLocationId: inputs.ageGroupByRoomLocationId,
        ageGroupByProgramCategoryId: inputs.ageGroupByProgramCategoryId,
    });

    return args.candidateRooms.map((room) => {
        const hypoPlacement = {
            enrollment_agreement_id: childAgreementId,
            room_location_id: room.id,
            program_category_id: args.programCategoryId,
            start_date: args.dateStart,
            end_date: null,
            status: "active",
        };
        const hypoAssignment = {
            enrollment_agreement_id: childAgreementId,
            schedule_pattern_id: args.patternId,
            start_date: args.dateStart,
            end_date: null,
            status: "active",
        };
        const after = buildScheduleExpectations({
            dateStart: args.dateStart,
            dateEnd: args.dateEnd,
            agreements: inputs.agreements,
            placements: [...inputs.placements, hypoPlacement],
            assignments: [...inputs.assignments, hypoAssignment],
            patternsById,
            config: inputs.config,
            ageGroupByRoomLocationId: inputs.ageGroupByRoomLocationId,
            ageGroupByProgramCategoryId: inputs.ageGroupByProgramCategoryId,
        });

        const roomWarnings = after.warnings.filter(
            (w) => BLOCKING_WARNING_CODES.has(w.code) && (w.roomLocationId === room.id || w.agreementId === childAgreementId),
        );
        const has = (code: ExpectationWarning["code"]) => roomWarnings.some((w) => w.code === code);

        return {
            roomId: room.id,
            roomName: room.name,
            beforePeakOccupancy: peakOccupancyForRoom(baseline.expectedOccupancyByRoomDate, room.id),
            afterPeakOccupancy: peakOccupancyForRoom(after.expectedOccupancyByRoomDate, room.id),
            capacityExceeded: has("capacity_exceeded"),
            scheduleEligible: !has("schedule_type_ineligible"),
            withinOperatingWindow: !has("pattern_weekday_outside_operating_window") && !has("days_policy_violation"),
            ageGroupIneligible: has("age_group_ineligible"),
            programMatch: programAgeGroupId != null && ageGroupByRoom[room.id] === programAgeGroupId,
            continuity: continuityRoomIds.has(room.id),
        };
    });
}

// ---------------------------------------------------------------------------
// Thin I/O: load config + facts, invoke the calculation, map to option rows
// ---------------------------------------------------------------------------

type CandidateRoomConfig = { id: string; name: string | null; active: boolean; ageBand: RoomAgeBandMonths | null };

/** Load candidate rooms with the config the fit calculation needs: age band + active. */
async function loadCandidateRoomConfigs(
    supabase: SupabaseClient,
    orgId: string,
    siteLocationId: string,
): Promise<CandidateRoomConfig[]> {
    const { data, error } = await supabase
        .from("locations")
        .select("id, label, status_key, metadata")
        .eq("org_id", orgId)
        .eq("parent_location_id", siteLocationId)
        .eq("location_type", "unit");
    if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
    return ((data ?? []) as { id: string; label: string | null; status_key: string | null; metadata: Record<string, unknown> | null }[]).map(
        (r) => {
            const meta = r.metadata ?? {};
            const unit = typeof meta.age_range_unit === "string" ? meta.age_range_unit : null;
            const from = ageBoundToMonths(numOrNull(meta.age_range_from), unit);
            const to = ageBoundToMonths(numOrNull(meta.age_range_to), unit);
            const ageBand: RoomAgeBandMonths | null = from == null && to == null ? null : { minMonths: from, maxMonths: to };
            // Fail-open: a room is active unless an explicit non-active status says otherwise.
            const status = (r.status_key ?? "").trim().toLowerCase();
            const active = status === "" || status === "active" || status === "open";
            return { id: r.id, name: r.label != null ? String(r.label).trim() || null : null, active, ageBand };
        },
    );
}

function numOrNull(v: unknown): number | null {
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
    return null;
}

export type GeneratePlacementOptionsInput = {
    orgId: string;
    siteLocationId: string;
    /** In the Scheduling flow this is the customer_member_id the card sends. */
    childAgreementId: string;
    /** Explicit customer_member_id for DOB resolution (defaults to childAgreementId). */
    customerMemberId?: string;
    programCategoryId: string | null;
    patternId: string;
    dateStart: string;
    dateEnd: string;
};

export type PlacementFitContext = {
    /** Child DOB used for age gates (YYYY-MM-DD), or null when unknown. */
    dateOfBirth: string | null;
    /** Whole months as of `asOf`, or null when DOB unknown. */
    childAgeMonths: number | null;
    /** Proposed start / effective date age is evaluated against. */
    asOf: string;
    /** Provenance for operators diagnosing surprising ineligibility. */
    dobSource: "persons.date_of_birth" | "customer_members.dob" | "unknown";
};

/** Map one calculation entry to an option row; the surface labels rank-0-eligible Recommended. */
function entryToOption(e: RoomFitEntry, facts: RoomEngineFacts | undefined): PlacementOption {
    const classification: PlacementOptionClassification = !e.eligible ? "blocked" : e.rank === 0 ? "recommended" : "eligible";
    return {
        roomId: e.roomId,
        roomName: e.roomName,
        classification,
        reason: e.explanation,
        beforePeakOccupancy: facts?.beforePeakOccupancy ?? 0,
        afterPeakOccupancy: facts?.afterPeakOccupancy ?? e.rankBasis.occupancyAfter,
        blockers: e.ineligibleReasons.map((r) => r.detail),
    };
}

/** Thin I/O: load inputs + config + DOB, compute facts, invoke `placement.room_fit`, map. */
export async function generatePlacementOptions(
    supabase: SupabaseClient,
    input: GeneratePlacementOptionsInput,
): Promise<{ options: PlacementOption[]; fitContext: PlacementFitContext }> {
    const inputs = await loadOperationalExpectationInputs(supabase, {
        orgId: input.orgId,
        siteLocationId: input.siteLocationId,
    });

    const pattern = inputs.patternsById.get(input.patternId);
    let patternWeekdays = pattern?.weekdays ?? [];
    let scheduleTypeKey = pattern?.schedule_type_key ?? "";
    if (!pattern) {
        const { data } = await supabase
            .from("schedule_patterns")
            .select("weekdays, schedule_type_key")
            .eq("org_id", input.orgId)
            .eq("id", input.patternId)
            .maybeSingle();
        const row = data as { weekdays?: number[]; schedule_type_key?: string } | null;
        patternWeekdays = row?.weekdays ?? [];
        scheduleTypeKey = row?.schedule_type_key ?? "";
    }

    const candidateRooms = await loadCandidateRoomConfigs(supabase, input.orgId, input.siteLocationId);

    // Age groups for the CANDIDATE rooms + this child's program (a lead child has no
    // placement yet), merged over the placement-derived maps — so program compat resolves.
    const extraAgeGroups = await loadExpectationAgeGroups(supabase, input.orgId, {
        programCategoryIds: input.programCategoryId ? [input.programCategoryId] : [],
        roomLocationIds: candidateRooms.map((r) => r.id),
    });
    const inputsWithAgeGroups: OperationalExpectationInputs = {
        ...inputs,
        ageGroupByRoomLocationId: { ...(inputs.ageGroupByRoomLocationId ?? {}), ...extraAgeGroups.ageGroupByRoomLocationId },
        ageGroupByProgramCategoryId: { ...(inputs.ageGroupByProgramCategoryId ?? {}), ...extraAgeGroups.ageGroupByProgramCategoryId },
    };
    const programKnown =
        input.programCategoryId != null && inputsWithAgeGroups.ageGroupByProgramCategoryId?.[input.programCategoryId] != null;

    const facts = buildRoomEngineFacts({
        inputs: inputsWithAgeGroups,
        childAgreementId: input.childAgreementId,
        programCategoryId: input.programCategoryId,
        patternId: input.patternId,
        patternWeekdays,
        scheduleTypeKey,
        candidateRooms: candidateRooms.map((r) => ({ id: r.id, name: r.name })),
        dateStart: input.dateStart,
        dateEnd: input.dateEnd,
    });
    const factsByRoom = new Map(facts.map((f) => [f.roomId, f]));
    const configByRoom = new Map(candidateRooms.map((r) => [r.id, r]));

    // Child age as of the PROPOSED effective (start) date — the correctness gate.
    // Source: persons.date_of_birth (preferred), else customer_members.dob.
    const memberId = input.customerMemberId ?? input.childAgreementId;
    const { data: cm } = await supabase
        .from("customer_members")
        .select("person_id, dob")
        .eq("org_id", input.orgId)
        .eq("id", memberId)
        .maybeSingle();
    const personId = (cm as { person_id?: string | null } | null)?.person_id ?? null;
    const cmDob = (cm as { dob?: string | null } | null)?.dob
        ? String((cm as { dob: string }).dob).slice(0, 10)
        : null;
    let dob: string | null = null;
    let dobSource: PlacementFitContext["dobSource"] = "unknown";
    if (personId) {
        const { data: person } = await supabase
            .from("persons")
            .select("date_of_birth")
            .eq("id", personId)
            .maybeSingle();
        const personDob = (person as { date_of_birth?: string | null } | null)?.date_of_birth ?? null;
        if (personDob) {
            dob = String(personDob).slice(0, 10);
            dobSource = "persons.date_of_birth";
        }
    }
    if (!dob && cmDob) {
        dob = cmDob;
        dobSource = "customer_members.dob";
    }
    const childAgeMonths = ageInMonthsAsOf(dob, input.dateStart);

    const candidates: RoomFitCandidate[] = facts.map((f) => {
        const cfg = configByRoom.get(f.roomId);
        return {
            roomId: f.roomId,
            roomName: f.roomName,
            active: cfg?.active ?? true,
            ageBand: cfg?.ageBand ?? null,
            // An engine age-group-ineligible signal also fails program compatibility.
            programMatch: f.programMatch && !f.ageGroupIneligible,
            programKnown,
            continuity: f.continuity,
            scheduleEligible: f.scheduleEligible,
            withinOperatingWindow: f.withinOperatingWindow,
            capacityExceeded: f.capacityExceeded,
            occupancyAfter: f.afterPeakOccupancy,
            capacityHeadroom: null,
        };
    });

    const result = resolveCalculation(
        PLACEMENT_ROOM_FIT,
        {
            asOf: input.dateStart,
            childAgeMonths,
            dobKnown: dob != null,
            candidates,
            siteLocationId: input.siteLocationId,
        },
        { clock: () => new Date() },
    );

    return {
        options: result.value.entries.map((e) => entryToOption(e, factsByRoom.get(e.roomId))),
        fitContext: {
            dateOfBirth: dob,
            childAgeMonths,
            asOf: input.dateStart,
            dobSource,
        },
    };
}
