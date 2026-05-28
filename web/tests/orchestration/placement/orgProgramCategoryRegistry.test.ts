import { describe, expect, it } from "vitest";
import { listOrgProgramCategoriesForSettings } from "@/lib/orchestration/placement/orgProgramCategoryRegistry";
import { ORG_PROGRAM_CATEGORY_LABELS } from "@/lib/orchestration/placement/orgProgramCategory";

describe("orgProgramCategoryRegistry", () => {
    it("lists human title-case category labels for settings", () => {
        const rows = listOrgProgramCategoriesForSettings();
        expect(rows.map((r) => r.label)).toEqual([
            ORG_PROGRAM_CATEGORY_LABELS.infant,
            ORG_PROGRAM_CATEGORY_LABELS.toddler,
            ORG_PROGRAM_CATEGORY_LABELS.preschool,
            ORG_PROGRAM_CATEGORY_LABELS.pre_k,
            ORG_PROGRAM_CATEGORY_LABELS.school_age,
        ]);
        for (const row of rows) {
            expect(row.label).toMatch(/^[A-Z]/);
            expect(row.label.toLowerCase()).not.toBe(row.label);
        }
    });
});
