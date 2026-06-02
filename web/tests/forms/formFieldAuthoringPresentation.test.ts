import { describe, expect, it } from "vitest";
import {
    describePrefillSource,
    entityTypeLabel,
    FIELD_AUTHORING_COPY,
    groupSystemFieldsForPicker,
} from "@/lib/forms/formFieldAuthoringPresentation";
import { OPERATIONAL_FORM_SYSTEM_FIELDS } from "@/lib/forms/systemFieldRegistry";
import { formFieldFromRegistryEntry } from "@/lib/forms/systemFieldToFormField";
import { customUnmappedTextField } from "@/lib/forms/systemFieldToFormField";

describe("formFieldAuthoringPresentation OI-4B", () => {
    it("groupSystemFieldsForPicker uses operator-facing groups without raw keys", () => {
        const groups = groupSystemFieldsForPicker(OPERATIONAL_FORM_SYSTEM_FIELDS);
        const guardian = groups.find((g) => g.id === "guardian");
        expect(guardian?.label).toBe("Guardian / Contact");
        expect(guardian?.fields.some((f) => f.id === "guardian_first_name")).toBe(true);
        expect(guardian?.fields.every((f) => !f.default_label.includes("_"))).toBe(true);

        const inquiry = groups.find((g) => g.id === "inquiry");
        expect(inquiry?.fields.some((f) => f.id === "opportunity_interest_notes")).toBe(true);
        expect(inquiry?.fields.find((f) => f.id === "opportunity_interest_notes")?.default_label).toBe(
            "Inquiry message"
        );
    });

    it("entityTypeLabel uses Guardian / Contact for guardian fields", () => {
        expect(entityTypeLabel("guardian")).toBe("Guardian / Contact");
    });
    it("describePrefillSource uses operator-friendly mapped label", () => {
        const entry = OPERATIONAL_FORM_SYSTEM_FIELDS.find((e) => e.id === "child_first_name")!;
        const field = formFieldFromRegistryEntry(entry, {});
        const prefill = describePrefillSource(field, entry);

        expect(prefill.kind).toBe("mapped");
        expect(prefill.label).toBe("Prefills from: Child first name");
        expect(prefill.label).toContain("Child first name");
    });

    it("describePrefillSource marks custom fields", () => {
        const field = customUnmappedTextField();
        const prefill = describePrefillSource(field, null);

        expect(prefill.kind).toBe("custom");
        expect(prefill.label).toBe(FIELD_AUTHORING_COPY.customField);
    });
});
