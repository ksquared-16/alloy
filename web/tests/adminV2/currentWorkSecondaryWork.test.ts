/**
 * SECONDARY WORK IS VISIBLE, DISTINGUISHABLE, AND NOT WHAT "RECORD OUTCOME" ACTS ON.
 *
 * The stage work runtime has always published `primary` separately from `additional`, and each item
 * carries its own `role`. The Current Work surface flattened the two into one list and dropped the
 * role, with two consequences:
 *
 *   presentation  a second live work item was indistinguishable from the stage's actual subject —
 *                 or, worse, sat among data requirements as though it were one.
 *   action        `pickPrimaryOpenItem` took the first OPEN item in `[primary, ...additional]`, so
 *                 the moment the primary was not open and a secondary was, the unqualified
 *                 "Record outcome" control silently began acting on the secondary one.
 *
 * The second is the one that could lose an operator's work: pressing Record outcome on a stage whose
 * primary work is "Review waitlist position" must never record an "Offer spot" outcome.
 *
 * Nothing here names a template key. The role comes from the runtime, so any process that configures
 * secondary work gets this behaviour with no code change — asserted by driving invented work keys.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { __testing } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkSurfaceVM";
import type { StageWorkItemProjection, StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import type { WorkIntentRuntimeState } from "@/lib/lifecycle/workIntentRuntimeTypes";

const { checklistFromStageRuntime, pickPrimaryOpenItem } = __testing;

function work(
    template_key: string,
    role: "primary" | "secondary",
    state: WorkIntentRuntimeState,
): StageWorkItemProjection {
    return {
        template_key,
        label: `${template_key} label`,
        role,
        state,
        requires_outcome_picker: false,
        work_id: `work-${template_key}`,
        due_at: null,
        due_urgency: "none",
        attempt_count: 0,
        last_outcome: null,
        completed_at: state === "completed" ? "2026-09-11T00:00:00Z" : null,
        outcomes: [],
        completion_policy_summary: null,
        completion_policy_min_attempts: null,
        completion_policy_max_attempts: null,
        outcome_automation_preview: [],
    };
}

function runtime(items: StageWorkItemProjection[]): StageWorkRuntimeProjection {
    return {
        stage_key: "some_stage",
        stage_label: "Some Stage",
        purpose: null,
        journey_segment: "family",
        template_keys: items.map((i) => i.template_key),
        primary: items[0] ?? null,
        additional: items.slice(1),
        execution: {} as never,
    };
}

describe("Current Work — secondary work", () => {
    it("carries the runtime's role onto every work row", () => {
        const rows = checklistFromStageRuntime(
            runtime([work("review_position", "primary", "open"), work("offer_place", "secondary", "open")]),
        );

        expect(rows.map((r) => [r.key, r.workRole])).toEqual([
            ["review_position", "primary"],
            ["offer_place", "secondary"],
        ]);
        // Work rows are work, not data requirements.
        expect(new Set(rows.map((r) => r.kind))).toEqual(new Set(["stage_work"]));
    });

    it("treats a row with no stated role as primary rather than guessing from position", () => {
        const item = { ...work("solo", "primary", "open") };
        delete (item as Partial<StageWorkItemProjection>).role;
        expect(checklistFromStageRuntime(runtime([item as StageWorkItemProjection]))[0]!.workRole).toBe("primary");
    });

    /* ------------------------------------------------------------ the ambiguity that mattered */

    it("RECORD OUTCOME acts on the PRIMARY work, even when only a secondary is open", () => {
        /*
         * The regression in one line. Before, `[primary, ...additional].find(open)` returned the
         * secondary item here, because the primary was merely planned.
         */
        const picked = pickPrimaryOpenItem(
            runtime([work("review_position", "primary", "planned"), work("offer_place", "secondary", "open")]),
        );
        expect(picked?.template_key).toBe("review_position");
    });

    it("prefers the primary's open work over a secondary's open work", () => {
        const picked = pickPrimaryOpenItem(
            runtime([work("review_position", "primary", "open"), work("offer_place", "secondary", "open")]),
        );
        expect(picked?.template_key).toBe("review_position");
    });

    it("reaches a secondary item only when the primary has nothing to act on", () => {
        const picked = pickPrimaryOpenItem(
            runtime([work("review_position", "primary", "completed"), work("offer_place", "secondary", "open")]),
        );
        expect(picked?.template_key).toBe("offer_place");
    });

    it("has nothing to act on when no work is live", () => {
        expect(pickPrimaryOpenItem(runtime([work("review_position", "primary", "completed")]))).toBeNull();
        expect(pickPrimaryOpenItem(null)).toBeNull();
    });

    /* ------------------------------------------------------------ presentation */

    it("renders secondary work in its own section, not among Requirements", () => {
        const src = readFileSync(
            resolve(__dirname, "../../components/admin/focusPanel/cards/CurrentWorkWorkspace.tsx"),
            "utf8",
        );
        expect(src).toContain('data-work-section="also-in-progress"');
        expect(src).toContain("Also in progress");
        // Selected through the SAME handler as any other checklist row, so it opens its own
        // work/outcome context rather than needing a second navigation path.
        expect(src).toContain("data-work-secondary-item");
        expect(src).toContain("onClick={() => onChecklistItem(item)}");
    });

    it("selects secondary work by ROLE, naming no template key", () => {
        const src = readFileSync(
            resolve(__dirname, "../../components/admin/focusPanel/cards/CurrentWorkWorkspace.tsx"),
            "utf8",
        );
        expect(src).toContain('item.workRole === "secondary"');
        // The defect this forbids is a hardcoded work key, which would make the section one
        // process's feature instead of a platform behaviour.
        expect(src).not.toContain("offer_spot");
    });

    it("only shows secondary work that is still outstanding", () => {
        const rows = checklistFromStageRuntime(
            runtime([
                work("review_position", "primary", "open"),
                work("offer_place", "secondary", "completed"),
            ]),
        );
        const outstandingSecondary = rows.filter((r) => r.workRole === "secondary" && r.status !== "complete");
        expect(outstandingSecondary).toEqual([]);
    });
});
