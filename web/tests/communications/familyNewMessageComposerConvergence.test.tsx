/** @vitest-environment jsdom */

/**
 * Surface cleanup Item 1 — Current Work → Contact Family and Manage → Send Message on ONE composer
 * and ONE send lifecycle, with the Contact Family work consequence declared by the caller.
 *
 * Rendered through the real runtime (`useFamilyCommunicationRuntime`) with only the network faked,
 * so what is asserted is what the operator's click actually sends, not what a source file says.
 */

import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { FamilyCommunicationWorkspaceVM } from "@/lib/communications/v2/familyWorkspace/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/communications/v2/flags", () => ({
    isCommsV2FlagEnabled: (key: string) =>
        key === "comms_v2_live_workspace"
        || key === "comms_v2_record_tab"
        || key === "comms_v2_command_center",
}));

vi.mock("@/contexts/AdminAuthContext", () => ({
    useAdminAuthOptional: () => ({ userId: "user-1" }),
}));

import FamilyCommunicationWorkspace from "@/app/adminV2/communications/FamilyCommunicationWorkspace";
import { canHostRecordMessageInFamilyComposer } from "@/app/adminV2/communications/RecordMessageComposerModal";
import { emptyPreferenceProfile } from "@/lib/communications/v2/communicationPreferenceLabels";
import { parseFamilySendWorkConsequence } from "@/lib/communications/v2/familyWorkspace/familySendWorkConsequence";
import {
    resetDrawerFamilyWorkspacePrefetchCacheForTests,
    seedDrawerFamilyWorkspaceCacheForTests,
} from "@/lib/communications/v2/drawerFamilyWorkspacePrefetchCache";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const channelOk = {
    hasAddress: true,
    providerBound: true,
    available: true,
    unavailableReason: null,
    marketing: "unset" as const,
    transactional: "unset" as const,
    canSendTransactional: true,
    canSendMarketing: true,
};

const leigh = {
    id: "11111111-1111-4111-8111-111111111111",
    displayName: "Leigh Mygrant",
    roleType: "parent",
    roleLabel: "Parent",
    isPrimary: true,
    tier: "primary" as const,
    email: "leigh@example.com",
    phone: "+15551234567",
    channels: { email: channelOk, sms: channelOk },
};

const OPP = "22222222-2222-4222-8222-222222222222";
const CUSTOMER = "33333333-3333-4333-8333-333333333333";

function buildVm(): FamilyCommunicationWorkspaceVM {
    const profile = emptyPreferenceProfile();
    return {
        family: {
            id: CUSTOMER,
            label: "Mygrant Family",
            program: null,
            location: { id: null, label: null },
            stage: null,
            ownerUserId: null,
            ownerLabel: null,
            lifecycleStage: "lead",
        },
        children: [],
        recipientGroups: [{ tier: "primary", uiLabel: "Primary", recipients: [leigh] }],
        eligibleRecipients: [leigh],
        disabledRecipients: [],
        selectedRecipients: [leigh.id],
        consentSummary: {
            byContact: {},
            household: { email: "unset", sms: "unset", marketing: "unset" },
            preferenceProfile: profile,
            preferenceProfilesByContact: { [leigh.id]: profile },
            displayFlags: { email: true, sms: true, marketing: true },
        },
        composerDraft: {
            channel: "email",
            recipientContactIds: [leigh.id],
            subject: null,
            body: "",
            availableChannels: { email: true, sms: true, note: false, reasons: {} },
            consentBlockers: [],
        },
        scope: {
            level: "family",
            customerId: CUSTOMER,
            focusChildId: null,
            focusOpportunityId: OPP,
            focusPersonId: null,
        },
        threads: [],
        selectedThread: null,
        messages: [],
        timelineEvents: [],
        healthSummary: { status: "healthy", engagementScore: 80, responseRate: null, lastContactAt: null, unreadCount: 0 },
        relatedTasks: [],
    };
}

