/**
 * Explicit configuration versus legacy fallback, for Process-card commands.
 *
 * The parity investigation had a live hypothesis: that removing a command from `/process` left
 * `helpful_actions` absent, and that absence fell through to legacy `supporting_actions`, quietly
 * putting the removed command back. That is a real shape in this codebase — `undefined` means
 * "legacy fallback" and `[]` means "explicitly none" — so it is worth locking rather than
 * re-deriving. It is NOT what happened here (see the projection diagnostics), and these assertions
 * are what keep that answer checkable instead of remembered.
 */

import { describe, expect, it } from "vitest";

import { resolvedHelpfulActionRefs } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkTemplateConfig";

describe("explicit stage commands never fall through to legacy defaults", () => {
    it("an explicit empty set stays empty, and does not become supporting_actions", () => {
        const refs = resolvedHelpfulActionRefs({
            work_key: "review_waitlist_position",
            helpful_actions: [],
            helpful_actions_explicit: true,
            supporting_actions: [{ action_ref: "quick_message" }],
        } as never);
        expect(refs).toEqual([]);
    });

    it("an explicit set is exactly what configuration named", () => {
        const refs = resolvedHelpfulActionRefs({
            work_key: "review_waitlist_position",
            helpful_actions: [{ action_ref: "send_tour_invitation" }, { action_ref: "send_form" }],
            helpful_actions_explicit: true,
            supporting_actions: [{ action_ref: "quick_message" }],
        } as never);
        expect(refs?.map((r) => r.action_ref)).toEqual(["send_tour_invitation", "send_form"]);
        // The invariant the operator cares about: a command they removed does not come back.
        expect(refs?.some((r) => r.action_ref === "quick_message")).toBe(false);
    });

    it("absent configuration may still use the legacy list — compatibility is not the defect", () => {
        // Removing this fallback would break stages authored before explicit sets existed.
        const refs = resolvedHelpfulActionRefs({
            work_key: "legacy_stage",
            supporting_actions: [{ action_ref: "quick_message" }],
        } as never);
        expect(refs?.map((r) => r.action_ref)).toEqual(["quick_message"]);
    });
});

describe("the published resolver marks stage commands explicit either way", () => {
    it("documents why absence cannot reach the legacy list from a published plan", async () => {
        // `resolveCurrentWorkTemplateFromPublishedPlan` sets `helpful_actions_explicit` on BOTH
        // branches — configured refs, and the empty set when a template omits them — so a published
        // plan can never present as "absent". That is what rules the fallback out as a cause here.
        const src = await import("node:fs").then((fs) =>
            fs.readFileSync(
                "lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkTemplateFromPublishedPlan.ts",
                "utf8",
            ),
        );
        const assignments = src.match(/helpful_actions_explicit = true/g) ?? [];
        expect(assignments.length).toBeGreaterThanOrEqual(2);
        expect(src).not.toMatch(/helpful_actions_explicit = false/);
    });
});
