import { describe, expect, it, vi } from "vitest";
import { enrichOcmProgramCategoryFields } from "@/lib/locations/resolveOcmProgramCategoryFields";

describe("enrichOcmProgramCategoryFields", () => {
    it("resolves desired_program_type from category id when only category is provided", async () => {
        const supabase = {
            from: () => ({
                select: () => ({
                    eq: () => ({
                        eq: () => ({
                            maybeSingle: async () => ({ data: { id: "cat-infant", key: "infant" } }),
                        }),
                    }),
                }),
            }),
        } as never;

        const result = await enrichOcmProgramCategoryFields(supabase, {
            orgId: "org-1",
            locationId: "site-north",
            desiredProgramType: null,
            desiredProgramCategoryId: "cat-infant",
        });

        expect(result).toEqual({
            desired_program_type: "infant",
            desired_program_category_id: "cat-infant",
        });
    });

    it("keeps explicit category id when program key cannot be resolved at site", async () => {
        const maybeSingle = vi.fn().mockResolvedValue({ data: null });
        const chain = {
            eq: () => chain,
            maybeSingle,
        };
        const supabase = {
            from: () => ({
                select: () => chain,
            }),
        } as never;

        const result = await enrichOcmProgramCategoryFields(supabase, {
            orgId: "org-1",
            locationId: "site-north",
            desiredProgramType: "infant",
            desiredProgramCategoryId: "cat-infant",
        });

        expect(result.desired_program_type).toBe("infant");
        expect(result.desired_program_category_id).toBe("cat-infant");
    });
});
