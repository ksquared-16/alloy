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
                uiPhase: "draft",
            },
        });
        const id = state.turns[0]!.id;
        state = toggleActionCardExpanded(state, id);
        expect(state.turns[0]?.kind).toBe("action_card");
        if (state.turns[0]?.kind === "action_card" && state.turns[0].card.type === "task_assist") {
            expect(state.turns[0].card.expanded).toBe(true);
        }
    });

    it("does not toggle workflow_assist_proposal action cards", () => {
        const suggestion = {
            version: 1 as const,
            agent_key: "workflow_assist" as const,
            suggestion_id: "wa-".padEnd(35, "0"),
            org_id: "org",
            actor_user_id: "actor",
            generated_at_iso: "2026-05-15T00:00:00.000Z",
            proposal_kind: "pause_workflow" as const,
            target_workflow_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            draft_row: null,
            patch: { enabled: false as const },
            reasoning: { summary: "s", warnings: [] as string[] },
            approval_required: true as const,
        };
        let state = appendThreadTurn(createEmptyThreadState(), {
            kind: "action_card",
            card: { type: "workflow_assist_proposal", suggestion },
        });
        const id = state.turns[0]!.id;
        state = toggleActionCardExpanded(state, id);
        expect(state.turns[0]?.kind).toBe("action_card");
        if (state.turns[0]?.kind === "action_card" && state.turns[0].card.type === "workflow_assist_proposal") {
            expect(state.turns[0].card.suggestion.suggestion_id).toBe(suggestion.suggestion_id);
        }
    });
});
