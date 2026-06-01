import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LIFECYCLE_PREFLIGHT_ACTION_KEYS } from "@/lib/completion/lifecycleActionRequirementCatalog";

const webRoot = resolve(__dirname, "../../..");

function read(rel: string): string {
    return readFileSync(resolve(webRoot, rel), "utf8");
}

describe("add child convergence contracts", () => {
    it("shell chrome and drawer listen on the same canonical open path", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain("openAddInquiryChildModal");
        expect(drawer).toContain("ADMINV2_OPEN_ADD_INQUIRY_CHILD_MODAL");
        expect(drawer).toContain("submitAddInquiryChildFromDrawer");
        expect(drawer).toContain('onAddChild={() => openAddInquiryChildModal("child")');

        const client = read("lib/admin/actions/applyRegistryResolvedActionClient.ts");
        expect(client).toContain("openAddInquiryChild");
        expect(client).toContain("dispatchOpenAddInquiryChildModal");
    });

    it("does not register add_child for lifecycle execute preflight", () => {
        expect(LIFECYCLE_PREFLIGHT_ACTION_KEYS).not.toContain("add_child");
        expect(LIFECYCLE_PREFLIGHT_ACTION_KEYS).not.toContain("add_sibling");
    });

    it("registry section actions pass openAddInquiryChild host", () => {
        const section = read("components/admin/opportunity/OpportunityInquiryChildrenRegistryActions.tsx");
        expect(section).toContain("openAddInquiryChild");
    });
});
