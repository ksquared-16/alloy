import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");

function read(relPath: string): string {
    return readFileSync(join(webRoot, relPath), "utf8");
}

describe("record drawer Manage menu presentation", () => {
    it("uses Manage label and platform menu component in opportunity header controls", () => {
        const controls = read("components/admin/opportunity/OpportunityDrawerHeaderControls.tsx");
        const menu = read("components/admin/drawer/record/RecordDrawerManageMenu.tsx");
        expect(controls).toContain("RecordDrawerManageMenu");
        expect(controls).not.toContain("OpportunityDrawerHeaderActionsMenu");
        expect(menu).toContain("RECORD_DRAWER_MANAGE_MENU_LABEL");
        expect(menu).toContain("RECORD_DRAWER_MANAGE_MENU_LABEL");
        expect(menu).toContain('"aria-label": "Record manage menu"');
        expect(menu).toContain("whitespace-nowrap");
    });

    it("wires delete lead modal from opportunity VM runtime", () => {
        const runtime = read("components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx");
        expect(runtime).toContain("DeleteLeadModal");
        expect(runtime).toContain('key === "delete_lead"');
        expect(runtime).toContain('dispatchOpportunityQueueUpdated(opportunityId, "delete_lead")');
        expect(runtime).toContain("closeDrawer");
        expect(runtime).toContain("resolvePortalRecordManageAccess");
        expect(runtime).toContain("manageCanMutate");
        expect(runtime).toContain("showSuccess");
    });

    it("keeps registry actions on command rail separate from manage menu", () => {
        const runtime = read("components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx");
        expect(runtime).toContain("displayVm.actions.header_menu");
        expect(runtime).toContain("DrawerCommandRailActionsRegistrar");
        expect(runtime).toContain("buildRecordManageMenuForEntity");
    });
});
