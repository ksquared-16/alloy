/**
 * The stepper shows the path a journey actually took — never a stage just because it is earlier in
 * configured order. Enrollment: family Lead/Tour/Decision; child Waitlist/Offered/Enrolling/Enrolled,
 * with Offered configured as a sub-stage of Decision (presented inside it).
 */
import { describe, expect, it } from "vitest";

import { buildBusinessProcessCardEvidence, deriveStageStates } from "@/lib/adminV2/runtime/focusPanel/businessProcess/buildBusinessProcessCardEvidence";
import { traversedStageKeysFromMetadata } from "@/lib/process/processInstances";

const stages = [
    { key: "lead", grain: "family", parentKey: null },
    { key: "tour", grain: "family", parentKey: null },
    { key: "decision", grain: "family", parentKey: null },
    { key: "waitlist", grain: "child", parentKey: null },
    { key: "offered", grain: "child", parentKey: "decision" },
    { key: "enrolling", grain: "child", parentKey: null },
    { key: "enrolled", grain: "child", parentKey: null },
];
const displayKeys = ["lead", "tour", "decision", "waitlist", "enrolling", "enrolled"];
const states = (currentKey: string, traversed: string[] | null = null) =>
    Object.fromEntries(deriveStageStates({ stages, displayKeys, currentKey, traversedStageKeys: traversed }));

