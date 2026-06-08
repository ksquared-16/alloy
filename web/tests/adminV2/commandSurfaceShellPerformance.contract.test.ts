import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const shellPath = join(process.cwd(), "app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx");

describe("command surface shell performance (Cards 18–20)", () => {
    const src = readFileSync(shellPath, "utf8");

    it("reserves thread panel height and coordinates busy status", () => {
        expect(src).toContain("COMMAND_SURFACE_THREAD_PANEL_MIN_HEIGHT_COLLAPSED_PX");
        expect(src).toContain("COMMAND_SURFACE_THREAD_SCROLL_MIN_HEIGHT_PX");
        expect(src).toContain("shouldShowInlineThreadBusyIndicator");
        expect(src).toContain("resolveCommandSurfaceThreadStatusLabel");
        expect(src).toContain('noticeRole: "searching"');
        expect(src).toContain("COMMAND_SURFACE_SEARCHING_NOTICE");
    });

    it("expands thread on submit and uses capability gate checking label", () => {
        expect(src).toContain("setThreadExpanded(true)");
        expect(src).toContain("CAPABILITY_GATE_CHECKING_LABEL");
        expect(src).toContain("workflowAssistCapabilitiesPending");
        expect(src).toContain("configAssistCapabilitiesPending");
    });

    it("does not stack Working with Processing in submit button only", () => {
        expect(src).toContain('busy ? "Processing…" : "Ask"');
        expect(src).not.toContain('Working…');
    });
});
