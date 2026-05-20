import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const drawerPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../components/admin/AdminEntityDrawer.tsx"
);
const shellPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx"
);

describe("AdminEntityDrawer BOS context contract (Loop 1)", () => {
    it("AdminEntityDrawer seeds GlobalAssistantContext for opportunities", () => {
        const src = readFileSync(drawerPath, "utf8");
        expect(src).toContain("useGlobalAssistantOptional");
        expect(src).toContain("buildOpportunityOperationalContext");
        expect(src).toContain("setAssistantContext");
        expect(src).toContain('drawer.type !== "opportunities"');
        expect(src).toContain("setAssistantContext(null)");
    });

    it("AICommandSurfaceShell shows active record chip and context switch notice", () => {
        const shellSrc = readFileSync(shellPath, "utf8");
        const chipPath = join(
            dirname(fileURLToPath(import.meta.url)),
            "../../app/adminV2/components/bos/OperationalActiveRecordChip.tsx"
        );
        const chipSrc = readFileSync(chipPath, "utf8");
        expect(shellSrc).toContain("OperationalActiveRecordChip");
        expect(shellSrc).toContain("operationalContextSwitchNoticeText");
        expect(shellSrc).toContain("activeOperationalEntityId");
        expect(shellSrc).not.toContain("Context: {globalAssistant.currentContext.label}");
        expect(chipSrc).toContain("data-command-surface-active-record-chip");
        expect(chipSrc).toContain("Active record");
    });

    it("CommandSurfaceThread blocks stale task assist proposals", () => {
        const threadPath = join(
            dirname(fileURLToPath(import.meta.url)),
            "../../app/adminV2/components/aiCommandSurface/CommandSurfaceThread.tsx"
        );
        const src = readFileSync(threadPath, "utf8");
        expect(src).toContain("activeOperationalEntityId");
        expect(src).toContain("data-command-surface-stale-proposal");
        expect(src).toContain("mutationsBlocked={staleProposal}");
    });
});
