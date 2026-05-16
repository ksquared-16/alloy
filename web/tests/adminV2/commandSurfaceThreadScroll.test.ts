import { describe, expect, it } from "vitest";

import { shouldForceCommandSurfaceScrollToBottom } from "@/lib/adminV2/aiCommandSurface/commandSurfaceThreadScroll";

describe("shouldForceCommandSurfaceScrollToBottom", () => {
    it("forces scroll on user_message and action_card", () => {
        expect(
            shouldForceCommandSurfaceScrollToBottom(
                { id: "1", kind: "user_message", text: "hi", at: "" },
                true
            )
        ).toBe(true);
        expect(
            shouldForceCommandSurfaceScrollToBottom(
                {
                    id: "2",
                    kind: "action_card",
                    at: "",
                    card: {
                        type: "config_layout_assist_proposal",
                        proposal: {} as never,
                        trace: {} as never,
                        persistedProposalId: null,
                    },
                },
                true
            )
        ).toBe(true);
    });

    it("does not scroll when user scrolled up and no new forced turn", () => {
        expect(shouldForceCommandSurfaceScrollToBottom(undefined, true)).toBe(false);
    });
});
