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
import { requiredStaffForChildren } from "@/lib/childcareOperational/config/ratioRules";
import { buildScheduleExpectations } from "@/lib/childcareOperational/expectations/buildScheduleExpectations";
import {
    countsPresent,
    NO_RECORD,
    resolveActualStaffing,
    staffActualFromDayState,
    type SubjectActualState,
} from "@/lib/roster/dailyOperatingState";
import { summarizeStaffPresenceByDay } from "@/lib/staffPresence/staffPresenceFold";
import { listStaffPresenceForSiteDate } from "@/lib/staffPresence/staffPresenceService";
import { loadOperationalExpectationInputs } from "@/lib/childcareOperational/expectations/loadOperationalExpectationInputs";
import { loadExpectationAgeGroups } from "@/lib/childcareOperational/expectations/resolveExpectationAgeGroups";
import { resolveRoomsForLocation } from "@/lib/location/canonicalRoomProvider";
import { readPatternDefaultHours } from "@/lib/scheduling/editorPatterns";
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
};

/** A staff member scheduled in a room on a date. Preview only — never Person detail. */
export type RosterStaffSubject = ScheduledStaffMember & {
    subjectType: "staff";
    /** Expected vs actual. A schedule is never proof of physical presence. */
    actual: SubjectActualState;
};

/** Staff physically present who were not on the schedule for this room·date. */
export type UnscheduledStaffPresence = {
    subjectType: "staff";
    personId: string;
    displayName: string;
    employmentId: string;
    actual: SubjectActualState;
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

    const patternIds = [...new Set(expectedToday.map((e) => e.schedulePatternId).filter(Boolean))];
    const patternRows =
        patternIds.length > 0
            ? ((
                  await supabase
                      .from("schedule_patterns")
                      .select("id, metadata")
                      .eq("org_id", orgId)
                      .in("id", patternIds)
              ).data ?? [])
            : [];
    const patternTimeLabel = new Map<string, string | null>();
    for (const p of patternRows as { id: string; metadata: unknown }[]) {
        const hours = readPatternDefaultHours((p.metadata ?? null) as Record<string, unknown> | null);
        patternTimeLabel.set(p.id, hours ? formatCompactScheduleHours(hours.arrive, hours.depart) : null);
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
            timeLabel: patternTimeLabel.get(e.schedulePatternId) ?? null,
            scheduleTypeKey: e.scheduleTypeKey,
            programCategoryId: e.programCategoryId,
            actual: (() => {
                const day = childDayByAgreement.get(e.agreementId);
                if (!day) return NO_RECORD;
                if (day.absent && !day.present) {
                    return {
                        state: "absent" as const,
                        arrivedAt: null,
                        departedAt: null,
                        actualRoomLocationId: null,
                        latestFactId: childLatestFactByAgreement.get(e.agreementId) ?? null,
                    };
                }
                if (!day.present) return NO_RECORD;
                return {
                    state: (day.missingCheckout ? "present" : day.lastCheckOutAt ? "checked_out" : "present") as
                        | "present"
                        | "checked_out",
                    arrivedAt: day.firstCheckInAt,
                    departedAt: day.lastCheckOutAt,
                    actualRoomLocationId: day.roomsObserved[day.roomsObserved.length - 1] ?? null,
                    latestFactId: childLatestFactByAgreement.get(e.agreementId) ?? null,
                };
            })(),
        };
        const list = childrenByRoom.get(e.roomLocationId);
        if (list) list.push(subject);
        else childrenByRoom.set(e.roomLocationId, [subject]);
    }

    const staffByRoomKey = new Map(staffSupply.cells.map((c) => [staffSupplyCellKey(c.roomLocationId, c.date), c]));

    const roomIds = [
        ...new Set([
            ...rooms.map((r) => r.id),
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
            }));

        const actualChildrenPresent = countsPresent(children.map((c) => c.actual));
        const actualStaffPresent =
            countsPresent(staff.map((s) => s.actual)) +
            countsPresent(unscheduledStaffPresent.map((s) => s.actual));

        const actualDemand = requiredStaffForChildren(resolveTiers(roomId, date), actualChildrenPresent);
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
            })),
    };
}
