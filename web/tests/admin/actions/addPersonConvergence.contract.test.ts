import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LIFECYCLE_PREFLIGHT_ACTION_KEYS } from "@/lib/completion/lifecycleActionRequirementCatalog";

const webRoot = resolve(__dirname, "../../..");

function read(rel: string): string {
    return readFileSync(resolve(webRoot, rel), "utf8");
}

describe("add person convergence contracts", () => {
    it("opportunity VM runtime and legacy drawer use canonical AddPersonModal", () => {
        const vmModals = read("lib/adminV2/viewModel/drawer/vmRuntime/useOpportunityDrawerVmRegistryModals.tsx");
        const legacyDrawer = read("components/admin/AdminEntityDrawerLegacy.tsx");
        expect(vmModals).toContain("AddPersonModal");
        expect(vmModals).toContain("submitAddPersonFromDrawer");
        expect(vmModals).toContain("openAddPerson");
        expect(legacyDrawer).toContain("AddPersonModal");
        expect(legacyDrawer).toContain("openAddPersonModal");
        expect(legacyDrawer).toContain("ADMINV2_OPEN_ADD_PERSON_MODAL");
        expect(legacyDrawer).not.toContain("AddFamilyMemberModal");
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

    it("create_lead stores optional intake notes in opportunity metadata", () => {
        const lead = read("lib/admin/actions/entryLifecycleActions.ts");
        expect(lead).toContain("intake_notes");
        expect(lead).toContain("{ intake_notes: intakeNotes }");
    });
});
