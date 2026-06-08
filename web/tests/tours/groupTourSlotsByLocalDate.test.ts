import { describe, expect, it } from "vitest";
import type { AvailableTourSlot } from "@/lib/tours/availability/types";
import {
    firstAvailableLocalDateKey,
    formatTourSlotTimeRangeLabel,
    groupTourSlotsByLocalDate,
    localDateKeyForSlot,
} from "@/lib/tours/availability/groupTourSlotsByLocalDate";

function slot(p: Partial<AvailableTourSlot> & Pick<AvailableTourSlot, "startAt" | "endAt" | "timezone" | "ruleId">): AvailableTourSlot {
    return {
        remainingCapacity: 1,
        locationId: "loc",
        userId: null,
        ...p,
    };
}

describe("groupTourSlotsByLocalDate", () => {
    it("groups by local wall date in slot timezone", () => {
        const slots: AvailableTourSlot[] = [
            slot({
                startAt: "2026-06-02T15:00:00.000Z",
                endAt: "2026-06-02T16:00:00.000Z",
                timezone: "America/Los_Angeles",
                ruleId: "r1",
            }),
            slot({
                startAt: "2026-06-02T20:00:00.000Z",
                endAt: "2026-06-02T21:00:00.000Z",
                timezone: "America/Los_Angeles",
                ruleId: "r1",
            }),
            slot({
                startAt: "2026-06-03T14:00:00.000Z",
                endAt: "2026-06-03T15:00:00.000Z",
                timezone: "America/Los_Angeles",
                ruleId: "r1",
            }),
        ];
        const g = groupTourSlotsByLocalDate(slots);
        expect(g.orderedDayKeys).toEqual(["2026-06-02", "2026-06-03"]);
        expect(g.byDay.get("2026-06-02")).toHaveLength(2);
        expect(g.byDay.get("2026-06-02")![0]!.startAt).toBe("2026-06-02T15:00:00.000Z");
        expect(g.byDay.get("2026-06-02")![1]!.startAt).toBe("2026-06-02T20:00:00.000Z");
    });

    it("firstAvailableLocalDateKey is earliest local day", () => {
        const slots: AvailableTourSlot[] = [
            slot({
                startAt: "2026-06-10T15:00:00.000Z",
                endAt: "2026-06-10T16:00:00.000Z",
                timezone: "America/Los_Angeles",
                ruleId: "r1",
            }),
            slot({
                startAt: "2026-06-05T15:00:00.000Z",
                endAt: "2026-06-05T16:00:00.000Z",
                timezone: "America/Los_Angeles",
                ruleId: "r1",
            }),
        ];
        expect(firstAvailableLocalDateKey(slots)).toBe("2026-06-05");
    });

    it("localDateKeyForSlot matches grouped bucket", () => {
        const s = slot({
            startAt: "2026-12-25T18:30:00.000Z",
            endAt: "2026-12-25T19:30:00.000Z",
            timezone: "America/New_York",
            ruleId: "r1",
        });
        const k = localDateKeyForSlot(s);
        const g = groupTourSlotsByLocalDate([s]);
        expect(g.byDay.has(k)).toBe(true);
    });

    it("filters slots to selected day bucket", () => {
        const slots: AvailableTourSlot[] = [
            slot({
                startAt: "2026-06-02T15:00:00.000Z",
                endAt: "2026-06-02T16:00:00.000Z",
                timezone: "America/Los_Angeles",
                ruleId: "r1",
            }),
            slot({
                startAt: "2026-06-03T15:00:00.000Z",
                endAt: "2026-06-03T16:00:00.000Z",
                timezone: "America/Los_Angeles",
                ruleId: "r1",
            }),
        ];
        const g = groupTourSlotsByLocalDate(slots);
        const key = "2026-06-02";
        const forDay = g.byDay.get(key) ?? [];
        expect(forDay.length).toBe(1);
        expect(forDay.every((s) => localDateKeyForSlot(s) === key)).toBe(true);
    });

    it("formatTourSlotTimeRangeLabel uses slot timezone", () => {
        const s = slot({
            startAt: "2026-06-02T15:00:00.000Z",
            endAt: "2026-06-02T16:00:00.000Z",
            timezone: "America/Los_Angeles",
            ruleId: "r1",
        });
        const label = formatTourSlotTimeRangeLabel(s);
        expect(label).toContain("–");
        expect(label).toMatch(/8:00/);
    });
});
