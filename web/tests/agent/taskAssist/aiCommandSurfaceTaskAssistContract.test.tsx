import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const shellPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx"
);
const threadPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../app/adminV2/components/aiCommandSurface/CommandSurfaceThread.tsx"
);
const eventsPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../lib/adminV2/aiCommandSurface/adminV2CommandBarEvents.ts"
);

describe("AICommandSurfaceShell Interaction Layer V1", () => {
    it("uses unified thread surface without mode tabs", () => {
        const src = readFileSync(shellPath, "utf8");
        expect(src).not.toContain("data-adminv2-command-surface-mode-tabs");
        expect(src).not.toContain("Find target");
        expect(src).toContain("data-command-surface-thread-panel");
        expect(src).toContain("data-command-surface-input");
        expect(src).toContain("data-command-surface-submit");
        expect(src).toContain("routeCommandSurface");
        expect(src).toContain("CommandSurfaceThread");
    });

    it("thread hosts Task Assist workspace inside action cards", () => {
        const threadSrc = readFileSync(threadPath, "utf8");
        expect(threadSrc).toContain("TaskAssistOpportunityWorkspace");
        expect(threadSrc).toContain("data-command-surface-task-assist-action-card");
        expect(threadSrc).toContain('source_surface="command_bar"');
        expect(threadSrc).toContain("command_bootstrap");
    });

    it("exports stable focus event name for GlobalAssistantContext", () => {
        const src = readFileSync(eventsPath, "utf8");
        expect(src).toContain("alloy-adminv2-focus-command-bar");
    });
});
