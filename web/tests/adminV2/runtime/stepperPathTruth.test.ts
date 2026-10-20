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
});
