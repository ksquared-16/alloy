import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { opportunityDrawerRecordNeedsRevalidate } from "@/lib/admin/drawer/opportunityDrawerRecordNeedsRevalidate";

const webRoot = join(__dirname, "..", "..", "..");

describe("opportunityDrawerRecordNeedsRevalidate", () => {
    it("requires revalidate when record surface is not full", () => {
        expect(opportunityDrawerRecordNeedsRevalidate({ _record_surface: "drawer_primary" })).toBe(true);
    });

    it("requires revalidate when inquiry child has program type but no label", () => {
        expect(
            opportunityDrawerRecordNeedsRevalidate({
                _record_surface: "full",
                _inquiry_children: [{ desired_program_type: "toddler", desired_program_label: null }],
            })
        ).toBe(true);
    });

    it("does not require revalidate when full surface has resolved inquiry labels", () => {
        expect(
            opportunityDrawerRecordNeedsRevalidate({
                _record_surface: "full",
                _inquiry_children: [
                    { desired_program_type: "toddler", desired_program_label: "Toddler Program" },
                ],
            })
        ).toBe(false);
    });

    it("AdminEntityDrawer revalidates opportunity after returning from person drawer", () => {
        const drawer = readFileSync(
            join(webRoot, "components/admin/AdminEntityDrawer.tsx"),
            "utf8"
        );
        expect(drawer).toContain("opportunityDrawerRecordNeedsRevalidate");
        expect(drawer).toContain("runOpportunityBackgroundFullHydrateRef.current?.({ cacheBust: true })");
        expect(drawer).toContain('prev.type === "persons"');
    });

    it("goBack clears person drawer open seed when restoring opportunity", () => {
        const ctx = readFileSync(join(webRoot, "contexts/AdminDrawerContext.tsx"), "utf8");
        expect(ctx).toContain("personDrawerOpenSeed: null");
    });
});
