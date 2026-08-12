import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LIFECYCLE_PREFLIGHT_ACTION_KEYS } from "@/lib/completion/lifecycleActionRequirementCatalog";

const webRoot = resolve(__dirname, "../../..");

function read(rel: string): string {
    return readFileSync(resolve(webRoot, rel), "utf8");
}

describe("add child convergence contracts", () => {

    it("does not register add_child for lifecycle execute preflight", () => {
        expect(LIFECYCLE_PREFLIGHT_ACTION_KEYS).not.toContain("add_child");
        expect(LIFECYCLE_PREFLIGHT_ACTION_KEYS).not.toContain("add_sibling");
    });

    it("registry section actions pass openAddInquiryChild host", () => {
        const section = read("components/admin/opportunity/OpportunityInquiryChildrenRegistryActions.tsx");
        expect(section).toContain("openAddInquiryChild");
    });
});
