/**
 * Combined Daily Roster — the composition, not a new source of truth.
 *
 * Answers one operational question: who is expected here, where, and when —
 * children and staff together — and does scheduled staff supply satisfy required
 * staffing demand?
 *
 * Every number in this file comes from somewhere else:
 *
 *   children          buildScheduleExpectations → expectedAttendance          (L3)
 *   required staff    buildScheduleExpectations → expectedStaffingByRoomDate  (ratio model)
 *   scheduled staff   buildStaffSupply          → subject_type='staff' ledger
 *   verdict           resolveStaffingSufficiency / rollUpStaffingSufficiency
 *
 * It persists nothing, owns no policy, and adds no roster-specific math. Children
 * and staff stay TYPED subjects: they are two different kinds of human with two
 * different canonical records, and flattening them into one row would destroy the
 * only thing that makes the roster navigable.
 *
 * Preview only. Every subject carries the ids needed to open its canonical
 * record; nothing here is authoritative record detail.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    effectiveAttendanceEvents,
    summarizeAttendanceByDay,
} from "@/lib/childcareOperational/attendance/attendanceFold";
import type { ChildAttendanceEventRow } from "@/lib/childcareOperational/attendance/attendanceTypes";
import { buildRoomConfigResolvers } from "@/lib/childcareOperational/config/roomConfigResolvers";
// The CANONICAL ratio surface, not the raw tier primitive. `resolveRequiredStaffForChildren` is a
// thin wrapper over the same function, so this is a seam change with no behavioural difference —
// but the doctrine is that a consumer never re-derives a fact, and the offender ledger in
// `tests/childcareOperational/calculations/staffingSeamOffenderLedger.test.ts` may shrink and never
// grow. Actual demand resolves exactly the way planned demand does.
import { resolveRequiredStaffForChildren } from "@/lib/childcareOperational/capacity/resolveRatio";
import { buildScheduleExpectations } from "@/lib/childcareOperational/expectations/buildScheduleExpectations";
import {
    countsPresent,
    NO_RECORD,
    resolveActualStaffing,
    staffActualFromDayState,
    type SubjectActualState,
} from "@/lib/roster/dailyOperatingState";
import { summarizeStaffPresenceByDay } from "@/lib/staffPresence/staffPresenceFold";
import {
    composeStaffReadinessSignals,
    type StaffReadinessSignal,
} from "@/lib/staffReadiness/staffReadinessSignals";
import { listStaffPresenceForSiteDate } from "@/lib/staffPresence/staffPresenceService";
import { loadOperationalExpectationInputs } from "@/lib/childcareOperational/expectations/loadOperationalExpectationInputs";
import { loadExpectationAgeGroups } from "@/lib/childcareOperational/expectations/resolveExpectationAgeGroups";
import { operationalGroupRooms, resolveRoomsForLocation } from "@/lib/location/canonicalRoomProvider";
import { resolveCurrentWhereabouts } from "@/lib/roster/resolveCurrentWhereabouts";
import {
    ATTENDANCE_SUBJECT_KINDS,
    applyObservedPresence,
    interpretServiceDay,
    raisesMissingArrivalAttention,
    serviceDayAsOf,
    type ServiceDayState,
} from "@/lib/childcareOperational/attendance/serviceDayExpectations";
import { effectiveExpectationsForWindow } from "@/lib/operationalExpectations/query/effectiveExpectationsForWindow";
import { createSupabaseExpectationQueryGateway } from "@/lib/operationalExpectations/query/supabaseExpectationQueryGateway";

/** The service-day reading attached to a roster child. */
export type ChildServiceDayState = {
    state: ServiceDayState;
    /**
     * The statement this reading came from. The operator surface needs it to say
     * "they'll be in after all" or "we're opening after all": a change must name
     * what it replaces, or it is not a change but a second, competing plan for the
     * same child on the same day.
     */
    expectationId: string | null;
    /** Operator-facing reason (illness, vacation, holiday_closure...). */
    reasonKey: string | null;
    /** True only for a genuine unexplained missing arrival. */
    raisesAttention: boolean;
    /**
     * The GRAIN was not operating today, independent of who turned up.
     *
     * Kept separate from `state` because observed presence overwrites the state —
     * a child who arrives on a closed day reads `attended_despite_plan`, which is
     * correct for her and wrong for the day. A surface that asked `state ===
     * "closed"` therefore stopped believing the site was shut the moment somebody
     * walked in, which is precisely backwards.
     */
    dayClosed: boolean;
};
import { resolveAssignmentTimes, uniformDailyInterval } from "@/lib/assignmentTime/resolveAssignmentTime";
import { formatCompactScheduleHours } from "@/lib/scheduling/projection/projectCompactScheduleForIdentity";
import {
    buildStaffSupply,
    staffSupplyCellKey,
    type ScheduledStaffMember,
} from "@/lib/scheduling/supply/buildStaffSupply";
import {
    resolveRequiredStaffDemand,
    resolveStaffingSufficiency,
    rollUpStaffingSufficiency,
    type StaffingSufficiency,
} from "@/lib/scheduling/supply/staffingSufficiency";

