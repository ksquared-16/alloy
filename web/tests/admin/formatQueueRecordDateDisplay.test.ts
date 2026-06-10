import { describe, expect, it } from "vitest";
import { formatQueueRecordDateDisplay } from "@/lib/adminFormatters";

describe("formatQueueRecordDateDisplay", () => {
    it("formats ISO date-only as compact display month", () => {
        expect(formatQueueRecordDateDisplay("2024-03-15")).toBe("Mar 15, 2024");
    });

    it("formats ISO datetime with middle dot separator", () => {
        expect(formatQueueRecordDateDisplay("2026-05-20T14:30:00.000Z")).toBe("May 20 · 2:30 PM");
    });

    it("normalizes tour preview strings to display doctrine", () => {
        const year = new Date().getUTCFullYear();
        expect(formatQueueRecordDateDisplay("May 20, 2:30 PM")).toBe(`May 20 · 2:30 PM`);
        void year;
    });
});
