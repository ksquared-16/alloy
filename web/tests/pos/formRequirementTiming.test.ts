import { describe, expect, it } from "vitest";

import {
    DEFAULT_REQUIREMENT_TIMING,
    configuredTimingsForRule,
    deferredTimingLabel,
    formRequirementMoment,
    formRequirementMomentTiming,
    splitRequiredRulesByFormMoment,
} from "@/lib/forms/lifecycle/formRequirementTiming";
import { selectRequirementRulesForMoment } from "@/lib/lifecycle/requirementTimingEvaluation";
import type {
    PublishedLifecycleFieldRules,
    RuleMetaV1,
} from "@/lib/lifecycle/requirementTimingTypes";

const REQUIRED = [
    "person:first_name",
    "child:first_name",
    "child:classroom",
    "opportunity:enrollment_packet",
    "child:age_group",
];

const RULES: PublishedLifecycleFieldRules = {
    required_rule_ids: REQUIRED,
    recommended_rule_ids: [],
};

const META: RuleMetaV1 = {
    version: 1,
    by_rule_id: {
        "person:first_name": { timing: "record_creation" },
        "child:first_name": { timing: "stage_progress" },
        "child:classroom": { timing: "stage_exit" },
        "opportunity:enrollment_packet": { timing: "process_completion" },
        "child:start_date": { timing: ["record_creation", "stage_exit"] },
    },
};

describe("formRequirementMoment", () => {
    it("a record-creating intent on its own creation stage answers to record_creation", () => {
        expect(formRequirementMoment("lead", "enrollment_lead")).toEqual({ kind: "record_creation" });
        expect(formRequirementMoment("waitlist", "waitlist")).toEqual({ kind: "record_creation" });
    });

    it("the same intent on a different stage is working an existing record", () => {
        expect(formRequirementMoment("tour", "enrollment_lead")).toEqual({
            kind: "stage_progress",
            stageKey: "tour",
        });
        expect(formRequirementMomentTiming("lead", "waitlist")).toBe("stage_progress");
    });

    it("non-record-creating intents always work a stage", () => {
        for (const intent of ["existing_family", "operational_document", "packet_step", "custom", "general", null]) {
            expect(formRequirementMomentTiming("lead", intent)).toBe("stage_progress");
        }
    });
});

