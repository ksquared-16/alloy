/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import {
    COLLECTION_ITEM_FIELD_CATALOG,
    DEFAULT_CHILDREN_COLLECTION_PRESENTATION,
    legacyCollectionPresentationFromFieldKey,
    renderCollectionFieldPresentation,
    selectableChildrenCollectionItemFieldKeys,
    unavailableChildrenCollectionItemFieldKeys,
} from "@/lib/presentation/collectionFieldPresentation";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";

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
        primary_contact: { display_name: "Casey Lee" },
        related_subjects_summary: [
            {
                subject_type: "child",
                subject_id: "child-1",
                display_name: "Lennon Kurzman",
                status_label: "Lead",
                program_label: "Toddler",
                date_of_birth: "2024-01-15",
                age_label: "2y",
            },
            {
                subject_type: "child",
                subject_id: "child-2",
                display_name: "Wrigley Kurzman",
                status_label: "Lead",
                schedule_label: "Full time",
                date_of_birth: "2025-10-01",
                age_label: "3m",
            },
            {
                subject_type: "child",
                subject_id: "child-3",
                display_name: "Sam Lee",
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
        row_subject: {
            subject_type: "child",
            subject_id: "child-1",
            display_name: "Lennon Kurzman",
            date_of_birth: "2024-01-15",
            age_label: "2y",
        },
        related_subjects_summary: [
            {
                subject_type: "child",
                subject_id: "child-2",
                display_name: "Wrigley Kurzman",
                status_label: "Lead",
                age_label: "3m",
            },
        ],
    });
}

describe("collectionFieldPresentation", () => {
    it("every selectable Children subfield is resolver-backed", () => {
        for (const key of selectableChildrenCollectionItemFieldKeys()) {
            expect(COLLECTION_ITEM_FIELD_CATALOG[key].resolverBacked).toBe(true);
        }
        expect(unavailableChildrenCollectionItemFieldKeys()).toEqual([]);
        expect(selectableChildrenCollectionItemFieldKeys()).toContain("gender");
        expect(COLLECTION_ITEM_FIELD_CATALOG.gender.resolverBacked).toBe(true);
    });

    it("maps legacy children.count to count display mode", () => {
        const legacy = legacyCollectionPresentationFromFieldKey("children.count");
        expect(renderCollectionFieldPresentation("children", familyContext(), legacy!)).toBe("3 children");
    });

    it("maps legacy children.names to comma-separated list", () => {
        const legacy = legacyCollectionPresentationFromFieldKey("children.names");
        expect(renderCollectionFieldPresentation("children", familyContext(), legacy!)).toBe(
            "Lennon Kurzman, Wrigley Kurzman, Sam Lee",
        );
    });

    it("maps legacy children.names + first_name to first names only", () => {
        const legacy = legacyCollectionPresentationFromFieldKey("children.names", "first_name");
        expect(renderCollectionFieldPresentation("children", familyContext(), legacy!)).toBe(
            "Lennon, Wrigley, Sam",
        );
    });

    it("renders gender when gender_label is hydrated on child summaries", () => {
        const display = renderCollectionFieldPresentation(
            "children",
            familyContext({
                related_subjects_summary: [
                    {
                        subject_type: "child",
                        subject_id: "child-1",
                        display_name: "Lennon Kurzman",
                        status_label: "Lead",
                        gender_label: "Female",
                    },
                ],
            }),
            {
                ...DEFAULT_CHILDREN_COLLECTION_PRESENTATION,
                includedFields: ["first_name", "gender"],
            },
        );
        expect(display).toBe("Lennon Female");
    });

    it("renders first name + age for multi-child family rows", () => {
        const display = renderCollectionFieldPresentation("children", familyContext(), {
            ...DEFAULT_CHILDREN_COLLECTION_PRESENTATION,
            includedFields: ["first_name", "age"],
        });
        expect(display).toBe("Lennon (2y), Wrigley (3m), Sam");
    });

    it("renders current child age on child-grain rows", () => {
        const display = renderCollectionFieldPresentation("children", childContext(), {
            ...DEFAULT_CHILDREN_COLLECTION_PRESENTATION,
            includedFields: ["first_name", "age"],
        });
        expect(display).toBe("Lennon (2y)");
    });

    it("omits age cleanly when DOB/age missing for a child", () => {
        const display = renderCollectionFieldPresentation("children", familyContext(), {
            ...DEFAULT_CHILDREN_COLLECTION_PRESENTATION,
            includedFields: ["first_name", "age"],
            maxDisplayed: "all",
        });
        expect(display).toContain("Sam");
        expect(display).not.toContain("Sam ()");
        expect(display).not.toMatch(/Sam \( \)/);
    });

    it("derives age from DOB when age_label absent", () => {
        const display = renderCollectionFieldPresentation(
            "children",
            familyContext({
                related_subjects_summary: [
                    {
                        subject_type: "child",
                        subject_id: "child-1",
                        display_name: "Lennon Kurzman",
                        status_label: "Lead",
                        date_of_birth: "2024-01-15",
                    },
                ],
            }),
            {
                ...DEFAULT_CHILDREN_COLLECTION_PRESENTATION,
                includedFields: ["first_name", "age"],
            },
        );
        expect(display).toMatch(/^Lennon \(2y\)$/);
    });

    it("maps legacy children.summary to count + list", () => {
        const legacy = legacyCollectionPresentationFromFieldKey("children.summary");
        expect(renderCollectionFieldPresentation("children", familyContext(), legacy!)).toBe(
            "3 children: Lennon Kurzman, Wrigley Kurzman, Sam Lee",
        );
    });

    it("renders configured list with selected fields and pipe formatting", () => {
        const display = renderCollectionFieldPresentation("children", familyContext(), {
            ...DEFAULT_CHILDREN_COLLECTION_PRESENTATION,
            includedFields: ["first_name", "program", "schedule"],
            listFormat: "pipe",
        });
        expect(display).toBe("Lennon Toddler | Wrigley Full time | Sam");
    });

    it("applies max displayed with +N more overflow", () => {
        const display = renderCollectionFieldPresentation("children", familyContext(), {
            ...DEFAULT_CHILDREN_COLLECTION_PRESENTATION,
            maxDisplayed: 2,
            overflowBehavior: "plus_n_more",
        });
        expect(display).toBe("Lennon Kurzman, Wrigley Kurzman, +1 more");
    });

    it("applies count-only overflow behavior", () => {
        const display = renderCollectionFieldPresentation("children", familyContext(), {
            ...DEFAULT_CHILDREN_COLLECTION_PRESENTATION,
            maxDisplayed: 2,
            overflowBehavior: "count_only",
        });
        expect(display).toBe("3 children");
    });
});
