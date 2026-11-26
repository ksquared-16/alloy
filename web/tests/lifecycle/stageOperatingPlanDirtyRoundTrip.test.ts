import { describe, expect, it } from "vitest";

import plans from "./fixtures/fireflyStageOperatingPlans.json";
import {
    stageOperatingPlanDraftDirty,
    stageOperatingPlanDraftFromSaved,
} from "@/lib/lifecycle/stageOperatingPlanEditorModel";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

/**
 * R-008 — selecting a stage to READ it must not mark the editor dirty.
 *
 * Browser-reproduced on Firefly: clean at boot, then `unsaved: true` with Save enabled from the
 * first stage SWITCH onward, with ZERO durable requests behind it, and it never clears again.
 *
 * `LifecycleStageOperatingPlanEditor` derives its dirty flag as
 *   stageOperatingPlanDraftDirty(savedPlan, draft, stageKey)
 * where the draft is itself built by `stageOperatingPlanDraftFromSaved(savedPlan, stageKey)`. So a
 * freshly loaded, unedited stage is dirty exactly when that round trip is not identity-stable —
 * a normalization asymmetry, not an operator edit.
 *
 * The fixture is the REAL published Firefly plan for all six enrollment stages, captured from
 * `/api/admin/lifecycle-builder/stage-bootstrap`, so this cannot pass on a synthetic shape that
 * happens to normalize cleanly.
 */

const SAVED = plans as unknown as Record<string, StageOperatingPlanV1>;
const STAGES = Object.keys(SAVED);

describe("a freshly loaded stage is not dirty", () => {
    it("covers every Firefly enrollment stage", () => {
        expect(STAGES).toEqual(
            expect.arrayContaining(["lead", "tour", "decision", "waitlist", "enrolling", "enrolled"]),
        );
    });

    it.each(STAGES)("round-trips %s without reporting a change", (stageKey) => {
        const saved = SAVED[stageKey]!;
        const draft = stageOperatingPlanDraftFromSaved(saved, stageKey);
        expect(stageOperatingPlanDraftDirty(saved, draft, stageKey)).toBe(false);
    });
});

describe("a real edit is still detected", () => {
    it("reports dirty when the operator actually changes something", () => {
        const stageKey = "waitlist";
        const saved = SAVED[stageKey]!;
        const draft = stageOperatingPlanDraftFromSaved(saved, stageKey);
        const edited = { ...draft, purpose: `${draft.purpose ?? ""} changed by the operator` };
        expect(stageOperatingPlanDraftDirty(saved, edited, stageKey)).toBe(true);
    });
});
