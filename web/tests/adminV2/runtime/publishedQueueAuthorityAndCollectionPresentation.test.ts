/**
 * Published queue surfaces are sparse and authoritative — no Lead Status / contact-line
 * / group defaults may re-enter empty slots. Collection presentation (names+age) must
 * reach CondensedQueueRow via the same compact mapping as Builder Live Preview.
 */
import { describe, expect, it } from "vitest";

import {
    compactSlotsUsePublishedAuthority,
    mapQueueRowSurfaceToCompactConfig,
} from "@/lib/presentation/runtime/queueRowSurfaceConfig";
import { resolveCompactSlotDisplay } from "@/lib/presentation/runtime/resolveCompactSlotDisplay";
import { previewRowModelFromConfig } from "@/lib/adminV2/settings/surfaces/queueRowBuilderPreview";
import type {
    QueueRecordLayoutConfigV3,
    QueueRecordColumnConfig,
    QueueRecordFieldConfig,
} from "@/lib/layout/queueRecordLayoutV3";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";
import type { CollectionFieldPresentationConfig } from "@/lib/presentation/collectionFieldPresentation";

// The canonical field contract, not a local subset of it. A narrower local shape is how the
// fixture drifted from QueueRecordFieldConfig in the first place.
function col(builderSlot: string, fields: QueueRecordFieldConfig[]): QueueRecordColumnConfig {
    return {
        id: `col-${builderSlot}-${fields.map((f) => f.fieldKey).join("-")}`,
        label: builderSlot,
        width: "large",
        scope: { type: "main_record" },
        builderSlot: builderSlot as QueueRecordColumnConfig["builderSlot"],
        blocks: [
            {
                type: "field_group",
                id: `fg-${builderSlot}`,
                label: builderSlot,
                layout: "stack",
                fields,
            },
        ],
    };
}

function layout(columns: QueueRecordColumnConfig[]): QueueRecordLayoutConfigV3 {
    return {
        variant: "operational-row",
        version: 3,
        columns,
        fixedControls: { actionsMenu: true, workWithBos: true, actionRailStyle: "stacked" },
    };
}

function familyContext(over: Partial<QueueRowContext> = {}): QueueRowContext {
    return {
        contract_version: "1.1-partial",
        row_subject: { subject_type: "case", subject_id: "opp-1", display_name: "Wenc Family" },
        row_stage: "New Leads",
        lifecycle_key: "enrollment",
        row_status_key: "open",
        row_status_label: "Open",
        case_context: {
            case_id: "opp-1",
            display_name: "Wenc Family",
            case_type_label: "Enrollment",
            case_status_key: "open",
            case_status_label: "Open",
        },
        primary_contact: {
            display_name: "Taryn Wenc",
            phone: "555-0100",
            email: "tarynw@hotmail.com",
        },
        related_subjects_summary: [
            {
                subject_type: "child",
                subject_id: "c1",
                display_name: "Blake Wenc",
                status_label: "—",
                age_label: "3",
                date_of_birth: "2023-04-12",
                program_label: "Toddler",
                schedule_label: "Full Day",
            },
            {
                subject_type: "child",
                subject_id: "c2",
                display_name: "Jarek Wenc",
                status_label: "—",
                age_label: "4",
                date_of_birth: "2022-01-08",
                program_label: "Preschool",
                schedule_label: "Full Day",
            },
        ],
        row_presentation_mode: "single_subject",
        attention_summary: null,
        work_summary: null,
        current_work_summary: null,
        next_best_action: null,
        drawer_open: { entity_type: "opportunities", entity_id: "opp-1" },
        ...over,
    };
}

describe("published queue slot authority — no fallback substitution", () => {
    it("removing Stage does not cause Lead Status / Open to appear", () => {
        const published = layout([
            col("identity", [{ id: "customer.display_name", fieldKey: "customer.display_name", label: "Household name", display: "text" }]),
            col("attention", [
                { id: "person.primary_contact_name", fieldKey: "person.primary_contact_name", label: "Primary contact", display: "text" },
                { id: "person.email", fieldKey: "person.email", label: "Email", display: "text" },
            ]),
            // Email placed on status (Right) — routed to contact; status must stay empty (not Open).
            col("status", [{ id: "person.email", fieldKey: "person.email", label: "Email", display: "text" }]),
            col("groupCount", [
                { id: "children.names", fieldKey: "children.names", label: "Children names", display: "text" },
                { id: "children.count", fieldKey: "children.count", label: "Children count", display: "text" },
            ]),
        ]);
        const mapped = mapQueueRowSurfaceToCompactConfig(published);
        expect(compactSlotsUsePublishedAuthority(mapped.slots)).toBe(true);
        expect(mapped.slots.status.visible).toBe(false);
        expect(mapped.slots.status.fieldKeys).toBeUndefined();
        expect(
            resolveCompactSlotDisplay("status", familyContext(), mapped.slots.status, null, {
                publishedAuthority: true,
            }),
        ).toBeNull();
        expect(mapped.slots.contact.fieldKeys).toEqual(
            expect.arrayContaining(["person.primary_contact_name", "person.email"]),
        );
        expect(mapped.slots.contact.fieldKeys).not.toContain("person.phone");
    });

    it("removing Phone removes Phone from the contact slot", () => {
        const withPhone = mapQueueRowSurfaceToCompactConfig(
            layout([
                col("identity", [{ id: "customer.display_name", fieldKey: "customer.display_name", label: "Household", display: "text" }]),
                col("attention", [
                    { id: "person.primary_contact_name", fieldKey: "person.primary_contact_name", label: "Primary contact", display: "text" },
                    { id: "person.phone", fieldKey: "person.phone", label: "Phone", display: "text" },
                ]),
            ]),
        );
        expect(withPhone.slots.contact.fieldKeys).toContain("person.phone");

        const withoutPhone = mapQueueRowSurfaceToCompactConfig(
            layout([
                col("identity", [{ id: "customer.display_name", fieldKey: "customer.display_name", label: "Household", display: "text" }]),
                col("attention", [{ id: "person.primary_contact_name", fieldKey: "person.primary_contact_name", label: "Primary contact", display: "text" }]),
            ]),
        );
        expect(withoutPhone.slots.contact.fieldKeys).toEqual(["person.primary_contact_name"]);
        expect(
            resolveCompactSlotDisplay("contact", familyContext(), withoutPhone.slots.contact, null, {
                publishedAuthority: true,
            }),
        ).toBe("Taryn Wenc");
    });

    it("sparse published configs stay sparse — no default field re-entry", () => {
        const sparse = mapQueueRowSurfaceToCompactConfig(
            layout([col("identity", [{ id: "customer.display_name", fieldKey: "customer.display_name", label: "Household", display: "text" }])]),
        );
        expect(sparse.slots.contact.visible).toBe(false);
        expect(sparse.slots.status.visible).toBe(false);
        expect(sparse.slots.work.visible).toBe(false);
        expect(sparse.slots.groupCount.visible).toBe(false);
        expect(sparse.slots.attention.visible).toBe(false);
    });

    it("null config still uses generic fallbacks (only when unpublished)", () => {
        const generic = mapQueueRowSurfaceToCompactConfig(null);
        expect(compactSlotsUsePublishedAuthority(generic.slots)).toBe(false);
        expect(
            resolveCompactSlotDisplay("status", familyContext(), generic.slots.status, null),
        ).toBe("Open");
    });
});

