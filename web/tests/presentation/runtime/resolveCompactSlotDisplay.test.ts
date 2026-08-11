/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { mapQueueRowSurfaceToCompactConfig } from "@/lib/presentation/runtime/queueRowSurfaceConfig";
import { resolveCompactSlotDisplay } from "@/lib/presentation/runtime/resolveCompactSlotDisplay";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";
import type { QueueRecordColumnConfig } from "@/lib/layout/queueRecordLayoutV3";

function familyContext(over: Partial<QueueRowContext> = {}): QueueRowContext {
    return {
        contract_version: "1.1-partial",
        row_subject: { subject_type: "case", subject_id: "opp-1", display_name: "Jordan Lee" },
        row_stage: "New Leads",
        lifecycle_key: "enrollment",
        row_status_key: "open",
        row_status_label: "Open",
        case_context: {
            case_id: "opp-1",
            display_name: "Jordan Lee",
            case_type_label: "Enrollment",
            case_status_key: "open",
            case_status_label: "Open",
        },
        primary_contact: {
            display_name: "Casey Lee",
            phone: "(503) 555-4729",
            email: "casey@example.com",
        },
        related_subjects_summary: [
            {
                subject_type: "child",
                subject_id: "child-1",
                display_name: "Avery Lee",
                status_label: "Lead",
            },
            {
                subject_type: "child",
                subject_id: "child-2",
                display_name: "Rowan Lee",
                status_label: "Lead",
            },
        ],
        attention_summary: null,
        work_summary: null,
        current_work_summary: null,
        next_best_action: null,
        drawer_open: { entity_type: "opportunities", entity_id: "opp-1" },
        ...over,
    };
}

function childContext(): QueueRowContext {
    return familyContext({
        row_subject: { subject_type: "child", subject_id: "child-1", display_name: "Avery Lee" },
        related_subjects_summary: [
            {
                subject_type: "child",
                subject_id: "child-2",
                display_name: "Rowan Lee",
                status_label: "Lead",
            },
        ],
    });
}

function statusColumn(fieldKey: string, label: string): QueueRecordColumnConfig {
    return {
        id: `col-${fieldKey.replace(/\./g, "-")}`,
        label: "",
        width: "status_band",
        scope: { type: "lifecycle_context" },
        builderSlot: "status",
        blocks: [
            {
                type: "field_group",
                id: `grp-${fieldKey}`,
                fields: [{ id: `f-${fieldKey}`, fieldKey, label, display: "pill" }],
            },
        ],
    };
}

