import { describe, expect, it } from "vitest";

import { routeCommandSurface } from "@/lib/adminV2/aiCommandSurface/commandSurfaceRouter";
import {
    buildCommandSurfaceRoutingNotice,
    ENTITY_SEARCH_ROUTING_NOTICE,
    shouldAppendCommandSurfaceRoutingNotice,
    WORKFLOW_ASSIST_BOUNDARY_NOTICE,
} from "@/lib/adminV2/aiCommandSurface/commandSurfaceRoutingCopy";
import { usingActiveRecordNoticeText } from "@/lib/adminV2/bos/activeOperationalContext";

const CHATBOT_PATTERNS = [/AI selected/i, /Matched capability/i, /Detected workflow/i, /heuristic/i];

function expectNoChatbotCopy(text: string) {
    for (const pattern of CHATBOT_PATTERNS) {
        expect(text).not.toMatch(pattern);
    }
}

describe("commandSurfaceRoutingCopy", () => {
    it("builds calm Task Assist routing notice", () => {
        const routed = routeCommandSurface("text the Mitchell family about tour");
        const text = buildCommandSurfaceRoutingNotice({ route: routed });
        expect(text).toMatch(/^Routing to Task Assist —/);
        expect(text).toMatch(/outbound message/i);
        expectNoChatbotCopy(text!);
    });

    it("builds Workflow Assist routing for failed runs", () => {
        const routed = routeCommandSurface("Show me workflows that failed this week");
        const text = buildCommandSurfaceRoutingNotice({ route: routed });
        expect(text).toMatch(/^Routing to Workflow Assist —/);
        expect(text).toMatch(/failed recently/i);
        expectNoChatbotCopy(text!);
    });

    it("skips generic routing when only workflow boundary applies", () => {
        const routed = routeCommandSurface("when forms complete move them to ready to enroll");
        const boundaryOnly = {
            ...routed,
            workflowAssistReadIntent: null,
            workflowAssistCreateIntent: null,
        };
        expect(shouldAppendCommandSurfaceRoutingNotice(boundaryOnly)).toBe(false);
        expect(shouldAppendCommandSurfaceRoutingNotice(routed)).toBe(true);
    });

    it("entity search notice is operational", () => {
        expect(ENTITY_SEARCH_ROUTING_NOTICE).toMatch(/matching records/i);
        expectNoChatbotCopy(ENTITY_SEARCH_ROUTING_NOTICE);
    });

    it("active record notice uses operator label", () => {
        expect(usingActiveRecordNoticeText("Chen household")).toBe("Using active record: Chen household");
    });

    it("workflow boundary copy avoids AI/debug tone", () => {
        expect(WORKFLOW_ASSIST_BOUNDARY_NOTICE).toContain("workflow configuration");
        expect(WORKFLOW_ASSIST_BOUNDARY_NOTICE).toContain("Task Assist");
        expectNoChatbotCopy(WORKFLOW_ASSIST_BOUNDARY_NOTICE);
    });
});
