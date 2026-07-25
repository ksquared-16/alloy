/**
 * Canonical compact schedule projection — Scheduling + Children share one formatter.
 */

import { describe, expect, it } from "vitest";
import {
    formatCompactScheduleEffective,
    formatCompactScheduleWeekdays,
    projectCompactScheduleForIdentity,
} from "@/lib/scheduling/projection/projectCompactScheduleForIdentity";
import type { ChildScheduling } from "@/lib/scheduling/projection/schedulingProjectionTypes";

function baseScheduling(overrides: Partial<ChildScheduling> = {}): ChildScheduling {
    return {
        status: "scheduled",
        child: {
            id: "cm-1",
            name: "Lennon",
            program: null,
            ageGroup: null,
            siteId: "site-1",
            siteName: "North Campus",
        },
        current: {
            bucket: "current",
            effectiveFrom: "2026-08-04",
            effectiveTo: null,
            openEnded: true,
            temporary: false,
            assignments: [
                {
                    id: "a1",
                    childId: "cm-1",
                    room: { id: "r1", name: "Toddler 2", program: "Toddler" },
                    weekdays: [1, 2, 3, 4, 5],
                    arriveTime: "07:30",
                    departTime: "17:30",
                    effectiveFrom: "2026-08-04",
                    effectiveTo: null,
                    openEnded: true,
                    kind: "base",
                },
            ],
            scheduleType: "full_day",
            scheduleTypeLabel: "Full Day",
            rate: "pending",
            projectedTuition: null,
        },
        proposed: null,
        upcoming: [],
        temporary: [],
        history: [],
        availableCommands: [],
        ...overrides,
    } as ChildScheduling;
}

describe("canonical compact schedule projection", () => {
    it("formats Mon–Fri as Monday–Friday", () => {
        expect(formatCompactScheduleWeekdays([1, 2, 3, 4, 5])).toBe("Monday–Friday");
        expect(formatCompactScheduleWeekdays([1, 3, 5])).toBe("Mon, Wed, Fri");
    });

    it("omits open-ended when end date is null", () => {
        expect(
            formatCompactScheduleEffective({
                effectiveFrom: "2026-08-04",
                effectiveTo: null,
                openEnded: true,
            }),
        ).toBe("from Aug 4, 2026");
        expect(
            formatCompactScheduleEffective({
                effectiveFrom: "2026-08-04",
                effectiveTo: null,
                openEnded: false,
            }),
        ).toBe("from Aug 4, 2026");
    });

    it("shows an explicit end date range without open-ended", () => {
        expect(
            formatCompactScheduleEffective({
                effectiveFrom: "2026-08-04",
                effectiveTo: "2027-06-30",
                openEnded: false,
            }),
        ).toBe("Aug 4, 2026–Jun 30, 2027");
    });

    it("default compact line is Room · weekly pattern · effective start", () => {
        const compact = projectCompactScheduleForIdentity(baseScheduling());
        expect(compact.compactLine).toBe("Toddler 2 · Monday–Friday · from Aug 4, 2026");
        expect(compact.scheduleLabel).toBe(compact.compactLine);
        expect(compact.compactLine).not.toContain("open-ended");
        expect(compact.compactLine).not.toContain("Full Day");
        expect(compact.compactLine).not.toContain("North Campus");
        expect(compact.compactLine).not.toContain("7:30");
        expect(compact.roomLabel).toBe("Toddler 2");
    });

    it("handles missing room", () => {
        const scheduling = baseScheduling();
        scheduling.current!.assignments[0]!.room = { id: null, name: null, program: null };
        const compact = projectCompactScheduleForIdentity(scheduling);
        expect(compact.compactLine).toBe("Monday–Friday · from Aug 4, 2026");
        expect(compact.roomLabel).toBeNull();
    });

    it("handles missing weekly pattern", () => {
        const scheduling = baseScheduling();
        scheduling.current!.assignments[0]!.weekdays = [];
        const compact = projectCompactScheduleForIdentity(scheduling);
        expect(compact.compactLine).toBe("Toddler 2 · from Aug 4, 2026");
        expect(compact.daysLabel).toBeNull();
    });

    it("uses proposed schedule when current is absent", () => {
        const scheduling = baseScheduling({
            status: "proposed",
            current: null,
            proposed: baseScheduling().current,
        });
        const compact = projectCompactScheduleForIdentity(scheduling);
        expect(compact.compactLine).toBe("Toddler 2 · Monday–Friday · from Aug 4, 2026");
        expect(compact.statusLabel).toBe("Proposed");
    });

    it("uses committed/current schedule when both exist", () => {
        const scheduling = baseScheduling();
        scheduling.proposed = {
            ...scheduling.current!,
            effectiveFrom: "2027-01-01",
            assignments: [
                {
                    ...scheduling.current!.assignments[0]!,
                    room: { id: "r2", name: "Preschool A", program: null },
                },
            ],
        };
        const compact = projectCompactScheduleForIdentity(scheduling);
        expect(compact.roomLabel).toBe("Toddler 2");
        expect(compact.compactLine).toContain("Toddler 2");
        expect(compact.compactLine).not.toContain("Preschool A");
    });

    it("emits emptyLabel when no schedule view exists", () => {
        const scheduling = baseScheduling({
            status: "needs-placement",
            current: null,
            proposed: null,
        });
        const compact = projectCompactScheduleForIdentity(scheduling, {
            emptyLabel: "No schedule yet",
        });
        expect(compact.compactLine).toBe("No schedule yet");
    });
});
