import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { opportunityDrawerHeaderActionClassName } from "@/components/admin/opportunity/OpportunityDrawerHeaderActionButton";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("OpportunityDrawerHeaderActionButton", () => {
    it("inquiry workflow uses rounded-full header contract", () => {
        const cls = opportunityDrawerHeaderActionClassName(true);
        expect(cls).toContain("rounded-full");
        expect(cls).toContain("px-4 py-2");
        expect(cls).toContain("text-[12px]");
        expect(cls).toContain("border-alloy-blue/30");
    });

    it("BOS and drawer header share button primitive and actions panel", () => {
        const drawer = readFileSync(join(webRoot, "components/admin/AdminEntityDrawer.tsx"), "utf8");
        const bos = readFileSync(join(webRoot, "components/admin/drawer/BosDrawerAssistCta.tsx"), "utf8");
        expect(drawer).toContain("OpportunityDrawerHeaderActionButton");
        expect(drawer).toContain("OpportunityDrawerHeaderActionsPanel");
        expect(bos).toContain("OpportunityDrawerHeaderActionButton");
        expect(bos).toContain("OpportunityDrawerHeaderActionsPanel");
        expect(bos).toContain("inquiryWorkflow");
    });
});
