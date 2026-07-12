import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(webRoot, rel), "utf8");
}

describe("BOS Adoption Sprint 01", () => {
    it("doctrine doc exists and declares identity frozen", () => {
        const doc = read("../docs/system/bos-identity-doctrine.md");
        expect(doc).toContain("Frozen");
        expect(doc).toContain("BosRevealSequence");
        expect(doc).toContain("does not redesign");
    });

    it("doctrine is linked from docs README and product stubs", () => {
        expect(read("../docs/README.md")).toContain("bos-identity-doctrine.md");
        expect(read("../docs/product/bos-foundation.md")).toContain("bos-identity-doctrine.md");
        expect(read("../docs/product/ai-system.md")).toContain("bos-identity-doctrine.md");
    });

    it("surface audit doc exists", () => {
        expect(read("../docs/sprints/archive/06_2026/bos_adoption_sprint01_surface_audit.md")).toContain(
            "Adoption Sprint 01",
        );
    });

    it("working reveal wired on analyze/review/intake surfaces", () => {
        expect(read("components/admin/actions/ActionWorkspacePasteCanvas.tsx")).toContain(
            'mode="working"',
        );
        expect(read("components/admin/opportunity/actions/ActionIntakePastePanel.tsx")).toContain(
            'mode="working"',
        );
        expect(read("components/forms/review/BosReviewSummaryPlaceholder.tsx")).toContain(
            'mode="working"',
        );
    });

    it("workspace open surfaces show content immediately without workspace reveal gate", () => {
        expect(read("components/admin/actions/ActionWorkspaceBosShell.tsx")).not.toContain("BosRevealSequence");
        expect(read("components/adminV2/messaging/ComposerBosEnhanceModal.tsx")).not.toContain("BosRevealSequence");
    });

    it("BosButton replaces custom BOS CTAs on adoption targets", () => {
        expect(read("components/admin/actions/ActionWorkspacePasteCanvas.tsx")).toContain("BosButton");
        expect(read("components/admin/opportunity/actions/ActionIntakePastePanel.tsx")).toContain(
            "BosButton",
        );
        expect(read("components/adminV2/messaging/ComposerReplyActionCluster.tsx")).toContain("BosButton");
    });

    it("route and drawer loading do not use identity smoke", () => {
        expect(read("components/admin/workspace/AdminV2RouteLoadingState.tsx")).not.toContain("BosSmoke");
        expect(read("components/admin/workspace/AdminV2DrawerLoadingState.tsx")).not.toContain("BosSmoke");
        expect(read("components/admin/workspace/AdminV2RouteLoadingState.tsx")).toContain("BosExecutionLoader");
    });

    it("production does not import deprecated BosGenieLampIcon", () => {
        const offenders = [
            "components/admin/actions/ActionWorkspacePasteCanvas.tsx",
            "components/adminV2/messaging/ComposerReplyActionCluster.tsx",
            "app/adminV2/components/aiCommandSurface/bosRail/BosRailPresentation.tsx",
        ];
        for (const f of offenders) {
            expect(read(f)).not.toContain("BosGenieLampIcon");
        }
    });
});
