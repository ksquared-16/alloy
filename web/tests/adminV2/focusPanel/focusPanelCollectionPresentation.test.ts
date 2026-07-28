import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    applyCanonicalChildrenCollectionPolicy,
    childIdentityFromCanonicalCollectionItem,
    FOCUS_PANEL_CHILDREN_COLLECTION_REF,
    normalizeFocusPanelChildrenRowsFromTruth,
} from "@/lib/adminV2/runtime/focusPanel/collections/focusPanelCollectionPresentation";
import { findCanonicalCollectionProvider } from "@/lib/fields/collection/canonicalCollectionProviderRegistry";
import { buildChildrenCardEvidence } from "@/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

const baseRow = {
    person_id: null,
    dob: null,
    age: null,
    desired_program_label: null,
    program_room_cohort_label: null,
    location_label: null,
    desired_schedule_label: null,
    start_date: null,
    outcome_status_key: null,
};

describe("focusPanelCollectionPresentation", () => {
    it("uses canonical children collection provider policy from registry", () => {
        const provider = findCanonicalCollectionProvider(FOCUS_PANEL_CHILDREN_COLLECTION_REF);
        expect(provider?.orderingPolicy).toBe("display_name");
        expect(provider?.activeOnly).toBe(true);
    });

    it("sorts children by display name per canonical collection policy", () => {
        const rows = applyCanonicalChildrenCollectionPolicy(
            [
                { ...baseRow, id: "b", display_name: "Zara", first_name: "Zara", last_name: "Lee" },
                { ...baseRow, id: "a", display_name: "Alex", first_name: "Alex", last_name: "Kim" },
            ] as never,
            [{ is_active: true }, { is_active: true }],
        );
        expect(rows.map((r) => r.display_name)).toEqual(["Alex", "Zara"]);
    });

    it("excludes inactive children when canonical provider activeOnly is true", () => {
        const rows = applyCanonicalChildrenCollectionPolicy(
            [{ ...baseRow, id: "a", display_name: "Active", first_name: "Active", last_name: "One" }] as never,
            [{ is_active: false }],
        );
        expect(rows).toHaveLength(0);
    });

    it("deduplicates duplicate child ids per canonical collection semantics", () => {
        const rows = applyCanonicalChildrenCollectionPolicy(
            [
                { ...baseRow, id: "cm-1", display_name: "Sam", first_name: "Sam", last_name: "A" },
                { ...baseRow, id: "cm-1", display_name: "Sam Duplicate", first_name: "Sam", last_name: "A" },
            ] as never,
            [{ is_active: true }, { is_active: true }],
        );
        expect(rows).toHaveLength(1);
    });

    it("returns empty rows for empty collection truth", () => {
        const { rows } = normalizeFocusPanelChildrenRowsFromTruth({});
        expect(rows).toEqual([]);
    });

    it("normalizes operational truth through canonical policy for multiple children", () => {
        const { rows } = normalizeFocusPanelChildrenRowsFromTruth({
            _inquiry_children: [
                { id: "cm-2", display_name: "Sam", first_name: "Sam", last_name: "B", is_active: true },
                { id: "cm-1", display_name: "Alex", first_name: "Alex", last_name: "A", is_active: true },
            ],
        });
        expect(rows.map((r) => r.id)).toEqual(["cm-1", "cm-2"]);
    });

    it("maps canonical collection items to child identity without storage columns in consumer", () => {
        const identity = childIdentityFromCanonicalCollectionItem({
            item_id: "cm-1",
            item_entity_type: "customer_member",
            record: { first_name: "Sam", last_name: "Lee", dob: "2020-01-02", display_name: "Sam Lee" },
        });
        expect(identity).toEqual({
            id: "cm-1",
            displayName: "Sam Lee",
            firstName: "Sam",
            lastName: "Lee",
            dob: "2020-01-02",
        });
    });

    it("does not import Forms modules", () => {
        const content = readFileSync(
            join(process.cwd(), "lib/adminV2/runtime/focusPanel/collections/focusPanelCollectionPresentation.ts"),
            "utf8",
        );
        expect(content).not.toContain("@/lib/forms/");
    });
});

describe("buildChildrenCardEvidence enrollment overlay", () => {
    const context = {
        grain: "case",
        truth: {
            _inquiry_children: [
                {
                    id: "cm-1",
                    display_name: "Sam",
                    first_name: "Sam",
                    last_name: "Lee",
                    is_active: true,
                    desired_program_label: "Preschool",
                    desired_schedule_label: "M-F",
                    start_date: "2026-09-01",
                    outcome_status_key: "waitlisted",
                },
            ],
        },
    } as unknown as OperationalContext;

    it("preserves enrollment overlay fields after canonical policy normalization", () => {
        const evidence = buildChildrenCardEvidence(context);
        expect(evidence.children).toHaveLength(1);
        expect(evidence.children[0]?.program).toBe("Preschool");
        expect(evidence.children[0]?.schedule).toBe("M-F");
        expect(evidence.children[0]?.name).toBe("Sam");
    });

    it("maps location_label onto Location display and never uses location_id as the value", () => {
        const withSite = {
            ...context,
            truth: {
                _inquiry_children: [
                    {
                        id: "cm-1",
                        display_name: "Sam",
                        first_name: "Sam",
                        last_name: "Lee",
                        is_active: true,
                        location_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                        location_label: "North Campus",
                        desired_program_label: "Preschool",
                        desired_schedule_label: "M-F",
                        start_date: "2026-09-01",
                    },
                ],
            },
        } as unknown as OperationalContext;
        const evidence = buildChildrenCardEvidence(withSite);
        expect(evidence.children[0]?.location).toBe("North Campus");
        expect(evidence.children[0]?.location).not.toBe(evidence.children[0]?.id);
        expect(evidence.children[0]?.room).toBeNull();
    });
});
