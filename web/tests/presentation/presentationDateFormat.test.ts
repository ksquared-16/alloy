import { describe, expect, it } from "vitest";
import {
    formatActivityTimestamp,
    formatDisplayDate,
    formatDisplayDateTime,
    formatQueueRecordDateDisplay,
    formatQueueRowDateCompact,
    formatTaskDueDate,
} from "@/lib/presentation/presentationDateFormat";

describe("presentationDateFormat", () => {
    it("formatDisplayDate uses short month display doctrine", () => {
        expect(formatDisplayDate("2024-03-15")).toBe("Mar 15, 2024");
        expect(formatDisplayDate("2026-06-15")).toBe("Jun 15, 2026");
    });

    it("formatDisplayDateTime uses middle dot between date and time", () => {
        expect(formatDisplayDateTime("2026-05-20T14:30:00.000Z")).toBe("May 20, 2026 · 2:30 PM");
    });

    it("formatQueueRowDateCompact omits year in reference year", () => {
        expect(formatQueueRowDateCompact("2026-05-20", { nowMs: Date.parse("2026-06-01T12:00:00.000Z") })).toBe("May 20");
    });

    it("formatQueueRowDateCompact includes year when outside reference year", () => {
        expect(formatQueueRowDateCompact("2024-03-15", { nowMs: Date.parse("2026-06-01T12:00:00.000Z") })).toBe("Mar 15, 2024");
    });

    it("formatQueueRecordDateDisplay matches compact queue doctrine", () => {
        expect(formatQueueRecordDateDisplay("2024-03-15")).toBe("Mar 15, 2024");
        expect(formatQueueRecordDateDisplay("2026-05-20T14:30:00.000Z")).toBe("May 20 · 2:30 PM");
    });

    it("formatTaskDueDate includes weekday and compact time", () => {
        const formatted = formatTaskDueDate("2026-01-01T09:00:00.000Z");
        expect(formatted).toMatch(/^Thu, Jan 1 • 9 AM$/);
    });

    it("formatActivityTimestamp uses Today and Yesterday labels", () => {
        const now = Date.parse("2026-06-15T18:00:00.000Z");
        expect(
            formatActivityTimestamp("2026-06-15T14:12:00.000Z", { nowMs: now }),
        ).toBe("Today • 2:12 PM");
        expect(
            formatActivityTimestamp("2026-06-14T16:35:00.000Z", { nowMs: now }),
        ).toBe("Yesterday • 4:35 PM");
        expect(
            formatActivityTimestamp("2025-06-15T14:15:00.000Z", { nowMs: now }),
        ).toBe("Jun 15, 2025 • 2:15 PM");
    });
});
