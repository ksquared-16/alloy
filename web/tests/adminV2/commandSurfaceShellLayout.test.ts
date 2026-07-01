import { describe, expect, it } from "vitest";

import { routeCommandSurface } from "@/lib/adminV2/aiCommandSurface/commandSurfaceRouter";
import {
    COMMAND_SURFACE_SEARCHING_NOTICE,
    isEntitySearchOnlyTaskAssistRoute,
    resolveCommandSurfaceThreadStatusLabel,
    shouldAppendCommandSurfaceRoutingNotice,
    shouldShowInlineThreadBusyIndicator,
} from "@/lib/adminV2/aiCommandSurface/commandSurfaceShellLayout";

describe("commandSurfaceShellLayout", () => {
    it("defers routing notice for entity-search-only Task Assist commands", () => {
        const routed = routeCommandSurface("find Mitchell family");
        expect(routed.route).toBe("task_assist");
        expect(isEntitySearchOnlyTaskAssistRoute(routed)).toBe(true);
        expect(shouldAppendCommandSurfaceRoutingNotice(routed)).toBe(false);
    });

    it("still appends routing for comms commands", () => {
        const routed = routeCommandSurface("text the Mitchell family about tour");
        expect(shouldAppendCommandSurfaceRoutingNotice(routed)).toBe(true);
    });

    it("suppresses inline busy when searching notice follows user message", () => {
        const show = shouldShowInlineThreadBusyIndicator({
            busy: true,
            turns: [
                { id: "1", kind: "user_message", text: "find smith", at: "" },
                {
                    id: "2",
                    kind: "assistant_notice",
                    text: COMMAND_SURFACE_SEARCHING_NOTICE,
                    noticeRole: "searching",
                    at: "",
                },
            ],
        });
        expect(show).toBe(false);
        expect(resolveCommandSurfaceThreadStatusLabel({ busy: true, turns: [] })).toBe("Processing…");
        expect(
            resolveCommandSurfaceThreadStatusLabel({
                busy: true,
                turns: [
                    { id: "1", kind: "user_message", text: "x", at: "" },
                    {
                        id: "2",
                        kind: "assistant_notice",
                        text: COMMAND_SURFACE_SEARCHING_NOTICE,
                        noticeRole: "searching",
                        at: "",
                    },
                ],
            })
        ).toBeNull();
    });
});
