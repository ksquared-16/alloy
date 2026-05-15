import { describe, expect, it } from "vitest";

import {
    appendThreadTurn,
    createEmptyThreadState,
    toggleActionCardExpanded,
} from "@/lib/adminV2/aiCommandSurface/commandSurfaceThreadState";

describe("commandSurfaceThreadState", () => {
    it("appends user and assistant turns", () => {
        let state = createEmptyThreadState();
        state = appendThreadTurn(state, { kind: "user_message", text: "hello" });
        state = appendThreadTurn(state, { kind: "assistant_notice", text: "hi there" });
        expect(state.turns).toHaveLength(2);
        expect(state.turns[0]?.kind).toBe("user_message");
        expect(state.turns[1]?.kind).toBe("assistant_notice");
    });

    it("toggles task assist action card expanded", () => {
        let state = appendThreadTurn(createEmptyThreadState(), {
            kind: "action_card",
            card: {
                type: "task_assist",
                entityId: "opp-1",
                entityLabel: "Smith",
                bootstrap: { intent_type: "draft_message" },
                bootstrapKey: "k1",
                expanded: false,
            },
        });
        const id = state.turns[0]!.id;
        state = toggleActionCardExpanded(state, id);
        expect(state.turns[0]?.kind).toBe("action_card");
        if (state.turns[0]?.kind === "action_card" && state.turns[0].card.type === "task_assist") {
            expect(state.turns[0].card.expanded).toBe(true);
        }
    });
});
