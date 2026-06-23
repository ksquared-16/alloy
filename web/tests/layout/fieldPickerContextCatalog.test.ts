import { describe, expect, it } from "vitest";

import {
    classifyFieldPickerContext,
    FIELD_PICKER_CONTEXT_LABELS,
    isFieldPickerBackendOnlyRef,
    isFieldPickerOperatorVisible,
    resolveFieldPickerLabel,
} from "@/lib/layout/fieldPickerContextCatalog";
import { resolveLayoutEditorFieldRefLabel } from "@/lib/layout/opportunityDrawerLayoutEditorFieldCatalog";

describe("fieldPickerContextCatalog", () => {
    it("resolves queue display projections with operator labels", () => {
        expect(resolveFieldPickerLabel("opportunity.location", "waitlist_queue_row")).toBe("Site / Location");
        expect(resolveFieldPickerLabel("waitlist.positionLabel", "waitlist_queue_row")).toBe("Waitlist position");
        expect(resolveFieldPickerLabel("overrides.flags", "waitlist_queue_row")).toBe("Overrides");
        expect(resolveFieldPickerLabel("child.name", "waitlist_queue_row")).toBe("Child full name");
    });

    it("hides backend-only refs from queue operator picker", () => {
        expect(isFieldPickerOperatorVisible("opportunity.primary_person_id", "waitlist_queue_row")).toBe(false);
        expect(isFieldPickerOperatorVisible("person.id", "pipeline_queue_row")).toBe(false);
        expect(isFieldPickerOperatorVisible("inquiry_child.location_id", "waitlist_queue_row")).toBe(false);
        expect(isFieldPickerBackendOnlyRef("opportunity.primary_person_id")).toBe(true);
    });

    it("allows operator-visible queue refs with friendly labels", () => {
        expect(isFieldPickerOperatorVisible("opportunity.location", "waitlist_queue_row")).toBe(true);
        expect(isFieldPickerOperatorVisible("person.primary_contact_name", "waitlist_queue_row")).toBe(true);
        expect(resolveFieldPickerLabel("person.primary_contact_name", "waitlist_queue_row")).toBe(
            "Primary contact name",
        );
    });

    it("classifies refs into shared context groups", () => {
        expect(classifyFieldPickerContext("opportunity.tour_date", { surface: "waitlist_queue_row" })).toBe(
            "lead_enrollment",
        );
        expect(classifyFieldPickerContext("child.name", { surface: "waitlist_queue_row" })).toBe("candidate_child");
        expect(classifyFieldPickerContext("person.primary_phone", { surface: "waitlist_queue_row" })).toBe(
            "primary_contact",
        );
        expect(classifyFieldPickerContext("waitlist.positionLabel", { surface: "waitlist_queue_row" })).toBe(
            "waitlist_placement",
        );
    });

    it("drawer and queue share childcare catalog labels for common refs", () => {
        expect(resolveFieldPickerLabel("opportunity.tour_date")).toBe(resolveLayoutEditorFieldRefLabel("opportunity.tour_date"));
        expect(resolveFieldPickerLabel("inquiry_child.desired_program_type")).toBe(
            resolveLayoutEditorFieldRefLabel("inquiry_child.desired_program_type"),
        );
    });

    it("exposes operator-facing context group labels", () => {
        expect(FIELD_PICKER_CONTEXT_LABELS.lead_enrollment).toBe("Lead / Enrollment");
        expect(FIELD_PICKER_CONTEXT_LABELS.primary_contact).toBe("Primary Contact");
        expect(FIELD_PICKER_CONTEXT_LABELS.waitlist_placement).toBe("Waitlist / Placement");
    });
});
