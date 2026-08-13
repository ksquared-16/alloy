/**
 * Staff presence fold + planned-vs-actual staffing.
 *
 * The correction/reversal rules are asserted here in the same shape the child
 * attendance fold asserts them — replay must not fork between fact streams.
 */

import { describe, expect, it } from "vitest";

import {
    effectiveStaffPresenceEvents,
    summarizeStaffPresenceByDay,
} from "@/lib/staffPresence/staffPresenceFold";
import type { StaffPresenceEventRow } from "@/lib/staffPresence/staffPresenceVocabulary";
import {
    countsPresent,
    resolveActualStaffing,
    staffActualFromDayState,
} from "@/lib/roster/dailyOperatingState";
import {
    getRegisteredAction,
    hasRegisteredHandler,
} from "@/lib/adminV2/actions/actionRegistry";
import {
    STAFF_PRESENCE_CORRECT_ACTION_KEY,
    STAFF_PRESENCE_RECORD_ACTION_KEY,
} from "@/lib/adminV2/actions/definitions/staffPresenceActions";

const DATE = "2026-08-17";
const PERSON = "person-jane";
const ROOM = "room-a";

function ev(over: Partial<StaffPresenceEventRow> & { id: string }): StaffPresenceEventRow {
    return {
        org_id: "org-1",
        person_id: PERSON,
        employment_id: "emp-1",
        site_location_id: "site-1",
        event_kind: "check_in",
        entry_type: "original",
        corrects_event_id: null,
        event_at: `${DATE}T08:10:00Z`,
        service_date: DATE,
        room_location_id: ROOM,
        actor_type: "operator",
        actor_user_id: null,
        actor_person_id: null,
        actor_label: null,
        source_type: "operator_action",
        source_key: "operator_action",
        reason_key: null,
        note: null,
        metadata: {},
        created_by: null,
        created_at: `${DATE}T08:10:00Z`,
        ...over,
    } as StaffPresenceEventRow;
}

describe("registered presence capabilities", () => {
    it("authors presence only through registered actions", () => {
        expect(hasRegisteredHandler(STAFF_PRESENCE_RECORD_ACTION_KEY)).toBe(true);
        expect(hasRegisteredHandler(STAFF_PRESENCE_CORRECT_ACTION_KEY)).toBe(true);
        expect(getRegisteredAction(STAFF_PRESENCE_CORRECT_ACTION_KEY)?.confirmationPolicy).toBe("required");
    });

    it("refuses a correction that references nothing", async () => {
        const action = getRegisteredAction(STAFF_PRESENCE_CORRECT_ACTION_KEY);
        const eligibility = await action!.resolveEligibility!({
            payload: {},
            invocation: { actionKey: STAFF_PRESENCE_CORRECT_ACTION_KEY, entityType: "person", entityId: PERSON },
        } as never);
        expect(eligibility.eligible).toBe(false);
        expect(eligibility.blockers.map((b) => b.code)).toContain("missing_target");
    });
});

