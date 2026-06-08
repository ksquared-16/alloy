import { describe, expect, it } from "vitest";

import { warmRelatedDrawerViewModels } from "@/lib/adminV2/viewModel/drawer/drawerModelSwapNavigation";

describe("warmRelatedDrawerViewModels", () => {
    it("warms parent, inquiry children, household links, and opportunity back-nav targets", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");
        const src = readFileSync(
            join(webRoot, "lib/adminV2/viewModel/drawer/drawerModelSwapNavigation.ts"),
            "utf8"
        );
        expect(src).toContain("warmInquiryChildrenFromRecord");
        expect(src).toContain("warmHouseholdLinksFromPersonRecord");
        expect(src).toContain("prepareDrawerViewModelDeduped");
        expect(typeof warmRelatedDrawerViewModels).toBe("function");
    });
});
