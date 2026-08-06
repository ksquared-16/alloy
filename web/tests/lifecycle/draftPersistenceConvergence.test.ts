/**
 * Authoring writes the DRAFT. Publication writes the projection. Nothing else does.
 *
 * `departments.metadata.lifecycle_builder_v1` is a published projection guarded at the database by
 * `trg_departments_lifecycle_projection_guard`. The lifecycle-builder route used to load from that
 * projection and save straight back to it, so once a department had configuration at all, EVERY
 * action failed at the database — `rename_stage` as surely as `update_stage_grain`.
 *
 * The draft surface, the CAS tokens and the publish RPC already existed. Only the wire was missing.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveStageGrain, assertStageMoveGrainCompatible } from "@/lib/lifecycle/stageGrainResolution";

const route = readFileSync(
    resolve(__dirname, "../../app/api/admin/departments/[departmentId]/lifecycle-builder/route.ts"),
    "utf8",
);

describe("the authoring route no longer writes the projection", () => {
    it("saves through the draft writer", () => {
        expect(route).toContain("saveDraft(");
        expect(route).toContain("openDraft(");
    });

    it("has no direct projection writer left to reach for", () => {
        // `saveConfig` wrote departments.metadata directly. An unused writer pointing at a
        // forbidden target is exactly what a future caller reaches for, so it is deleted.
        expect(route).not.toContain("async function saveConfig");
        expect(route).not.toContain("mergeLifecycleBuilderIntoMetadata");
    });

    it("never calls the projection-write capability token", () => {
        expect(route).not.toContain("begin_lifecycle_projection_write");
    });

    it("reads the draft as the authoring source", () => {
        expect(route).toContain("draftBuilder(draft)");
    });

    it("compare-and-sets on the revision the editor loaded", () => {
        expect(route).toContain("expectedDraftRevision: loadedDraftRevision");
    });

    it("returns the saved draft revision so the editor can chain edits", () => {
        expect(route).toContain("draft_revision: savedDraft.draftRevision");
    });
});

describe("Decision resolves to family once configured metadata agrees", () => {
    // The state the two controlled draft writes produced: metadata `family`, plan `family`,
    // canonical vocabulary `family`.
    const decision = resolveStageGrain({
        stageKey: "decision",
        operatingPlanJourneySegment: "family",
        configuredMetadataGrain: "family",
    });

    it("resolves cleanly, with all three sources agreeing", () => {
        expect(decision.ok).toBe(true);
        if (!decision.ok) return;
        expect(decision.grain).toBe("family");
        expect(decision.opinions.map((o) => o.source).sort()).toEqual([
            "canonical_vocabulary",
            "configured_metadata",
            "operating_plan",
        ]);
        expect(decision.opinions.every((o) => o.grain === "family")).toBe(true);
    });

    it("allows a family subject onto Decision", () => {
        expect(assertStageMoveGrainCompatible({ subjectGrain: "family", destination: decision }).ok).toBe(true);
    });

    it("still blocks a child subject", () => {
        const blocked = assertStageMoveGrainCompatible({ subjectGrain: "child", destination: decision });
        expect(blocked.ok).toBe(false);
        if (!blocked.ok) expect(blocked.error.kind).toBe("stage_grain_mismatch");
    });

    it("still detects a stage that contradicts ITSELF", () => {
        /**
         * Previously this used metadata-vs-built-in-vocabulary as the contradiction. Configuration
         * now owns stage grain, so that combination resolves cleanly to the configured value. The
         * contradiction that remains detectable — and the one that matters — is a stage whose own
         * operating plan and configured metadata disagree.
         */
        const before = resolveStageGrain({
            stageKey: "decision",
            operatingPlanJourneySegment: "family",
            configuredMetadataGrain: "child",
        });
        expect(before.ok).toBe(false);
        if (!before.ok) expect(before.reason).toBe("grain_contradiction");
    });
});
