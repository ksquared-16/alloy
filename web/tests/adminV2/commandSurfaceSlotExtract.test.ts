import { describe, expect, it } from "vitest";

import { extractCommandSurfaceSlots } from "@/lib/adminV2/aiCommandSurface/commandSurfaceSlotExtract";

describe("extractCommandSurfaceSlots", () => {
    it("splits Mitchell family entity from that-clause goal", () => {
        const s = extractCommandSurfaceSlots(
            "text the Mitchell family that we're excited for her youngest child to start"
        );
        expect(s.entity_search_text?.toLowerCase()).toMatch(/mitchell/);
        expect(s.entity_search_text?.toLowerCase()).toMatch(/family/);
        expect(s.message_goal_text?.toLowerCase()).toContain("excited");
        expect(s.message_goal_text?.toLowerCase()).not.toContain("mitchell");
        expect(s.channel_hint).toBe("sms");
    });

    it("parses email schedule with entity, timing, and goal", () => {
        const s = extractCommandSurfaceSlots("email Smith family tomorrow about tour next steps");
        expect(s.entity_search_text?.toLowerCase()).toMatch(/smith/);
        expect(s.entity_search_text?.toLowerCase()).toMatch(/family/);
        expect(s.message_goal_text?.toLowerCase()).toContain("tour");
        expect(s.timing_phrase?.toLowerCase()).toMatch(/tomorrow/);
        expect(s.channel_hint).toBe("email");
    });

    it("parses reminder with entity and timing", () => {
        const s = extractCommandSurfaceSlots("remind me to follow up with Smith tomorrow");
        expect(s.entity_search_text?.toLowerCase()).toMatch(/smith/);
        expect(s.timing_phrase?.toLowerCase()).toMatch(/tomorrow/);
        expect(s.reminder_verb).toBe(true);
    });

    it("detects job layout vocabulary", () => {
        const s = extractCommandSurfaceSlots("make the job overview more customer focused");
        expect(s.layout_verb).toBe(true);
        expect(s.comms_verb).toBe(false);
    });

    it("detects workflow-like phrasing", () => {
        const s = extractCommandSurfaceSlots("when forms complete move them to ready to enroll");
        expect(s.workflow_like).toBe(true);
    });
});
