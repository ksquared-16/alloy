import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Communications modal — Operational Workspace Doctrine V2 shell.
 */

function read(rel: string): string {
    const p = join(process.cwd(), rel);
    expect(existsSync(p), `exists: ${rel}`).toBe(true);
    return readFileSync(p, "utf8");
}

const MODAL = "app/adminV2/components/InboxModal.tsx";
const SHELL = "app/adminV2/communications/CommunicationsWorkspaceShell.tsx";
const PANEL = "app/adminV2/communications/CommunicationsModalTabPanel.tsx";
const PAGE = "app/adminV2/communications/page.tsx";
const WS = "app/adminV2/communications/TemplatesWorkspace.tsx";
const DOCTRINE = "components/workspace/doctrine.ts";

describe("Communications modal tabs", () => {
    it("InboxModal exposes Work and Studio sections when Command Center is enabled", () => {
        const src = read(MODAL);
        const shell = read(SHELL);
        const panel = read(PANEL);
        expect(src).toContain("CommunicationsWorkspaceShell");
        expect(shell).toContain("data-comms-workspace-shell");
        expect(shell).toContain("WorkspaceShell");
        expect(src).toContain("COMMUNICATIONS_MODAL_TABS");
        expect(src).not.toContain("SettingsEntityTabBar");
        expect(src).toContain("CommunicationsModalTabPanel");
        for (const label of [
            "Overview",
            "Inbox",
            "Announcements",
            "Scheduled",
            "Templates",
            "Channels",
            "Rules",
        ]) {
            expect(panel).toContain(label);
        }
        expect(shell).toContain('data-inbox-compose-new="true"');
        expect(src).toContain("ComposeNewCommunicationModal");
        expect(shell).toContain("workspace-v2");
        expect(shell).not.toContain('data-comms-workspace-context="true"');
        expect(shell).toContain("CommunicationsWorkspaceKpiStrip");
        expect(shell).not.toContain("OperationalModalHeader");
        expect(shell).toContain("Where conversations happen.");
        expect(shell).toContain("COMMS_WORKSPACE_EXECUTION_CLASS");
    });

    it("CommsModalTabBar renders subordinate underline tabs with a Bend Pine active state (not floating pills)", () => {
        const tabBar = read("app/adminV2/communications/CommsModalTabBar.tsx");
        const ui = read("app/adminV2/communications/commsWorkspaceUi.tsx");
        expect(tabBar).toContain('data-workspace-section-tabs="true"');
        expect(tabBar).toContain("border-b-2");
        expect(tabBar).toContain("border-alloy-juniper");
        expect(tabBar).toContain("text-alloy-juniper");
        expect(tabBar).not.toContain("COMMS_TAB_RAIL_CLASS");
        expect(ui).toContain("alloy-juniper");
        expect(ui).not.toContain("alloy-blue");
        expect(ui).not.toMatch(/bg-alloy-pine\b/);
        expect(tabBar).not.toContain("COMMS_SECONDARY_BTN_CLASS");
    });

    it("TemplateCategoryField uses dropdown default and explicit create mode", () => {
        const field = read("app/adminV2/communications/TemplateCategoryField.tsx");
        expect(field).toContain("resolveTemplateCategoryCommitValue");
        expect(field).toContain('data-template-category-add="true"');
        expect(field).toContain('data-template-category-mode="dropdown"');
        expect(field).toContain("+ Create new category");
    });

    it("tab panel mounts all Work and Studio workspaces without separate tab flags", () => {
        const src = read(PANEL);
        expect(src).toContain("CommunicationsOverviewLanding");
        expect(src).toContain("CommandCenterShell");
        expect(src).toContain("TemplatesWorkspace");
        expect(src).toContain("AnnouncementsWorkspace");
        expect(src).toContain("ScheduledWorkspace");
        expect(src).toContain("ChannelsWorkspace");
        expect(src).toContain("RulesWorkspace");
        expect(src).toContain('data-comms-tab-panel="overview"');
        expect(src).toContain('data-comms-tab-panel="inbox"');
        expect(src).toContain('data-comms-tab-panel="templates"');
        expect(src).toContain('data-comms-tab-panel="announcements"');
        expect(src).toContain('data-comms-tab-panel="scheduled"');
        expect(src).toContain('data-comms-tab-panel="channels"');
        expect(src).toContain('data-comms-tab-panel="rules"');
        expect(src).not.toContain("comms_v2_templates");
        expect(src).not.toContain("comms_v2_announcements");
        expect(src).not.toContain("comms-modal-placeholder");
        expect(src).not.toContain("isCommsV2FlagEnabled");
        expect(src).toMatch(/data-comms-modal-body="true"/);
    });

    it("CommunicationsWorkspaceShell composes doctrine WorkspaceShell", () => {
        const shell = read(SHELL);
        expect(shell).not.toContain("OperationalModalHeader");
        expect(shell).toContain("@/components/workspace/WorkspaceShell");
        expect(read(DOCTRINE)).toContain("WorkspaceOperationalHealth");
        expect(read(DOCTRINE)).toContain("WorkspaceMetricTiles");
    });

    it("Overview landing uses doctrine WorkspaceSurface", () => {
        const landing = read("app/adminV2/communications/CommunicationsOverviewLanding.tsx");
        expect(landing).toContain("WorkspaceSurface");
        expect(landing).toContain("@/components/workspace/WorkspaceSurface");
    });

    it("InboxModal gates the consolidated surface only on comms_v2_command_center", () => {
        const src = read(MODAL);
        expect(src).toMatch(/isCommsV2FlagEnabled\(["']comms_v2_command_center["']\)/);
        expect(src).not.toContain("comms_v2_templates");
        expect(src).not.toContain("comms_v2_announcements");
        expect(src).toContain('useState<CommunicationsModalTab>("overview")');
    });

    it("standalone /admin/communications route is deprecated and not the operator hub", () => {
        const src = read(PAGE);
        expect(src).toMatch(/data-comms-hub-deprecated="true"/);
        expect(src).not.toContain("CommunicationsHubClient");
    });

    it("legacy inbox panel path remains when comms_v2_command_center is off", () => {
        const src = read(MODAL);
        expect(src).toMatch(/isCommsV2FlagEnabled\(["']comms_v2_command_center["']\)/);
        expect(src).toContain("<InboxPanel");
    });
});

describe("Templates workspace", () => {
    const src = read(WS);

    it("uses ONLY the template APIs", () => {
        expect(src).toContain("/api/admin/communications/templates");
        expect(src).toMatch(/TEMPLATES_API/);
    });

    it("calls NO provider / send / announcement APIs", () => {
        expect(src).not.toMatch(/twilio|sendgrid|resend|webhook|10dlc/i);
        expect(src).not.toMatch(/executeCommunicationsSend|enqueueCanonicalOutbound/);
        expect(src).not.toMatch(/\/api\/admin\/communications\/(send|announcements|bindings)/);
        expect(src).not.toMatch(/communications\/threads/);
    });

    it("renders a three-column workspace with list, editor, and right panel", () => {
        expect(src).toContain('data-templates-workspace="true"');
        expect(src).toContain('data-template-list="true"');
        expect(src).toContain('data-template-editor="true"');
        expect(src).toContain('data-template-details="true"');
        expect(src).toContain('data-template-message="true"');
        expect(src).toContain("TemplateCategoryField");
        expect(src).toContain("TemplateTokenPickerPanel");
        expect(src).toMatch(/grid-cols-\[272px_minmax\(0,1fr\)_320px\]/);
    });
});
