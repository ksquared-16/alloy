import { describe, expect, it } from "vitest";

describe("PersonDrawerHouseholdSection clickable affordance", () => {
    it("uses distinct hover/active classes on openable household cards", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");
        const src = readFileSync(
            join(webRoot, "components/admin/entity/PersonDrawerHouseholdSection.tsx"),
            "utf8"
        );
        expect(src).toContain("HOUSEHOLD_PERSON_CARD_CLICKABLE_CLASS");
        expect(src).toContain("hover:bg-alloy-stone");
        expect(src).toContain("active:scale-[0.99]");
        expect(src).toContain("cursor-pointer");
        expect(src).toContain("data-person-drawer-household-child-link");
        expect(src).toContain("HOUSEHOLD_PERSON_CARD_CLICKABLE_CLASS");
    });
});
