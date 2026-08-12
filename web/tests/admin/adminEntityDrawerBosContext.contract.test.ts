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

    it("AICommandSurfaceShell shows active record chip; context switches stay silent in chat", () => {
        const shellSrc = readFileSync(shellPath, "utf8");
        const chipPath = join(
            dirname(fileURLToPath(import.meta.url)),
            "../../app/adminV2/components/bos/OperationalActiveRecordChip.tsx"
        );
        const chipSrc = readFileSync(chipPath, "utf8");
        const threadPath = join(
            dirname(fileURLToPath(import.meta.url)),
            "../../app/adminV2/components/aiCommandSurface/CommandSurfaceThread.tsx"
        );
        const threadSrc = readFileSync(threadPath, "utf8");
        expect(shellSrc).toContain("OperationalActiveRecordChip");
        expect(shellSrc).toContain("operationalContextSwitchNoticeText");
        expect(shellSrc).toContain("noticeRole: \"context_boundary\"");
        expect(shellSrc).toContain("autoSubmitSeedCommand");
        expect(shellSrc).toContain("runSubmittedCommandRef");
        expect(shellSrc).toContain("activeOperationalEntityId");
        expect(shellSrc).not.toContain("Context: {globalAssistant.currentContext.label}");
        expect(chipSrc).toContain("data-command-surface-active-record-chip");
        expect(chipSrc).toContain("Active record");
        // Visible conversation must not render passive context-boundary notices.
        expect(threadSrc).toMatch(/if \(isContextBoundary\) return null/);
    });

    it("CommandSurfaceThread blocks stale task assist proposals", () => {
        const threadPath = join(
            dirname(fileURLToPath(import.meta.url)),
            "../../app/adminV2/components/aiCommandSurface/CommandSurfaceThread.tsx"
        );
        const src = readFileSync(threadPath, "utf8");
        expect(src).toContain("activeOperationalEntityId");
        expect(src).toContain("isStaleOperationalProposalEntity");
        expect(src).toContain("mutationsBlocked={staleProposal}");
    });
});
