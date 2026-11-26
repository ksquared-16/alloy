/**
 * Rule 7: a lens that names the case's own stage keeps that stage leading. Decision's view spans
 * `decision` and the internal `offered` sub-stage — the family is still in Decision while an offer
 * awaits the family's answer, even when no child sits at `decision` itself.
 */
import { describe, expect, it } from "vitest";

import { resolveContextMissionStages } from "@/lib/process/engine/resolveContextMissionStages";

describe("Decision lens keeps the family's own stage leading", () => {
    it("all children have paths (offered + waitlist): the card is still Decision", () => {
        const r = resolveContextMissionStages({ contextStageKey: "decision", effectiveParticipantStageKeys: ["offered", "waitlist"], workViewLensStageKeys: ["decision", "offered"] });
        expect(r.primaryMissionStageKey).toBe("decision");
        expect(r.missionStageKeys[0]).toBe("decision");
    });

    it("one child undecided, one offered: Decision leads", () => {
        const r = resolveContextMissionStages({ contextStageKey: "decision", effectiveParticipantStageKeys: ["decision", "offered"], workViewLensStageKeys: ["decision", "offered"] });
        expect(r.primaryMissionStageKey).toBe("decision");
    });

    it("a child-grain lens that does not name the case stage is unchanged", () => {
        const r = resolveContextMissionStages({ contextStageKey: "decision", effectiveParticipantStageKeys: ["offered"], workViewLensStageKeys: ["offered"] });
        expect(r.primaryMissionStageKey).toBe("offered");
    });
});
