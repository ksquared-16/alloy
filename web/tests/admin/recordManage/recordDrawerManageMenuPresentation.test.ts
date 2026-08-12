import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");

function read(relPath: string): string {
    return readFileSync(join(webRoot, relPath), "utf8");
}

describe("record drawer Manage menu presentation", () => {
    it("uses Manage label and registry-backed menu in opportunity header controls", () => {
        const controls = read("components/admin/opportunity/OpportunityDrawerHeaderControls.tsx");
        const menu = read("components/admin/drawer/record/RecordDrawerManageMenu.tsx");
        expect(controls).toContain("RecordDrawerManageMenu");
        expect(controls).toContain("subjectManageActions");
        expect(menu).toContain("RECORD_DRAWER_MANAGE_MENU_LABEL");
        expect(menu).toContain("registryActions");
    });

});
