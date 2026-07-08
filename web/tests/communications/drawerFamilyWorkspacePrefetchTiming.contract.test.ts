import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("drawer-open family workspace prefetch (PR 1.5)", () => {
    it("arms deferred prefetch when opportunity drawer opens", () => {
        const runtime = readFileSync(
            join(process.cwd(), "components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx"),
            "utf8"
        );
        const cache = readFileSync(
            join(process.cwd(), "lib/communications/v2/drawerFamilyWorkspacePrefetchCache.ts"),
            "utf8"
        );
        expect(runtime).toMatch(/scheduleDeferredDrawerFamilyWorkspacePrefetch\("opportunities", layoutPrefetchId\)/);
        expect(cache).toMatch(/export function scheduleDeferredDrawerFamilyWorkspacePrefetch/);
    });

    it("Activity embed uses compact loading shell while warm cache resolves", () => {
        const workspace = readFileSync(
            join(process.cwd(), "app/adminV2/communications/FamilyCommunicationWorkspace.tsx"),
            "utf8"
        );
        const ui = readFileSync(join(process.cwd(), "app/adminV2/communications/commsWorkspaceUi.tsx"), "utf8");
        expect(workspace).toMatch(/CommsActivityEmbedLoadingShell/);
        expect(workspace).toMatch(/compactActivityLoading/);
        expect(workspace).toMatch(/subscribeDrawerFamilyWorkspaceCache/);
        expect(ui).toMatch(/data-comms-activity-embed-loading-shell/);
    });
});