/** A child expected in a room on a date. Preview only — never child detail. */
export type RosterChildSubject = {
    subjectType: "child";
    customerMemberId: string;
    enrollmentAgreementId: string;
    /** Canonical human identity when the child has one; the record target. */
    personId: string | null;
    displayName: string;
    /** Compact daily hours from the schedule pattern, when configured. */
    timeLabel: string | null;
    scheduleTypeKey: string;
    programCategoryId: string | null;
    /** Expected vs actual — `no_record` means nothing was authored, not absent. */
    actual: SubjectActualState;
    /**
     * How the SERVICE DAY reads for this child once known operational intent is
     * applied — known away, closed, or an integrity failure we could not resolve.
     * Observed presence still decides physical state; this decides how SILENCE
     * reads, which is the difference between "nobody expected her" and "she is
     * missing".
     */
    serviceDay?: ChildServiceDayState;
};

/** A staff member scheduled in a room on a date. Preview only — never Person detail. */
export type RosterStaffSubject = ScheduledStaffMember & {
    subjectType: "staff";
    /** Expected vs actual. A schedule is never proof of physical presence. */
    actual: SubjectActualState;
    /**
     * ADVISORY readiness, from the Slice 5 projection via the Slice 6 batch composer.
     *
     * A FOURTH fact, deliberately separate from the three beside it: assigned is the
     * plan, actual is what happened, and this is whether the paperwork behind the
     * person is in order. Collapsing any of them into a single status is the thing
     * Operations must not do — a present, assigned staff member with a lapsed CPR is
     * all three at once, and an operator needs to see that rather than one verdict
     * standing in for it.
     *
     * Null means "not evaluated", never "fine". It cannot block anything: the signal
     * is composed at `record_view`, so every gap it carries is non-blocking.
     */
    readiness: StaffReadinessSignal | null;
};

/** Staff physically present who were not on the schedule for this room·date. */
export type UnscheduledStaffPresence = {
    subjectType: "staff";
    personId: string;
    displayName: string;
    employmentId: string;
    actual: SubjectActualState;
    /** Advisory only, as on every other staff row. Null means not evaluated. */
    readiness: StaffReadinessSignal | null;
};

export type RosterCell = {
    roomLocationId: string;
    roomName: string;
    date: string;
    weekday: number;
    children: RosterChildSubject[];
    staff: RosterStaffSubject[];
    expectedChildCount: number;
    scheduledStaffCount: number;
    /** Null when no ratio configuration resolves for this room·day. */
    requiredStaff: number | null;
    /** PLANNED verdict: required(expected children) vs scheduled staff. */
    staffingSufficiency: StaffingSufficiency;
    /**
     * Why the verdict is what it is. `unknown` always carries a reason so the
     * surface can say "we cannot tell" rather than implying a healthy state.
     */
    staffingReason: "evaluated" | "no_ratio_configuration";

    // ── Actual operating state ────────────────────────────────────────────────
    actualChildrenPresent: number;
    actualStaffPresent: number;
    /** Demand for the children ACTUALLY present — not the expected count. */
    actualRequiredStaff: number | null;
    /** ACTUAL verdict. Never interchangeable with `staffingSufficiency`. */
    actualStaffingSufficiency: StaffingSufficiency;
    /** Present staff with no scheduled assignment in this room·date. */
    unscheduledStaffPresent: UnscheduledStaffPresence[];
};

