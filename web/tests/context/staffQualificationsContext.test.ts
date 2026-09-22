/**
 * A CARD NOBODY CAN REACH IS NOT SHIPPED.
 *
 * The Qualifications card was declared for the `person` grain, placed on the person composition,
 * given a derivation and a renderer branch — four green steps — and an operator opening a real
 * staff record still saw nothing. The Operations Staff record does not render the Focus Panel
 * composition at all: it renders ONE canonical card per selected CONTEXT, through
 * `DurableRecordContextualCard`. With no `qualifications` context there was no option to select,
 * so the host never reached the card.
 *
 * That is a fifth requirement, and it is the one no automated gate was asking about. This file
 * asks: the kind exists, it is a canonical record kind, a staff subject emits it, a non-staff
 * person does not, and the host actually renders the card for it.
 *
 * The source assertion at the end is deliberate. Every other assertion here composes values this
 * test just built; only reading the host proves the wiring an operator depends on.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildSubjectQualificationsContext } from "@/lib/context/buildSubjectContexts";
import { durableRecordContextOptions } from "@/lib/context/durableRecordContextOptions";
import type { PersonEmploymentComposition } from "@/lib/employment/buildPersonEmploymentComposition";

function code(rel: string): string {
    return readFileSync(join(__dirname, "../../", rel), "utf8");
}

const STAFF: PersonEmploymentComposition = {
    is_staff: true,
    current: {
        id: "emp-1",
        status: "active",
        state_label: "Active",
        is_open: true,
        position_label: "Lead Teacher",
        employment_type: "full_time",
        employment_type_label: "Full time",
        primary_location_id: "loc-1",
        primary_location_label: "North Campus",
        external_employee_id: null,
        badge_number: null,
        start_date: "2026-01-05",
        end_date: null,
        end_reason_key: null,
    },
    periods: [],
    configured_facts: [],
    never_employed: false,
};

describe("the Qualifications context is what makes the card reachable", () => {
    it("a staff subject emits it, even holding nothing", () => {
        // Offered on EMPLOYMENT, not on holding a credential. "No qualifications recorded" is an
        // answer an operator needs, and gating on content would hide the empty state precisely
        // when someone went looking for it.
        const ctx = buildSubjectQualificationsContext(STAFF, "p-1");
        expect(ctx).not.toBeNull();
        expect(ctx!.kind).toBe("qualifications");
        expect(ctx!.key).toBe("qualifications");
        expect(ctx!.label).toBe("Qualifications");
        // No derived summary: standing depends on the org's day and is resolved server-side.
        expect(ctx!.detail).toBeNull();
        expect(ctx!.destination_entity_type).toBe("persons");
        // A standing is not a queue position, so it routes to no work unit.
        expect(ctx!.destination_work_unit_key).toBeNull();
    });

    it("a person who has never worked here does not get the context", () => {
        // A qualification hangs off an employment. With none there is nothing to be about, and the
        // option would open a card that must immediately render nothing.
        expect(buildSubjectQualificationsContext(null, "p-1")).toBeNull();
        expect(
            buildSubjectQualificationsContext(
                { ...STAFF, is_staff: false, current: null, never_employed: true },
                "p-1",
            ),
        ).toBeNull();
    });

    it("it resolves as a canonical card about the record, like Employment", () => {
        const [option] = durableRecordContextOptions([
            buildSubjectQualificationsContext(STAFF, "p-1")!,
        ]);
        // `canonical_record`, not `none`: a card exists for it, so the option must not report that
        // nothing renders.
        expect(option!.surface).toBe("canonical_record");
        expect(option!.kind).toBe("qualifications");
    });

    it("the host renders the canonical card for that context", () => {
        // The assertion that would have caught the defect. Everything else here is this test
        // talking to itself; this reads the wiring an operator actually depends on.
        const host = code("components/presentation/durableRecord/DurableRecordContextualCard.tsx");
        expect(host).toContain('option.kind === "qualifications"');
        expect(host).toContain("derivePersonQualificationsCard(subject.person.employment)");
        // Read-only here, exactly as the Staff card is on this host: recording a qualification is
        // the registered command's job, and a second execution path is what that rule prevents.
        expect(host).not.toContain("mutation={qualificationMutation}");
    });

    it("the loader emits it beside Employment, from the same composition", () => {
        // One source for "is this person staff". Two fetches would drift with nothing reporting it.
        const loader = code("lib/context/loadSubjectContexts.ts");
        expect(loader).toContain("buildSubjectQualificationsContext(employment, subjectId)");
    });
});
