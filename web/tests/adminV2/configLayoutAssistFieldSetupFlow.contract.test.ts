import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const shellPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx"
);
const threadPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../app/adminV2/components/aiCommandSurface/CommandSurfaceThread.tsx"
);

describe("config layout assist in-chat field setup flow contract", () => {
    it("shell routes create_field to field-setup without default persist", () => {
        const src = readFileSync(shellPath, "utf8");
        expect(src).toContain("runConfigLayoutAssistFieldSetup");
        expect(src).toContain("/api/admin/ai/config-layout-assist/field-setup");
        expect(src).toContain("config_layout_assist_field_setup");
        expect(src).toContain("field-setup/confirm");
        expect(src).toContain("config_layout_assist_ready");
        expect(src).toMatch(/intent\.kind === "create_field"[\s\S]*?runConfigLayoutAssistFieldSetup/);
    });

    it("thread renders field setup and ready cards", () => {
        const src = readFileSync(threadPath, "utf8");
        expect(src).toContain("ConfigLayoutAssistFieldSetupCard");
        expect(src).toContain("ConfigLayoutAssistReadyCard");
        expect(src).toContain("onConfirmConfigFieldSetup");
        expect(src).toContain("onApproveConfigProposal");
    });
});
