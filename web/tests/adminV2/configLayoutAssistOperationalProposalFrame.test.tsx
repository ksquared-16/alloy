import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const threadCardPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../app/adminV2/components/aiCommandSurface/ConfigLayoutAssistProposalThreadCard.tsx"
);
const readyCardPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../app/adminV2/components/aiCommandSurface/ConfigLayoutAssistReadyCard.tsx"
);
const fieldSetupPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../app/adminV2/components/aiCommandSurface/ConfigLayoutAssistFieldSetupCard.tsx"
);
const settingsPanelPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../app/adminV2/settings/config-proposals/ConfigLayoutProposalReviewPanel.tsx"
);

describe("Config Assist OperationalProposalCardFrame migration", () => {
    it("thread proposal card uses frame and preserves review CTA", () => {
        const src = readFileSync(threadCardPath, "utf8");
        expect(src).toContain("OperationalProposalCardFrame");
        expect(src).not.toContain("CommandSurfaceActionCardShell");
        expect(src).toContain("config_layout_assist");
        expect(src).toContain("CONFIG_LAYOUT_ASSIST_PROPOSAL_TYPE_LABEL");
        expect(src).toContain("data-command-surface-config-assist-review-proposal");
        expect(src).not.toMatch(/\bAI thinks\b/i);
        expect(src).not.toContain("Copilot");
    });

    it("ready card uses frame with approve and settings copy", () => {
        const src = readFileSync(readyCardPath, "utf8");
        expect(src).toContain("OperationalProposalCardFrame");
        expect(src).toContain("CONFIG_LAYOUT_ASSIST_SETTINGS_HUB_COPY");
        expect(src).toContain("data-command-surface-config-assist-approve-apply");
        expect(src).toContain("requiresApproval");
    });

    it("field setup card uses frame with confirm control", () => {
        const src = readFileSync(fieldSetupPath, "utf8");
        expect(src).toContain("OperationalProposalCardFrame");
        expect(src).toContain("data-command-surface-config-assist-confirm-setup");
        expect(src).toContain("CONFIG_LAYOUT_ASSIST_FIELD_SETUP_TYPE_LABEL");
    });

    it("settings review panel uses frame and lifecycle actions", () => {
        const src = readFileSync(settingsPanelPath, "utf8");
        expect(src).toContain("OperationalProposalCardFrame");
        expect(src).toContain("lifecycleState");
        expect(src).toContain("mapConfigLifecycleToBosStatus");
        expect(src).not.toContain("CommandSurfaceActionCardShell");
    });
});