describe("staff presence fold", () => {
    it("treats a correction as the effective fact and the original as superseded", () => {
        const events = [
            ev({ id: "a", event_at: `${DATE}T08:10:00Z` }),
            ev({ id: "b", entry_type: "correction", corrects_event_id: "a", event_at: `${DATE}T07:55:00Z` }),
        ];
        const effective = effectiveStaffPresenceEvents(events);
        expect(effective.map((e) => e.id)).toEqual(["b"]);

        const [day] = summarizeStaffPresenceByDay(events);
        expect(day.firstCheckInAt).toBe(`${DATE}T07:55:00Z`);
        expect(day.present).toBe(true);
    });

    it("treats a reversal as a tombstone that contributes nothing", () => {
        const events = [
            ev({ id: "a" }),
            ev({ id: "b", entry_type: "reversal", corrects_event_id: "a", room_location_id: null }),
        ];
        expect(effectiveStaffPresenceEvents(events)).toHaveLength(0);
        expect(summarizeStaffPresenceByDay(events)).toHaveLength(0);
    });

    it("distinguishes on-site from checked out", () => {
        const [onSite] = summarizeStaffPresenceByDay([ev({ id: "a" })]);
        expect(staffActualFromDayState(onSite).state).toBe("present");

        const [out] = summarizeStaffPresenceByDay([
            ev({ id: "a" }),
            ev({ id: "b", event_kind: "check_out", room_location_id: null, event_at: `${DATE}T16:30:00Z` }),
        ]);
        const actual = staffActualFromDayState(out);
        expect(actual.state).toBe("checked_out");
        expect(actual.departedAt).toBe(`${DATE}T16:30:00Z`);
    });

    it("reports an authored absence distinctly from no record", () => {
        const [absent] = summarizeStaffPresenceByDay([
            ev({ id: "a", event_kind: "absence", room_location_id: null }),
        ]);
        expect(staffActualFromDayState(absent).state).toBe("absent");
        expect(staffActualFromDayState(null).state).toBe("no_record");
    });

    it("carries the ACTUAL room, which is not the scheduled room", () => {
        const [day] = summarizeStaffPresenceByDay([
            ev({ id: "a", room_location_id: "room-a" }),
            ev({ id: "b", event_kind: "present", room_location_id: "room-b", event_at: `${DATE}T11:00:00Z` }),
        ]);
        expect(day.currentRoomLocationId).toBe("room-b");
        expect(day.roomsObserved).toEqual(["room-a", "room-b"]);
    });

    it("counts only present subjects toward actual supply", () => {
        expect(
            countsPresent([
                { state: "present", arrivedAt: null, departedAt: null, actualRoomLocationId: null, latestFactId: null },
                { state: "checked_out", arrivedAt: null, departedAt: null, actualRoomLocationId: null, latestFactId: null },
                { state: "absent", arrivedAt: null, departedAt: null, actualRoomLocationId: null, latestFactId: null },
                { state: "no_record", arrivedAt: null, departedAt: null, actualRoomLocationId: null, latestFactId: null },
            ])
        ).toBe(1);
    });
});

describe("actual staffing sufficiency", () => {
    it("is sufficient when present staff meet demand for present children", () => {
        expect(
            resolveActualStaffing({
                actualChildrenPresent: 4,
                actualStaffPresent: 1,
                requiredStaffForActualChildren: 1,
                exceedsDefinedTiers: false,
            }).actualStaffingSufficiency
        ).toBe("sufficient");
    });

    it("is short when present staff do not meet demand for present children", () => {
        const v = resolveActualStaffing({
            actualChildrenPresent: 8,
            actualStaffPresent: 1,
            requiredStaffForActualChildren: 2,
            exceedsDefinedTiers: false,
        });
        expect(v.actualRequiredStaff).toBe(2);
        expect(v.actualStaffPresent).toBe(1);
        expect(v.actualStaffingSufficiency).toBe("short");
    });

    it("is unknown — never sufficient — when no ratio tier covers the present children", () => {
        // The engine returns requiredStaff 0 with exceedsDefinedTiers when nothing
        // is configured. Taken raw that would read as a satisfied room.
        expect(
            resolveActualStaffing({
                actualChildrenPresent: 6,
                actualStaffPresent: 1,
                requiredStaffForActualChildren: 0,
                exceedsDefinedTiers: true,
            }).actualStaffingSufficiency
        ).toBe("unknown");
    });

    it("does not confuse scheduled staff with present staff", () => {
        // The negative control in narrative form: substituting the scheduled count
        // for the present count flips a genuinely short room to sufficient.
        const truth = resolveActualStaffing({
            actualChildrenPresent: 8,
            actualStaffPresent: 1, // one person actually here
            requiredStaffForActualChildren: 2,
            exceedsDefinedTiers: false,
        });
        const ifWeUsedScheduled = resolveActualStaffing({
            actualChildrenPresent: 8,
            actualStaffPresent: 2, // two people SCHEDULED
            requiredStaffForActualChildren: 2,
            exceedsDefinedTiers: false,
        });
        expect(truth.actualStaffingSufficiency).toBe("short");
        expect(ifWeUsedScheduled.actualStaffingSufficiency).toBe("sufficient");
        expect(truth.actualStaffingSufficiency).not.toBe(ifWeUsedScheduled.actualStaffingSufficiency);
    });
});