type Call = { url: string; body: Record<string, unknown> | null };
let calls: Call[] = [];

function installFetch(): void {
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
        const url = String(input);
        const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
        calls.push({ url, body });
        if (url.includes("/family-send")) {
            const confirm = body?.confirm === true;
            return new Response(
                JSON.stringify({
                    mode: confirm ? "sent" : "preflight",
                    results: [
                        {
                            person_id: leigh.id,
                            display_name: leigh.displayName,
                            status: confirm ? "sent" : "ready",
                            reason: null,
                            thread_id: confirm ? "44444444-4444-4444-8444-444444444444" : null,
                            communication_message_id: confirm ? "55555555-5555-4555-8555-555555555555" : null,
                        },
                    ],
                    summary: { requested: 1, ready: confirm ? 0 : 1, sent: confirm ? 1 : 0, blocked: 0, failed: 0 },
                }),
                { status: 200 },
            );
        }
        if (url.includes("/communications/templates?")) {
            return new Response(
                JSON.stringify({
                    templates: [
                        { id: "tpl-email", name: "Tour follow-up", channel: "email" },
                        { id: "tpl-sms", name: "SMS nudge", channel: "sms" },
                    ],
                }),
                { status: 200 },
            );
        }
        if (url.includes("/communications/templates/tpl-email")) {
            return new Response(
                JSON.stringify({ current_version: { subject: "Thanks for visiting", body: "It was lovely to meet you." } }),
                { status: 200 },
            );
        }
        if (url.includes("/family-workspace")) {
            return new Response(JSON.stringify({ workspace: buildVm() }), { status: 200 });
        }
        return new Response("{}", { status: 200 });
    });
}

let container: HTMLElement | null = null;
let root: Root | null = null;

function render(node: ReactNode): HTMLElement {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
        root!.render(node);
    });
    return container;
}

async function flush(times = 3): Promise<void> {
    for (let i = 0; i < times; i++) {
        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });
    }
}

async function click(el: Element | null): Promise<void> {
    expect(el).toBeTruthy();
    await act(async () => {
        (el as HTMLElement).click();
        await Promise.resolve();
    });
    await flush();
}

function familySendBodies(): Record<string, unknown>[] {
    return calls.filter((c) => c.url.includes("/family-send")).map((c) => c.body ?? {});
}

/** Preview, then Confirm send — the canonical review-first lifecycle. */
async function sendThroughConfirmation(el: HTMLElement): Promise<void> {
    await click(el.querySelector('[data-cc-send-button="true"]'));
    await click(document.querySelector('[data-cc-send-confirm-action="true"]'));
}

function renderComposer(props: Record<string, unknown> = {}): HTMLElement {
    return render(
        <FamilyCommunicationWorkspace
            entity={{ entityType: "opportunities", entityId: OPP }}
            surfaceVariant="activity_embed"
            composeIntent="new_message"
            draftSeed={{ channel: "email", subject: "Hello", body: "Checking in" }}
            {...props}
        />,
    );
}

