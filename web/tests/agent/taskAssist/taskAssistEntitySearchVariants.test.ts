import { describe, expect, it } from "vitest";

import { extractCommandSurfaceSlots } from "@/lib/adminV2/aiCommandSurface/commandSurfaceSlotExtract";
import { commandSurfaceEntitySearchQuery } from "@/lib/adminV2/aiCommandSurface/commandSurfaceRouter";
import { parseTaskAssistCommandIntent } from "@/lib/agent/taskAssist/taskAssistCommandIntent";
import {
    buildTaskAssistEntitySearchVariants,
    formatTaskAssistEntitySearchNoMatchMessage,
    primaryTaskAssistEntitySearchToken,
} from "@/lib/agent/taskAssist/taskAssistEntitySearchVariants";

const MITCHELL_CMD =
    "text the Mitchell family that we're excited for her youngest child to start";

describe("taskAssistEntitySearchVariants", () => {
    it("builds family/household/surname variants from Mitchell family", () => {
        const v = buildTaskAssistEntitySearchVariants("Mitchell family");
        expect(v.map((x) => x.toLowerCase())).toEqual(
            expect.arrayContaining(["mitchell family", "mitchell", "mitchell household"])
        );
        expect(v.length).toBeLessThanOrEqual(6);
    });

    it("dedupes family and household cross-variants", () => {
        const v = buildTaskAssistEntitySearchVariants("Smith household");
        const lower = v.map((x) => x.toLowerCase());
        expect(new Set(lower).size).toBe(lower.length);
        expect(lower).toContain("smith family");
        expect(lower).toContain("smith household");
        expect(lower).toContain("smith");
    });

    it("primary token prefers surname over family suffix", () => {
        expect(primaryTaskAssistEntitySearchToken("Mitchell family")).toBe("Mitchell");
    });

    it("no-match message includes display token", () => {
        expect(formatTaskAssistEntitySearchNoMatchMessage("Mitchell")).toContain("'Mitchell'");
    });
});

describe("Mitchell command end-to-end extract + search q", () => {
    it("does not send full sentence to entity search", () => {
        const slots = extractCommandSurfaceSlots(MITCHELL_CMD);
        expect(slots.entity_search_text?.toLowerCase()).toMatch(/mitchell/);
        expect(slots.message_goal_text?.toLowerCase()).toContain("excited");
        expect(slots.message_goal_text?.toLowerCase()).not.toContain("mitchell");

        const intent = parseTaskAssistCommandIntent(MITCHELL_CMD);
        const q = commandSurfaceEntitySearchQuery(MITCHELL_CMD, slots, intent);
        expect(q.toLowerCase()).toMatch(/mitchell/);
        expect(q.length).toBeLessThan(40);
        expect(q.toLowerCase()).not.toContain("excited");
        expect(q.toLowerCase()).not.toContain("youngest");
    });
});
