/**
 * THE LIFECYCLE RAIL'S CURRENT STAGE IS THE RECORD'S, NEVER THE LENS'S.
 *
 * A Work Unit answers "which operational lens did the operator open?". It cannot answer "which
 * stage is this record actually in?" — and the rail used to let it, by falling back to the work
 * unit's own `lifecycle_stage_key` whenever the record's status resolved no stage.
 *
 * The consequence was measurable rather than theoretical: every placement candidate opened from the
 * Waitlist work unit reported stage `waitlist`, whatever its process instance said, so the Process
 * card asserted membership nobody had granted and no QA against that card could tell real
 * membership from the lane it was viewed through.
 *
 * These tests hold the rail to two things: the record's own status decides, and an unresolved stage
 * resolves to NULL rather than to whatever the route happened to be.
 */

import { describe, expect, it } from "vitest";

import { buildOpportunityWorkspaceLifecycleRail } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityWorkspaceLifecycleRail";
import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";

const STAGE_KEYS = ["lead", "tour", "waitlist", "enrolling"] as const;

function departmentMetadata() {
    return {
        lifecycle_builder_v1: {
            version: 1,
            active_process_id: "p1",
            processes: [
                {
                    id: "p1",
                    key: "enrollment",
                    name: "Enrollment",
                    is_active: true,
                    stages: STAGE_KEYS.map((key, i) => ({
                        id: `s-${key}`,
                        key,
                        label: key === "lead" ? "New Lead" : key,
                        sort_order: i,
                        is_active: true,
                    })),
                },
            ],
        },
    };
}

/** A status definition that names the stage it belongs to, the way configuration does. */
function statusDef(statusKey: string, stageKey: string): StatusDefinitionRow {
    return {
        status_key: statusKey,
        metadata: { process_stage_key: stageKey },
    } as unknown as StatusDefinitionRow;
}

function rail(args: { statusKey: string | null; statusDefs?: StatusDefinitionRow[] }) {
    return buildOpportunityWorkspaceLifecycleRail({
        departmentMetadata: departmentMetadata(),
        statusKey: args.statusKey,
        statusDefs: args.statusDefs ?? [statusDef("new_lead", "lead"), statusDef("touring", "tour")],
    });
}

describe("the lifecycle rail's current stage", () => {
    it("comes from the record's own status", () => {
        expect(rail({ statusKey: "touring" })?.current_stage_key).toBe("tour");
        expect(rail({ statusKey: "new_lead" })?.current_stage_key).toBe("lead");
    });

    it("is NULL when the record's status names no stage — the honest answer", () => {
        // The rail still renders. It simply stops claiming to know where this record sits.
        const r = rail({ statusKey: "some_unconfigured_status" });
        expect(r).not.toBeNull();
        expect(r!.stages.map((s) => s.key)).toEqual([...STAGE_KEYS]);
        expect(r!.current_stage_key).toBeNull();
    });

    it("is NULL for a record with no status at all", () => {
        expect(rail({ statusKey: null })?.current_stage_key).toBeNull();
        expect(rail({ statusKey: "   " })?.current_stage_key).toBeNull();
    });

    /**
     * THE GUARD THAT MATTERS.
     *
     * The builder takes no work-unit input, so no route can reach the answer. Asserting the
     * SIGNATURE rather than a behaviour is deliberate: a behavioural test would pass again the day
     * someone re-adds the parameter and wires it only in production, whereas the parameter simply
     * not existing cannot be bypassed.
     */
    it("cannot be told what the lens was — the builder takes no work-unit input", () => {
        const source = buildOpportunityWorkspaceLifecycleRail.toString();
        expect(source).not.toMatch(/workUnit/i);
        expect(source).not.toMatch(/lifecycle_stage_key/);
    });

    it("a record's stage does not change when the same record is read through another lane", () => {
        // Two reads, same record, nothing about the route in scope. One answer.
        const fromOneLane = rail({ statusKey: "new_lead" })?.current_stage_key;
        const fromAnother = rail({ statusKey: "new_lead" })?.current_stage_key;
        expect(fromOneLane).toBe("lead");
        expect(fromAnother).toBe(fromOneLane);
    });
});
