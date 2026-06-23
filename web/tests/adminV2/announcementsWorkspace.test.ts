import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Comms V2 Phase 1 / B5 — Announcements workspace source contract.
 * Node-environment (no DOM): assert the workspace behavior/guardrails from source.
 */

function read(rel: string): string {
    const p = join(process.cwd(), rel);
    expect(existsSync(p), `exists: ${rel}`).toBe(true);
    return readFileSync(p, "utf8");
}

const WS = read("app/adminV2/communications/AnnouncementsWorkspace.tsx");

describe("Announcements workspace", () => {
    it("uses the announcement + template APIs", () => {
        expect(WS).toContain("/api/admin/communications/announcements");
        expect(WS).toContain("/api/admin/communications/templates");
    });

    it("only calls announcement, template, and read-only audience option APIs", () => {
        // collect every /api/... string literal referenced
        const apis = [...WS.matchAll(/["'`](\/api\/[^"'`]+)["'`]/g)].map((m) => m[1]);
        const allowedPrefixes = [
            "/api/admin/communications/announcements",
            "/api/admin/communications/templates",
            "/api/admin/location-program-categories",
            "/api/admin/communications/status-options",
            "/api/admin/locations?hierarchy=1",
        ];
        for (const api of apis) {
            expect(
                allowedPrefixes.some((p) => api.startsWith(p)),
                `unexpected API used: ${api}`
            ).toBe(true);
        }
    });

    it("calls NO provider / send / scheduled-send APIs", () => {
        expect(WS).not.toMatch(/twilio|sendgrid|resend|webhook|10dlc/i);
        expect(WS).not.toMatch(/executeCommunicationsSend|enqueueCanonicalOutbound/);
        expect(WS).not.toMatch(/communication-scheduled-sends|communication_scheduled_sends|claim_due_/);
        expect(WS).not.toMatch(/["'`][^"'`]*\/send\b/);
    });

    it("has NO send button; schedule + cancel are functional (B7) and call the B7 endpoints", () => {
        expect(WS).not.toMatch(/data-announcement-send\b/);
        expect(WS).toContain('data-announcement-schedule="true"');
        expect(WS).toContain('data-announcement-schedule-run="true"');
        expect(WS).toContain('data-announcement-cancel-schedule="true"');
        expect(WS).toMatch(/`\$\{ANNOUNCEMENTS_API\}\/\$\{selectedId\}\/schedule`/);
        expect(WS).toMatch(/`\$\{ANNOUNCEMENTS_API\}\/\$\{selectedId\}\/cancel`/);
    });

    it("offers an archive action and writes status only via create(draft)/archive", () => {
        expect(WS).toContain('data-announcement-archive="true"');
        expect(WS).toContain("/archive");
        // never writes scheduled/sent status from the UI
        expect(WS).not.toMatch(/status:\s*["'`](scheduled|sent)["'`]/);
    });

    it("has a working template selector that previews the chosen template", () => {
        expect(WS).toContain('data-announcement-template="true"');
        expect(WS).toMatch(/loadTemplatePreview/);
        expect(WS).toMatch(/fetchCommunicationTemplateCurrentVersion/);
        expect(WS).toMatch(/loadTemplatePreview\(v, Boolean\(v\)\)/);
        expect(WS).toMatch(/loadTemplatePreview\(a\.template_id \?\? null, false\)/);
    });

    it("provides channel selection + the Audience Builder (grain + composable filters)", () => {
        expect(WS).toContain('data-announcement-channels="true"');
        expect(WS).toContain('data-announcement-targets="true"');
        expect(WS).toContain('data-audience-builder="true"');
        expect(WS).toContain('data-audience-grain="true"');
        expect(WS).toContain('data-filter-family-status="true"');
        expect(WS).toContain('data-filter-child-status="true"');
        expect(WS).toContain('data-target-location="true"');
        expect(WS).toContain('data-target-program="true"');
        expect(WS).toContain("Family status");
        expect(WS).toContain("Child status");
        expect(WS).toContain("Match children, send to guardians.");
        expect(WS).toContain("CommsAudienceMultiSelect");
        expect(WS).toContain("siteLocationOptionsFromHierarchy");
        expect(WS).not.toContain("/api/admin/location-options");
        expect(WS).toContain("useWorkspaceSiteFilter");
        expect(WS).toContain("roomAudienceBuilderState");
        // no fixed-bucket affordances any more
        expect(WS).not.toContain("data-target-group");
        expect(WS).not.toMatch(/type: "(all_families|active_families|waitlist)"/);
    });

    it("loads status options from the status-options endpoint (family + child)", () => {
        expect(WS).toContain("/api/admin/communications/status-options");
        expect(WS).toMatch(/grain=\$\{g\}/);
        expect(WS).toContain("loadStatusOptions");
    });

    it("enables room targeting when hierarchy options exist for one location + program", () => {
        expect(WS).toContain('data-target-room="true"');
        expect(WS).toContain("roomAudienceBuilderState");
        expect(WS).toMatch(/kind: "room"/);
    });

    it("saves the audience as ONE custom rule.audience_spec via the targets endpoint", () => {
        expect(WS).toMatch(/`\$\{ANNOUNCEMENTS_API\}\/\$\{id\}\/targets`/);
        expect(WS).toMatch(/method:\s*"PUT"/);
        expect(WS).toMatch(/target_type: "custom", rule: \{ audience_spec: buildAudienceSpec\(\) \}/);
        // no legacy typed-bucket writes
        expect(WS).not.toMatch(/target_type: t\.target_type/);
        expect(WS).not.toMatch(/announcement_recipients|recipient_snapshot/);
    });

    it("calls the recipient-preview endpoint (read-only) and renders counts + unresolved", () => {
        expect(WS).toContain('data-recipient-preview="true"');
        expect(WS).toContain('data-recipient-preview-run="true"');
        expect(WS).toContain("RECIPIENT_PREVIEW_API");
        expect(WS).toContain("/api/admin/communications/announcements/recipient-preview");
        expect(WS).toContain("previewRecipients");
        expect(WS).toContain('data-recipient-total="true"');
        expect(WS).toContain('data-recipient-unresolved="true"');
        expect(WS).not.toContain("Save the draft to preview recipients");
        expect(WS).not.toContain("Save the draft first");
        // preview is read-only — it must not write recipients or send
        expect(WS).not.toMatch(/announcement_recipients/);
    });

    it("shows announcement library first without auto-opening the editor", () => {
        expect(WS).not.toContain("didAutoOpenEditorRef");
        expect(WS).toContain("CommsLibraryListReserve");
        expect(WS).toContain("Select an announcement from the library");
        expect(WS).toContain("New Announcement");
        expect(WS).toContain("All Announcements");
        expect(WS).toContain("No Announcements");
        expect(WS).toContain("Draft and Scheduled Broadcasts");
    });

    it("only adds the preview endpoint to its API surface (still no send/scheduled APIs)", () => {
        const apis = [...WS.matchAll(/["'`](\/api\/[^"'`]+)["'`]/g)].map((m) => m[1]);
        const allowedPrefixes = [
            "/api/admin/communications/announcements",
            "/api/admin/communications/templates",
            "/api/admin/location-program-categories",
            "/api/admin/communications/status-options",
            "/api/admin/locations?hierarchy=1",
        ];
        for (const api of apis) {
            expect(allowedPrefixes.some((p) => api.startsWith(p)), `unexpected API: ${api}`).toBe(true);
        }
        expect(WS).toContain("/api/admin/communications/announcements/recipient-preview");
        expect(WS).not.toMatch(/executeCommunicationsSend|communication-scheduled-sends/);
    });
});
