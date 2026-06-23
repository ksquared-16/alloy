import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Communications modal consolidation — Inbox / Templates / Announcements in one operator surface.
 */

function read(rel: string): string {
    const p = join(process.cwd(), rel);
    expect(existsSync(p), `exists: ${rel}`).toBe(true);
    return readFileSync(p, "utf8");
}

const MODAL = "app/adminV2/components/InboxModal.tsx";
const PANEL = "app/adminV2/communications/CommunicationsModalTabPanel.tsx";
const PAGE = "app/adminV2/communications/page.tsx";
const WS = "app/adminV2/communications/TemplatesWorkspace.tsx";

describe("Communications modal tabs", () => {
    it("InboxModal exposes Inbox, Templates, and Announcements tabs when Command Center is enabled", () => {
        const src = read(MODAL);
        const panel = read(PANEL);
        expect(src).toContain("SettingsEntityTabBar");
        expect(src).toContain("COMMUNICATIONS_MODAL_TABS");
        expect(src).toContain("CommunicationsModalTabPanel");
        for (const label of ["Inbox", "Templates", "Announcements"]) {
            expect(panel).toContain(label);
        }
        expect(src).toContain('data-adminv2-inbox-modal="true"');
    });

    it("tab panel mounts Command Center, TemplatesWorkspace, and AnnouncementsWorkspace without separate tab flags", () => {
        const src = read(PANEL);
        expect(src).toContain("CommandCenterShell");
        expect(src).toContain("TemplatesWorkspace");
        expect(src).toContain("AnnouncementsWorkspace");
        expect(src).not.toContain("comms_v2_templates");
        expect(src).not.toContain("comms_v2_announcements");
        expect(src).not.toContain("comms-modal-placeholder");
        expect(src).not.toContain("isCommsV2FlagEnabled");
        expect(src).toMatch(/data-comms-modal-body="true"/);
    });

    it("InboxModal gates the consolidated surface only on comms_v2_command_center", () => {
        const src = read(MODAL);
        expect(src).toMatch(/isCommsV2FlagEnabled\(["']comms_v2_command_center["']\)/);
        expect(src).not.toContain("comms_v2_templates");
        expect(src).not.toContain("comms_v2_announcements");
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
        expect(src).toMatch(/grid-cols-\[260px_minmax\(0,1fr\)_300px\]/);
    });
});
