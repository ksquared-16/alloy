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
                    subjectId: "cm-1",
                    subjectType: "child",
                    childId: "cm-1",
                    room: { id: "r1", name: "Toddler 2", program: "Toddler" },
                    weekdays: [1, 2, 3, 4, 5],
                    arriveTime: "07:30",
                    departTime: "17:30",
                    effectiveFrom: "2026-08-04",
                    effectiveTo: null,
                    openEnded: true,
                    kind: "base",
                    status: "active",
                    isPrimary: true,
                    assignmentType: {
                        id: null,
                        key: null,
                        label: null,
                        iconKey: null,
                        visualTone: null,
                        billingParticipation: null,
                        attendanceParticipation: null,
                        staffingParticipation: null,
                    },
                    patternId: "pat-1",
                    patternLabel: null,
                    billing: { participation: "none", label: "No billing" },
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
    };
}

describe("canonical compact schedule projection", () => {
    it("formats Mon–Fri as Mon–Fri", () => {
        expect(formatCompactScheduleWeekdays([1, 2, 3, 4, 5])).toBe("Mon–Fri");
        expect(formatCompactScheduleWeekdays([1, 3, 5])).toBe("Mon/Wed/Fri");
    });

    it("omits open-ended when end date is null", () => {
        expect(
            formatCompactScheduleEffective({
                effectiveFrom: "2026-08-04",
                effectiveTo: null,
                openEnded: true,
            }),
        ).toBe("Aug 4, 2026");
        expect(
            formatCompactScheduleEffective({
                effectiveFrom: "2026-08-04",
                effectiveTo: null,
                openEnded: false,
            }),
        ).toBe("Aug 4, 2026");
    });

    it("shows an explicit end date range with an arrow", () => {
        expect(
            formatCompactScheduleEffective({
                effectiveFrom: "2026-08-04",
                effectiveTo: "2027-06-30",
                openEnded: false,
            }),
        ).toBe("Aug 4, 2026 → Jun 30, 2027");
    });

    it("default compact line is Room · Days · Effective · Time", () => {
        const compact = projectCompactScheduleForIdentity(baseScheduling());
        expect(compact.compactLine).toBe("Toddler 2 · Mon–Fri · Aug 4, 2026 · 7:30 AM–5:30 PM");
        expect(compact.scheduleLabel).toBe(compact.compactLine);
        expect(compact.compactLine).not.toContain("open-ended");
        expect(compact.compactLine).not.toContain("Full Day");
        expect(compact.compactLine).not.toContain("North Campus");
        expect(compact.roomLabel).toBe("Toddler 2");
    });

    it("keeps room-first scan and appends +N more for concurrent assignments", () => {
        const scheduling = baseScheduling();
        scheduling.current!.assignments = [
            {
                ...scheduling.current!.assignments[0]!,
                id: "primary",
                isPrimary: true,
                assignmentType: {
                    ...scheduling.current!.assignments[0]!.assignmentType,
                    key: "primary_classroom",
                    label: "Primary Classroom",
                    billingParticipation: "eligible",
                },
                billing: { participation: "eligible", label: "Tuition" },
            },
            {
                ...scheduling.current!.assignments[0]!,
                id: "before",
                isPrimary: false,
                arriveTime: "07:00",
                departTime: "08:30",
                assignmentType: {
                    ...scheduling.current!.assignments[0]!.assignmentType,
                    key: "before_care",
                    label: "Before Care",
                    billingParticipation: "eligible",
                },
                billing: { participation: "eligible", label: "Recurring billing eligible" },
            },
        ];
        const compact = projectCompactScheduleForIdentity(scheduling);
        expect(compact.primaryTypeLabel).toBe("Primary Classroom");
        expect(compact.assignmentCount).toBe(2);
        expect(compact.compactLine).toBe(
            "Toddler 2 · Mon–Fri · Aug 4, 2026 · 7:30 AM–5:30 PM · +1 more"
        );
    });

    it("handles missing room", () => {
        const scheduling = baseScheduling();
        scheduling.current!.assignments[0]!.room = { id: null, name: null, program: null };
        const compact = projectCompactScheduleForIdentity(scheduling);
        expect(compact.compactLine).toBe("Mon–Fri · Aug 4, 2026 · 7:30 AM–5:30 PM");
        expect(compact.roomLabel).toBeNull();
    });

    it("handles missing weekly pattern", () => {
        const scheduling = baseScheduling();
        scheduling.current!.assignments[0]!.weekdays = [];
        const compact = projectCompactScheduleForIdentity(scheduling);
        expect(compact.compactLine).toBe("Toddler 2 · Aug 4, 2026 · 7:30 AM–5:30 PM");
        expect(compact.daysLabel).toBeNull();
    });

    it("uses proposed schedule when current is absent", () => {
        const scheduling = baseScheduling({
            status: "proposed",
            current: null,
            proposed: baseScheduling().current,
        });
        const compact = projectCompactScheduleForIdentity(scheduling);
        expect(compact.compactLine).toBe("Toddler 2 · Mon–Fri · Aug 4, 2026 · 7:30 AM–5:30 PM");
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

    it("can omit hours when includeHours is false", () => {
        const compact = projectCompactScheduleForIdentity(baseScheduling(), { includeHours: false });
        expect(compact.compactLine).toBe("Toddler 2 · Mon–Fri · Aug 4, 2026");
    });
});
