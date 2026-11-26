/**
 * RECORD HOME + INTENT CONVERGENCE — the pass-2 invariants, asserted where they can fail.
 *
 *   selecting a record opens the record; selecting related work navigates to the work.
 *
 * The load-bearing claims:
 *   1. The overlay's `Go to` destinations are Search's destinations — one resolver, byte-equal
 *      payloads, so the two entries cannot land on two implementations of one journey.
 *   2. The record opens record-first: identity for a child, employment for a person, no chooser.
 *   3. A declared OPERATIONAL intent (Create assignment → schedule) is honoured in place; a
 *      PROCESS preference is not — a process is related work and navigates.
 */

import { describe, expect, it } from "vitest";

import { durableRecordRelatedWork } from "@/lib/context/durableRecordRelatedWork";
import { resolveSearchDestinations } from "@/lib/search/searchDestinations";
import {
    durableRecordContextOptions,
    resolveInitialContextOption,
} from "@/lib/context/durableRecordContextOptions";
import type { SubjectContext } from "@/lib/context/subjectContextTypes";

/** Lennon's contexts as the shared projection produces them in the certification tenant. */
function lennonContexts(): SubjectContext[] {
    return [
        {
            kind: "process",
            key: "enrollment",
            label: "Enrollment",
            detail: "Waitlist",
            destination_entity_type: "opportunity",
            destination_entity_id: "case-1",
            destination_work_unit_key: "unit-1",
            destination_work_view_id: null,
            stage_key: "waitlist",
            state: "active",
            operational_memberships: null,
        },
        {
            kind: "schedule",
            key: "schedule",
            label: "Schedule",
            detail: null,
            site_location_id: "site-1",
        },
        { kind: "identity", key: "identity", label: "Child", detail: null },
        {
            kind: "relationship",
            key: "household",
            label: "Household",
            detail: null,
            destination_entity_id: "household-1",
        },
    ] as unknown as SubjectContext[];
}

const LENNON = {
    kind: "child" as const,
    memberId: "member-1",
    personId: null,
    householdId: "household-1",
    label: "Lennon Kurzman",
};

describe("Go to reuses Search's destinations — no Operations resolver", () => {
    it("emits payloads BYTE-EQUAL to what resolveSearchDestinations emits for the same subject", () => {
        const contexts = lennonContexts();
        const related = durableRecordRelatedWork(LENNON, contexts);

        const fromSearch = resolveSearchDestinations({
            subject: {
                kind: "child",
                id: LENNON.memberId,
                display_name: LENNON.label,
                person_id: null,
                household_id: LENNON.householdId,
                household_case_entity_id: null,
                household_case_work_unit_key: null,
            },
            contexts,
            promotedKeys: [],
        }).filter(
            (d) =>
                d.target === "focus_panel"
                && d.key !== "household"
                && Boolean((d.host_work_unit_key ?? "").trim()),
        );

        expect(related).toEqual(fromSearch);
        // The set is real, not vacuous: Lennon's enrollment and assignment both navigate.
        expect(related.map((d) => d.key)).toEqual(["process:enrollment", "assignment"]);
    });

    it("drops a destination that names no Work Unit — a `Go to` that would do nothing", () => {
        const contexts = lennonContexts();
        (contexts[0] as { destination_work_unit_key: string | null }).destination_work_unit_key = null;
        const related = durableRecordRelatedWork(LENNON, contexts);
        expect(related.map((d) => d.key)).not.toContain("process:enrollment");
    });

    it("a person with only employment has no related-work destinations, and empty is ordinary", () => {
        const contexts = [
            { kind: "employment", key: "employment", label: "Employment", detail: null },
        ] as unknown as SubjectContext[];
        expect(
            durableRecordRelatedWork({ kind: "person", personId: "p-1", label: "Jane" }, contexts),
        ).toEqual([]);
    });
});

describe("record-first defaults", () => {
    it("the in-place schedule context SURVIVES beside its Go to — two intents, not one", () => {
        // "Show me the commitment here" (the certified O-3b editing surface, and Create
        // Assignment's landing) and "go to where assignments are worked" coexist, exactly as
        // Search offers a record destination beside the operational ones.
        const options = durableRecordContextOptions(lennonContexts());
        expect(options.some((o) => o.surface === "canonical_operational")).toBe(true);
        expect(durableRecordRelatedWork(LENNON, lennonContexts()).map((d) => d.key)).toContain(
            "assignment",
        );
    });


    it("a child's record options lead with identity, then household — the overlay's default order", () => {
        const options = durableRecordContextOptions(lennonContexts()).filter(
            (o) => o.surface === "canonical_record",
        );
        expect(options.map((o) => o.kind)).toEqual(["identity", "relationship"]);
    });

    it("a declared operational intent resolves in place; nothing else does", () => {
        const options = durableRecordContextOptions(lennonContexts());
        const inPlace = options.filter(
            (o) => o.surface === "canonical_record" || o.surface === "canonical_operational",
        );
        // Create assignment arrives with `schedule` and must land on the scheduling card.
        expect(resolveInitialContextOption(inPlace, "schedule")?.kind).toBe("schedule");
        // A process key finds nothing in the in-place set — its home is `Go to`.
        expect(resolveInitialContextOption(inPlace, "enrollment")?.kind).not.toBe("process");
    });
});
