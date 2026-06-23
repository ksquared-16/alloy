import { describe, expect, it } from "vitest";
import {
    canRemoveTemplateCategory,
    collectTemplateCategories,
    mergeTemplateCategoryOptions,
    normalizeTemplateCategoryLabel,
} from "@/lib/communications/v2/templateCategoryOptions";

describe("templateCategoryOptions", () => {
    it("collects unique sorted categories from templates", () => {
        expect(
            collectTemplateCategories([
                { category: "Billing" },
                { category: "Enrollment" },
                { category: "Billing" },
            ])
        ).toEqual(["Billing", "Enrollment"]);
    });

    it("merges template categories with session additions and removals", () => {
        expect(
            mergeTemplateCategoryOptions(["Billing"], ["Tours", "Billing"], ["Tours"])
        ).toEqual(["Billing"]);
    });

    it("blocks remove when templates use the category", () => {
        const check = canRemoveTemplateCategory([{ category: "Enrollment" }], "Enrollment");
        expect(check.ok).toBe(false);
        if (!check.ok) expect(check.reason).toContain("Used by 1 template");
    });

    it("allows remove when category is session-only", () => {
        expect(canRemoveTemplateCategory([], "Tours")).toEqual({ ok: true });
    });

    it("normalizes category labels", () => {
        expect(normalizeTemplateCategoryLabel("  Parent   Comms  ")).toBe("Parent Comms");
    });
});