describe("Item 1 — shared New Message composer presentation", () => {
    beforeEach(() => {
        resetDrawerFamilyWorkspacePrefetchCacheForTests();
        seedDrawerFamilyWorkspaceCacheForTests({ entityType: "opportunities", entityId: OPP, composerChannel: "email" }, buildVm());
        fetchMock.mockReset();
        calls = [];
        installFetch();
    });

    afterEach(() => {
        act(() => {
            root?.unmount();
        });
        container?.remove();
        container = null;
        root = null;
        document.body.innerHTML = "";
        resetDrawerFamilyWorkspacePrefetchCacheForTests();
    });

    it("puts Email | SMS in the header row with + New, and drops the New Message title", async () => {
        const el = renderComposer();
        await flush();
        const header = el.querySelector("[data-cc-thread-header]");
        expect(header?.querySelector("[data-cc-composer-channels]")).toBeTruthy();
        expect(header?.querySelector("[data-cc-new-message]")).toBeTruthy();
        expect(header?.textContent).not.toContain("New Message");
        // Exactly one channel strip — it moved, it was not duplicated.
        expect(el.querySelectorAll("[data-cc-composer-channels]").length).toBe(1);
    });

    it("switching to SMS still works from the header", async () => {
        const el = renderComposer();
        await flush();
        await click(el.querySelector('[data-cc-thread-header] [data-cc-workspace-mode="sms"]'));
        expect(el.querySelector('[data-cc-workspace-mode="sms"]')?.getAttribute("aria-pressed")).toBe("true");
        expect(el.querySelector('textarea[aria-label="Message body"]')).toBeTruthy();
        // SMS has no CC/BCC.
        expect(el.querySelector("[data-cc-toggle-cc-bcc]")).toBeNull();
    });

    it("To row carries the recipient (as its preference affordance), + Add and + CC/BCC — no Preferences row", async () => {
        const el = renderComposer();
        await flush();
        const toRow = el.querySelector("[data-cc-recipient-to-row]");
        expect(toRow).toBeTruthy();
        expect(toRow?.querySelector(`[data-cc-recipient-preference-trigger="${leigh.id}"]`)?.textContent).toContain("Leigh Mygrant");
        expect(toRow?.querySelector("[data-cc-recipient-compact-trigger]")).toBeTruthy();
        expect(toRow?.querySelector("[data-cc-toggle-cc-bcc]")).toBeTruthy();
        expect(el.querySelector("[data-cc-recipient-preferences-row]")).toBeNull();
        expect(el.textContent).not.toContain("Add another email");

        // Clicking the name reveals THAT person's preferences.
        await click(toRow!.querySelector(`[data-cc-recipient-preference-trigger="${leigh.id}"]`));
        const panel = el.querySelector(`[data-cc-recipient-preference-panel="${leigh.id}"]`);
        expect(panel?.textContent).toContain("Communication preferences");
        expect(panel?.textContent).toContain("Leigh Mygrant");
    });

    it("CC/BCC stays hidden until invoked, then accepts addresses", async () => {
        const el = renderComposer();
        await flush();
        expect(el.querySelector("[data-cc-cc-bcc-fields]")).toBeNull();
        expect(el.querySelector('input[aria-label="CC email"]')).toBeNull();
        await click(el.querySelector("[data-cc-toggle-cc-bcc]"));
        const cc = el.querySelector('input[aria-label="CC email"]') as HTMLInputElement;
        expect(cc).toBeTruthy();
        expect(el.querySelector('input[aria-label="BCC email"]')).toBeTruthy();
    });

    it("+ Add opens the recipient picker; removing and re-adding a recipient works", async () => {
        const el = renderComposer();
        await flush();
        await click(el.querySelector(`[data-cc-recipient-remove="${leigh.id}"]`));
        expect(el.querySelector(`[data-cc-recipient-pill="${leigh.id}"]`)).toBeNull();
        await click(el.querySelector("[data-cc-recipient-compact-trigger]"));
        const popover = el.querySelector("[data-cc-recipient-popover]");
        expect(popover).toBeTruthy();
        expect(popover?.querySelector('input[aria-label="Manual recipient email"]')).toBeTruthy();
        await click(popover!.querySelector(`[data-cc-recipient="${leigh.id}"]`));
        expect(el.querySelector(`[data-cc-recipient-pill="${leigh.id}"]`)).toBeTruthy();
    });

    it("Template ▾ in the toolbar copies the current version into an editable subject/body", async () => {
        const el = renderComposer({ draftSeed: { channel: "email" } });
        await flush();
        await click(el.querySelector('[data-cc-template-trigger="true"]'));
        await flush();
        // Channel-scoped list: the SMS template is not offered while composing email.
        expect(el.querySelector('[data-cc-template-option="tpl-sms"]')).toBeNull();
        await click(el.querySelector('[data-cc-template-option="tpl-email"]'));
        await flush();
        const subject = el.querySelector('[data-cc-subject-input="true"]') as HTMLInputElement;
        expect(subject.value).toBe("Thanks for visiting");
        expect(el.querySelector('[data-cc-email-composer="true"]')?.textContent).toContain("It was lovely to meet you.");
        expect(calls.some((c) => c.url.endsWith("/api/admin/communications/templates/tpl-email"))).toBe(true);
        // Still editable after apply — it is a copy, not a link.
        await act(async () => {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
            setter.call(subject, "Edited subject");
            subject.dispatchEvent(new Event("input", { bubbles: true }));
        });
        expect((el.querySelector('[data-cc-subject-input="true"]') as HTMLInputElement).value).toBe("Edited subject");
        // Applying a template sends nothing.
        expect(familySendBodies()).toHaveLength(0);
    });

    it("keeps Send, Send later and BOS in the footer", async () => {
        const el = renderComposer();
        await flush();
        const footer = el.querySelector("[data-cc-composer-footer]");
        expect(footer?.querySelector('[data-cc-send-button="true"]')).toBeTruthy();
        expect(footer?.querySelector('[aria-label="Send later"]')).toBeTruthy();
        expect(footer?.querySelector('[data-bos-assist-button="true"]')).toBeTruthy();
    });
});

