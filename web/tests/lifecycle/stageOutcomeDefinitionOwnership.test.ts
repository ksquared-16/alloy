import { describe, expect, it } from "vitest";
import {
    setWorkTemplateOutcomeRefs,
    workTemplateOutcomeRefs,
} from "@/lib/lifecycle/stageWorkTemplateActionRefs";
import type { StageOperatingPlanEditorDraft } from "@/lib/lifecycle/stageOperatingPlanEditorModel";

function draftWithSharedOutcome(): StageOperatingPlanEditorDraft {
    return {
        purpose: "Tour",
        journey_segment: "family",
        work_templates: [
            {
                template_key: "conduct_tour",
                label: "Conduct Tour",
                required: true,
                primary: true,
                due_policy: { kind: "same_day" },
                owner_strategy: "record_owner",
                outcome_refs: [{ outcome_ref: "needs_follow_up" }],
            },
            {
                template_key: "follow_up_after_tour",
                label: "Follow Up After Tour",
                required: false,
                due_policy: { kind: "offset_days", days: 1 },
                owner_strategy: "record_owner",
                outcome_refs: [{ outcome_ref: "needs_follow_up" }],
            },
        ],
        outcomes: [{ outcome_key: "needs_follow_up", label: "Needs Follow-up" }],
        outcome_rules: [
            {
                rule_key: "needs_follow_up_remain",
                when_outcome_key: "needs_follow_up",
                targets: [{ kind: "no_movement" }],
            },
        ],
        attention_rules: [],
        outgoing_transitions: [],
    };
}

describe("shared Outcome Definition ownership", () => {
    it("two Work Templates may reference one stage Outcome Definition", () => {
        const draft = draftWithSharedOutcome();
        const refs = draft.work_templates.flatMap((row) => workTemplateOutcomeRefs(row));
        expect(refs.filter((ref) => ref === "needs_follow_up")).toHaveLength(2);
        expect(draft.outcomes).toHaveLength(1);
    });

    it("removing one Work Template reference leaves the definition and other reference intact", () => {
        const draft = draftWithSharedOutcome();
        const first = draft.work_templates[0]!;
        const work_templates = [...draft.work_templates];
        work_templates[0] = setWorkTemplateOutcomeRefs(first, []);
        const next = { ...draft, work_templates };
        expect(next.outcomes).toHaveLength(1);
        expect(workTemplateOutcomeRefs(next.work_templates[1]!)).toEqual(["needs_follow_up"]);
        expect(next.outcome_rules).toHaveLength(1);
    });

    it("Available Outcomes persist refs only on Work Templates", () => {
        const draft = draftWithSharedOutcome();
        expect(draft.work_templates[0]?.outcome_refs?.[0]?.outcome_ref).toBe("needs_follow_up");
        expect(draft.outcomes[0]?.outcome_key).toBe("needs_follow_up");
    });

    it("blocks deletion while another Work Template still references the definition", () => {
        const draft = draftWithSharedOutcome();
        const otherRefs = draft.work_templates.filter(
            (row) =>
                row.template_key !== "conduct_tour"
                && workTemplateOutcomeRefs(row).includes("needs_follow_up"),
        );
        expect(otherRefs.map((row) => row.template_key)).toEqual(["follow_up_after_tour"]);
    });

    it("unreferenced definitions remain valid for reuse", () => {
        const draft = draftWithSharedOutcome();
        const work_templates = draft.work_templates.map((row) => setWorkTemplateOutcomeRefs(row, []));
        const next = { ...draft, work_templates };
        expect(next.outcomes).toHaveLength(1);
        expect(
            next.work_templates.every((row) => !workTemplateOutcomeRefs(row).includes("needs_follow_up")),
        ).toBe(true);
    });
});
