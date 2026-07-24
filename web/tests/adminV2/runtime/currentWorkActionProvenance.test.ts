/**
 * Configuration-provenance certification for What's Next actions.
 *
 * Proves the platform-capability contract: what an action DOES and WHERE it opens is derived from
 * capability metadata + configured placement, never from the action's label / stage / process /
 * target-state string. Complements currentWorkCommandIntegrity (proofs: unregistered→config-error,
 * disabled-vs-blocked, metadata-not-label parity) and currentWorkResolutions (outcomes/transitions
 * come only from configured collections, process-agnostic).
 */
import { describe, expect, it } from "vitest";

import { resolveCurrentWorkActionSurface } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkActionSurface";
import { resolveCurrentWorkActionButtons } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkActionButtons";
import type {
    CurrentWorkActionVM,
    CurrentWorkSurfaceVM,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";

function action(over: Partial<CurrentWorkActionVM>): CurrentWorkActionVM {
    return {
        key: "k",
        label: "L",
        category: "supporting",
        placement: "current_work_supporting",
        execution: { status: "executable", blockers: [] },
        ...over,
    } as CurrentWorkActionVM;
}

describe("What's Next action provenance — host resolves from capability metadata, not the label", () => {
    it("proof 1: two differently-labelled actions bound to the SAME capability open the SAME host", () => {
        const a = resolveCurrentWorkActionSurface(
            action({ key: "tour_a", label: "Schedule tour", handlerKey: "schedule_tour" }),
        );
        const b = resolveCurrentWorkActionSurface(
            // A wildly different label/key — but the SAME capability binding.
            action({ key: "book_a_visit", label: "Book a campus visit ✨", handlerKey: "schedule_tour" }),
        );
        expect(a).toBe("inline_form");
        expect(b).toBe("inline_form");
        expect(a).toBe(b);
    });

    it("proof 1: two DIFFERENT capabilities that declare the same interaction host both resolve to it", () => {
        // schedule_tour and reschedule_tour are distinct capabilities, both interactionHost=inline_form.
        expect(resolveCurrentWorkActionSurface(action({ key: "x", handlerKey: "schedule_tour" }))).toBe("inline_form");
        expect(resolveCurrentWorkActionSurface(action({ key: "y", handlerKey: "reschedule_tour" }))).toBe("inline_form");
        // A different capability declares a different host — proving the host is metadata, not the row.
        expect(resolveCurrentWorkActionSurface(action({ key: "z", handlerKey: "send_form" }))).toBe("form_delivery");
    });

    it("proof 7: label / stage / process / target strings never change the resolved host", () => {
        const stageish = resolveCurrentWorkActionSurface(
            action({ key: "waitlist", label: "Move to Waitlist", handlerKey: "schedule_tour" }),
        );
        const targetish = resolveCurrentWorkActionSurface(
            action({ key: "tour_scheduled", label: "tour_scheduled", handlerKey: "schedule_tour" }),
        );
        expect(stageish).toBe("inline_form");
        expect(targetish).toBe("inline_form");
    });

    it("proof 4: an action with no resolvable capability is UNSUPPORTED (never a working-looking host)", () => {
        const surface = resolveCurrentWorkActionSurface(
            action({ key: "totally_made_up_capability", handlerKey: "totally_made_up_capability", resolved: undefined }),
        );
        expect(surface).toBe("unsupported");
    });
});

describe("What's Next action provenance — rendering follows configured PLACEMENT", () => {
    type ActionPlacementSurface = Pick<
        CurrentWorkSurfaceVM,
        "primaryAction" | "recordOutcomeAction" | "supportingActions"
    >;
    function surfaceWith(over: Partial<ActionPlacementSurface>): ActionPlacementSurface {
        return {
            primaryAction: null,
            recordOutcomeAction: null,
            supportingActions: [],
            ...over,
        };
    }

    it("proof 2: an action present in a configured placement renders; removing the placement removes it", () => {
        const placed = resolveCurrentWorkActionButtons(
            surfaceWith({
                primaryAction: action({ key: "cmd", label: "Do the thing", handlerKey: "schedule_tour" }),
                supportingActions: [action({ key: "help", label: "Send form", handlerKey: "send_form" })],
            }),
        );
        expect(placed.dominant?.key).toBe("cmd");
        expect(placed.helpful.map((h) => h.key)).toEqual(["help"]);

        // Same surface with the supporting placement removed — the helpful action is gone, no code change.
        const removed = resolveCurrentWorkActionButtons(
            surfaceWith({
                primaryAction: action({ key: "cmd", label: "Do the thing", handlerKey: "schedule_tour" }),
                supportingActions: [],
            }),
        );
        expect(removed.dominant?.key).toBe("cmd");
        expect(removed.helpful).toEqual([]);
    });

    it("proof 3: an action whose execution is blocked is not rendered as an enabled button", () => {
        const buttons = resolveCurrentWorkActionButtons(
            surfaceWith({
                primaryAction: action({
                    key: "cmd",
                    handlerKey: "schedule_tour",
                    execution: { status: "blocked", blockers: [{ code: "not_ready", message: "Not ready" }] },
                }),
                supportingActions: [],
            }),
        );
        // A blocked primary is not promoted to the dominant executable button.
        expect(buttons.dominant).toBeNull();
    });
});
