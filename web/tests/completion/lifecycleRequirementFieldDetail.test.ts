import { describe, expect, it } from "vitest";
import {
    lifecycleRequirementFieldDetailForLabel,
    lifecycleRequirementFieldDetailEditable,
} from "@/lib/completion/lifecycleRequirementFieldDetail";

describe("lifecycleRequirementFieldDetail", () => {
    it("Person expands to first name, last name, email or phone", () => {
        const d = lifecycleRequirementFieldDetailForLabel("Person");
        expect(d?.fields).toEqual(["First Name", "Last Name", "Email or Phone"]);
    });

    it("Child expands to name and DOB or age group", () => {
        const d = lifecycleRequirementFieldDetailForLabel("Child");
        expect(d?.fields).toContain("First Name");
        expect(d?.fields).toContain("Date of Birth or Age Group");
    });

    it("field-level detail is not editable on Lifecycle", () => {
        expect(lifecycleRequirementFieldDetailEditable("Person")).toBe(false);
        expect(lifecycleRequirementFieldDetailEditable("Child")).toBe(false);
    });
});
