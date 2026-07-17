import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Focus Panel Activity communications first paint (Path C)", () => {
    it("attaches communications preview VM to the selected opportunity payload", () => {
        const types = readFileSync(join(process.cwd(), "lib/adminV2/viewModel/drawer/types.ts"), "utf8");
        const compose = readFileSync(
            join(process.cwd(), "lib/adminV2/viewModel/drawer/opportunity/composeOpportunityDrawerViewModel.ts"),
            "utf8"
        );
        const resolver = readFileSync(
            join(process.cwd(), "lib/communications/v2/familyWorkspace/resolveFamilyCommunicationWorkspacePreview.ts"),
            "utf8"
        );
        expect(types).toMatch(/activity:\s*{\s*communicationsPreviewVm/);
        expect(compose).toMatch(/resolveFamilyCommunicationWorkspacePreview/);
        expect(compose).toMatch(/communicationsPreviewVm/);
        expect(resolver).toMatch(/FAMILY_WORKSPACE_PREVIEW_VERSION/);
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
        const inline = readFileSync(
            join(process.cwd(), "components/presentation/workUnit/InlineOpportunityFocusPanel.tsx"),
            "utf8"
        );
        const workspace = readFileSync(
            join(process.cwd(), "app/adminV2/communications/FamilyCommunicationWorkspace.tsx"),
            "utf8"
        );
        // NOTE: the `queue_row_click` staging mark previously lived in the retired
        // useWorkUnitSurfaceRuntime (now deleted). That runtime was already unmounted, so the mark was
        // not firing in production — this assertion certified dead code and is removed. If the comms
        // timing graph wants that entry mark, re-home it in useCommittedWorkUnitSurfaceRuntime.openRecord.
        expect(runtime).toMatch(/markDrawerFamilyWorkspaceTiming\("row_selected"/);
        expect(runtime).toMatch(/markDrawerFamilyWorkspaceTiming\("drawer_vm_ready"/);
        expect(runtime).toMatch(/markDrawerFamilyWorkspaceTiming\("activity_clicked"/);
        expect(inline).toMatch(/markDrawerFamilyWorkspaceTiming\("activity_clicked"/);
        expect(inline).toMatch(/markDrawerFamilyWorkspaceTiming\("preview_vm_ready"/);
        expect(embedded).toMatch(/markDrawerFamilyWorkspaceTiming\("activity_mounted"/);
        expect(workspace).toMatch(/markDrawerFamilyWorkspaceTiming\("workspace_mounted"/);
        expect(workspace).toMatch(/warm_cache_hit|warm_cache_miss/);
    });

    it("Activity workspace consumes preview before falling back to cache or network", () => {
        const workspace = readFileSync(
            join(process.cwd(), "app/adminV2/communications/FamilyCommunicationWorkspace.tsx"),
            "utf8"
        );
        const recordTab = readFileSync(
            join(process.cwd(), "app/adminV2/communications/recordTab/RecordCommunicationsTab.tsx"),
            "utf8"
        );
        const embedded = readFileSync(
            join(process.cwd(), "components/admin/focusPanel/OpportunityFocusPanelEmbeddedWorkspace.tsx"),
            "utf8"
        );
        const ui = readFileSync(join(process.cwd(), "app/adminV2/communications/commsWorkspaceUi.tsx"), "utf8");
        expect(embedded).toMatch(/initialPreviewVm={displayVm\.activity\?\.communicationsPreviewVm \?\? null}/);
        expect(recordTab).toMatch(/initialPreviewVm/);
        expect(workspace).toMatch(/workspaceFromPreview/);
        expect(workspace).toMatch(/source: .*preview_vm/);
        expect(workspace).toMatch(/CommsActivityEmbedHydratingShell/);
        expect(ui).toMatch(/data-comms-activity-embed-hydrating-shell/);
    });
});
