/**
 * Tour automation Rule conditions — reuse Work View filters_v1 evaluator.
 */

import { describe, expect, it } from "vitest";

import {
    evaluateTourAutomationConditions,
    parseTourAutomationConditions,
} from "@/lib/tours/comms/tourCommsAutomationConditions";
import {
    buildTourCommsStudioDraftFromConfig,
    serializeTourCommsStudioDraftToFragment,
} from "@/lib/tours/comms/tourCommsStudioPolicy";
import {
    mergeTourCommsConfig,
    parseTourCommsConfigFragment,
} from "@/lib/tours/comms/tourCommsConfig";
import { buildTourReminderSchedulePlans } from "@/lib/tours/comms/tourReminderTiming";

const tourStart = "2026-08-20T16:00:00.000Z";
const now = new Date("2026-08-13T00:00:00.000Z");

const waitlistAndNorth = [
    { field_key: "opportunity_stage", operator: "equals" as const, value: "waitlist" },
    { field_key: "site", operator: "equals" as const, value: "loc-north" },
];

describe("tourCommsAutomationConditions", () => {
    it("parses only runtime-supported automation fields", () => {
        const parsed = parseTourAutomationConditions([
            ...waitlistAndNorth,
            { field_key: "program", operator: "equals", value: "infant" },
            { field_key: "bogus", operator: "equals", value: "x" },
        ]);
        expect(parsed).toEqual(waitlistAndNorth);
    });

    it("AND-passes when Stage + Location match Kurzman-like facts", () => {
        expect(
            evaluateTourAutomationConditions(waitlistAndNorth, {
                stage_key: "waitlist",
                site_id: "loc-north",
                has_active_tour: true,
            }).pass,
        ).toBe(true);
    });

    it("AND-fails when Location is wrong", () => {
        expect(
            evaluateTourAutomationConditions(waitlistAndNorth, {
                stage_key: "waitlist",
                site_id: "loc-wrong",
                has_active_tour: true,
            }).pass,
        ).toBe(false);
    });

    it("AND-fails when Stage is a non-matching configured stage", () => {
        expect(
            evaluateTourAutomationConditions(waitlistAndNorth, {
                stage_key: "enrolled",
                site_id: "loc-north",
                has_active_tour: true,
            }).pass,
        ).toBe(false);
    });

    it("empty conditions always pass", () => {
        expect(
            evaluateTourAutomationConditions([], {
                stage_key: "lead",
                site_id: "loc-north",
            }).pass,
        ).toBe(true);
    });
});

describe("tour reminder schedule plans — automation conditions", () => {
    function plans(fragment: Record<string, unknown>, facts: Record<string, unknown>) {
        const config = mergeTourCommsConfig(parseTourCommsConfigFragment(fragment), {});
        return buildTourReminderSchedulePlans({
            tourStartAtIso: tourStart,
            bookingStatusKey: "confirmed",
            bookingTimezone: "America/Los_Angeles",
            config,
            now,
            conditionFacts: facts,
        });
    }

    it("schedules when Stage=Waitlist matches", () => {
        const result = plans(
            {
                reminder_offsets: [{ reminder_key: "r24", offset_minutes: 1440, channels: ["email"] }],
                channels: { email: true, sms: false },
                automation_conditions_v1: [
                    { field_key: "opportunity_stage", operator: "equals", value: "waitlist" },
                ],
            },
            { stage_key: "waitlist", location_id: "loc-north", has_active_tour: true },
        );
        expect(result.filter((p) => p.kind === "schedule")).toHaveLength(1);
    });

    it("suppresses when Stage does not match", () => {
        const result = plans(
            {
                reminder_offsets: [{ reminder_key: "r24", offset_minutes: 1440, channels: ["email"] }],
                channels: { email: true, sms: false },
                automation_conditions_v1: [
                    { field_key: "opportunity_stage", operator: "equals", value: "waitlist" },
                ],
            },
            { stage_key: "enrolled", location_id: "loc-north", has_active_tour: true },
        );
        const suppressed = result.filter((p) => p.kind === "suppressed");
        expect(suppressed).toHaveLength(1);
        expect(suppressed[0]).toMatchObject({ reason: "conditions_not_met" });
    });

    it("suppresses when Stage matches but Location does not (multi-AND)", () => {
        const result = plans(
            {
                reminder_offsets: [{ reminder_key: "r24", offset_minutes: 1440, channels: ["email"] }],
                channels: { email: true, sms: false },
                automation_conditions_v1: waitlistAndNorth,
            },
            { stage_key: "waitlist", site_id: "loc-wrong", has_active_tour: true },
        );
        expect(result.every((p) => p.kind === "suppressed" && p.reason === "conditions_not_met")).toBe(
            true,
        );
    });
});

describe("tourCommsStudioPolicy — conditions round-trip", () => {
    it("persists Stage + Location AND conditions through draft serialize/parse", () => {
        const draft = buildTourCommsStudioDraftFromConfig(
            mergeTourCommsConfig(
                parseTourCommsConfigFragment({
                    automation_conditions_v1: waitlistAndNorth,
                }),
                {},
            ),
        );
        expect(draft.automationConditions).toEqual(waitlistAndNorth);

        const fragment = serializeTourCommsStudioDraftToFragment(draft, {});
        expect(fragment.automation_conditions_v1).toEqual(waitlistAndNorth);

        const reopened = buildTourCommsStudioDraftFromConfig(
            mergeTourCommsConfig(parseTourCommsConfigFragment(fragment), {}),
        );
        expect(reopened.automationConditions).toEqual(waitlistAndNorth);
    });
});
