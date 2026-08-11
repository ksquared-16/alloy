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
            { key: "subject", label: "Open Joe", target: "open_drawer", entity_type: "persons", entity_id: "p-1", primary: true },
            { key: "process:enrollment", label: "Enrollment", target: "open_drawer", entity_type: "opportunities", entity_id: "opp-9" },
            { key: "household", label: "Household", target: "open_drawer", entity_type: "customers", entity_id: "cust-1" },
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

describe("search selection projection", () => {
    it("flattens a subject to the record its PRIMARY destination names", () => {
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
