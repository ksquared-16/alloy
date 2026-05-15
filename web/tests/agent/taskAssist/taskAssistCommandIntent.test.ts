import { describe, expect, it } from "vitest";

import {
    buildTaskAssistCommandBootstrap,
    parseTaskAssistCommandIntent,
    timingHintToDatetimeLocal,
} from "@/lib/agent/taskAssist/taskAssistCommandIntent";

describe("parseTaskAssistCommandIntent", () => {
    it("detects SMS draft from text command", () => {
        const p = parseTaskAssistCommandIntent("text the Smith family about missing forms");
        expect(p.intent_type).toBe("draft_message");
        expect(p.channel_hint).toBe("sms");
        expect(p.message_goal_text?.toLowerCase()).toContain("missing forms");
        expect(p.search_text_hint?.toLowerCase()).toMatch(/smith/);
        expect(p.workflow_blocked).toBe(false);
    });

    it("detects email draft", () => {
        const p = parseTaskAssistCommandIntent("email Johnson about tour confirmation");
        expect(p.intent_type).toBe("draft_message");
        expect(p.channel_hint).toBe("email");
    });

    it("detects schedule when timing and message intent coexist", () => {
        const p = parseTaskAssistCommandIntent("text Smith about forms tomorrow at 9");
        expect(p.intent_type).toBe("schedule_message");
        expect(p.channel_hint).toBe("sms");
        expect(p.timing_hint_text?.toLowerCase()).toMatch(/tomorrow/);
    });

    it("detects create_reminder", () => {
        const p = parseTaskAssistCommandIntent("remind me to follow up with Smith next week");
        expect(p.intent_type).toBe("create_reminder");
        expect(p.timing_hint_text?.toLowerCase()).toMatch(/next week/);
    });

    it("blocks workflow-like phrases", () => {
        const p = parseTaskAssistCommandIntent("when tour happens automatically send them email");
        expect(p.workflow_blocked).toBe(true);
        expect(p.warnings.some((w) => w.includes("Workflow Assist"))).toBe(true);
    });

    it("blocks workflow vocabulary", () => {
        expect(parseTaskAssistCommandIntent("create a workflow rule for Smith").workflow_blocked).toBe(true);
        expect(parseTaskAssistCommandIntent("trigger email every time they apply").workflow_blocked).toBe(true);
    });

    it("returns unknown for name-only search with clarification warning", () => {
        const p = parseTaskAssistCommandIntent("Smith family");
        expect(p.intent_type).toBe("unknown");
        expect(p.search_text_hint?.toLowerCase()).toMatch(/smith/);
        expect(p.warnings.length).toBeGreaterThan(0);
    });

    it("buildTaskAssistCommandBootstrap maps schedule intent to open_schedule", () => {
        const p = parseTaskAssistCommandIntent("email Smith about invoice tomorrow");
        const b = buildTaskAssistCommandBootstrap(p);
        expect(b.intent_type).toBe("schedule_message");
        expect(b.open_schedule).toBe(true);
        expect(b.channel_hint).toBe("email");
        expect(b.instruction?.toLowerCase()).toMatch(/invoice/);
    });

    it("buildTaskAssistCommandBootstrap maps reminder title", () => {
        const p = parseTaskAssistCommandIntent("follow up with Smith about packet");
        const b = buildTaskAssistCommandBootstrap(p);
        expect(b.intent_type).toBe("create_reminder");
        expect(b.reminder_title?.toLowerCase()).toMatch(/packet/);
    });
});

describe("timingHintToDatetimeLocal", () => {
    it("parses tomorrow with default morning hour", () => {
        const v = timingHintToDatetimeLocal("tomorrow");
        expect(v).toMatch(/T09:00$/);
    });

    it("parses at 9 am/pm hints", () => {
        const v = timingHintToDatetimeLocal("tomorrow at 9");
        expect(v).toBeTruthy();
    });
});
