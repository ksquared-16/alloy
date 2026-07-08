import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("drawer-open family workspace prefetch (PR 1.5b)", () => {
    it("starts immediate prefetch when the active drawer opportunity is selected", () => {
        const runtime = readFileSync(
            join(process.cwd(), "components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx"),
            "utf8"
        );
        const cache = readFileSync(
            join(process.cwd(), "lib/communications/v2/drawerFamilyWorkspacePrefetchCache.ts"),
            "utf8"
        );
        expect(runtime).toMatch(/activeDrawerOpportunityId/);
        expect(runtime).toMatch(/prefetchActiveDrawerFamilyWorkspace\("opportunities", activeDrawerOpportunityId\)/);
        expect(runtime).not.toMatch(/scheduleDeferredDrawerFamilyWorkspacePrefetch/);
        expect(cache).toMatch(/export function prefetchActiveDrawerFamilyWorkspace/);
    });

    it("emits staging timing marks for row select, prefetch, and Activity mount", () => {
        const runtime = readFileSync(
            join(process.cwd(), "components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx"),
            "utf8"
        );
        const embedded = readFileSync(
            join(process.cwd(), "components/admin/focusPanel/OpportunityFocusPanelEmbeddedWorkspace.tsx"),
            "utf8"
        );
        const workspace = readFileSync(
            join(process.cwd(), "app/adminV2/communications/FamilyCommunicationWorkspace.tsx"),
            "utf8"
        );
        expect(runtime).toMatch(/markDrawerFamilyWorkspaceTiming\("row_selected"/);
        expect(runtime).toMatch(/markDrawerFamilyWorkspaceTiming\("drawer_vm_ready"/);
        expect(runtime).toMatch(/markDrawerFamilyWorkspaceTiming\("activity_clicked"/);
        expect(embedded).toMatch(/markDrawerFamilyWorkspaceTiming\("activity_mounted"/);
        expect(workspace).toMatch(/markDrawerFamilyWorkspaceTiming\("workspace_mounted"/);
        expect(workspace).toMatch(/warm_cache_hit|warm_cache_miss/);
    });

    it("Activity embed uses real hydrating shell while warm cache resolves", () => {
        const workspace = readFileSync(
            join(process.cwd(), "app/adminV2/communications/FamilyCommunicationWorkspace.tsx"),
            "utf8"
        );
        const ui = readFileSync(join(process.cwd(), "app/adminV2/communications/commsWorkspaceUi.tsx"), "utf8");
        expect(workspace).toMatch(/CommsActivityEmbedHydratingShell/);
        expect(workspace).toMatch(/compactActivityLoading/);
        expect(workspace).toMatch(/subscribeDrawerFamilyWorkspaceCache/);
        expect(ui).toMatch(/data-comms-activity-embed-hydrating-shell/);
        expect(ui).toMatch(/No communication yet/);
    });
});
