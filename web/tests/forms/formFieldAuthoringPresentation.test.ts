import { describe, expect, it } from "vitest";
import { describePrefillSource, FIELD_AUTHORING_COPY } from "@/lib/forms/formFieldAuthoringPresentation";
import { OPERATIONAL_FORM_SYSTEM_FIELDS } from "@/lib/forms/systemFieldRegistry";
import { formFieldFromRegistryEntry } from "@/lib/forms/systemFieldToFormField";
import { customUnmappedTextField } from "@/lib/forms/systemFieldToFormField";

describe("formFieldAuthoringPresentation OI-4B", () => {
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
