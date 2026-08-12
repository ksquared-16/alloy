/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    resolveFamilyComposeIntent,
    type FamilyComposeDraftSeed,
} from "@/lib/communications/v2/familyWorkspace/familyComposeIntent";

const root = process.cwd();

function read(rel: string): string {
    return readFileSync(join(root, rel), "utf8");
}

describe("family compose intent — New Message vs browse", () => {
    it("defaults browse and resolves new_message", () => {
        expect(resolveFamilyComposeIntent(null)).toBe("browse");
        expect(resolveFamilyComposeIntent(undefined)).toBe("browse");
        expect(resolveFamilyComposeIntent("browse")).toBe("browse");
        expect(resolveFamilyComposeIntent("new_message")).toBe("new_message");
    });

    it("Current Work communication commands force New Message compose intent", () => {
        const panel = read("components/admin/focusPanel/cards/CurrentWorkActionPanel.tsx");
        expect(panel).toContain('composeIntent="new_message"');
        expect(panel).toContain("CurrentWorkNewMessageComposerHost");
        expect(panel).toContain("useTourInvitationComposeSeed");
        expect(panel).toContain("CommunicationsDrawerSection");
        // Tour no longer mounts a forked composer panel.
        expect(panel).not.toContain("CurrentWorkTourInvitationPanel");
    });

    it("runtime skips Activity auto-select when composeIntent is new_message", () => {
        const runtime = read("lib/communications/v2/familyWorkspace/useFamilyCommunicationRuntime.ts");
        expect(runtime).toContain("forceNewMessage");
        expect(runtime).toMatch(/if \(forceNewMessage\) return;/);
        expect(runtime).toContain("composeIntent");
        expect(runtime).toContain("draftSeed");
        expect(runtime).toContain('mode: "mark_sent"');
    });

    it("Tour draft seed carries invitation URL fields into composer seed shape", () => {
        const seed: FamilyComposeDraftSeed = {
            subject: "You're invited to tour",
            body: "Book here: https://example.test/a/AbCdEfGh",
            smsBody: "Tour: https://example.test/a/AbCdEfGh",
            channel: "email",
            recipientPersonIds: ["person-1"],
            tourInvitationId: "inv-1",
        };
        expect(seed.body).toMatch(/\/a\/[A-Za-z0-9]+/);
        expect(seed.tourInvitationId).toBe("inv-1");
        const hook = read("lib/tours/useTourInvitationComposeSeed.ts");
        expect(hook).toContain("seedFromPrepared");
        expect(hook).toContain("tourInvitationId");
        expect(hook).toContain("invitationActionUrl");
        expect(hook).toContain("provisionTourInvitationPrepare");
    });

    it("Activity embed still bootstraps first thread when browsing (not forced New Message)", () => {
        const runtime = read("lib/communications/v2/familyWorkspace/useFamilyCommunicationRuntime.ts");
        expect(runtime).toMatch(/activityEmbedBootstrappedRef/);
        expect(runtime).toMatch(/vm\.threads\.find\(\(t\) => t\.messageCount > 0\)/);
        // Activity path does not pass composeIntent=new_message from the Activity cockpit.
        const embedded = read("components/admin/focusPanel/OpportunityFocusPanelEmbeddedWorkspace.tsx");
        expect(embedded).toContain('surfaceVariant="activity_embed"');
        expect(embedded).not.toContain('composeIntent="new_message"');
    });

    it("prop chain carries composeIntent and draftSeed to family runtime", () => {
        const drawer = read("components/admin/communications/CommunicationsDrawerSection.tsx");
        const tab = read("app/adminV2/communications/recordTab/RecordCommunicationsTab.tsx");
        const workspace = read("app/adminV2/communications/FamilyCommunicationWorkspace.tsx");
        expect(drawer).toContain("composeIntent={props.composeIntent}");
        expect(drawer).toContain("draftSeed={props.draftSeed}");
        expect(tab).toContain("composeIntent={props.composeIntent}");
        expect(tab).toContain("draftSeed={props.draftSeed}");
        expect(workspace).toContain("composeIntent?: FamilyComposeIntent");
        expect(workspace).toContain("draftSeed?: FamilyComposeDraftSeed");
        expect(workspace).toContain('data-cc-compose-intent=');
    });

    it("Current Work workspace reset keys off Attention subject, not resolved drawerId", () => {
        const grid = read("components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx");
        expect(grid).toContain("attentionSubjectId");
        expect(grid).toContain("prevAttentionSubjectIdRef");
        expect(grid).toMatch(/if \(prev == null \|\| prev === attentionSubjectId\) return/);
        // Must not reset workspace when family opportunity id resolves after child Attention.
        expect(grid).not.toMatch(/setCurrentWorkWorkspace\(\{ open: false, intent: null \}\);\s*\}, \[drawerId\]\)/);
    });
});
