import { describe, expect, it } from "vitest";
import { formatPublicValidationErrors } from "@/lib/public/forms/formatPublicValidationErrors";
import type { FormSchemaV1 } from "@/lib/forms/schema";

const schema = {
    title: "TA-806",
    sections: [],
    fields: [
        { id: "occ_other_guardians", type: "group", label: "Other parents or guardians", fields: [{ id: "occ_other_guardians__relationship_type", type: "text", label: "Relationship to the child" }] },
        { id: "occ_emergency_contacts", type: "group", label: "Emergency contacts", fields: [] },
        { id: "occ_nickname", type: "text", label: "Child's nickname" },
    ],
} as unknown as FormSchemaV1;

describe("formatPublicValidationErrors — a family reads questions, not paths", () => {
    it("names the group, the member and the question (the deployed ZZQALM234600 refusal)", () => {
        const [line] = formatPublicValidationErrors(
            [{ path: ["occ_other_guardians", "0", "values", "occ_other_guardians__relationship_type"], message: "Required field missing", code: "custom" } as never],
            schema,
        );
        expect(line).toBe("Other parents or guardians (1): Relationship to the child is required.");
        expect(line).not.toMatch(/occ_|›/);
    });

    it("says what a group needs, and names a plain question by its label", () => {
        expect(formatPublicValidationErrors([{ path: ["occ_emergency_contacts"], message: "Expected at least 1 group instance(s)" } as never], schema)[0]).toBe("Emergency contacts needs at least 1.");
        expect(formatPublicValidationErrors([{ path: ["occ_nickname"], message: "Required field missing" } as never], schema)[0]).toBe("Child's nickname is required.");
    });

    it("without a schema it still never prints a path", () => {
        const [line] = formatPublicValidationErrors([{ path: ["groups", "medications", "0", "values", "schedule"], message: "Invalid option for select" } as never]);
        expect(line).not.toContain("›");
        expect(line).toContain("Schedule");
        expect(line).toContain("not on the list");
    });
});
