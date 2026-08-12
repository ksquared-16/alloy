import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
    evaluatePersonDrawerCompletionPreview,
    PERSON_COMPLETION_SURFACE_BY_LAYOUT_VARIANT,
    resolveCompletionSurfaceForLayoutVariant,
} from "@/lib/admin/person/personDrawerLayoutCompletionBridge";
import {
    PERSON_LAYOUT_VARIANT_CHILD,
    PERSON_LAYOUT_VARIANT_PARENT,
    resolvePersonDrawerLayoutVariant,
} from "@/lib/admin/person/personDrawerLayoutRuntime";
import {
    completionBlocksSave,
    evaluateCompletionRequirements,
    evaluateCompletionRequirementsFromRecord,
} from "@/lib/completion/evaluateCompletionRequirements";
import { evaluateOpportunityCompletionRequirements } from "@/lib/completion/evaluateOpportunityCompletionRequirements";
import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";

const runtimeLayout: RecordLayoutConfigJson = {
    person_drawer_mode: "runtime_v1",
    person_layout_variants: {
        person_child_operating_v1: { person_operating_sections: ["child_summary", "household"] },
        person_parent_operating_v1: {
            person_operating_sections: ["parent_summary", "household", "household_address", "employee_status"],
        },
    },
};

describe("person layout + completion reconciliation", () => {
    describe("layout variant compatibility", () => {
        it("maps layout variant keys to completion surfaces", () => {
            expect(resolveCompletionSurfaceForLayoutVariant(PERSON_LAYOUT_VARIANT_CHILD)).toBe(
                PERSON_COMPLETION_SURFACE_BY_LAYOUT_VARIANT[PERSON_LAYOUT_VARIANT_CHILD]
            );
            expect(resolveCompletionSurfaceForLayoutVariant(PERSON_LAYOUT_VARIANT_PARENT)).toBe(
                PERSON_COMPLETION_SURFACE_BY_LAYOUT_VARIANT[PERSON_LAYOUT_VARIANT_PARENT]
            );
        });

        it("layout resolver variant keys align with completion bridge", () => {
            const child = resolvePersonDrawerLayoutVariant(runtimeLayout, {
                childOperatingChrome: true,
                parentOperatingChrome: false,
            });
            const parent = resolvePersonDrawerLayoutVariant(runtimeLayout, {
                childOperatingChrome: false,
                parentOperatingChrome: true,
            });
            expect(child.variant_key).toBe(PERSON_LAYOUT_VARIANT_CHILD);
            expect(parent.variant_key).toBe(PERSON_LAYOUT_VARIANT_PARENT);
            expect(resolveCompletionSurfaceForLayoutVariant(child.variant_key)).toBe("person_drawer_child");
            expect(resolveCompletionSurfaceForLayoutVariant(parent.variant_key)).toBe("person_drawer_parent");
        });
    });

    describe("runtime drawer UI — completion summaries", () => {
        it("child preview includes layout variant metadata on violations", () => {
            const r = evaluatePersonDrawerCompletionPreview({
                personId: "c1",
                layoutVariantKey: PERSON_LAYOUT_VARIANT_CHILD,
                record: {
                    id: "c1",
                    first_name: "Sam",
                    last_name: "",
                    _customer_members: [{ relationship: "child" }],
                },
            });
            expect(r.blocking[0]?.context.layout_variant_key).toBe(PERSON_LAYOUT_VARIANT_CHILD);
            expect(r.blocking[0]?.context.surface).toBe("person_drawer_child");
        });

        it("parent preview surfaces soft contact recommendation without blocking save", () => {
            const r = evaluatePersonDrawerCompletionPreview({
                personId: "p1",
                layoutVariantKey: PERSON_LAYOUT_VARIANT_PARENT,
                record: {
                    id: "p1",
                    first_name: "Ada",
                    last_name: "Lovelace",
                    email: "",
                    phone: "",
                    _customer_persons: [{ role_type: "parent" }],
                },
            });
            expect(r.ok).toBe(true);
            const contactFlag =
                r.warnings.some((v) => v.label === "Email or phone") ||
                r.recommendations.some((v) => v.label === "Email or phone");
            expect(contactFlag).toBe(true);
            expect(completionBlocksSave(r)).toBe(false);
        });

        it("household primary contact preview uses _household_adult_links from drawer record", () => {
            const r = evaluateCompletionRequirementsFromRecord({
                entity_type: "person",
                entity_id: "p1",
                phase: "preview",
                surface: "person_drawer_parent",
                layout_variant_key: PERSON_LAYOUT_VARIANT_PARENT,
                record: {
                    id: "p1",
                    first_name: "Ada",
                    last_name: "Lovelace",
                    email: "a@example.com",
                    _household_context: [{ customer_id: "cust-1" }],
                    _household_adult_links: [
                        {
                            customer_id: "cust-1",
                            person_id: "p1",
                            role_type: "parent",
                            is_household_primary_contact: false,
                        },
                        {
                            customer_id: "cust-1",
                            person_id: "p2",
                            role_type: "guardian",
                            is_household_primary_contact: false,
                        },
                    ],
                },
            });
            expect(r.warnings.some((v) => v.label === "Primary contact")).toBe(true);
            expect(completionBlocksSave(r)).toBe(false);
        });

    });

    describe("client/server agreement shape", () => {
        it("preview and save phases share evaluator for parent contact (soft vs hard)", () => {
            const values = {
                first_name: "Ada",
                last_name: "Lovelace",
                email: "",
                phone: "",
            };
            const related = { customer_persons: [{ role_type: "parent" as const }] };

            const preview = evaluateCompletionRequirements({
                phase: "preview",
                entity_type: "person",
                entity_id: "p1",
                values,
                related,
            });
            const save = evaluateCompletionRequirements({
                phase: "save",
                entity_type: "person",
                entity_id: "p1",
                values,
                related,
            });

            expect(preview.recommendations.some((v) => v.label === "Email or phone")).toBe(true);
            expect(save.warnings.some((v) => v.label === "Email or phone")).toBe(true);
            expect(completionBlocksSave(preview)).toBe(false);
            expect(completionBlocksSave(save)).toBe(false);
        });

        it("first/last name hard-block on save matches preview blocking", () => {
            const r = evaluateCompletionRequirements({
                phase: "save",
                entity_type: "person",
                entity_id: "p1",
                values: { first_name: "", last_name: "" },
                related: { customer_persons: [{ role_type: "parent" }] },
            });
            expect(completionBlocksSave(r)).toBe(true);
            expect(r.blocking.map((v) => v.field_key)).toEqual(["first_name", "last_name"]);
        });
    });

    describe("opportunity status transition structured payload", () => {
        it("tour_scheduled without tour date returns structured hard_block violations", () => {
            const r = evaluateOpportunityCompletionRequirements({
                phase: "status_change",
                entity_type: "opportunity",
                entity_id: "opp-1",
                status_to: "tour_scheduled",
                values: {
                    primary_person_id: "p1",
                    metadata: { tour_time: "10:00" },
                },
                related: {
                    inquiry_children: [{ id: "c1", first_name: "Kid", last_name: "One" }],
                },
            });
            expect(r.ok).toBe(false);
            expect(r.blocking[0]).toMatchObject({
                entity_type: "opportunity",
                blocking_level: "hard_block",
                field_key: "tour_date",
            });
        });

        it("enrolled without desired start date returns structured violation", () => {
            const r = evaluateOpportunityCompletionRequirements({
                phase: "status_change",
                entity_type: "opportunity",
                entity_id: "opp-1",
                status_to: "enrolled",
                values: { primary_person_id: "p1", location_id: "loc-1" },
                related: {
                    inquiry_children: [
                        {
                            id: "c1",
                            first_name: "Kid",
                            last_name: "One",
                            program_category_id: "cat-infant",
                            start_date: "",
                        },
                    ],
                },
            });
            expect(r.blocking.some((v) => v.field_key === "start_date")).toBe(true);
        });
    });
});
