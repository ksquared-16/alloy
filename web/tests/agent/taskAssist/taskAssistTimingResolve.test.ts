import { describe, expect, it } from "vitest";

import {
    formatResolvedTimingLabel,
    resolveNextWeekdayLocal,
    timingHintIsDateGranularOnly,
    timingHintToDatetimeLocal,
} from "@/lib/agent/taskAssist/taskAssistTimingResolve";

describe("taskAssistTimingResolve", () => {
    it("resolves Monday at 9a to the upcoming Monday from Friday", () => {
        const friday = new Date(2026, 4, 15, 14, 0, 0, 0);
        expect(friday.getDay()).toBe(5);
        const resolved = resolveNextWeekdayLocal({ weekday: 1, hour: 9, minute: 0, now: friday });
        expect(resolved.getDay()).toBe(1);
        expect(resolved.getDate()).toBe(18);
        expect(resolved.getHours()).toBe(9);
        expect(resolved.getMinutes()).toBe(0);
        const local = timingHintToDatetimeLocal("Monday at 9a", { now: friday });
        expect(local).toMatch(/^2026-05-18T09:00/);
    });

    it("treats tomorrow without clock as date-granular only", () => {
        expect(timingHintIsDateGranularOnly("tomorrow")).toBe(true);
        expect(timingHintIsDateGranularOnly("Monday at 9a")).toBe(false);
    });

    it("formats resolved timing for thread copy", () => {
        const friday = new Date(2026, 4, 15, 10, 0, 0, 0);
        const label = formatResolvedTimingLabel("Monday at 9a", { now: friday });
        expect(label).toBeTruthy();
        expect(label!.toLowerCase()).toContain("mon");
    });
});