describe("Item 1 — one send lifecycle, caller-declared work consequence", () => {
    beforeEach(() => {
        resetDrawerFamilyWorkspacePrefetchCacheForTests();
        seedDrawerFamilyWorkspaceCacheForTests({ entityType: "opportunities", entityId: OPP, composerChannel: "email" }, buildVm());
        fetchMock.mockReset();
        calls = [];
        installFetch();
    });

    afterEach(() => {
        act(() => {
            root?.unmount();
        });
        container?.remove();
        container = null;
        root = null;
        document.body.innerHTML = "";
        resetDrawerFamilyWorkspacePrefetchCacheForTests();
    });

    it("Current Work declares contact_family_work on preview and confirm through family-send", async () => {
        const el = renderComposer({ entryContext: "current_work", workConsequence: "contact_family_work" });
        await flush();
        await sendThroughConfirmation(el);
        const bodies = familySendBodies();
        expect(bodies.map((b) => b.confirm)).toEqual([false, true]);
        for (const b of bodies) {
            expect(b.work_consequence).toBe("contact_family_work");
            expect(b.opportunity_id).toBe(OPP);
            expect(b.recipient_person_ids).toEqual([leigh.id]);
        }
    });

    it("Manage → Send Message sends through the same route and declares NO work consequence", async () => {
        const onSendAcknowledged = vi.fn();
        const el = renderComposer({ onSendAcknowledged });
        await flush();
        await sendThroughConfirmation(el);
        const bodies = familySendBodies();
        expect(bodies.map((b) => b.confirm)).toEqual([false, true]);
        for (const b of bodies) {
            expect("work_consequence" in b).toBe(false);
            expect(b.opportunity_id).toBe(OPP);
        }
        // No QuickMessage lifecycle: nothing went to /communications/send.
        expect(calls.some((c) => /\/api\/admin\/communications\/send$/.test(c.url))).toBe(false);
        // Done on the success acknowledgement hands control back to the host (modal closes).
        await flush(6);
        expect(document.querySelector('[data-cc-send-confirm-dialog="true"]')?.getAttribute("data-cc-send-confirm-phase")).toBe("success");
        await click(document.querySelector('[data-cc-send-done="true"]'));
        expect(onSendAcknowledged).toHaveBeenCalledTimes(1);
    });

    it("a prepared Tour invitation is activated after a confirmed send from a non-Current-Work host", async () => {
        const el = renderComposer({
            draftSeed: { channel: "email", subject: "Tour", body: "Book here", tourInvitationId: "inv-1" },
        });
        await flush();
        await sendThroughConfirmation(el);
        const marks = calls.filter(
            (c) => c.url.includes("/api/admin/actions/execute") && (c.body?.payload as { mode?: string })?.mode === "mark_sent",
        );
        expect(marks).toHaveLength(1);
        expect(marks[0]!.body).toMatchObject({
            action_key: "send_tour_invitation",
            entity_id: OPP,
            payload: { invitation_id: "inv-1", channel: "email" },
        });
        // The mark follows the CONFIRMED send, never the preview.
        const confirmIdx = calls.findIndex((c) => c.url.includes("/family-send") && c.body?.confirm === true);
        expect(calls.indexOf(marks[0]!)).toBeGreaterThan(confirmIdx);
    });

    it("no Tour mark without a prepared invitation", async () => {
        const el = renderComposer();
        await flush();
        await sendThroughConfirmation(el);
        expect(calls.some((c) => c.url.includes("/api/admin/actions/execute"))).toBe(false);
    });
});

