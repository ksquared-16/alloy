/**
 * The stepper shows the path a journey actually took — never a stage just because it is earlier in
 * configured order. Enrollment: family Lead/Tour/Decision; child Waitlist/Offered/Enrolling/Enrolled,
 * with Offered configured as a sub-stage of Decision (presented inside it).
 */
import { describe, expect, it } from "vitest";

import { deriveStageStates } from "@/lib/adminV2/runtime/focusPanel/businessProcess/buildBusinessProcessCardEvidence";
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
});