describe("splitRequiredRulesByFormMoment", () => {
    it("a lead form is blocked only by creation-time rules", () => {
        const split = splitRequiredRulesByFormMoment({
            requiredRuleIds: REQUIRED,
            rules: RULES,
            ruleMeta: META,
            moment: { kind: "record_creation" },
        });

        expect(split.blockingRuleIds).toEqual(["person:first_name"]);
        expect(split.deferredRuleIds).toEqual([
            "child:first_name",
            "child:classroom",
            "opportunity:enrollment_packet",
            "child:age_group",
        ]);
    });

    it("Kelly's case: child info configured as stage_progress stops blocking lead creation", () => {
        const requiredRuleIds = [
            "person:first_name",
            "person:last_name",
            "child:first_name",
            "child:last_name",
        ];
        const split = splitRequiredRulesByFormMoment({
            requiredRuleIds,
            rules: { required_rule_ids: requiredRuleIds, recommended_rule_ids: [] },
            ruleMeta: {
                version: 1,
                by_rule_id: {
                    "person:first_name": { timing: "record_creation" },
                    "person:last_name": { timing: "record_creation" },
                    "child:first_name": { timing: "stage_progress" },
                    "child:last_name": { timing: "stage_progress" },
                },
            },
            moment: { kind: "record_creation" },
        });

        expect(split.blockingRuleIds).toEqual(["person:first_name", "person:last_name"]);
        // Still required by the process — just not by this form.
        expect(split.deferredRuleIds).toEqual(["child:first_name", "child:last_name"]);
        expect(split.deferredTimingByRuleId["child:first_name"]).toEqual(["stage_progress"]);
    });

    it("a stage form keeps untagged required rules blocking (no regression)", () => {
        const split = splitRequiredRulesByFormMoment({
            requiredRuleIds: REQUIRED,
            rules: RULES,
            ruleMeta: META,
            moment: { kind: "stage_progress", stageKey: "tour" },
        });

        expect(split.blockingRuleIds).toEqual(["child:first_name", "child:age_group"]);
        expect(split.deferredRuleIds).toEqual([
            "person:first_name",
            "child:classroom",
            "opportunity:enrollment_packet",
        ]);
    });

    it("with no configured timing at all, a stage form blocks on everything it used to", () => {
        const split = splitRequiredRulesByFormMoment({
            requiredRuleIds: REQUIRED,
            rules: RULES,
            ruleMeta: null,
            moment: { kind: "stage_progress", stageKey: "tour" },
        });
        expect(split.blockingRuleIds).toEqual(REQUIRED);
        expect(split.deferredRuleIds).toEqual([]);
    });

    it("records the timing that deferred each rule", () => {
        const split = splitRequiredRulesByFormMoment({
            requiredRuleIds: REQUIRED,
            rules: RULES,
            ruleMeta: META,
            moment: { kind: "record_creation" },
        });
        expect(split.deferredTimingByRuleId["child:classroom"]).toEqual(["stage_exit"]);
        expect(split.deferredTimingByRuleId["opportunity:enrollment_packet"]).toEqual(["process_completion"]);
        // Untagged rules report the default they were judged against, not an empty list.
        expect(split.deferredTimingByRuleId["child:age_group"]).toEqual(["stage_progress"]);
    });

    it("does not duplicate a rule listed twice", () => {
        const split = splitRequiredRulesByFormMoment({
            requiredRuleIds: ["child:classroom", "child:classroom"],
            rules: RULES,
            ruleMeta: META,
            moment: { kind: "record_creation" },
        });
        expect(split.deferredRuleIds).toEqual(["child:classroom"]);
    });

    it("a multi-timing rule blocks at each configured moment", () => {
        const requiredRuleIds = ["child:start_date"];
        const rules: PublishedLifecycleFieldRules = { required_rule_ids: requiredRuleIds, recommended_rule_ids: [] };
        for (const moment of [
            { kind: "record_creation" } as const,
            { kind: "stage_exit_progress", stageKey: "tour" } as const,
        ]) {
            const split = splitRequiredRulesByFormMoment({ requiredRuleIds, rules, ruleMeta: META, moment });
            expect(split.blockingRuleIds, moment.kind).toEqual(["child:start_date"]);
        }
        const progress = splitRequiredRulesByFormMoment({
            requiredRuleIds,
            rules,
            ruleMeta: META,
            moment: { kind: "stage_progress", stageKey: "tour" },
        });
        expect(progress.deferredRuleIds).toEqual(["child:start_date"]);
    });
});

describe("the adapter does not re-implement timing semantics", () => {
    it("blocking set is exactly the canonical selector's result intersected with required", () => {
        for (const moment of [
            { kind: "record_creation" } as const,
            { kind: "stage_progress", stageKey: "tour" } as const,
            { kind: "stage_exit_progress", stageKey: "tour" } as const,
            { kind: "process_completion", processKey: "enrollment" } as const,
        ]) {
            const canonical = selectRequirementRulesForMoment({ rules: RULES, ruleMeta: META, moment })
                .map((r) => r.ruleId)
                .filter((id) => REQUIRED.includes(id));
            const split = splitRequiredRulesByFormMoment({
                requiredRuleIds: REQUIRED,
                rules: RULES,
                ruleMeta: META,
                moment,
            });
            expect(new Set(split.blockingRuleIds), moment.kind).toEqual(new Set(canonical));
            // Every required rule lands in exactly one bucket.
            expect(split.blockingRuleIds.length + split.deferredRuleIds.length).toBe(REQUIRED.length);
        }
    });
});

describe("operator-facing copy", () => {
    it("configuredTimingsForRule reports untagged as empty, not a guess", () => {
        expect(configuredTimingsForRule("child:age_group", META)).toEqual([]);
        expect(configuredTimingsForRule("child:start_date", META)).toEqual(["record_creation", "stage_exit"]);
        expect(configuredTimingsForRule("person:first_name", null)).toEqual([]);
    });

    it("deferredTimingLabel reads as prose", () => {
        expect(DEFAULT_REQUIREMENT_TIMING).toBe("stage_progress");
        expect(deferredTimingLabel(["stage_exit"])).toBe("before leaving this stage");
        expect(deferredTimingLabel(["record_creation", "stage_exit"])).toBe(
            "when the record is created or before leaving this stage"
        );
        expect(deferredTimingLabel([])).toBe("while working this stage");
    });
});
