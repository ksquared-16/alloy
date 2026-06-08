import { describe, expect, it } from "vitest";

import {
    formatOperationalTaskDueDisplay,
    formatOperationalTaskSourceLabel,
    operationalTaskDueToLocalInput,
} from "@/lib/agent/taskAssist/formatOperationalTaskSourceLabel";

describe("formatOperationalTaskSourceLabel", () => {
    it("maps task_assist to friendly copy", () => {
        expect(formatOperationalTaskSourceLabel("task_assist")).toBe("Task Assist follow-up");
    });

    it("maps manual to friendly copy", () => {
        expect(formatOperationalTaskSourceLabel("manual")).toBe("Added manually");
    });

    it("never returns raw task_assist for mixed case input", () => {
        expect(formatOperationalTaskSourceLabel("TASK_ASSIST")).not.toContain("task_assist");
    });
});

describe("formatOperationalTaskDueDisplay", () => {
    it("formats parseable ISO timestamps", () => {
        const out = formatOperationalTaskDueDisplay("2026-06-15T14:30:00.000Z");
        expect(out).toBeTruthy();
        expect(out).not.toBe("2026-06-15T14:30:00.000Z");
    });
});

describe("operationalTaskDueToLocalInput", () => {
    it("returns empty string for invalid ISO", () => {
        expect(operationalTaskDueToLocalInput("not-a-date")).toBe("");
    });
});