export type CombinedRosterReadModel = {
    siteLocationId: string;
    date: string;
    cells: RosterCell[];
    /** Site-wide PLANNED verdict. Pessimistic: any short, then any unknown. */
    staffingSufficiency: StaffingSufficiency;
    /** Site-wide ACTUAL verdict from real presence. Never the planned one. */
    actualStaffingSufficiency: StaffingSufficiency;
    totals: {
        expectedChildren: number;
        scheduledStaff: number;
        /** Null when any evaluated room·day could not resolve demand. */
        requiredStaff: number | null;
        roomsShort: number;
        roomsUnknown: number;
        actualChildrenPresent: number;
        actualStaffPresent: number;
        roomsActuallyShort: number;
    };
    /** Scheduled at the site with no room — real supply that must not vanish. */
    unroomedStaff: RosterStaffSubject[];
};

export type BuildCombinedRosterInput = {
    orgId: string;
    siteLocationId: string;
    /** Single operational day. The roster is a day surface, not a week grid. */
    date: string;
};

function weekdayOf(ymd: string): number {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function displayNameFrom(row: {
    full_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    display_name?: string | null;
}): string {
    const full = (row.full_name ?? "").trim();
    if (full) return full;
    const composed = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
    if (composed) return composed;
    return (row.display_name ?? "").trim() || "Unnamed";
}

export async function buildCombinedRoster(
    supabase: SupabaseClient,
    input: BuildCombinedRosterInput
): Promise<CombinedRosterReadModel> {
    const { orgId, siteLocationId, date } = input;
    const weekday = weekdayOf(date);

    // EVERY unit, deliberately — this is a name lookup, not an option set. The
    // attendance events folded below may legitimately name a shared space (a child
    // on the playground) or a physical room, and a roster that could not name them
    // would render a blank where a real location belongs. Narrowing this to
    // operational groups is the one change that would break it.
    const rooms = await resolveRoomsForLocation(supabase, orgId, siteLocationId);
    const roomNameById = new Map(rooms.map((r) => [r.id, r.name?.trim() || "Room"]));

    // Both sides load in parallel. Child expectations are scoped to
    // subject_type='child' inside the loader; staff supply reads the staff slice.
    const [inputs, staffSupply, staffPresenceRows, childAttendanceRes] = await Promise.all([
        loadOperationalExpectationInputs(supabase, { orgId, siteLocationId }),
        buildStaffSupply(supabase, { orgId, siteLocationId, dateStart: date, dateEnd: date }),
        // ACTUALS. Two typed fact streams, never one table.
        listStaffPresenceForSiteDate(supabase, orgId, siteLocationId, date),
        supabase
            .from("child_attendance_events")
            .select(
                "id, org_id, enrollment_agreement_id, customer_member_id, site_location_id, event_kind, entry_type, corrects_event_id, event_at, service_date, room_location_id, from_room_location_id, to_room_location_id, actor_type, source_type, source_key, created_at"
            )
            .eq("org_id", orgId)
            .eq("site_location_id", siteLocationId)
            .eq("service_date", date),
    ]);

    // Correction/reversal interpretation lives in the folds, never in a consumer.
    const staffDayByPerson = new Map(
        summarizeStaffPresenceByDay(staffPresenceRows).map((d) => [d.personId, d])
    );
    const childAttendanceRows = ((childAttendanceRes.data ?? []) as ChildAttendanceEventRow[]) ?? [];
    const childDayByAgreement = new Map(
        summarizeAttendanceByDay(childAttendanceRows).map((d) => [d.enrollmentAgreementId, d])
    );
    /*
     * CURRENT WHEREABOUTS COMES FROM THE CERTIFIED FOLD, NOT FROM THE DAY SET.
     *
     * `roomsObserved` is an alphabetically sorted SET of every room seen today —
     * there is no time in it. Reading its last element answered "which room name
     * sorts last", which is right often enough to pass a demo and wrong on any
     * afternoon that ends somewhere alphabetically early. Grouped per child so the
     * fold sees one child's history, which is what it expects.
     */
    const eventsByAgreement = new Map<string, ChildAttendanceEventRow[]>();
    for (const e of childAttendanceRows) {
        const list = eventsByAgreement.get(e.enrollment_agreement_id) ?? [];
        list.push(e);
        eventsByAgreement.set(e.enrollment_agreement_id, list);
    }
    // End of the service day: "where did today leave this child", not "where were
    // they at the instant this request happened to run".
    const whereaboutsAsOf = `${date}T23:59:59.999Z`;

    // The effective fact a child correction would target — same fold, so the
    // surface never has to interpret raw history to offer "Correct".
    const childLatestFactByAgreement = new Map<string, string>();
    for (const ev of effectiveAttendanceEvents(childAttendanceRows)
        .slice()
        .sort((a, b) => a.event_at.localeCompare(b.event_at))) {
        childLatestFactByAgreement.set(ev.enrollment_agreement_id, ev.id);
    }

    const extraAgeGroups = await loadExpectationAgeGroups(supabase, orgId, {
        programCategoryIds: [],
        roomLocationIds: rooms.map((r) => r.id),
    });
    const withAgeGroups = {
        ...inputs,
        ageGroupByRoomLocationId: {
            ...(inputs.ageGroupByRoomLocationId ?? {}),
            ...extraAgeGroups.ageGroupByRoomLocationId,
        },
        ageGroupByProgramCategoryId: {
            ...(inputs.ageGroupByProgramCategoryId ?? {}),
            ...extraAgeGroups.ageGroupByProgramCategoryId,
        },
    };

    const expectations = buildScheduleExpectations({
        dateStart: date,
        dateEnd: date,
        agreements: withAgeGroups.agreements,
        placements: withAgeGroups.placements,
        assignments: withAgeGroups.assignments,
        patternsById: withAgeGroups.patternsById,
        config: withAgeGroups.config,
        ageGroupByRoomLocationId: withAgeGroups.ageGroupByRoomLocationId,
        ageGroupByProgramCategoryId: withAgeGroups.ageGroupByProgramCategoryId,
        proposedAssignments: withAgeGroups.proposedAssignments,
    });

    const expectedToday = expectations.expectedAttendance.filter((e) => e.date === date);

    /*
     * KNOWN OPERATIONAL INTENT FOR THIS SERVICE DAY.
     *
     * The schedule says who normally attends and the facts say who turned up;
     * neither knows that Emma is on holiday or that the centre is shut. Without
     * this the roster reports a holiday as a hundred unexplained missing
     * arrivals, which is the defect Thread 4 exists to remove.
     *
     * A failed read THROWS rather than yielding an empty set: "no expectations"
     * and "we could not ask" must never look alike, because the first renders as
     * a normal day.
     */
    const expectationSubjects = [
        { kind: ATTENDANCE_SUBJECT_KINDS.site, id: siteLocationId },
        ...rooms.map((r) => ({ kind: ATTENDANCE_SUBJECT_KINDS.operationalGroup, id: r.id })),
        ...[...new Set(expectedToday.map((e) => e.customerMemberId))].map((id) => ({
            kind: ATTENDANCE_SUBJECT_KINDS.child,
            id,
        })),
    ];
    const serviceDayExpectations = await effectiveExpectationsForWindow(
        { orgId, subjects: expectationSubjects, asOf: serviceDayAsOf(date) },
        createSupabaseExpectationQueryGateway(supabase),
    );

    const serviceDayByChild = new Map(
        interpretServiceDay({
            siteLocationId,
            scheduledChildIds: expectedToday.map((e) => e.customerMemberId),
            groupByChildId: new Map(expectedToday.map((e) => [e.customerMemberId, e.roomLocationId])),
            effective: serviceDayExpectations.effective,
            unresolved: serviceDayExpectations.unresolved,
        }).map((row) => [row.childId, row]),
    );

    // Batched identity resolution — one query per population, never per subject.
    const memberIds = [...new Set(expectedToday.map((e) => e.customerMemberId))];
    const memberRows =
        memberIds.length > 0
            ? ((
                  await supabase
                      .from("customer_members")
                      .select("id, person_id, display_name, first_name, last_name")
                      .eq("org_id", orgId)
                      .in("id", memberIds)
              ).data ?? [])
            : [];
    const memberById = new Map(
        (memberRows as {
            id: string;
            person_id: string | null;
            display_name: string | null;
            first_name: string | null;
            last_name: string | null;
        }[]).map((m) => [m.id, m])
    );

    const childPersonIds = [
        ...new Set(
            [...memberById.values()].map((m) => m.person_id).filter((v): v is string => Boolean(v))
        ),
    ];
    const personRows =
        childPersonIds.length > 0
            ? ((
                  await supabase
                      .from("persons")
                      .select("id, full_name, first_name, last_name")
                      .eq("org_id", orgId)
                      .in("id", childPersonIds)
              ).data ?? [])
            : [];
    const personNameById = new Map(
        (personRows as {
            id: string;
            full_name: string | null;
            first_name: string | null;
            last_name: string | null;
        }[]).map((p) => [p.id, displayNameFrom(p)])
    );

    // Hours come from the ASSIGNMENT each expectation came from, not from the pattern
    // it was created with: two children on one pattern may legitimately differ.
    const assignmentTimes = await resolveAssignmentTimes(supabase, {
        orgId,
        assignmentIds: expectedToday.map((e) => e.assignmentId).filter(Boolean),
    });
    const assignmentTimeLabel = new Map<string, string | null>();
    for (const [assignmentId, time] of assignmentTimes) {
        const uniform = uniformDailyInterval(time);
        assignmentTimeLabel.set(
            assignmentId,
            uniform ? formatCompactScheduleHours(uniform.startTime, uniform.endTime) : null
        );
    }

    // Demand is INTERPRETED, never taken raw: the ratio engine reports 0 required
    // when no tier applies, which would otherwise read as a satisfied room.
    const requiredByRoom = new Map<string, number | null>();
    for (const s of expectations.expectedStaffingByRoomDate) {
        if (s.date !== date) continue;
        requiredByRoom.set(
            s.roomLocationId,
            resolveRequiredStaffDemand({
                requiredStaff: s.requiredStaff,
                exceedsDefinedTiers: s.exceedsDefinedTiers,
                childCount: s.childCount,
            })
        );
    }

    const childrenByRoom = new Map<string, RosterChildSubject[]>();
    for (const e of expectedToday) {
        // A child with no committed room is expected at the site but not placeable
        // on a room card; it must not be silently attributed to an arbitrary room.
        if (!e.roomLocationId) continue;
        const member = memberById.get(e.customerMemberId);
        const personId = member?.person_id ?? null;
        const subject: RosterChildSubject = {
            subjectType: "child",
            customerMemberId: e.customerMemberId,
            enrollmentAgreementId: e.agreementId,
            personId,
            displayName:
                (personId ? personNameById.get(personId) : null) ??
                (member ? displayNameFrom(member) : "Unnamed child"),
            timeLabel: assignmentTimeLabel.get(e.assignmentId) ?? null,
            scheduleTypeKey: e.scheduleTypeKey,
            programCategoryId: e.programCategoryId,
            actual: (() => {
                const day = childDayByAgreement.get(e.agreementId);
                if (!day) return NO_RECORD;

                // State AND location both come from the chronological fold, so the
                // Workspace and the Focus Panel cannot disagree about a child.
                const here = resolveCurrentWhereabouts(
                    eventsByAgreement.get(e.agreementId) ?? [],
                    whereaboutsAsOf,
                );
                if (here.state === "not_arrived") return NO_RECORD;

                return {
                    state: here.state,
                    // Times stay day-level: "when did she first arrive / last leave"
                    // is a question about the whole day, not about this instant.
                    arrivedAt: day.firstCheckInAt,
                    departedAt: day.lastCheckOutAt,
                    actualRoomLocationId: here.locationId,
                    latestFactId: childLatestFactByAgreement.get(e.agreementId) ?? null,
                };
            })(),
            serviceDay: (() => {
                const expectation = serviceDayByChild.get(e.customerMemberId);
                if (!expectation) return undefined;

                // Observed presence is read through the SAME fold the row above
                // uses, so the physical answer and the interpreted answer cannot
                // come from two different readings of the day.
                const here = resolveCurrentWhereabouts(
                    eventsByAgreement.get(e.agreementId) ?? [],
                    whereaboutsAsOf,
                );
                const observed =
                    here.state === "present" ? "present"
                    : here.state === "checked_out" ? "checked_out"
                    : here.state === "absent" ? "absent"
                    : "no_record";

                const state = applyObservedPresence(expectation, observed);
                return {
                    state,
                    expectationId: expectation.expectationId,
                    dayClosed: expectation.interpretation === "closed",
                    reasonKey: expectation.reasonKey,
                    raisesAttention: raisesMissingArrivalAttention(state),
                };
            })(),
        };
        const list = childrenByRoom.get(e.roomLocationId);
        if (list) list.push(subject);
        else childrenByRoom.set(e.roomLocationId, [subject]);
    }

    const staffByRoomKey = new Map(staffSupply.cells.map((c) => [staffSupplyCellKey(c.roomLocationId, c.date), c]));

    // A roster cell is a STAFFING row: occupancy, required staff, ratio breach.
    // Those are facts about an operational GROUP, so only groups are seeded here —
    // otherwise adding a physical room or a playground manufactures an empty cell
    // that reports as a room awaiting ratio configuration, and inflates
    // totals.roomsUnknown with locations that never had a staffing obligation.
    //
    // Seeding, not filtering: the two sources below still admit any location that
    // genuinely has a child or a scheduled staff member today, so a child actually
    // on the playground keeps a row. `rooms` above stays unnarrowed on purpose —
    // it is the name lookup, and it must still be able to name that location.
    const roomIds = [
        ...new Set([
            ...operationalGroupRooms(rooms).map((r) => r.id),
            ...childrenByRoom.keys(),
            ...staffSupply.cells
                .map((c) => c.roomLocationId)
                .filter((v): v is string => Boolean(v)),
        ]),
    ];

    // Same tier resolver the planned demand used — the ACTUAL demand must come
    // from the same ratio engine, never a roster-local calculation.
    const { resolveTiers } = buildRoomConfigResolvers({
        agreements: withAgeGroups.agreements,
        placements: withAgeGroups.placements,
        config: withAgeGroups.config,
        ageGroupByRoomLocationId: withAgeGroups.ageGroupByRoomLocationId,
        ageGroupByProgramCategoryId: withAgeGroups.ageGroupByProgramCategoryId,
    });

    const scheduledPersonIdsByRoom = new Map<string, Set<string>>();
    for (const c of staffSupply.cells) {
        if (!c.roomLocationId) continue;
        scheduledPersonIdsByRoom.set(
            c.roomLocationId,
            new Set(c.scheduledStaff.map((s) => s.personId))
        );
    }

    const staffNameById = new Map(staffSupply.members.map((m) => [m.personId, m.displayName]));

    const cells: RosterCell[] = roomIds.map((roomId) => {
        const children = childrenByRoom.get(roomId) ?? [];
        const supplyCell = staffByRoomKey.get(staffSupplyCellKey(roomId, date)) ?? null;
        const staff: RosterStaffSubject[] = (supplyCell?.scheduledStaff ?? []).map((s) => ({
            ...s,
            subjectType: "staff" as const,
            // Filled below, once the whole site-day is evaluated in one pass. Null
            // here states "not evaluated yet", which is the truthful default: a row
            // that defaulted to a clean signal would assert readiness it never asked about.
            readiness: null as StaffReadinessSignal | null,
            actual: staffActualFromDayState(staffDayByPerson.get(s.personId)),
        }));

        const requiredStaff = requiredByRoom.get(roomId) ?? null;
        const staffingSufficiency = resolveStaffingSufficiency({
            requiredStaff,
            scheduledStaffCount: staff.length,
        });

        // Staff physically here whose actual room is this room but who hold no
        // scheduled assignment for it. They are real supply and must be counted —
        // silently inventing a schedule assignment for them would be worse.
        const scheduledHere = scheduledPersonIdsByRoom.get(roomId) ?? new Set<string>();
        const unscheduledStaffPresent: UnscheduledStaffPresence[] = [...staffDayByPerson.values()]
            .filter(
                (d) =>
                    d.present &&
                    d.currentRoomLocationId === roomId &&
                    !scheduledHere.has(d.personId)
            )
            .map((d) => ({
                subjectType: "staff" as const,
                personId: d.personId,
                displayName: staffNameById.get(d.personId) ?? "Staff member",
                employmentId: d.employmentId,
                actual: staffActualFromDayState(d),
                readiness: null as StaffReadinessSignal | null,
            }));

        const actualChildrenPresent = countsPresent(children.map((c) => c.actual));
        const actualStaffPresent =
            countsPresent(staff.map((s) => s.actual)) +
            countsPresent(unscheduledStaffPresent.map((s) => s.actual));

        const actualDemand = resolveRequiredStaffForChildren(resolveTiers(roomId, date), actualChildrenPresent);
        const { actualRequiredStaff, actualStaffingSufficiency } = resolveActualStaffing({
            actualChildrenPresent,
            actualStaffPresent,
            requiredStaffForActualChildren: actualDemand.requiredStaff,
            exceedsDefinedTiers: actualDemand.exceedsDefinedTiers,
        });

        return {
            roomLocationId: roomId,
            roomName: roomNameById.get(roomId) ?? "Room",
            date,
            weekday,
            children,
            staff,
            expectedChildCount: children.length,
            scheduledStaffCount: staff.length,
            requiredStaff,
            staffingSufficiency,
            staffingReason: requiredStaff == null ? "no_ratio_configuration" : "evaluated",
            actualChildrenPresent,
            actualStaffPresent,
            actualRequiredStaff,
            actualStaffingSufficiency,
            unscheduledStaffPresent,
        };
    });

    cells.sort((a, b) => a.roomName.localeCompare(b.roomName));

    /*
     * ONE readiness evaluation for the whole site·day.
     *
     * Composed here rather than per row: the Slice 6 batch composer fetches a fixed
     * handful of reads for any number of employments, and asking the single-employment
     * question once per staff member would be six queries each on a surface an
     * operator reloads all morning.
     *
     * It is the SAME evaluation the Readiness card performs — same evaluator, same
     * `record_view` trigger — so Operations and the Focus Panel cannot come to
     * disagree about whether Jane's CPR has lapsed.
     */
    const rosterEmploymentIds = [
        ...new Set(
            [
                ...staffSupply.members.map((m) => m.employmentId),
                ...[...staffDayByPerson.values()].map((d) => d?.employmentId ?? null),
            ].filter((v): v is string => Boolean(v)),
        ),
    ];
    const readinessByEmployment = rosterEmploymentIds.length > 0
        ? await composeStaffReadinessSignals(supabase, orgId, rosterEmploymentIds, date)
        : new Map<string, StaffReadinessSignal>();
    const readinessFor = (employmentId: string | null | undefined): StaffReadinessSignal | null =>
        (employmentId ? readinessByEmployment.get(employmentId) ?? null : null);

    for (const cell of cells) {
        for (const member of cell.staff) member.readiness = readinessFor(member.employmentId);
        for (const extra of cell.unscheduledStaffPresent ?? []) extra.readiness = readinessFor(extra.employmentId);
    }

    const anyUnknownDemand = cells.some((c) => c.requiredStaff == null);
    const totals = {
        expectedChildren: cells.reduce((n, c) => n + c.expectedChildCount, 0),
        scheduledStaff: cells.reduce((n, c) => n + c.scheduledStaffCount, 0),
        requiredStaff: anyUnknownDemand
            ? null
            : cells.reduce((n, c) => n + (c.requiredStaff ?? 0), 0),
        roomsShort: cells.filter((c) => c.staffingSufficiency === "short").length,
        roomsUnknown: cells.filter((c) => c.staffingSufficiency === "unknown").length,
        actualChildrenPresent: cells.reduce((n, c) => n + c.actualChildrenPresent, 0),
        actualStaffPresent: cells.reduce((n, c) => n + c.actualStaffPresent, 0),
        roomsActuallyShort: cells.filter((c) => c.actualStaffingSufficiency === "short").length,
    };

    return {
        siteLocationId,
        date,
        cells,
        staffingSufficiency: rollUpStaffingSufficiency(cells.map((c) => c.staffingSufficiency)),
        actualStaffingSufficiency: rollUpStaffingSufficiency(
            cells.map((c) => c.actualStaffingSufficiency)
        ),
        totals,
        unroomedStaff: staffSupply.members
            .filter((m) => m.roomLocationId == null)
            .map((m) => ({
                ...m,
                subjectType: "staff" as const,
                actual: staffActualFromDayState(staffDayByPerson.get(m.personId)),
                // The shape most easily forgotten: a Center Director or a float has no
                // room, and a signal that reached only roomed staff would be silently
                // blind to exactly the people Slice 7 worked to keep visible.
                readiness: readinessFor(m.employmentId),
            })),
    };
}
