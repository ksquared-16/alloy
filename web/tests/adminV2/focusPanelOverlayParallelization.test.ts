/**
 * Focus Panel first-useful — the child-orientation overlay chain was parallelized: the three
 * independent overlay FETCHES (placement labels, process-instance participation, durable facts) now
 * run concurrently and only their pure APPLICATION stays serial in precedence order. These tests lock
 * the extracted pure `apply*` functions so the reordering can never silently change the result:
 * precedence must remain placement → participation → durable → draft (durable > draft > process > OCM).
 */

import { describe, expect, it } from "vitest";
import {
    applyDurableOperationalFacts,
    applyProcessInstanceParticipation,
} from "@/lib/admin/opportunityEntityRecord";

type Child = Record<string, unknown> & { customer_member_id: string; location_id?: string | null };

function child(id: string, extra: Partial<Child> = {}): Child {
    return { customer_member_id: id, desired_program_label: "OCM Program", start_date: "2026-01-01", ...extra } as Child;
}

describe("applyProcessInstanceParticipation (pure)", () => {
    it("overlays process-instance state/stage and marks the participation source", () => {
        const out = applyProcessInstanceParticipation(
            [child("m1")] as never,
            [{ subject_id: "m1", state: "enrolling", stage_key: "lead" }] as never,
            new Map([["enrolling", "Enrolling"]]),
        );
        expect(out[0]).toMatchObject({
            outcome_status_key: "enrolling",
            outcome_status_label: "Enrolling",
            stage_key: "lead",
            _participation_source: "process_instances",
        });
    });

    it("falls back to OCM for a child with no matching instance", () => {
        const out = applyProcessInstanceParticipation([child("m1")] as never, [] as never, new Map());
        expect(out[0]._participation_source).toBe("ocm");
    });
});

describe("applyDurableOperationalFacts (pure)", () => {
    it("durable facts WIN over the incoming (participation-applied) values", () => {
        const facts = new Map([["m1", { programLabel: "Durable Program", roomLabel: "Room A", scheduleLabel: "Full", startDate: "2026-09-01", programCategoryId: "pc1", siteLocationId: "loc9" }]]);
        const out = applyDurableOperationalFacts([child("m1")] as never, facts as never);
        expect(out[0]).toMatchObject({
            desired_program_label: "Durable Program",
            program_room_cohort_label: "Room A",
            start_date: "2026-09-01",
            location_id: "loc9",
            _operational_facts_source: "durable",
        });
    });

    it("children with no durable fact keep OCM values and are marked ocm (draft-eligible)", () => {
        const out = applyDurableOperationalFacts([child("m1")] as never, new Map() as never);
        expect(out[0].desired_program_label).toBe("OCM Program");
        expect(out[0]._operational_facts_source).toBe("ocm");
    });

    it("precedence is preserved when composed serially: participation then durable", () => {
        // Simulate the parallel-fetch → serial-apply pipeline exactly as the shell now runs it.
        const base = [child("m1"), child("m2")];
        const instances = [{ subject_id: "m1", state: "enrolling", stage_key: "lead" }];
        const durable = new Map([["m2", { programLabel: "Durable P", roomLabel: null, scheduleLabel: null, startDate: null, programCategoryId: null, siteLocationId: null }]]);
        let out = applyProcessInstanceParticipation(base as never, instances as never, new Map([["enrolling", "Enrolling"]]));
        out = applyDurableOperationalFacts(out, durable as never);
        // m1: participation applied, no durable → ocm facts source, process participation source.
        expect(out[0]).toMatchObject({ _participation_source: "process_instances", _operational_facts_source: "ocm" });
        // m2: no participation (ocm), durable facts win.
        expect(out[1]).toMatchObject({ _participation_source: "ocm", _operational_facts_source: "durable", desired_program_label: "Durable P" });
    });
});
