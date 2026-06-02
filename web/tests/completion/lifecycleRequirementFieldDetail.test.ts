import { describe, expect, it } from "vitest";
import {
    lifecycleRequirementFieldDetailForLabel,
    lifecycleRequirementFieldDetailEditable,
} from "@/lib/completion/lifecycleRequirementFieldDetail";

describe("lifecycleRequirementFieldDetail", () => {
    it("Person expands to first name, last name, email or phone", () => {
        const d = lifecycleRequirementFieldDetailForLabel("Person");
        expect(d?.fields).toEqual(["First Name", "Last Name", "Email", "Phone"]);
    });

    it("Child expands to name, DOB, and age group", () => {
        const d = lifecycleRequirementFieldDetailForLabel("Child");
        expect(d?.fields).toEqual(["First Name", "Last Name", "Date of Birth", "Age Group"]);
    });

    it("field-level detail is not editable on Lifecycle", () => {
        expect(lifecycleRequirementFieldDetailEditable("Person")).toBe(false);
        expect(lifecycleRequirementFieldDetailEditable("Child")).toBe(false);
    });
});
