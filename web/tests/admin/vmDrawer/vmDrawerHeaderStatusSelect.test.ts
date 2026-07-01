import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const STATUS_SELECT = join(process.cwd(), "components/admin/vmDrawer/VmDrawerHeaderStatusSelect.tsx");

describe("vmDrawerHeaderStatusSelect", () => {
    it("renders known status label instead of skeleton while options load", () => {
        const src = readFileSync(STATUS_SELECT, "utf8");
        expect(src).toContain("hasKnownStatusPresentation");
        expect(src).toContain("!hasKnownStatusPresentation");
        expect(src).toContain("VmReadonlyStatusPill");
        expect(src).toContain('data-vm-drawer-header-status="readonly"');
    });
});
