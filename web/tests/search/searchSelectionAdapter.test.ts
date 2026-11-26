import { describe, expect, it } from "vitest";

import type { SearchResult } from "@/lib/search/searchContracts";
import {
    searchSelectionFromResult,
    searchSelectionsFromResults,
} from "@/lib/search/searchSelectionAdapter";
import { buildRecordPickerOptions } from "@/lib/pos/packet/recordPickerOptions";

/**
 * Regression cover for a defect Search V2 shipped: `/api/admin/global-search` has
 * THREE consumers, and changing its response to subjects silently broke the two
 * that expected flat record hits — the POS packet record picker and the
 * Experience Builder preview selector. Both filtered to zero results with no
 * error, because a `SearchResult` has no `entity_type`/`entity_id`/`group`.
 */

function childResult(): SearchResult {
    return {
        subject: {
            kind: "child",
            id: "cm-1",
            display_name: "Joe Smith",
            person_id: "p-1",
            household_id: "cust-1",
        },
        recognition: {
            type_label: "Child",
            household_name: "Smith Household",
            location_label: "Bend Campus",
            age_label: "4y 2mo",
        },
        contexts: [],
        destinations: [
            { key: "subject", label: "Open Joe", target: "focus_panel", card_key: "children", item_id: "cm-1", host_entity_type: "persons", host_entity_id: "p-1", primary: true },
            { key: "process:enrollment", label: "Enrollment", target: "focus_panel", card_key: "current_work", context_key: "enrollment", host_entity_type: "opportunities", host_entity_id: "opp-9" },
            { key: "household", label: "Household", target: "focus_panel", card_key: "household", host_entity_type: "customers", host_entity_id: "cust-1" },
        ],
        ranking: { score: 500, reasons: [] },
    };
}

function locationResult(): SearchResult {
    return {
        subject: { kind: "location", id: "loc-1", display_name: "North Campus" },
        recognition: { type_label: "Campus" },
        contexts: [],
        destinations: [
            { key: "subject", label: "Open North Campus", target: "route", href: "/organization/locations?locationId=loc-1", primary: true },
        ],
        ranking: { score: 15, reasons: [] },
    };
}

/**
 * The SHIPPING shape after the record/work split: the primary destination is a durable record and
 * carries no host at all.
 */
function durableChildResult(overrides: { personId?: string | null } = {}): SearchResult {
    const personId = overrides.personId === undefined ? "p-1" : overrides.personId;
    return {
        subject: {
            kind: "child",
            id: "cm-1",
            display_name: "Joe Smith",
            person_id: personId,
            household_id: "cust-1",
        },
        recognition: {
            type_label: "Child",
            household_name: "Smith Household",
            location_label: "Bend Campus",
            age_label: "4y 2mo",
        },
        contexts: [],
        destinations: [
            { key: "subject", label: "Open Joe", target: "durable_record", subject_type: "child", subject_id: "cm-1", primary: true },
            { key: "process:enrollment", label: "Enrollment", target: "focus_panel", card_key: "current_work", context_key: "enrollment", host_entity_type: "opportunities", host_entity_id: "opp-9" },
            { key: "household", label: "Household", target: "focus_panel", card_key: "household", host_entity_type: "customers", host_entity_id: "cust-1" },
        ],
        ranking: { score: 500, reasons: [] },
    };
}

function durablePersonResult(): SearchResult {
    return {
        subject: { kind: "person", id: "p-kelly", display_name: "Kelly Kurzman", person_id: "p-kelly", household_id: "cust-1" },
        recognition: { type_label: "Parent / Guardian" },
        contexts: [],
        destinations: [
            { key: "subject", label: "Open Kelly", target: "durable_record", subject_type: "person", subject_id: "p-kelly", primary: true },
        ],
        ranking: { score: 400, reasons: [] },
    };
}

