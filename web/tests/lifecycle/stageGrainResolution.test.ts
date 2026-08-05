/**
 * The family case and each child's enrollment move on separate tracks.
 *
 * `assertStageConfigured` verifies a destination EXISTS in the configured Business Process. It
 * never verified the destination was compatible, so a child outcome could write a family stage and
 * a family close could land on a child stage.
 *
 * Three sources answer "what grain is this stage", and on Firefly's Decision stage they disagree —
 * operating plan and canonical vocabulary say family, department metadata says child. These tests
 * pin the contract that makes that disagreement BLOCK and be reported, rather than be silently
 * arbitrated in favour of whichever source happened to be consulted.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
    assertStageMoveGrainCompatible,
    resolveStageGrain,
} from "@/lib/lifecycle/stageGrainResolution";

describe("grain resolution precedence", () => {
    it("prefers an explicit operating-plan journey_segment", () => {
        const resolution = resolveStageGrain({
            stageKey: "some_tenant_stage",
            operatingPlanJourneySegment: "child",
        });
        expect(resolution.ok && resolution.grain).toBe("child");
        expect(resolution.ok && resolution.source).toBe("operating_plan");
    });

    it("falls back to the canonical vocabulary for a known platform stage", () => {
        const lead = resolveStageGrain({ stageKey: "lead" });
        expect(lead.ok && lead.grain).toBe("family");
        expect(lead.ok && lead.source).toBe("canonical_vocabulary");

        const waitlist = resolveStageGrain({ stageKey: "waitlist" });
        expect(waitlist.ok && waitlist.grain).toBe("child");
    });

    it("falls back to configured metadata for a tenant-authored stage", () => {
        const resolution = resolveStageGrain({
            stageKey: "tenant_only_stage",
            configuredMetadataGrain: "family",
        });
        expect(resolution.ok && resolution.grain).toBe("family");
        expect(resolution.ok && resolution.source).toBe("configured_metadata");
    });

    it("resolves the canonical terminal stages on their own tracks", () => {
        expect(resolveStageGrain({ stageKey: "closed" }).ok).toBe(true);
        expect(resolveStageGrain({ stageKey: "closed" })).toMatchObject({ grain: "family" });
        expect(resolveStageGrain({ stageKey: "closed_withdrawn" })).toMatchObject({ grain: "child" });
    });

    it("blocks when nothing declares a grain", () => {
        const resolution = resolveStageGrain({ stageKey: "who_knows" });
        expect(resolution.ok).toBe(false);
        expect(resolution.ok === false && resolution.reason).toBe("grain_unknown");
    });

    it("treats an unreadable declaration as no declaration", () => {
        expect(resolveStageGrain({ stageKey: "x", configuredMetadataGrain: "sideways" }).ok).toBe(false);
        expect(resolveStageGrain({ stageKey: "x", operatingPlanJourneySegment: 7 }).ok).toBe(false);
    });
});

describe("Firefly's Decision contradiction is reported, not arbitrated", () => {
    // canonical=family, department metadata=child. Precedence alone would pick a winner; the
    // contract deliberately refuses, because a stage whose sources describe different journeys is
    // misconfigured and movement onto it must stop until someone decides which is true.
    const decision = resolveStageGrain({ stageKey: "decision", configuredMetadataGrain: "child" });

    it("does not silently coerce Decision to family", () => {
        expect(decision.ok).toBe(false);
        expect(decision.ok === false && decision.reason).toBe("grain_contradiction");
    });

    it("names every disagreeing source and its value", () => {
        if (decision.ok) throw new Error("expected contradiction");
        if (decision.reason !== "grain_contradiction") throw new Error("expected contradiction");
        expect(decision.conflicts).toEqual(
            expect.arrayContaining([
                { source: "canonical_vocabulary", grain: "family" },
                { source: "configured_metadata", grain: "child" },
            ]),
        );
        expect(decision.message).toContain("conflicting journey grains");
    });

    it("agrees once the metadata is corrected, which is sub-slice 3's job", () => {
        const corrected = resolveStageGrain({ stageKey: "decision", configuredMetadataGrain: "family" });
        expect(corrected.ok && corrected.grain).toBe("family");
    });
});

describe("movement compatibility", () => {
    const familyDest = resolveStageGrain({ stageKey: "tour" });
    const childDest = resolveStageGrain({ stageKey: "waitlist" });

    it("allows family → family", () => {
        expect(assertStageMoveGrainCompatible({ subjectGrain: "family", destination: familyDest }).ok).toBe(true);
    });

    it("allows child → child", () => {
        expect(assertStageMoveGrainCompatible({ subjectGrain: "child", destination: childDest }).ok).toBe(true);
    });

    it("blocks family → child", () => {
        const result = assertStageMoveGrainCompatible({ subjectGrain: "family", destination: childDest });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.kind).toBe("stage_grain_mismatch");
            expect(result.error.subject_grain).toBe("family");
            expect(result.error.destination_grain).toBe("child");
            expect(result.error.message).toContain("no change was made");
        }
    });

    it("blocks child → family", () => {
        const result = assertStageMoveGrainCompatible({ subjectGrain: "child", destination: familyDest });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.kind).toBe("stage_grain_mismatch");
    });

    it("blocks an unknown subject grain", () => {
        for (const subjectGrain of [undefined, null, "", "household"]) {
            const result = assertStageMoveGrainCompatible({ subjectGrain, destination: familyDest });
            expect(result.ok, String(subjectGrain)).toBe(false);
            if (!result.ok) expect(result.error.kind).toBe("subject_grain_unknown");
        }
    });

    it("blocks an unknown destination grain", () => {
        const result = assertStageMoveGrainCompatible({
            subjectGrain: "family",
            destination: resolveStageGrain({ stageKey: "who_knows" }),
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.kind).toBe("destination_grain_unknown");
    });

    it("blocks a contradictory destination and carries the conflict", () => {
        const result = assertStageMoveGrainCompatible({
            subjectGrain: "family",
            destination: resolveStageGrain({ stageKey: "decision", configuredMetadataGrain: "child" }),
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.kind).toBe("destination_grain_contradiction");
            expect(result.error.conflicts?.length).toBeGreaterThan(1);
        }
    });

    it("never infers the subject's grain from the destination", () => {
        // Reading "the destination is child-grain, so this must be a child" would turn a family
        // close into a child write — the exact accident being prevented.
        const result = assertStageMoveGrainCompatible({ subjectGrain: undefined, destination: childDest });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.kind).toBe("subject_grain_unknown");
    });
});

describe("the guard is on the write path", () => {
    const executor = readFileSync(
        resolve(__dirname, "../../lib/lifecycle/stageOutcomeRuleTargetExecutor.ts"),
        "utf8",
    );
    const move = executor.slice(executor.indexOf('case "move_to_stage"'));

    it("validates grain before either stage writer runs", () => {
        expect(move).toContain("assertStageMoveGrainCompatible");
        expect(move.indexOf("assertStageMoveGrainCompatible")).toBeLessThan(
            move.indexOf("moveEnrollmentInstanceStageByScope"),
        );
        expect(move.indexOf("assertStageMoveGrainCompatible")).toBeLessThan(
            move.indexOf('subject.journey_segment === "child"'),
        );
    });

    it("performs no write on the blocked path", () => {
        const blocked = move.slice(
            move.indexOf("assertStageMoveGrainCompatible"),
            move.indexOf("const nowIso"),
        );
        for (const writer of [".update(", ".insert(", "moveEnrollmentInstanceStageByScope"]) {
            expect(blocked, `blocked path must not call ${writer}`).not.toContain(writer);
        }
    });

    it("returns the structured error alongside the message", () => {
        expect(move).toContain("stage_grain_error");
    });
});

describe("editor destination filtering uses the same contract", () => {
    const editor = readFileSync(
        resolve(
            __dirname,
            "../../components/adminV2/settings/lifecycle/LifecycleStageOutcomeDefinitionsEditor.tsx",
        ),
        "utf8",
    );

    it("filters with the shared resolver rather than a private rule", () => {
        expect(editor).toContain("resolveStageGrain");
        expect(editor).toContain("entityGrain");
    });

    it("still excludes the current stage", () => {
        expect(editor).toContain("stage.key !== stageKey");
    });

    it("keeps find-before-create and the transition allocator intact", () => {
        // Sub-slice 2 must not disturb the authoring behaviour from e28d80a7a.
        expect(editor).toContain("ensureOutgoingTransitionToStage");
        expect(editor).toContain("upsertComposableOutcomeBehavior");
    });
});

describe("a family outcome and a child outcome see different destinations", () => {
    const stages = [
        { key: "lead", label: "Lead" },
        { key: "tour", label: "Tour" },
        { key: "waitlist", label: "Waitlist" },
        { key: "enrolling", label: "Enrolling" },
        { key: "closed", label: "Closed" },
        { key: "closed_withdrawn", label: "Closed / Not Enrolling" },
    ];
    const offered = (grain: "family" | "child", current: string) =>
        stages
            .filter((s) => s.key !== current)
            .filter((s) => {
                const r = resolveStageGrain({ stageKey: s.key });
                return r.ok && r.grain === grain;
            })
            .map((s) => s.key);

    it("family editors exclude child stages", () => {
        const options = offered("family", "lead");
        expect(options).toEqual(["tour", "closed"]);
        expect(options).not.toContain("waitlist");
        expect(options).not.toContain("closed_withdrawn");
    });

    it("child editors exclude family stages", () => {
        const options = offered("child", "waitlist");
        expect(options).toEqual(["enrolling", "closed_withdrawn"]);
        expect(options).not.toContain("tour");
        expect(options).not.toContain("closed");
    });
});
