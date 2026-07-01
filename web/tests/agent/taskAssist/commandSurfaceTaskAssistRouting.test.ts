import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const threadPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../app/adminV2/components/aiCommandSurface/CommandSurfaceThread.tsx"
);
const shellPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx"
);

describe("Command surface Task Assist routing", () => {
    it("renders reminder compact card only for uiPhase reminder (no draft send controls)", () => {
        const src = readFileSync(threadPath, "utf8");
        expect(src).toContain('uiPhase === "reminder"');
        expect(src).toContain("TaskAssistCompactReminderCard");
        const reminderIdx = src.indexOf('uiPhase === "reminder"');
        const draftIdx = src.indexOf('uiPhase === "draft"');
        expect(reminderIdx).toBeGreaterThan(-1);
        expect(draftIdx).toBeGreaterThan(reminderIdx);
        const slice = src.slice(reminderIdx, draftIdx);
        expect(slice).toContain("TaskAssistCompactReminderCard");
        expect(slice).not.toContain("TaskAssistCompactDraftCard");
    });

    it("shell routes create_reminder to reminder uiPhase", () => {
        const src = readFileSync(shellPath, "utf8");
        expect(src).toContain('intent?.intent_type === "create_reminder"');
        expect(src).toContain('isReminderIntent ? "reminder"');
    });
});
