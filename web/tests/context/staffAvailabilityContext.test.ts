/**
 * REACHABILITY IS THE FIFTH STEP, AND IT IS THE ONE THAT WAS MISSED.
 *
 * Slice 3 declared a person-grain card, placed it on the composition, derived a
 * model and gave it a renderer branch — four green steps — and an operator opening
 * a real staff record saw nothing, because the Operations Staff record renders ONE
 * canonical card per CONTEXT and no context named it.
 *
 * So this file asserts the whole chain for Availability, and then asserts the RULE
 * generically: every person-grain card the composition places must be reachable
 * through a context the host actually renders. The generic assertion is the point —
 * a card added later gets the same protection without anyone remembering to write
 * a test for it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { focusPanelDefaultCompositionForGrain } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelSummaryDefaultComposition";
import { buildSubjectAvailabilityContext } from "@/lib/context/buildSubjectContexts";
import { durableRecordContextOptions } from "@/lib/context/durableRecordContextOptions";
import type { PersonEmploymentComposition } from "@/lib/employment/buildPersonEmploymentComposition";

function code(rel: string): string {
    return readFileSync(join(__dirname, "../../", rel), "utf8");
}

const HOST = "components/presentation/durableRecord/DurableRecordContextualCard.tsx";

const STAFF: PersonEmploymentComposition = {
    is_staff: true,
    current: {
        id: "emp-1", status: "active", state_label: "Active", is_open: true,
        position_label: "Lead Teacher", employment_type: "full_time", employment_type_label: "Full time",
        primary_location_id: "loc-1", primary_location_label: "North Campus",
        external_employee_id: null, badge_number: null,
        start_date: "2026-01-05", end_date: null, end_reason_key: null,
    },
    periods: [], configured_facts: [], never_employed: false,
};

describe("the Availability context makes the card reachable", () => {
    it("a staff subject emits it, even with no pattern set", () => {
        // Gated on EMPLOYMENT, not on having a pattern: "no availability set" is the
        // state an operator opens the record to fix.
        const ctx = buildSubjectAvailabilityContext(STAFF, "p-1");
        expect(ctx).not.toBeNull();
        expect(ctx!.kind).toBe("availability");
        expect(ctx!.label).toBe("Availability");
        // No derived detail: the resolved answer depends on the org's day.
        expect(ctx!.detail).toBeNull();
        // A standing intent is not a queue position.
        expect(ctx!.destination_work_unit_key).toBeNull();
    });

    it("a person who never worked here does not get it", () => {
        expect(buildSubjectAvailabilityContext(null, "p-1")).toBeNull();
        expect(buildSubjectAvailabilityContext(
            { ...STAFF, is_staff: false, current: null, never_employed: true }, "p-1",
        )).toBeNull();
    });

    it("it resolves as a canonical card about the record", () => {
        const [option] = durableRecordContextOptions([buildSubjectAvailabilityContext(STAFF, "p-1")!]);
        // `canonical_record`, not `none`: a card exists, so the option must not
        // report that nothing renders.
        expect(option!.surface).toBe("canonical_record");
    });

    it("the host renders the canonical card for it", () => {
        const host = code(HOST);
        expect(host).toContain('option.kind === "availability"');
        expect(host).toContain("derivePersonAvailabilityCard(subject.person.employment)");
    });

    it("the loader emits it from the same composition as Employment", () => {
        expect(code("lib/context/loadSubjectContexts.ts"))
            .toContain("buildSubjectAvailabilityContext(employment, subjectId)");
    });
});

/**
 * THE RULE, NOT THE INSTANCE.
 *
 * Written generically so the next person-grain card inherits the protection. If a
 * card is placed on the person surface and the contextual host cannot reach it,
 * this fails and names the key — which is exactly the report that was missing when
 * Qualifications shipped invisible.
 */
describe("every placed person card is reachable through a real context", () => {
    /** Cards the person panel composes that the CONTEXTUAL host is not expected to own. */
    const HOST_EXEMPT = new Set<string>([
        // `staff` is reached through the `employment` context, whose key does not
        // match the card key — the one legitimate mismatch, and it is asserted below.
        "staff",
    ]);

    it("names a context branch in the host for each placed card", () => {
        const host = code(HOST);
        const placed = focusPanelDefaultCompositionForGrain("person").map((e) => e.key);
        expect(placed.length).toBeGreaterThan(0);
        for (const key of placed) {
            if (HOST_EXEMPT.has(key)) continue;
            expect(
                host.includes(`data-contextual-card-canonical-card="${key}"`),
                `${key} is placed on the person surface but the contextual host renders no branch for `
                    + "it, so an operator opening a real staff record will never see it.",
            ).toBe(true);
        }
    });

    it("the exempt card is reached through its own named context", () => {
        // Stated rather than assumed: `staff` renders under the `employment` context.
        const host = code(HOST);
        expect(host).toContain('option.kind === "employment"');
        expect(host).toContain('data-contextual-card-canonical-card="staff"');
    });
});
