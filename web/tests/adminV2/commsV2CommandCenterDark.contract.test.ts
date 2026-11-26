import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const modal = readFileSync(join(process.cwd(), "app", "adminV2", "components", "InboxModal.tsx"), "utf8");
const panel = readFileSync(join(process.cwd(), "app", "adminV2", "communications", "CommunicationsModalTabPanel.tsx"), "utf8");
const shell = readFileSync(join(process.cwd(), "app", "adminV2", "communications", "CommandCenterShell.tsx"), "utf8");

/** Command Center REPLACES the inbox panel inside the existing BOS-rail modal — dark + doctrine. */
describe("command center replaces inbox modal body", () => {
    it("InboxModal gates the body behind comms_v2_command_center, preserving the legacy panel when off", () => {
        expect(modal).toMatch(/isCommsV2FlagEnabled\(["']comms_v2_command_center["']\)/);
        expect(modal).toMatch(/<CommunicationsModalTabPanel/);
        expect(panel).toMatch(/<CommandCenterShell\s*\/>/);
        expect(modal).toMatch(/<InboxPanel/); // legacy panel still rendered in the off branch
    });
    it("the BOS rail stays put — modal still uses the workspace BOS shell", () => {
        expect(modal).toMatch(/AdminV2WorkspaceBosModalShell/);
    });
    it("the body is queue + workspace (operational queues, not folders) and owns NO BOS rail", () => {
        expect(shell).toMatch(/data-cc-column="queue"/);
        expect(shell).toMatch(/data-cc-column="workspace"/);
        expect(shell).toMatch(/visibleCommandCenterQueues/);
        expect(shell).not.toMatch(/data-cc-column="bos"/);
        expect(shell).not.toMatch(/CommandRailBosMount/); // BOS is the modal shell's, not the body's
    });
    it("the body embeds no BOS panel and uses no folder navigation", () => {
        expect(shell).not.toMatch(/aiCommandSurface\/[A-Za-z]*Panel/);
        expect(shell).not.toMatch(/InboxFolder|folder navigation|\"Sent\"|\"Archived\"|\"Drafts\"/);
    });
});
