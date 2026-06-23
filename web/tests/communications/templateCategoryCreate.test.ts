import { describe, expect, it } from "vitest";
import { resolveTemplateCategoryCommitValue } from "@/lib/communications/v2/templateCategoryCreate";

describe("resolveTemplateCategoryCommitValue", () => {
    it("uses value when creating is false (first category with no existing options)", () => {
        expect(
            resolveTemplateCategoryCommitValue({ creating: false, draft: "", value: "Enrollment" })
        ).toBe("Enrollment");
    });

    it("uses draft when creating is true", () => {
        expect(
            resolveTemplateCategoryCommitValue({ creating: true, draft: "Tours", value: "" })
        ).toBe("Tours");
    });

    it("trims whitespace", () => {
        expect(
            resolveTemplateCategoryCommitValue({ creating: false, draft: "", value: "  Billing  " })
        ).toBe("Billing");
    });
});
