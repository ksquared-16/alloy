/**
 * THE BUSINESS PROCESS PROVIDER — one composition, three processes, no process-name branch.
 *
 * Portability is asserted the only way that means anything: by driving the SAME function from three
 * different configurations and checking it never needs to know which one it got. Instantiating React
 * props directly would prove nothing about the resolver.
 */

import { describe, expect, it } from "vitest";

import { buildBusinessProcessCardEvidence } from "@/lib/adminV2/runtime/focusPanel/businessProcess/buildBusinessProcessCardEvidence";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

type StageFixture = { key: string; label: string; support?: readonly string[] };

/**
 * A context shaped exactly as the runtime composes one. `truth` carries the children rows the
 * Children evidence builder reads, so participants arrive through their real owner rather than
 * being handed to the provider pre-made.
 */
function contextFixture(args: {
    processLabel: string;
    stages: StageFixture[];
    caseStageKey: string | null;
    children?: Array<{ id: string; name: string; stage_key?: string | null; outcome_status_key?: string | null }>;
}): OperationalContext {
    return {
        grain: "case",
        subject: { type: "opportunity", id: "opp_1", label: "Wright Family" },
        businessProcess: {
            key: args.caseStageKey,
            label: args.processLabel,
            stageKey: args.caseStageKey,
            stages: args.stages,
        },
        perspective: null,
        truth: {
            id: "opp_1",
            stage_key: args.caseStageKey,
            _children: (args.children ?? []).map((c) => ({
                id: c.id,
                customer_member_id: c.id,
                name: c.name,
                first_name: c.name.split(" ")[0],
                stage_key: c.stage_key ?? null,
                outcome_status_key: c.outcome_status_key ?? null,
            })),
        },
        signals: {
            work: null,
            attention: null,
            tour: null,
            communications: null,
            billing: null,
        },
        stageWorkRuntime: null,
    } as unknown as OperationalContext;
}

const ENROLLMENT: StageFixture[] = [
    { key: "lead", label: "Lead" },
    { key: "tour", label: "Tour", support: ["Aug 27 · 10:00 AM", "North Campus"] },
    { key: "waitlist", label: "Waitlist", support: ["#4 · Toddler", "Joined Aug 19"] },
    { key: "enrolling", label: "Enrolling" },
    { key: "enrolled", label: "Enrolled" },
];

const ASSIGNMENT: StageFixture[] = [
    { key: "requested", label: "Requested" },
    { key: "offered", label: "Offered", support: ["Sunflower Room"] },
    { key: "active", label: "Active", support: ["Sunflower Room", "Mon – Fri"] },
    { key: "ended", label: "Ended" },
];

const BILLING: StageFixture[] = [
    { key: "setup", label: "Setup" },
    { key: "active", label: "Active" },
    { key: "past_due", label: "Past due", support: ["$255 · 10 days", "Visa declined Aug 16"] },
    { key: "closed", label: "Closed" },
];

describe("one provider, three configured processes", () => {
    it("renders each process's own configured stages, in configured order", () => {
        for (const [label, stages, current] of [
            ["Enrollment", ENROLLMENT, "tour"],
            ["Assignment", ASSIGNMENT, "active"],
            ["Billing", BILLING, "past_due"],
        ] as const) {
            const ev = buildBusinessProcessCardEvidence(
                contextFixture({ processLabel: label, stages: [...stages], caseStageKey: current }),
            );
            expect(ev.stages.map((s) => s.key)).toEqual(stages.map((s) => s.key));
            expect(ev.stages.find((s) => s.key === current)?.state).toBe("current");
            expect(ev.caseStageKey).toBe(current);
        }
    });

    it("marks stages done / current / future by position, for every process alike", () => {
        const ev = buildBusinessProcessCardEvidence(
            contextFixture({ processLabel: "Billing", stages: BILLING, caseStageKey: "past_due" }),
        );
        expect(ev.stages.map((s) => s.state)).toEqual(["done", "done", "current", "future"]);
    });

    it("resolves at most TWO annotation slots, whatever configuration supplies", () => {
        const greedy: StageFixture[] = [
            { key: "active", label: "Active", support: ["one", "two", "three", "four"] },
        ];
        const ev = buildBusinessProcessCardEvidence(
            contextFixture({ processLabel: "Assignment", stages: greedy, caseStageKey: "active" }),
        );
        const stage = ev.stages[0]!;
        expect(stage.primarySupport).toBe("one");
        expect(stage.secondarySupport).toBe("two");
        // The platform owns the cap: a third slot is not a property the stage can have.
        expect(Object.keys(stage)).not.toContain("tertiarySupport");
    });

    it("leaves annotation slots null when configuration declares none", () => {
        const ev = buildBusinessProcessCardEvidence(
            contextFixture({ processLabel: "Assignment", stages: ASSIGNMENT, caseStageKey: "requested" }),
        );
        const requested = ev.stages.find((s) => s.key === "requested")!;
        expect(requested.primarySupport).toBeNull();
        expect(requested.secondarySupport).toBeNull();
    });

    it("omits the rail entirely when a process declares no stages", () => {
        const ev = buildBusinessProcessCardEvidence(
            contextFixture({ processLabel: "Unstaged", stages: [], caseStageKey: null }),
        );
        expect(ev.stages).toEqual([]);
        expect(ev.caseStageKey).toBeNull();
    });
});
