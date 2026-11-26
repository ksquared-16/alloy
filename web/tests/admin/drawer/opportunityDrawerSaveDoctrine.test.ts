import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
    drawerOperatingIsDirty,
    drawerOperatingSaveAll,
    registerDrawerOperatingEditSection,
} from "@/lib/admin/drawer/drawerOperatingSaveCoordinator";

const webRoot = join(process.cwd());

function readSrc(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("Opportunity drawer save doctrine", () => {

    it("header save component hides when clean and shows save control when dirty", () => {
        const shared = readSrc("components/admin/entity/DrawerHeaderRecordSaveActions.tsx");
        expect(shared).toContain("if (!canMutate || !isDirty) return null");
        expect(shared).toContain("data-opportunity-drawer-save-changes");
        const header = readSrc("components/admin/entity/OpportunityDrawerHeaderSaveActions.tsx");
        expect(header).toContain("const isDirty = formDirty || coordDirty");
        expect(header).toContain("drawerOperatingSaveAll");
    });

    it("registers inquiry children with drawer operating coordinator and removes row Save button", () => {
        const section = readSrc("components/admin/entity/OpportunityInquiryChildrenSection.tsx");
        expect(section).toContain('registerDrawerOperatingEditSection("opportunity_inquiry_children"');
        expect(section).toContain("inquiryChildrenSectionIsDirty");
        expect(section).not.toMatch(/>\s*Save\s*<\/button>/);
        expect(section).toContain("drawerOperatingSaveCoordinator");
    });

    it("coordinator save runs when inquiry children section is dirty", async () => {
        const coordinatorSave = vi.fn(async () => undefined);
        registerDrawerOperatingEditSection("opportunity_inquiry_children", {
            isDirty: () => true,
            save: coordinatorSave,
        });
        expect(drawerOperatingIsDirty()).toBe(true);
        await drawerOperatingSaveAll();
        expect(coordinatorSave).toHaveBeenCalled();
        registerDrawerOperatingEditSection("opportunity_inquiry_children", null);
        expect(drawerOperatingIsDirty()).toBe(false);
    });

    it("coordinator is clean when no inquiry edits registered", () => {
        registerDrawerOperatingEditSection("opportunity_inquiry_children", null);
        expect(drawerOperatingIsDirty()).toBe(false);
    });
});