describe("collection presentation — preview and live share one path", () => {
    const namesWithAge: CollectionFieldPresentationConfig = {
        displayMode: "list",
        includedFields: ["first_name", "last_name", "age"],
        listFormat: "pipe",
        maxDisplayed: "all",
        overflowBehavior: "plus_n_more",
    };

    it("names + age + pipe reach CondensedQueueRow compact slots", () => {
        const published = layout([
            col("identity", [{ id: "customer.display_name", fieldKey: "customer.display_name", label: "Household", display: "text" }]),
            col("groupCount", [
                {
                    id: "children.names",
                    fieldKey: "children.names",
                    label: "Children names",
                    display: "text",
                    collectionPresentation: namesWithAge,
                },
                { id: "children.count", fieldKey: "children.count", label: "Children count", display: "text" },
            ]),
        ]);
        const mapped = mapQueueRowSurfaceToCompactConfig(published);
        expect(mapped.slots.groupCount.fieldKeys).toEqual(
            expect.arrayContaining(["children.names", "children.count"]),
        );
        expect(mapped.slots.groupCount.collectionPresentationByFieldKey?.["children.names"]).toEqual(
            expect.objectContaining({
                displayMode: "list",
                includedFields: expect.arrayContaining(["first_name", "last_name", "age"]),
                listFormat: "pipe",
            }),
        );
        const display = resolveCompactSlotDisplay(
            "groupCount",
            familyContext(),
            mapped.slots.groupCount,
            null,
            { publishedAuthority: true },
        );
        expect(display).toContain("Blake Wenc · 3");
        expect(display).toContain("Jarek Wenc · 4");
        expect(display).toContain(" | ");
        expect(display).toContain("2 children");
    });

    it("Builder preview seeds age so Age toggle is visible", () => {
        const published = layout([
            col("groupCount", [
                {
                    id: "children.names",
                    fieldKey: "children.names",
                    label: "Children names",
                    display: "text",
                    collectionPresentation: namesWithAge,
                },
            ]),
        ]);
        const preview = previewRowModelFromConfig(published);
        const mapped = mapQueueRowSurfaceToCompactConfig(published);
        const withoutAge = resolveCompactSlotDisplay(
            "groupCount",
            preview.context!,
            {
                ...mapped.slots.groupCount,
                collectionPresentationByFieldKey: {
                    "children.names": {
                        ...namesWithAge,
                        includedFields: ["first_name", "last_name"],
                    },
                },
            },
            null,
            { publishedAuthority: true },
        );
        const withAge = resolveCompactSlotDisplay(
            "groupCount",
            preview.context!,
            mapped.slots.groupCount,
            null,
            { publishedAuthority: true },
        );
        expect(withoutAge).toBe("Blake Wenc | Jarek Wenc");
        expect(withAge).toBe("Blake Wenc · 3 | Jarek Wenc · 4");
        expect(withAge).not.toBe(withoutAge);
    });

    it("count-only and summary modes stay distinct", () => {
        const countOnly = mapQueueRowSurfaceToCompactConfig(
            layout([col("groupCount", [{ id: "children.count", fieldKey: "children.count", label: "Children count", display: "text" }])]),
        );
        expect(
            resolveCompactSlotDisplay("groupCount", familyContext(), countOnly.slots.groupCount, null, {
                publishedAuthority: true,
            }),
        ).toBe("2 children");

        const summary = mapQueueRowSurfaceToCompactConfig(
            layout([
                col("groupCount", [
                    {
                        id: "children.summary",
                        fieldKey: "children.summary",
                        label: "Children summary",
                        display: "text",
                        collectionPresentation: {
                            displayMode: "summary",
                            includedFields: ["first_name", "last_name"],
                            listFormat: "comma",
                            maxDisplayed: "all",
                            overflowBehavior: "plus_n_more",
                        },
                    },
                ]),
            ]),
        );
        expect(
            resolveCompactSlotDisplay("groupCount", familyContext(), summary.slots.groupCount, null, {
                publishedAuthority: true,
            }),
        ).toMatch(/^2 children · /);
    });
});