describe("stepper path truth", () => {
    it("an offer pending reads as Decision — no Offered milestone, Waitlist not checked", () => {
        expect(states("offered", ["offered"])).toEqual({ lead: "done", tour: "done", decision: "current", waitlist: "future", enrolling: "future", enrolled: "future" });
    });

    it("Decision → Offered → Enrolling: Waitlist stays blank because it was never entered", () => {
        expect(states("enrolling", ["offered", "enrolling"])).toEqual({ lead: "done", tour: "done", decision: "done", waitlist: "skipped", enrolling: "current", enrolled: "future" });
    });

    it("Decision → Waitlist: Waitlist is current", () => {
        expect(states("waitlist", ["waitlist"])).toMatchObject({ decision: "done", waitlist: "current", enrolling: "future" });
    });

    it("Waitlist → Offered → Enrolling: Waitlist is checked because it WAS entered", () => {
        expect(states("enrolling", ["waitlist", "offered", "enrolling"])).toMatchObject({ waitlist: "done", enrolling: "current" });
    });

    it("an unrecorded path never infers a child stage as traversed", () => {
        expect(states("enrolled", null)).toMatchObject({ decision: "done", waitlist: "skipped", enrolling: "skipped", enrolled: "current" });
    });

    it("the family track stays linear", () => {
        expect(states("decision")).toEqual({ lead: "done", tour: "done", decision: "current", waitlist: "future", enrolling: "future", enrolled: "future" });
    });

    it("the recorded path is read from metadata.stage_path_v1", () => {
        expect(traversedStageKeysFromMetadata({ stage_path_v1: [{ stage_key: "offered", entered_at: "t" }, { stage_key: "enrolling" }, { bad: 1 }] })).toEqual(["offered", "enrolling"]);
        expect(traversedStageKeysFromMetadata(null)).toEqual([]);
    });

    describe("an optional branch (allow_skipping) is drawn only on the path", () => {
        const railStages = [
            { key: "lead", label: "Lead", grain: "family" },
            { key: "tour", label: "Tour", grain: "family" },
            { key: "decision", label: "Decision", grain: "family" },
            { key: "waitlist", label: "Waitlist", grain: "child", allow_skipping: true },
            { key: "offered", label: "Offer pending", grain: "child", parent_stage_key: "decision" },
            { key: "enrolling", label: "Enrolling", grain: "child" },
            { key: "enrolled", label: "Enrolled", grain: "child" },
        ];
        const drawn = (stageKey: string, traversed: string[] = []) =>
            buildBusinessProcessCardEvidence({
                grain: "case",
                subject: { type: "opportunity", id: "o", label: "F" },
                businessProcess: { key: "enrollment", label: "Enrollment", stageKey, stages: railStages, traversedStageKeys: traversed },
            } as never).stages.map((st) => `${st.label}:${st.state}${st.detail ? `(${st.detail})` : ""}`);

        it("Offer pending: Lead ✓ → Tour ✓ → Decision ● (Offer pending) → Enrolling ○ → Enrolled ○", () => {
            expect(drawn("offered", ["offered"])).toEqual(["Lead:done", "Tour:done", "Decision:current(Offer pending)", "Enrolling:future", "Enrolled:future"]);
        });

        it("Accepted without waiting: no Waitlist step at all", () => {
            expect(drawn("enrolling", ["offered", "enrolling"])).toEqual(["Lead:done", "Tour:done", "Decision:done", "Enrolling:current", "Enrolled:future"]);
        });

        it("a family at Decision with one child's offer pending draws no Waitlist step", () => {
            const ev = buildBusinessProcessCardEvidence({
                grain: "case",
                subject: { type: "opportunity", id: "o", label: "F" },
                businessProcess: { key: "enrollment", label: "Enrollment", stageKey: "decision", stages: railStages, traversedStageKeys: [] },
                truth: {
                    stage_key: "decision",
                    _inquiry_children: [
                        { id: "c1", customer_member_id: "c1", display_name: "Ava Q", stage_key: "offered", outcome_status_key: "waitlisted" },
                        { id: "c2", customer_member_id: "c2", display_name: "Ben Q", stage_key: "decision" },
                    ],
                },
            } as never);
            // Both children are placed (the fixture binds), and Ava sits on Decision, not Waitlist.
            expect(ev.participants.map((x) => x.stageKey).sort()).toEqual(["decision", "offered"]);
            expect(ev.stages.find((st) => st.label === "Decision")?.participants.length).toBe(2);
            expect(ev.stages.map((st) => st.label)).toEqual(["Lead", "Tour", "Decision", "Enrolling", "Enrolled"]);
        });

        it("a waitlisted child shows Waitlist as its current step", () => {
            expect(drawn("waitlist", ["waitlist"])).toContain("Waitlist:current");
        });

        it("a child who waited and then enrolled keeps Waitlist checked", () => {
            expect(drawn("enrolling", ["waitlist", "offered", "enrolling"])).toContain("Waitlist:done");
        });
    });

    describe("a folded sub-stage reads inside its parent step, in configuration's words", () => {
        // `offered` folds into Decision; the per-child path that lands a child there reads "Offer pending".
        const rail = [
            { key: "lead", label: "Lead", grain: "family" },
            { key: "tour", label: "Tour", grain: "family" },
            { key: "decision", label: "Decision", grain: "family" },
            { key: "waitlist", label: "Waitlist", grain: "child", allow_skipping: true },
            {
                key: "offered",
                label: "Offer pending",
                grain: "child",
                parent_stage_key: "decision",
                folded_paths: [{ decision_key: "child_offer_spot", state_label: "Offer pending" }],
            },
            { key: "enrolling", label: "Enrolling", grain: "child" },
            { key: "enrolled", label: "Enrolled", grain: "child" },
        ];
        const child = (id: string, name: string, stage: string, answers?: Record<string, string[]>) => ({
            id,
            customer_member_id: id,
            display_name: name,
            stage_key: stage,
            ...(answers
                ? { _decision_answers_v1: Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, { answers: v.map((l) => ({ key: "placement", value: "x", value_label: l })) }])) }
                : {}),
        });
        const decisionStep = (children: unknown[], stages: ReadonlyArray<Record<string, unknown>> = rail) =>
            buildBusinessProcessCardEvidence({
                grain: "case",
                subject: { type: "opportunity", id: "o", label: "F" },
                businessProcess: { key: "enrollment", label: "Enrollment", stageKey: "decision", stages, traversedStageKeys: [] },
                truth: { stage_key: "decision", _inquiry_children: children },
            } as never).stages.find((st) => st.label === "Decision");

        it("one child: the path's state label and the answer it recorded", () => {
            const step = decisionStep([child("a", "Ava Q", "offered", { child_offer_spot: ["Infant"] }), child("b", "Ben Q", "waitlist")]);
            expect(step?.detail).toBe("Offer pending · Infant");
            // Only the offered child sits on Decision; the waitlisted sibling does not lend it a state.
            expect(step?.participants.map((x) => x.name)).toEqual(["Ava Q"]);
        });

        it("several children: a count in the sub-stage's configured label, never one child's details", () => {
            const step = decisionStep([
                child("a", "Ava Q", "offered", { child_offer_spot: ["Infant"] }),
                child("b", "Ben Q", "offered", { child_offer_spot: ["Toddler"] }),
            ]);
            expect(step?.detail).toBe("2 Offer pending");
        });

        it("the words are configuration's: a relabelled path reads in its new words", () => {
            const relabelled = rail.map((st) =>
                st.key === "offered" ? { ...st, folded_paths: [{ decision_key: "child_offer_spot", state_label: "Spot offered" }] } : st,
            );
            expect(decisionStep([child("a", "Ava Q", "offered", { child_offer_spot: ["Infant"] })], relabelled)?.detail).toBe("Spot offered · Infant");
        });

        it("no child at a sub-stage: the step carries no folded detail", () => {
            expect(decisionStep([child("a", "Ava Q", "decision"), child("b", "Ben Q", "waitlist")])?.detail).toBeUndefined();
        });
    });
});
