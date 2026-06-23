import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Comms V2 Phase 1 / B3 — Communications Hub + Templates UI source contract.
 * Node-environment contract tests (matches tests/adminV2/inboxFoundation.test.ts):
 * read component source and assert behavior/guardrails without a DOM.
 */

function read(rel: string): string {
    const p = join(process.cwd(), rel);
    expect(existsSync(p), `exists: ${rel}`).toBe(true);
    return readFileSync(p, "utf8");
}

const PAGE = "app/adminV2/communications/page.tsx";
const HUB = "app/adminV2/communications/CommunicationsHubClient.tsx";
const WS = "app/adminV2/communications/TemplatesWorkspace.tsx";

describe("Communications Hub shell", () => {
    it("page gates server-side on comms_v2 flags and passes them to the client", () => {
        const src = read(PAGE);
        expect(src).toContain("isCommsV2FlagEnabled");
        expect(src).toContain("comms_v2_templates");
        expect(src).toContain("comms_v2_announcements");
        expect(src).toContain("comms_v2_preferences");
        expect(src).toContain("CommunicationsHubClient");
        // dark by default: an inert notice path exists
        expect(src).toMatch(/comms-hub-disabled/);
    });

    it("hub renders the permanent four-tab IA via the shared tab bar", () => {
        const src = read(HUB);
        expect(src).toContain("SettingsEntityTabBar");
        for (const label of ["Inbox", "Templates", "Announcements", "Preferences"]) {
            expect(src).toContain(label);
        }
        expect(src).toContain('data-comms-hub="true"');
    });

    it("Inbox tab links to the existing inbox surface and introduces no send UI", () => {
        const src = read(HUB);
        expect(src).toContain("/adminV2/messages");
        // the hub itself must not pull in the composer/send path
        expect(src).not.toMatch(/MessagingComposerFrame|executeCommunicationsSend|\/send/);
    });

    it("Announcements renders a flag-gated workspace; Preferences stays a placeholder", () => {
        const src = read(HUB);
        // Announcements now mounts the functional workspace when enabled.
        expect(src).toContain("AnnouncementsWorkspace");
        expect(src).toMatch(/flags\.announcements\s*\?\s*\(?\s*<AnnouncementsWorkspace/);
        // Preferences remains a placeholder; the hub shell itself calls no announcement/send APIs.
        expect(src).toContain("PlaceholderPanel");
        expect(src).not.toMatch(/\/api\/admin\/communications\//);
    });
});

describe("Templates workspace", () => {
    const src = read(WS);

    it("uses ONLY the template APIs", () => {
        expect(src).toContain("/api/admin/communications/templates");
        // CRUD + archive endpoints only
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

    it("exposes search + category/channel/status filters", () => {
        expect(src).toContain('data-template-search="true"');
        expect(src).toContain('data-template-filter-category="true"');
        expect(src).toContain('data-template-filter-channel="true"');
        expect(src).toContain('data-template-filter-status="true"');
    });

    it("token picker inserts valid catalog paths", () => {
        expect(src).toContain("listCommunicationTokensByGroup");
        expect(src).toContain('data-template-token-picker="true"');
        expect(src).toContain("data-token-path");
        // inserts the {{path}} form
        expect(src).toMatch(/`\{\{\$\{path\}\}\}`/);
    });

    it("subject is EMAIL-only (hidden for sms/in_app)", () => {
        // subject input rendered only under the email guard
        expect(src).toContain("templateChannelSupportsSubject");
        expect(src).toMatch(/isEmail\s*&&[\s\S]*data-template-subject="true"/);
        // switching channel away from email clears the subject
        expect(src).toMatch(/subject: templateChannelSupportsSubject\(channel\) \? d\.subject : ""/);
    });

    it("live preview uses the B0 engine and updates automatically (no save/refresh/generate)", () => {
        expect(src).toContain("segmentCommunicationTemplate");
        expect(src).toContain("useMemo");
        expect(src).toContain('data-template-preview="true"');
        // does NOT call the server preview route for live preview
        expect(src).not.toContain("/preview");
        // no manual "generate preview" button
        expect(src).not.toMatch(/generate preview/i);
    });

    it("shows missing and unknown token indicators", () => {
        expect(src).toContain('data-template-missing-tokens="true"');
        expect(src).toContain('data-template-unknown-tokens="true"');
        expect(src).toContain("validateCommunicationTokenPaths");
    });

    it("offers archive but NO delete", () => {
        expect(src).toContain('data-template-archive="true"');
        expect(src).toContain("/archive");
        expect(src).not.toMatch(/data-template-delete|method:\s*"DELETE"/);
    });
});
