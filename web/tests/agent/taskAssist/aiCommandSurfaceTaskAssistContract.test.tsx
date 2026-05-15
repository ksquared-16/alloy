import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const shellPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx"
);
const eventsPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../lib/adminV2/aiCommandSurface/adminV2CommandBarEvents.ts"
);

describe("AICommandSurfaceShell Task Assist (Card 9 command bar home)", () => {
    it("listens for focus event and hosts Task Assist workspace tray when mode is task_assist", () => {
        const src = readFileSync(shellPath, "utf8");
        expect(src).toContain("ADMIN_V2_FOCUS_COMMAND_BAR");
        expect(src).toContain("TaskAssistOpportunityWorkspace");
        expect(src).toContain("data-adminv2-task-assist-command-tray");
        expect(src).toContain("data-adminv2-command-surface-mode-tabs");
        expect(src).toContain('source_surface="command_bar"');
        expect(src).toContain("data-adminv2-task-assist-find-target");
        expect(src).toContain("fetchTaskAssistEntitySearch");
        expect(src).toContain("parseTaskAssistCommandIntent");
        expect(src).toContain("command_bootstrap");
        expect(src).toContain("data-adminv2-task-assist-intent-summary");
    });

    it("exports stable focus event name for GlobalAssistantContext", () => {
        const src = readFileSync(eventsPath, "utf8");
        expect(src).toContain("alloy-adminv2-focus-command-bar");
    });
});
