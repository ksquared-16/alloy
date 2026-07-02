import { describe, expect, it, vi } from "vitest";
import { resolveProgramCategoryId } from "@/lib/locations/resolveOcmProgramCategoryFields";

function supabaseReturning(data: unknown) {
    const chain: Record<string, unknown> = {};
    chain.eq = () => chain;
    chain.maybeSingle = vi.fn().mockResolvedValue({ data });
    return {
        from: () => ({ select: () => chain }),
    } as never;
}

describe("resolveProgramCategoryId", () => {
    it("resolves the category FK from site + stable program key", async () => {
        const supabase = supabaseReturning({ id: "cat-infant" });
        const result = await resolveProgramCategoryId(supabase, {
            orgId: "org-1",
            locationId: "site-north",
            programKey: "infant",
        });
        expect(result).toBe("cat-infant");
    });

    it("returns null without a site or program key", async () => {
        const supabase = supabaseReturning({ id: "cat-infant" });
        expect(
            await resolveProgramCategoryId(supabase, { orgId: "org-1", locationId: null, programKey: "infant" })
        ).toBeNull();
        expect(
            await resolveProgramCategoryId(supabase, { orgId: "org-1", locationId: "site-north", programKey: "  " })
        ).toBeNull();
    });

    it("returns null when no active category matches the key at the site", async () => {
        const supabase = supabaseReturning(null);
        expect(
            await resolveProgramCategoryId(supabase, {
                orgId: "org-1",
                locationId: "site-north",
                programKey: "preschool",
            })
        ).toBeNull();
    });
});
