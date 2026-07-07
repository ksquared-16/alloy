/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import {
    DEFAULT_CHILDREN_COLLECTION_PRESENTATION,
    legacyCollectionPresentationFromFieldKey,
    renderCollectionFieldPresentation,
} from "@/lib/presentation/collectionFieldPresentation";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";

function familyContext(): QueueRowContext {
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
                display_name: "Avery Lee",
                status_label: "Lead",
                program_label: "Toddler",
            },
            {
                subject_type: "child",
                subject_id: "child-2",
                display_name: "Rowan Lee",
                status_label: "Lead",
                schedule_label: "Full time",
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
    };
}

describe("collectionFieldPresentation", () => {
    it("maps legacy children.count to count display mode", () => {
        const legacy = legacyCollectionPresentationFromFieldKey("children.count");
        expect(renderCollectionFieldPresentation("children", familyContext(), legacy!)).toBe("3 children");
    });

    it("maps legacy children.names to comma-separated list", () => {
        const legacy = legacyCollectionPresentationFromFieldKey("children.names");
        expect(renderCollectionFieldPresentation("children", familyContext(), legacy!)).toBe(
            "Avery Lee, Rowan Lee, Sam Lee",
        );
    });

    it("maps legacy children.names + first_name to first names only", () => {
        const legacy = legacyCollectionPresentationFromFieldKey("children.names", "first_name");
        expect(renderCollectionFieldPresentation("children", familyContext(), legacy!)).toBe("Avery, Rowan, Sam");
    });

    it("maps legacy children.summary to count + list", () => {
        const legacy = legacyCollectionPresentationFromFieldKey("children.summary");
        expect(renderCollectionFieldPresentation("children", familyContext(), legacy!)).toBe(
            "3 children: Avery Lee, Rowan Lee, Sam Lee",
        );
    });

    it("renders configured list with selected fields and pipe formatting", () => {
        const display = renderCollectionFieldPresentation("children", familyContext(), {
            ...DEFAULT_CHILDREN_COLLECTION_PRESENTATION,
            includedFields: ["first_name", "program", "schedule"],
            listFormat: "pipe",
        });
        expect(display).toBe("Avery Toddler | Rowan Full time | Sam");
    });

    it("applies max displayed with +N more overflow", () => {
        const display = renderCollectionFieldPresentation("children", familyContext(), {
            ...DEFAULT_CHILDREN_COLLECTION_PRESENTATION,
            maxDisplayed: 2,
            overflowBehavior: "plus_n_more",
        });
        expect(display).toBe("Avery Lee, Rowan Lee, +1 more");
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
