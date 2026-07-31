/**
 * The drafting half of D3.
 *
 * The behaviour under test is a policy, not an algorithm: an operator who inherits a broken graph
 * must still be able to edit it, and an operator who breaks it must be stopped at the edit. Every
 * case below is one of those two people.
 */

import { describe, expect, it } from "vitest";

import {
    assessStageDraftSave,
    classifyStageDraftFindings,
    remainingIssuesSummary,
    stageOperatingContractFindingKey,
} from "@/lib/lifecycle/stageOperatingPlanDraftDelta";
import type { StageOperatingContractIssue } from "@/lib/lifecycle/validateStageOperatingPlanOperatingContract";

function issue(over: Partial<StageOperatingContractIssue> = {}): StageOperatingContractIssue {
    return {
        code: "outcome_transition_invalid",
        severity: "error",
        message: "“Tour Scheduled” names a transition that does not exist.",
        controlId: "tour_scheduled-transition",
        ...over,
    };
}

describe("finding identity", () => {
    it("is the same finding when only the operator copy changed", () => {
        // Messages get rewritten. A diff keyed on text would call that a new defect and freeze
        // every stage the day someone improves the wording.
        const a = issue({ message: "Old wording." });
        const b = issue({ message: "Completely new wording, same defect." });
        expect(stageOperatingContractFindingKey(a)).toBe(stageOperatingContractFindingKey(b));
    });

    it("separates the same defect on two different controls", () => {
        expect(stageOperatingContractFindingKey(issue({ controlId: "a-transition" }))).not.toBe(
            stageOperatingContractFindingKey(issue({ controlId: "b-transition" })),
        );
    });

    it("separates two findings that share a control but not an outcome", () => {
        expect(stageOperatingContractFindingKey(issue({ outcome_key: "x" }))).not.toBe(
            stageOperatingContractFindingKey(issue({ outcome_key: "y" })),
        );
    });
});

describe("classification", () => {
    const preexisting = issue({ controlId: "legacy-transition" });
    const fresh = issue({ controlId: "new-transition" });

    it("calls a finding that was not there before introduced", () => {
        const delta = classifyStageDraftFindings([preexisting], [preexisting, fresh]);
        expect(delta.introduced.map((i) => i.controlId)).toEqual(["new-transition"]);
        expect(delta.preexisting.map((i) => i.controlId)).toEqual(["legacy-transition"]);
    });

    it("calls a finding that survived the edit pre-existing", () => {
        const delta = classifyStageDraftFindings([preexisting], [preexisting]);
        expect(delta.introduced).toEqual([]);
        expect(delta.resolved).toEqual([]);
        expect(delta.preexisting).toHaveLength(1);
    });

    it("calls a finding that disappeared resolved", () => {
        const delta = classifyStageDraftFindings([preexisting], []);
        expect(delta.resolved.map((i) => i.controlId)).toEqual(["legacy-transition"]);
    });

    it("calls a warning this edit turned into an error worsened", () => {
        const before = issue({ controlId: "same", severity: "warning" });
        const after = issue({ controlId: "same", severity: "error" });
        const delta = classifyStageDraftFindings([before], [after]);
        expect(delta.worsened).toHaveLength(1);
        expect(delta.introduced).toEqual([]);
    });
});

describe("the save verdict", () => {
    it("lets an inherited defect through — THE defect this replaces", () => {
        // Previously this threw before the request was assembled: the stage could not be edited at
        // all, and the operator saw nothing.
        const inherited = issue({ controlId: "legacy-transition" });
        const assessment = assessStageDraftSave({ before: [inherited], after: [inherited] });
        expect(assessment.blocking).toEqual([]);
        expect(assessment.warnings).toHaveLength(1);
    });

    it("blocks an error this edit introduced", () => {
        const assessment = assessStageDraftSave({ before: [], after: [issue()] });
        expect(assessment.blocking).toHaveLength(1);
        expect(assessment.warnings).toEqual([]);
    });

    it("blocks a newly introduced error even while inherited ones ride along as warnings", () => {
        const inherited = issue({ controlId: "legacy-transition" });
        const introduced = issue({ controlId: "new-transition" });
        const assessment = assessStageDraftSave({
            before: [inherited],
            after: [inherited, introduced],
        });
        expect(assessment.blocking.map((i) => i.controlId)).toEqual(["new-transition"]);
        expect(assessment.warnings.map((i) => i.controlId)).toEqual(["legacy-transition"]);
    });

    it("never blocks on a warning, however new", () => {
        const assessment = assessStageDraftSave({
            before: [],
            after: [issue({ severity: "warning" })],
        });
        expect(assessment.blocking).toEqual([]);
        expect(assessment.warnings).toHaveLength(1);
    });

    it("counts every remaining error against publication, whoever caused it", () => {
        // Drafting forgives inherited errors. Publication does not, and the count must say so.
        const assessment = assessStageDraftSave({
            before: [issue({ controlId: "a" }), issue({ controlId: "b" })],
            after: [issue({ controlId: "a" }), issue({ controlId: "b" })],
        });
        expect(assessment.blocking).toEqual([]);
        expect(assessment.blocking_publication_count).toBe(2);
    });

    it("reports a repair", () => {
        const assessment = assessStageDraftSave({ before: [issue()], after: [] });
        expect(assessment.resolved).toHaveLength(1);
        expect(assessment.blocking_publication_count).toBe(0);
        expect(remainingIssuesSummary(assessment)).toBeNull();
    });
});

describe("the operator sentence", () => {
    it("names the count and pluralizes", () => {
        const two = assessStageDraftSave({
            before: [issue({ controlId: "a" }), issue({ controlId: "b" })],
            after: [issue({ controlId: "a" }), issue({ controlId: "b" })],
        });
        expect(remainingIssuesSummary(two)).toBe(
            "Draft saved. This stage still has 2 issues that must be repaired before publication.",
        );
        const one = assessStageDraftSave({ before: [issue()], after: [issue()] });
        expect(remainingIssuesSummary(one)).toContain("1 issue that must be repaired");
    });

    it("says nothing when there is nothing owed", () => {
        expect(remainingIssuesSummary(assessStageDraftSave({ before: [], after: [] }))).toBeNull();
    });
});