describe("Item 1 — explicit contract", () => {
    it("parses only the declared consequence; everything else is no consequence", () => {
        expect(parseFamilySendWorkConsequence("contact_family_work")).toBe("contact_family_work");
        expect(parseFamilySendWorkConsequence(" contact_family_work ")).toBe("contact_family_work");
        for (const raw of [undefined, null, "", "true", true, 1, "complete", "contact_family"]) {
            expect(parseFamilySendWorkConsequence(raw)).toBeNull();
        }
    });

    it("family-send associates Contact Family work only when the consequence is declared", () => {
        const route = readFileSync(join(process.cwd(), "app/api/admin/communications/family-send/route.ts"), "utf8");
        const gate = route.slice(0, route.indexOf("await associateOutboundCommunicationToContactAttempt("));
        const condition = gate.slice(gate.lastIndexOf("if ("));
        expect(condition).toContain('workConsequence === "contact_family_work"');
        expect(condition).toContain("confirm &&");
        expect(condition).toContain("result.summary.sent > 0");
    });

    it("only the Current Work host declares the consequence; the Manage host does not", () => {
        const panel = readFileSync(join(process.cwd(), "components/admin/focusPanel/cards/CurrentWorkActionPanel.tsx"), "utf8");
        const modal = readFileSync(join(process.cwd(), "app/adminV2/communications/RecordMessageComposerModal.tsx"), "utf8");
        expect(panel).toContain('workConsequence="contact_family_work"');
        expect(panel).toContain("<FamilyNewMessageComposer");
        expect(modal).toContain("<FamilyNewMessageComposer");
        expect(modal).not.toMatch(/workConsequence=/);
    });

    it("record-scoped opportunity launches are hosted by the family composer; person-only launches are not", () => {
        expect(canHostRecordMessageInFamilyComposer({ recordScoped: true, opportunityId: OPP })).toBe(true);
        expect(canHostRecordMessageInFamilyComposer({ recordScoped: true, opportunityId: OPP, personId: leigh.id })).toBe(true);
        // The contextual launcher puts the person id in `opportunityId` when there is no opportunity.
        expect(canHostRecordMessageInFamilyComposer({ recordScoped: true, opportunityId: leigh.id, personId: leigh.id })).toBe(false);
        expect(canHostRecordMessageInFamilyComposer({ recordScoped: false, opportunityId: OPP })).toBe(false);
        expect(canHostRecordMessageInFamilyComposer(null)).toBe(false);
        const nav = readFileSync(join(process.cwd(), "app/adminV2/components/TopNavBar.tsx"), "utf8");
        expect(nav).toContain("canHostRecordMessageInFamilyComposer(quickMessageSeed)");
        expect(nav).toContain("<RecordMessageComposerModal");
    });
});
