import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
    COMMAND_SURFACE_INTERACTIVE_CARD_CLASS,
    COMMAND_SURFACE_NAV_OPENING_LABEL,
    handleCommandSurfaceCardNavigate,
} from "@/lib/adminV2/aiCommandSurface/commandSurfaceCardNavigation";

describe("commandSurfaceCardNavigation", () => {
    it("handleCommandSurfaceCardNavigate invokes onNavigateStart", () => {
        const navigate = vi.fn();
        const onNavigateStart = vi.fn();
        handleCommandSurfaceCardNavigate(
            { preventDefault: vi.fn(), stopPropagation: vi.fn() },
            "/adminV2/workflows",
            navigate,
            { onNavigateStart }
        );
        expect(onNavigateStart).toHaveBeenCalledOnce();
        expect(navigate).toHaveBeenCalledWith("/adminV2/workflows");
    });

    it("handleCommandSurfaceCardNavigate stops propagation and navigates", () => {
        const navigate = vi.fn();
        const preventDefault = vi.fn();
        const stopPropagation = vi.fn();

        handleCommandSurfaceCardNavigate(
            { preventDefault, stopPropagation },
            "/adminV2/workflows",
            navigate
        );

        expect(preventDefault).toHaveBeenCalledOnce();
        expect(stopPropagation).toHaveBeenCalledOnce();
        expect(navigate).toHaveBeenCalledWith("/adminV2/workflows");
    });

    it("handleCommandSurfaceCardNavigate is a no-op for empty href", () => {
        const navigate = vi.fn();
        const preventDefault = vi.fn();
        const stopPropagation = vi.fn();

        handleCommandSurfaceCardNavigate({ preventDefault, stopPropagation }, "  ", navigate);

        expect(preventDefault).not.toHaveBeenCalled();
        expect(stopPropagation).not.toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalled();
    });
});

describe("command surface card navigation contract", () => {
    const root = join(process.cwd(), "app/adminV2/components/aiCommandSurface");

    it("Workflow Assist review panel uses CommandSurfaceCardLink for Open Automations", () => {
        const src = readFileSync(join(root, "WorkflowAssistProposalReviewPanel.tsx"), "utf8");
        expect(src).toContain("CommandSurfaceCardLink");
        expect(src).toContain("data-command-surface-workflow-assist-open-automations");
        expect(src).not.toMatch(/<Link[^>]+href=["']\/adminV2\/workflows/);
    });

    it("CommandSurfaceThread assistant bubbles are pointer-events interactive", () => {
        const src = readFileSync(join(root, "CommandSurfaceThread.tsx"), "utf8");
        expect(src).toContain("COMMAND_SURFACE_INTERACTIVE_CARD_CLASS");
        expect(src).toContain("CommandSurfaceCardLink");
    });

    it("CommandSurfaceCardLink shows opening state and collapses command surface", () => {
        const src = readFileSync(join(root, "CommandSurfaceCardLink.tsx"), "utf8");
        expect(src).toContain("COMMAND_SURFACE_NAV_OPENING_LABEL");
        expect(src).toContain("navigating ? openingLabel");
        expect(src).toContain("collapseCommandSurfaceAfterNavigation");
        expect(src).toContain("setNavigating(true)");
    });

    it("GlobalAssistant exposes collapse after navigation", () => {
        const src = readFileSync(
            join(process.cwd(), "contexts/GlobalAssistantContext.tsx"),
            "utf8"
        );
        expect(src).toContain("collapseCommandSurfaceAfterNavigation");
    });

    it("Config Assist proposal card uses shared interactive shell", () => {
        const src = readFileSync(join(root, "ConfigLayoutAssistProposalThreadCard.tsx"), "utf8");
        expect(src).toContain("CommandSurfaceActionCardShell");
    });
});
