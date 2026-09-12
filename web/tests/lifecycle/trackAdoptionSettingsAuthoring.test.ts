/**
 * ADOPTION IS REACHABLE FROM SETTINGS, AND PREVIEWING IT WRITES NOTHING.
 *
 * The capability was the hard part, but a capability nobody can reach is still a missing product
 * path — the whole reason this work exists is that the only way to give an existing process tracks
 * was a direct database edit. So the operator route is pinned here: the card is mounted in Business
 * Process Settings, it calls the two governed actions by name, and it appears only for a process
 * that has no tracks.
 *
 * The load-bearing assertion is the last one. Every other action in the lifecycle-builder route
 * falls through to `saveDraft`, so a preview implemented as an ordinary case would persist a draft
 * revision merely for looking. That is checked by ORDER rather than by presence: the preview branch
 * must return before the save, which a "contains the word return" test would not have caught.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

const ROUTE = "app/api/admin/departments/[departmentId]/lifecycle-builder/route.ts";
const CARD = "components/adminV2/settings/lifecycle/BusinessProcessTrackAdoptionCard.tsx";
const BOARD = "components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx";

describe("track adoption — Settings authoring", () => {
    it("the lifecycle-builder route exposes both governed actions", () => {
        const route = read(ROUTE);
        expect(route).toContain('case "preview_process_track_adoption":');
        expect(route).toContain('case "adopt_process_tracks":');
        expect(route).toContain("evaluateProcessTrackAdoption");
        expect(route).toContain("adoptProcessTracks");
    });

    it("the route refuses adoption with the blockers rather than partially applying", () => {
        const route = read(ROUTE);
        expect(route).toContain("track_adoption_refused");
        // The writer is reached only after the evaluation passed.
        const refusal = route.indexOf("track_adoption_refused");
        const write = route.indexOf("config = adoptProcessTracks(");
        expect(refusal).toBeGreaterThan(-1);
        expect(write).toBeGreaterThan(refusal);
    });

    it("the route reads live instances as part of the decision, not just the preview", () => {
        const route = read(ROUTE);
        expect(route).toContain("observedProcessInstanceStages");
        // Fetched before the evaluation, so the same evidence backs preview and apply.
        expect(route.indexOf("observedProcessInstanceStages")).toBeLessThan(
            route.indexOf("evaluateProcessTrackAdoption({"),
        );
    });

    it("PREVIEW RETURNS BEFORE THE SAVE — looking never writes a draft revision", () => {
        const route = read(ROUTE);
        const previewReturn = route.indexOf("previewed: true");
        const save = route.indexOf("await saveDraft(");
        expect(previewReturn).toBeGreaterThan(-1);
        expect(save).toBeGreaterThan(-1);
        expect(previewReturn).toBeLessThan(save);
    });

    it("the Settings card calls both actions by their governed names", () => {
        const card = read(CARD);
        expect(card).toContain("preview_process_track_adoption");
        expect(card).toContain("adopt_process_tracks");
        expect(card).toContain("/lifecycle-builder");
    });

    it("the card offers Adopt only once a preview says it is adoptable", () => {
        const card = read(CARD);
        expect(card).toContain("!report?.adoptable");
        // And it renders the server's refusals rather than inventing its own copy.
        expect(card).toContain("business-process-track-adoption-blockers");
        expect(card).toContain("{b.message}");
    });

    it("the card stays away from a process that already has tracks", () => {
        const card = read(CARD);
        expect(card).toContain("if (tracksConfigured && !adopted) return null;");
    });

    it("the card is mounted in Business Process Settings", () => {
        const board = read(BOARD);
        expect(board).toContain("BusinessProcessTrackAdoptionCard");
        expect(board).toContain("tracksConfigured={Boolean(processTracks?.tracks?.length)}");
        // Editing rights gate the apply, exactly as every other authoring control on this board.
        expect(board).toContain("canEdit={activationOwned}");
    });

    it("no generic module reaches for the Enrollment template to do this", () => {
        /*
         * The configuration/runtime line. The evaluator may only read a descriptor; the moment it
         * imports the template it has stopped being a platform capability and become an Enrollment
         * feature wearing a generic name.
         */
        const evaluator = read("lib/businessProcesses/configuration/processTrackAdoption.ts");
        expect(evaluator).not.toContain("enrollmentProcessTemplate");
        expect(evaluator).not.toContain("ENROLLMENT_");
        for (const forbidden of ["family_track", "child_track", "waitlist", "enrolling", "decision"]) {
            expect(evaluator, `the evaluator must not name "${forbidden}"`).not.toContain(`"${forbidden}"`);
        }
    });
});