describe("a DURABLE primary destination still yields a pickable record", () => {
    /**
     * The regression this exists to prevent, arriving from the opposite direction to the original.
     *
     * When the subject destination became `durable_record` it stopped carrying a host — and a
     * projection that only understood `focus_panel` would have found no entity on ANY person or
     * child result and filtered every one of them away. Silently: an empty picker, not an error.
     * That is the same failure mode this module was written after.
     */
    it("does not zero out the picker for a child", () => {
        const selection = searchSelectionFromResult(durableChildResult())!;
        expect(selection).toBeTruthy();
        expect(selection.entity_type).toBe("persons");
        expect(selection.entity_id).toBe("p-1");
        expect(selection.name).toBe("Joe Smith");
        // The case behind the subject is still resolved, from the OPERATIONAL siblings.
        expect(selection.opportunity_id).toBe("opp-9");
    });

    it("does not zero out the picker for a person", () => {
        const selection = searchSelectionFromResult(durablePersonResult())!;
        expect(selection.entity_type).toBe("persons");
        expect(selection.entity_id).toBe("p-kelly");
    });

    it("drops a child with no person row rather than inventing an entity type", () => {
        // `customer_members.person_id` is nullable and null is ordinary. These consumers pick in the
        // drawer vocabulary, which has no child grain, so the honest answer is no reference — never
        // a fabricated `customer_members` entity type, which the legacy guard below also forbids.
        expect(searchSelectionFromResult(durableChildResult({ personId: null }))).toBeNull();
    });

    it("never names a legacy drawer entity type", () => {
        for (const result of [durableChildResult(), durablePersonResult()]) {
            const selection = searchSelectionFromResult(result);
            expect(selection?.entity_type).not.toBe("customer_members");
            expect(selection?.entity_type).not.toBe("contacts");
        }
    });

    it("still builds picker options from a durable-primary result set", () => {
        const options = buildRecordPickerOptions(
            searchSelectionsFromResults([durableChildResult(), durablePersonResult()]),
        );
        // Both people are pickable. (The builder also derives a household option from the child's
        // `customer_id`, which is pre-existing behaviour and not what this test is about.)
        const people = options.filter((o) => o.entity_type === "person").map((o) => o.entity_id);
        expect(people).toContain("p-1");
        expect(people).toContain("p-kelly");
    });
});

describe("search selection projection", () => {
    it("flattens a subject to the HOST record its PRIMARY destination names", () => {
        const selection = searchSelectionFromResult(childResult())!;
        expect(selection.entity_type).toBe("persons");
        expect(selection.entity_id).toBe("p-1");
        expect(selection.name).toBe("Joe Smith");
        expect(selection.type_label).toBe("Child");
        expect(selection.household_name).toBe("Smith Household");
        expect(selection.customer_id).toBe("cust-1");
    });

    it("carries the opportunity behind a subject that participates in one", () => {
        const selection = searchSelectionFromResult(childResult())!;
        expect(selection.opportunity_id).toBe("opp-9");
    });

    it("treats a campus as a location record even though it opens a route", () => {
        const selection = searchSelectionFromResult(locationResult())!;
        expect(selection.entity_type).toBe("locations");
        expect(selection.entity_id).toBe("loc-1");
    });

    it("returns null when a subject has no canonical record surface", () => {
        const orphan: SearchResult = {
            subject: { kind: "child", id: "cm-x", display_name: "No Surface" },
            recognition: { type_label: "Child" },
            contexts: [],
            destinations: [],
            ranking: { score: 0, reasons: [] },
        };
        expect(searchSelectionFromResult(orphan)).toBeNull();
        expect(searchSelectionsFromResults([orphan])).toEqual([]);
    });

    it("REGRESSION: the POS record picker produces options again", () => {
        // Before the fix this returned [] for every query, silently.
        const options = buildRecordPickerOptions(searchSelectionsFromResults([childResult()]));

        expect(options[0].entity_type).toBe("person");
        expect(options[0].entity_id).toBe("p-1");
        expect(options[0].label).toBe("Joe Smith");

        // The picker derives a selectable household from `customer_id` +
        // `household_name`. The projection must carry both, or that affordance
        // would be lost silently rather than loudly.
        expect(options).toHaveLength(2);
        expect(options[1]).toMatchObject({
            entity_type: "customer",
            entity_id: "cust-1",
            label: "Smith Household",
        });
    });

    it("REGRESSION: a raw SearchResult array yields no picker options without the projection", () => {
        // Proves the defect was real rather than hypothetical: feeding subjects
        // straight in — which is what shipped — produces nothing.
        const raw = [childResult()] as unknown as Parameters<typeof buildRecordPickerOptions>[0];
        expect(buildRecordPickerOptions(raw)).toHaveLength(0);
    });
});
