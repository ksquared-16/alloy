import { describe, expect, it } from "vitest";
import { formatQueueRecordDateDisplay } from "@/lib/adminFormatters";

describe("formatQueueRecordDateDisplay", () => {
    it("formats ISO date-only as MM-DD-YYYY", () => {
        expect(formatQueueRecordDateDisplay("2024-03-15")).toBe("03-15-2024");
    });

    it("formats ISO datetime with middle dot separator", () => {
        expect(formatQueueRecordDateDisplay("2026-05-20T14:30:00.000Z")).toBe("05-20-2026 · 2:30 PM");
    });

    it("normalizes tour preview strings to MM-DD-YYYY", () => {
        const year = new Date().getUTCFullYear();
        expect(formatQueueRecordDateDisplay("May 20, 2:30 PM")).toBe(`05-20-${year} · 2:30 PM`);
    });
});
