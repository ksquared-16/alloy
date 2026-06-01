import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LIFECYCLE_PREFLIGHT_ACTION_KEYS } from "@/lib/completion/lifecycleActionRequirementCatalog";

const webRoot = resolve(__dirname, "../../..");

function read(rel: string): string {
    return readFileSync(resolve(webRoot, rel), "utf8");
}

describe("add person convergence contracts", () => {
    it("drawer uses canonical AddPersonModal and submit helper", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain("AddPersonModal");
        expect(drawer).toContain("submitAddPersonFromDrawer");
        expect(drawer).toContain("openAddPersonModal");
        expect(drawer).toContain("ADMINV2_OPEN_ADD_PERSON_MODAL");
        expect(drawer).not.toContain("AddFamilyMemberModal");
    });

    it("registry client routes person actions to openAddPerson", () => {
        const client = read("lib/admin/actions/applyRegistryResolvedActionClient.ts");
        expect(client).toContain("openAddPerson");
        expect(client).toContain("dispatchOpenAddPersonModal");
        expect(client).toContain("isAddPersonFormKey");
    });

    it("execute path links household and opportunity via shared helper", () => {
        const execute = read("lib/admin/actions/executeAdminAction.ts");
        expect(execute).toContain("upsertAndLinkPersonForAdmin");
    });

    it("does not register person actions for lifecycle preflight", () => {
        expect(LIFECYCLE_PREFLIGHT_ACTION_KEYS).not.toContain("add_family_member");
        expect(LIFECYCLE_PREFLIGHT_ACTION_KEYS).not.toContain("add_related_person");
    });

    it("create_lead requires person identity only", () => {
        const lead = read("lib/admin/actions/entryLifecycleActions.ts");
        expect(lead).toMatch(/Phone or email is required/);
        expect(lead).not.toMatch(/child.*required/i);
    });
});
