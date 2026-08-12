/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    appendUrlToComposerDraft,
    composerMarkupToPlainText,
    plainComposerTextToEditableHtml,
} from "@/lib/communications/v2/familyWorkspace/composerBodyMarkup";
import { resolveComposerInsertCapabilities } from "@/lib/communications/v2/familyWorkspace/composerInsertCapabilities";
import { tourInvitationDraftFromDetail } from "@/lib/tours/tourInvitationPrepareWarmCache";

const root = process.cwd();

function read(rel: string): string {
    return readFileSync(join(root, rel), "utf8");
}

describe("Tour invitation draft — visible body is send body", () => {
    it("prepare detail always places invitationActionUrl into email and SMS bodies", () => {
        const draft = tourInvitationDraftFromDetail({
            invitation_id: "inv-1",
            draft: {
                emailSubject: "Come tour",
                emailBody: "Hello Kelly,\n\nWe'd love to show you around.",
                smsBody: "Tour invite:",
                invitationActionUrl: "https://example.test/a/FreshLink1",
                recipientPersonId: "p1",
            },
        });
        expect(draft?.emailBody).toContain("https://example.test/a/FreshLink1");
        expect(draft?.smsBody).toContain("https://example.test/a/FreshLink1");
        expect(draft?.emailSubject).toBe("Come tour");
    });

    it("Send Tour Invitation seed requires a provisioned URL before composer ready", () => {
        const hook = read("lib/tours/useTourInvitationComposeSeed.ts");
        expect(hook).toContain("provisionTourInvitationPrepare");
        expect(hook).toContain("invitationActionUrl");
        expect(hook).toMatch(/!prepared\?\.invitationId \|\| !prepared\.invitationActionUrl/);
        expect(hook).toContain("seedFromPrepared");
    });

    it("email contentEditable syncs bodyDraft so Tour seed is visible", () => {
        const view = read("app/adminV2/communications/FamilyCommunicationWorkspaceView.tsx");
        expect(view).toContain("plainComposerTextToEditableHtml");
        expect(view).toContain("useLayoutEffect");
        expect(view).toMatch(/currentPlain === targetPlain/);
    });

    it("plainComposerTextToEditableHtml preserves URL text for the operator", () => {
        const html = plainComposerTextToEditableHtml(
            "Hello Kelly,\n\nChoose a time:\nhttps://example.test/a/AbCdEfGh",
        );
        expect(html).toContain("https://example.test/a/AbCdEfGh");
        expect(composerMarkupToPlainText(html)).toContain("https://example.test/a/AbCdEfGh");
    });
});

describe("Insert ▾ Tour Invitation Link — shared provisioning", () => {
    it("resolves Tour insert only for opportunity-scoped composers", () => {
        expect(resolveComposerInsertCapabilities({ opportunityId: null })).toEqual([]);
        expect(resolveComposerInsertCapabilities({ opportunityId: "opp-1" })).toEqual([
            { key: "tour_invitation_link", label: "Tour Invitation Link" },
        ]);
        expect(
            resolveComposerInsertCapabilities({
                opportunityId: "opp-1",
                tourInvitationEligible: false,
            }),
        ).toEqual([]);
    });

    it("appendUrlToComposerDraft does not duplicate and does not send", () => {
        const once = appendUrlToComposerDraft("Hello", "https://example.test/a/1");
        expect(once).toBe("Hello\n\nhttps://example.test/a/1");
        expect(appendUrlToComposerDraft(once, "https://example.test/a/1")).toBe(once);
    });

    it("runtime Insert path uses forceFresh provisionTourInvitationPrepare", () => {
        const runtime = read("lib/communications/v2/familyWorkspace/useFamilyCommunicationRuntime.ts");
        expect(runtime).toContain("insertTourInvitationLink");
        expect(runtime).toContain("provisionTourInvitationPrepare");
        expect(runtime).toContain("forceFresh: true");
        expect(runtime).toContain("appendUrlToComposerDraft");
        // Insert must not call family-send.
        const insertFn = runtime.slice(runtime.indexOf("insertTourInvitationLink"));
        expect(insertFn.slice(0, 900)).not.toContain("family-send");
        // Send posts the visible bodyDraft (what the operator sees).
        expect(runtime).toMatch(/body:\s*bodyDraft/);
        // Do not wipe Insert-set invitation ids on every render from a null draftSeed.
        expect(runtime).not.toMatch(
            /tourInvitationIdRef\.current\s*=\s*draftSeed\?\.tourInvitationId\?\.trim\(\)\s*\|\|\s*null;/,
        );
        expect(runtime).toContain("tourInvitationIdRef.current = seed?.tourInvitationId?.trim() || null");
    });

    it("generic Message host does not auto-seed Tour draft", () => {
        const panel = read("components/admin/focusPanel/cards/CurrentWorkActionPanel.tsx");
        // Tour host uses seed; generic New Message host only gets draftSeed when Tour prepares it.
        expect(panel).toContain("CurrentWorkTourInvitationComposerHost");
        expect(panel).toContain("useTourInvitationComposeSeed");
        expect(panel).toMatch(/CurrentWorkNewMessageComposerHost[\s\S]*draftSeed=\{draftSeed \?\? null\}/);
        // Message / send_message path mounts host without seed hook.
        expect(panel).toContain('composeIntent="new_message"');
    });

    it("warm cache exports one shared provisionTourInvitationPrepare authority", () => {
        const cache = read("lib/tours/tourInvitationPrepareWarmCache.ts");
        expect(cache).toContain("export async function provisionTourInvitationPrepare");
        expect(cache).toContain('action_key: "send_tour_invitation"');
        expect(cache).toContain('mode: "prepare"');
    });

    it("toolbar exposes Insert menu wired to insert capabilities", () => {
        const view = read("app/adminV2/communications/FamilyCommunicationWorkspaceView.tsx");
        expect(view).toContain("resolveComposerInsertCapabilities");
        expect(view).toContain('data-cc-insert-trigger="true"');
        expect(view).toContain("Tour Invitation Link");
        expect(view).toContain("onInsertTourInvitationLink");
    });
});
