import { describe, expect, it } from "vitest";

import { overlayChildMissionOntoSettledFocusModel } from "@/lib/adminV2/runtime/focusPanel/overlayChildMissionOntoSettledFocusModel";
import type { FocusPanelCommitCriticalInput } from "@/lib/adminV2/runtime/focusPanel/focusPanelCommitCriticalInput";
import type { FocusPanelWorkModeModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelWorkModeModel";

/**
 * TWO SIBLINGS AT DIFFERENT STAGES.
 *
 * Lennon is at `tour_scheduled`, Wrigley at `waitlist`, and they share one family opportunity, so
 * the Settlement VM behind both is the SAME. The header commits the new child from canonical queue
 * context at ~150ms while the provisioning answer still describes the child the operator left.
 *
 * The family cards are authoritative for that shared family and must stay. The child's own mission
 * cards must not assert the previous child's work under the new child's name.
 *
 * The tenant this sprint measures against has every child at one stage, so this case cannot be
 * observed in the browser there — which is exactly why it is pinned here.
 */

const LENNON = "member-lennon";
const WRIGLEY = "member-wrigley";

function stageWork(stageKey: string, primaryLabel: string) {
    return {
        stage_key: stageKey,
        stage_label: stageKey,
        journey_segment: null,
        template_keys: [primaryLabel],
        primary: { label: primaryLabel, template_key: primaryLabel, work_id: `${stageKey}-work` },
    } as unknown as FocusPanelCommitCriticalInput["stageWorkRuntime"];
}

function commitCriticalFor(subjectId: string, stageKey: string, primaryLabel: string): FocusPanelCommitCriticalInput {
    return {
        subjectId,
        statusKey: stageKey,
        stageWorkRuntime: stageWork(stageKey, primaryLabel),
        publishedStageInputs: null,
        situation: { stageKey, stageLabel: stageKey, purpose: null },
        primaryAction: { actionRef: `act:${stageKey}`, label: primaryLabel },
        actionAbsence: null,
        subjectIdentityTruth: { "child.display_name": subjectId } as unknown as FocusPanelCommitCriticalInput["subjectIdentityTruth"],
        subjectGrain: { grain: "child", subjectType: "child" } as FocusPanelCommitCriticalInput["subjectGrain"],
    };
}

/** Family Settlement model — identical for both siblings, because it is the same family. */
function settledFamilyModel(): FocusPanelWorkModeModel {
    const familyCards = new Map<string, unknown>([
        ["household", { key: "household", title: "HOUSEHOLD" }],
        ["children", { key: "children", title: "CHILDREN" }],
        ["billing_preview", { key: "billing_preview", title: "BILLING PREVIEW" }],
    ]);
    const familyReadiness = new Map<string, string>([
        ["household", "ready"],
        ["children", "ready"],
        ["billing_preview", "ready"],
        ["current_work", "ready"],
    ]);
    return {
        source: "drawer-vm",
        phase: "settled",
        mode: "work",
        title: "Kurzman Family",
        subject: { type: "opportunity", id: "family-opportunity" },
        // The overlay reads the family's settled truth to find the focused child's own row.
        context: {
            signals: { work: {} },
            subject: { type: "child", id: "member-attended" },
            truth: {
                _inquiry_children: [
                    { customer_member_id: LENNON, first_name: "Lennon", dob: "2024-04-02" },
                    { customer_member_id: WRIGLEY, first_name: "Wrigley", dob: "2026-03-15" },
                ],
            },
        },
        cardModels: familyCards,
        cardReadiness: familyReadiness,
    } as unknown as FocusPanelWorkModeModel;
}

describe("child mission reveal contract — siblings at different stages", () => {
    it("commits the mission when the answer describes the child attention is on", () => {
        const out = overlayChildMissionOntoSettledFocusModel(
            settledFamilyModel(),
            commitCriticalFor(WRIGLEY, "waitlist", "Review waitlist position"),
            { attentionSubjectId: WRIGLEY },
        );
        expect(out.cardReadiness.get("current_work")).toBe("ready");
        expect(out.cardModels.get("current_work")).toBeTruthy();
    });

    it("NEVER shows the prior sibling's What's Next under the new child", () => {
        // Answer still describes Wrigley (waitlist); attention has moved to Lennon (tour_scheduled).
        const out = overlayChildMissionOntoSettledFocusModel(
            settledFamilyModel(),
            commitCriticalFor(WRIGLEY, "waitlist", "Review waitlist position"),
            { attentionSubjectId: LENNON },
        );
        expect(out.cardReadiness.get("current_work")).toBe("reserved");
        expect(out.cardReadiness.get("child_identity")).toBe("reserved");
        // The CELL is held, not removed — dropping it would make a card vanish and reappear.
        // What it must not do is carry the previous child's work.
        expect(out.cardModels.has("current_work")).toBe(true);
        expect(JSON.stringify(out.cardModels.get("current_work") ?? null)).not.toContain(
            "Review waitlist position",
        );
    });

    it("leaves every family Settlement card stable while the child mission reserves", () => {
        const before = settledFamilyModel();
        const out = overlayChildMissionOntoSettledFocusModel(
            before,
            commitCriticalFor(WRIGLEY, "waitlist", "Review waitlist position"),
            { attentionSubjectId: LENNON },
        );
        for (const key of ["household", "children", "billing_preview"]) {
            expect(out.cardReadiness.get(key)).toBe("ready");
            expect(out.cardModels.get(key)).toEqual(before.cardModels.get(key));
        }
        // The panel is held, never blanked.
        expect(out.cardModels.size).toBeGreaterThanOrEqual(3);
        expect(out.title).toBe(before.title);
    });

    it("commits the NEW child's mission once its authoritative answer arrives", () => {
        const reserved = overlayChildMissionOntoSettledFocusModel(
            settledFamilyModel(),
            commitCriticalFor(WRIGLEY, "waitlist", "Review waitlist position"),
            { attentionSubjectId: LENNON },
        );
        expect(reserved.cardReadiness.get("current_work")).toBe("reserved");

        const settledForLennon = overlayChildMissionOntoSettledFocusModel(
            settledFamilyModel(),
            commitCriticalFor(LENNON, "tour_scheduled", "Confirm tour attendance"),
            { attentionSubjectId: LENNON },
        );
        expect(settledForLennon.cardReadiness.get("current_work")).toBe("ready");
        expect(JSON.stringify(settledForLennon.cardModels.get("current_work"))).toContain(
            "Confirm tour attendance",
        );
    });

    it("latest-click-wins: an answer for an ALREADY-LEFT child never commits", () => {
        // A -> B -> A. The in-flight answer for B lands while attention is back on A.
        const staleForB = overlayChildMissionOntoSettledFocusModel(
            settledFamilyModel(),
            commitCriticalFor(LENNON, "tour_scheduled", "Confirm tour attendance"),
            { attentionSubjectId: WRIGLEY },
        );
        expect(staleForB.cardReadiness.get("current_work")).toBe("reserved");
        expect(JSON.stringify(staleForB.cardModels.get("current_work") ?? null)).not.toContain(
            "Confirm tour attendance",
        );
    });

    it("is inert when attention is unknown (no kernel), preserving prior behaviour", () => {
        const out = overlayChildMissionOntoSettledFocusModel(
            settledFamilyModel(),
            commitCriticalFor(WRIGLEY, "waitlist", "Review waitlist position"),
            { attentionSubjectId: null },
        );
        expect(out.cardReadiness.get("current_work")).toBe("ready");
    });
});