describe("resolveCompactSlotDisplay", () => {
    it("renders primary contact name, phone, and email together on the contact line", () => {
        const slots = {
            visible: true,
            label: "Primary contact · Phone · Email",
            fieldKeys: ["person.primary_contact_name", "person.phone", "person.email"],
        } as const;
        expect(resolveCompactSlotDisplay("contact", familyContext(), slots, null)).toBe(
            "Casey Lee · (503) 555-4729 · casey@example.com",
        );
    });

    it("formats raw 10-digit phone on the contact line", () => {
        const slots = {
            visible: true,
            label: null,
            fieldKeys: ["person.primary_contact_name", "person.phone", "person.email"],
        } as const;
        const display = resolveCompactSlotDisplay(
            "contact",
            familyContext({
                primary_contact: {
                    display_name: "Rob Digan",
                    phone: "4804844844",
                    email: "rob@digan.com",
                },
            }),
            slots,
            null,
        );
        expect(display).toBe("Rob Digan · (480) 484-4844 · rob@digan.com");
    });

    it("omits invalid phone without leaving blank placeholders", () => {
        const slots = {
            visible: true,
            label: null,
            fieldKeys: ["person.primary_contact_name", "person.phone", "person.email"],
        } as const;
        const display = resolveCompactSlotDisplay(
            "contact",
            familyContext({
                primary_contact: {
                    display_name: "Rob Digan",
                    phone: "12345",
                    email: "rob@digan.com",
                },
            }),
            slots,
            null,
        );
        expect(display).toBe("Rob Digan · rob@digan.com");
    });

    it("omits missing phone and email without blank placeholders", () => {
        const slots = {
            visible: true,
            label: null,
            fieldKeys: ["person.primary_contact_name", "person.phone", "person.email"],
        } as const;
        const display = resolveCompactSlotDisplay(
            "contact",
            familyContext({ primary_contact: { display_name: "Casey Lee" } }),
            slots,
            null,
        );
        expect(display).toBe("Casey Lee");
        expect(display).not.toContain("· ·");
    });

    it("preserves configured field order when joining multiple values", () => {
        const slots = {
            visible: true,
            label: null,
            fieldKeys: ["person.email", "person.phone", "person.primary_contact_name"],
        } as const;
        expect(resolveCompactSlotDisplay("contact", familyContext(), slots, null)).toBe(
            "casey@example.com · (503) 555-4729 · Casey Lee",
        );
    });

    it("routes person contact fields from groupCount to contact line via compact config", () => {
        const config = mapQueueRowSurfaceToCompactConfig({
            variant: "operational-row",
            version: 3,
            columns: [
                {
                    id: "col-identity",
                    label: "",
                    width: "identity",
                    scope: { type: "main_record" },
                    builderSlot: "identity",
                    blocks: [
                        {
                            type: "field_group",
                            id: "grp-household",
                            fields: [
                                {
                                    id: "f-household",
                                    fieldKey: "customer.display_name",
                                    label: "Household name",
                                    display: "text",
                                },
                            ],
                        },
                    ],
                },
                {
                    id: "col-secondary",
                    label: "",
                    width: "identity",
                    scope: { type: "main_record" },
                    builderSlot: "groupCount",
                    blocks: [
                        {
                            type: "field_group",
                            id: "grp-contact",
                            fields: [
                                {
                                    id: "f-contact",
                                    fieldKey: "person.primary_contact_name",
                                    label: "Primary contact",
                                    display: "text",
                                },
                                {
                                    id: "f-phone",
                                    fieldKey: "person.phone",
                                    label: "Phone",
                                    display: "phone",
                                    inlineWithPrevious: true,
                                },
                                {
                                    id: "f-email",
                                    fieldKey: "person.email",
                                    label: "Email",
                                    display: "email",
                                    inlineWithPrevious: true,
                                },
                            ],
                        },
                    ],
                },
                {
                    id: "col-children",
                    label: "",
                    width: "children",
                    scope: { type: "repeated_related", relationshipKey: "children" },
                    builderSlot: "attention",
                    blocks: [
                        {
                            type: "field_group",
                            id: "grp-children",
                            fields: [{ id: "f-children", fieldKey: "children", label: "Children", display: "text" }],
                        },
                    ],
                },
            ],
            fixedControls: { actionsMenu: true, workWithBos: true, actionRailStyle: "stacked" },
        });

        expect(config.slots.contact.fieldKeys).toEqual([
            "person.primary_contact_name",
            "person.phone",
            "person.email",
        ]);
        expect(config.slots.subject.fieldKeys).toEqual(["customer.display_name"]);
        expect(resolveCompactSlotDisplay("contact", familyContext(), config.slots.contact, null)).toBe(
            "Casey Lee · (503) 555-4729 · casey@example.com",
        );
    });

    it("customer.display_name uses case household name, not primary contact", () => {
        const slots = {
            visible: true,
            label: "Household",
            fieldKeys: ["customer.display_name"],
        } as const;
        const ctx = familyContext({
            row_subject: { subject_type: "case", subject_id: "opp-1", display_name: "Ravi Almead" },
            case_context: {
                case_id: "opp-1",
                display_name: "Almead Family",
                case_type_label: "Enrollment",
                case_status_key: "open",
                case_status_label: "Open",
            },
            primary_contact: {
                display_name: "Ravi Almead",
                phone: "(556) 965-2536",
            },
        });
        expect(resolveCompactSlotDisplay("subject", ctx, slots, null)).toBe("Almead Family");
        expect(resolveCompactSlotDisplay("subject", ctx, slots, null)).not.toBe("Ravi Almead");
    });

    it("does not emit builder labels when runtime values exist", () => {
        const slots = {
            visible: true,
            label: "Stage",
            fieldKeys: ["queue_row.stage_label"],
        } as const;
        const display = resolveCompactSlotDisplay("status", familyContext(), slots, null);
        expect(display).toBe("New Leads");
        expect(display).not.toBe("Stage");
    });

    it("renders configured Stage field as process stage label, not row status", () => {
        const config = mapQueueRowSurfaceToCompactConfig({
            variant: "operational-row",
            version: 3,
            columns: [statusColumn("queue_row.stage_label", "Stage")],
            fixedControls: { actionsMenu: true, workWithBos: true, actionRailStyle: "stacked" },
        });
        const display = resolveCompactSlotDisplay("status", familyContext(), config.slots.status, null);
        expect(display).toBe("New Leads");
        expect(display).not.toBe("Open");
        expect(display).not.toBe("Stage");
    });

    it("renders configured Status field as record status such as Open", () => {
        const config = mapQueueRowSurfaceToCompactConfig({
            variant: "operational-row",
            version: 3,
            columns: [statusColumn("opportunity.status_label", "Status")],
            fixedControls: { actionsMenu: true, workWithBos: true, actionRailStyle: "stacked" },
        });
        const display = resolveCompactSlotDisplay("status", familyContext(), config.slots.status, null);
        expect(display).toBe("Open");
    });

    it("renders both Stage and Status when configured on the same slot", () => {
        const slots = {
            visible: true,
            label: "Stage · Status",
            fieldKeys: ["queue_row.stage_label", "opportunity.status_label"],
        } as const;
        expect(resolveCompactSlotDisplay("status", familyContext(), slots, null)).toBe("New Leads · Open");
    });

    it("renders child name on child-grain rows", () => {
        const slots = {
            visible: true,
            label: "Child name",
            fieldKeys: ["child.name"],
        } as const;
        expect(resolveCompactSlotDisplay("groupCount", childContext(), slots, null)).toBe("Avery Lee");
    });

    it("renders children collection first name + age from context", () => {
        const ctx = familyContext({
            related_subjects_summary: [
                {
                    subject_type: "child",
                    subject_id: "child-1",
                    display_name: "Lennon Kurzman",
                    status_label: "Lead",
                    age_label: "2y",
                },
                {
                    subject_type: "child",
                    subject_id: "child-2",
                    display_name: "Wrigley Kurzman",
                    status_label: "Lead",
                    age_label: "3m",
                },
            ],
        });
        const slots = {
            visible: true,
            label: "Children",
            fieldKeys: ["children"],
            collectionPresentationByFieldKey: {
                children: {
                    displayMode: "list" as const,
                    includedFields: ["first_name", "age"] as const,
                    listFormat: "comma" as const,
                    maxDisplayed: "all" as const,
                    overflowBehavior: "plus_n_more" as const,
                },
            },
        };
        expect(resolveCompactSlotDisplay("groupCount", ctx, slots, null)).toBe("Lennon (2y), Wrigley (3m)");
    });

    it("renders children collection field with configured presentation", () => {
        const slots = {
            visible: true,
            label: "Children",
            fieldKeys: ["children"],
            collectionPresentationByFieldKey: {
                children: {
                    displayMode: "list" as const,
                    includedFields: ["first_name", "last_name"] as const,
                    listFormat: "comma" as const,
                    maxDisplayed: "all" as const,
                    overflowBehavior: "plus_n_more" as const,
                },
            },
        };
        expect(resolveCompactSlotDisplay("groupCount", familyContext(), slots, null)).toBe(
            "Avery Lee, Rowan Lee",
        );
    });

    it("legacy children.names still resolves for published configs", () => {
        const slots = {
            visible: true,
            label: "Children",
            fieldKeys: ["children.names"],
        } as const;
        expect(resolveCompactSlotDisplay("groupCount", familyContext(), slots, null)).toBe(
            "Avery Lee, Rowan Lee",
        );
    });

    it("configured children field stays visible at runtime when related subjects exist", () => {
        const slots = {
            visible: true,
            label: "Children",
            fieldKeys: ["children.names"],
        } as const;
        const family = familyContext();
        expect(resolveCompactSlotDisplay("groupCount", family, slots, null)).not.toBeNull();
    });

    it("renders children count and summary on family rows", () => {
        const count = resolveCompactSlotDisplay(
            "groupCount",
            familyContext(),
            { visible: true, label: null, fieldKeys: ["children.count"] },
            null,
        );
        expect(count).toBe("2 children");

        const summary = resolveCompactSlotDisplay(
            "groupCount",
            familyContext(),
            { visible: true, label: null, fieldKeys: ["children.summary"] },
            null,
        );
        expect(summary).toBe("2 children · Avery Lee, Rowan Lee");
    });

    it("renders child.name as first name when nameDisplay is first_name", () => {
        const slots = {
            visible: true,
            label: "Child name",
            fieldKeys: ["child.name"],
            nameDisplayByFieldKey: { "child.name": "first_name" as const },
        };
        expect(resolveCompactSlotDisplay("groupCount", childContext(), slots, null)).toBe("Avery");
    });

    it("legacy children.names first_name maps via collection included fields", () => {
        const slots = {
            visible: true,
            label: "Children",
            fieldKeys: ["children.names"],
            nameDisplayByFieldKey: { "children.names": "first_name" as const },
        };
        expect(resolveCompactSlotDisplay("groupCount", familyContext(), slots, null)).toBe("Avery, Rowan");
    });

    it("renders work slot with progress hint", () => {
        const display = resolveCompactSlotDisplay(
            "work",
            familyContext({
                current_work_summary: {
                    label: "Review Lead",
                    state: "open",
                    due_label: null,
                    progress_hint: "1 of 3 complete",
                    blocker_hint: null,
                },
            }),
            undefined,
            null,
        );
        expect(display).toBe("Review Lead · 1 of 3 complete");
    });
});
