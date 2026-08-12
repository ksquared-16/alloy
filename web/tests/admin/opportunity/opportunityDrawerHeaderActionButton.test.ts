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

});
