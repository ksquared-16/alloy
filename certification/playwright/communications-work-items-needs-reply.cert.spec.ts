/**
 * Work Items H2 — the SAFE Communications scenario, certified through Communications.
 *
 * This file proves the scenario in `communicationsNeedsReplyScenario.ts` is worth
 * handing to the Work Items lane: that it produces actionable state the way the
 * product produces it, that the state is the Communications runtime's and not this
 * spec's, and that it converges back the way an operator would converge it.
 *
 * The one claim every assertion here rests on: NOTHING in this file writes
 * `attention_state`. It is written by step 7 of `ingestResendInboundEmail` on the way
 * in, and by the operator triage route on the way out. If the runtime stopped
 * producing Needs Reply, every projection assertion below would fail rather than
 * quietly certify a value a fixture had planted.
 *
 * Safety is covered in the scenario module's header — synthetic seeded identity,
 * `.invalid` on both ends, a credential that cannot reach a provider, and an inbound
 * path that transmits nothing. Work Items finalizes its own H2 convergence; what this
 * establishes is that it now has a scenario it is allowed to use.
 */
import { expect, test } from "@playwright/test";

import {
    armNeedsReply,
    cleanupScenario,
    conversationFromAuthority,
    markThreadRead,
    messagesOn,
    operationalTaskIds,
    resolveThroughTriage,
    CERT_QA_SENDER,
    COMMUNICATIONS_WORK_ITEM_PREFIX,
} from "./communicationsNeedsReplyScenario";

type Page = import("@playwright/test").Page;

const WORKSPACE = "/workspace";
const INBOX_NAV = '[data-adminv2-sidebar-modal-nav="inbox"]';
const TASKS_NAV = '[data-adminv2-sidebar-modal-nav="tasks"]';
const SETTLE = 120_000;

/**
 * Both workspace modals open on Overview. The queue and the conversation list live one
 * section tab in, so the tab click is part of reaching the surface — not a settling
 * allowance. Sections are addressed by their ARIA role: the sub-tab component renders
 * `role="tab"` with the visible label, and the `data-comms-tab` attribute other
 * Communications specs still select on is no longer in the rendered DOM.
 */
async function openWorkItems(page: Page) {
    await page.goto(WORKSPACE);
    await page.waitForLoadState("domcontentloaded");
    const nav = page.locator(TASKS_NAV);
    await expect(nav).toBeVisible({ timeout: 180_000 });
    await nav.first().click();
    const queue = page.getByRole("tab", { name: "Queue", exact: true });
    await expect(queue).toBeVisible({ timeout: SETTLE });
    await queue.click();
    await expect(page.locator('[data-adminv2-tasks-panel="true"]').first()).toBeVisible({ timeout: SETTLE });
}

async function openCommunications(page: Page) {
    await page.goto(WORKSPACE);
    await page.waitForLoadState("domcontentloaded");
    const nav = page.locator(INBOX_NAV);
    await expect(nav).toBeVisible({ timeout: 180_000 });
    await nav.first().click();
    const tab = page.getByRole("tab", { name: "Inbox", exact: true });
    await expect(tab).toBeVisible({ timeout: SETTLE });
    await tab.click();
    await expect(page.locator('[data-comms-tab-panel="inbox"] [data-cc-shell]')).toBeVisible({ timeout: SETTLE });
}

test.describe("H2 scenario — authoritative actionable state", () => {
    test("H2-1 the Communications runtime, not the fixture, produces Needs Reply", async ({ page }) => {
        const scenario = await armNeedsReply(page);

        const conversation = await conversationFromAuthority(page, scenario.threadId);
        expect(conversation, "the delivered conversation is visible to the Communications authority").toBeTruthy();
        // Written by ingestion. This spec has issued no update of any kind.
        expect(conversation!.attention_state).toBe("needs_response");
        expect(conversation!.channel).toBe("email");
        expect(String(conversation!.recipient_key ?? "")).toBe(CERT_QA_SENDER);

        // The message is canonical history, not a staged row.
        const inbound = (await messagesOn(page, scenario.threadId)).filter(
            (m) => String(m.direction ?? "") === "inbound",
        );
        expect(inbound.some((m) => String(m.body ?? "").includes(scenario.marker))).toBe(true);

        await cleanupScenario(page, scenario.threadId);
    });

    test("H2-2 re-arming is repeatable and stays one conversation", async ({ page }) => {
        // Repeatability is a REQUIREMENT of this scenario, so it is certified rather than
        // asserted in a comment. Two armings, two distinct provider messages, one thread —
        // and the second re-arms a conversation the first had resolved.
        const first = await armNeedsReply(page);
        await resolveThroughTriage(page, first.threadId);
        expect((await conversationFromAuthority(page, first.threadId))!.attention_state).toBe("resolved");

        const second = await armNeedsReply(page);
        expect(second.threadId).toBe(first.threadId);
        expect(second.emailId).not.toBe(first.emailId);
        expect((await conversationFromAuthority(page, second.threadId))!.attention_state).toBe("needs_response");

        await cleanupScenario(page, second.threadId);
    });

    test("H2-3 the Work Items row is virtual — no operational_tasks row is created", async ({ page }) => {
        const before = await operationalTaskIds(page);
        const scenario = await armNeedsReply(page);
        const after = await operationalTaskIds(page);

        // The projected id must never appear in the DATABASE-backed task list...
        expect(after).not.toContain(scenario.workItemId);
        expect(after.some((id) => id.startsWith(COMMUNICATIONS_WORK_ITEM_PREFIX))).toBe(false);
        // ...and delivering a message must not have created an operational task at all.
        expect(after.length).toBe(before.length);

        await cleanupScenario(page, scenario.threadId);
    });
});

test.describe("H2 scenario — Unread is not Needs Reply", () => {
    test("H2-4 reading the message clears unread and leaves the actionable state standing", async ({ page }) => {
        const scenario = await armNeedsReply(page);

        const unread = await conversationFromAuthority(page, scenario.threadId);
        expect(Number(unread!.unread ?? unread!.unread_count ?? 0)).toBeGreaterThan(0);

        await markThreadRead(page, scenario.threadId);

        const read = await conversationFromAuthority(page, scenario.threadId);
        expect(Number(read!.unread ?? read!.unread_count ?? 0)).toBe(0);
        // The work did not go away because somebody looked at it. This is the half of
        // "Unread != Needs Reply" that protects the operator.
        expect(read!.attention_state).toBe("needs_response");

        await cleanupScenario(page, scenario.threadId);
    });

    test("H2-5 a resolved conversation is not actionable even while it is unread", async ({ page }) => {
        const scenario = await armNeedsReply(page);
        await resolveThroughTriage(page, scenario.threadId);

        const conversation = await conversationFromAuthority(page, scenario.threadId);
        // Never read, still unread — and correctly not work. This is the half that keeps
        // Work Items from becoming a second inbox.
        expect(Number(conversation!.unread ?? conversation!.unread_count ?? 0)).toBeGreaterThan(0);
        expect(conversation!.attention_state).toBe("resolved");
    });
});

test.describe("H2 scenario — projection, navigation, convergence", () => {
    test("H2-6 the scenario projects into Work Items and converges when resolved", async ({ page }) => {
        const scenario = await armNeedsReply(page);

        await openWorkItems(page);
        // The Unassigned view, not the default Mine.
        //
        // A projected conversation carries the Communications assignee, and an inbound
        // message from a family is assigned to nobody — so `filterTasksByView` correctly
        // excludes it from Mine. Certifying against the default view would have asserted
        // the projection was broken when the truthful answer is that nobody owns this work
        // yet. Work Items H2 needs to know this: the convergence is observable in
        // Unassigned (and in the Communications source facet), not in Mine.
        await page.locator('[data-work-items-view="unassigned"]').first().click();

        const row = page.locator(`[data-workspace-queue-row-id="${scenario.workItemId}"]`);
        await expect(row.first(), "the actionable conversation projects as a Work Item").toBeVisible({
            timeout: SETTLE,
        });

        // Authoritative resolution, through the operator route the Resolved control posts to.
        await resolveThroughTriage(page, scenario.threadId);

        // Operational refresh: the projection is derived from the Communications warm cache,
        // so convergence is observed after that cache is reloaded — the same way the product
        // observes it, not by waiting for an interval.
        await openWorkItems(page);
        await page.locator('[data-work-items-view="unassigned"]').first().click();
        await expect(page.locator(`[data-workspace-queue-row-id="${scenario.workItemId}"]`)).toHaveCount(0, {
            timeout: SETTLE,
        });
    });

    test("H2-7 Open Conversation reaches the exact thread, and the reply lands on it", async ({ page }) => {
        const scenario = await armNeedsReply(page);

        await openCommunications(page);
        const conversationRow = page.locator(`[data-cc-conversation="${scenario.threadId}"]`);
        await expect(conversationRow.first()).toBeVisible({ timeout: SETTLE });
        await conversationRow.first().click();

        // Exact-thread proof: the arming marker exists on this conversation and nowhere
        // else in the tenant, so rendering it is proof of WHICH thread is open — stronger
        // than a selected-row class, which would pass for a neighbouring conversation.
        const workspace = page.locator('[data-cc-column="workspace"]');
        await expect(workspace).toContainText(scenario.marker, { timeout: SETTLE });

        // The actionable conversation offers the Work Items cross-link — the navigation
        // seam Work Items H2 arrives through, proven from the Communications side.
        await expect(workspace.locator('[data-work-items-cross-link="view-in-queue"]')).toBeVisible({
            timeout: SETTLE,
        });

        // Authoritative reply, sent through the operator composer to the synthetic
        // `.invalid` sender. The certification credential cannot reach a provider.
        //
        // The reply composer is COLLAPSED on an existing conversation — an operator opens
        // it deliberately. Expanding it is part of the operator path, not a test workaround.
        const replyBody = `Certification reply ${scenario.marker}`;
        await workspace.locator("[data-cc-reply-expand]").first().click();
        // Email composes in a rich-text box, not a textarea.
        const composer = workspace.getByRole("textbox", { name: "Message body" }).first();
        await expect(composer).toBeVisible({ timeout: SETTLE });
        await composer.fill(replyBody);
        // The send control enables once the composer has a body AND the thread's recipient
        // has resolved. Clicking before that is a click on a disabled button, which
        // Playwright performs happily and which sends nothing.
        const send = workspace.locator('[data-cc-send-button="true"]').first();
        await expect(send).toBeEnabled({ timeout: SETTLE });
        await send.click();

        // Sending is TWO steps. "Send reply" runs a preflight — it resolves the recipients
        // and reports who is ready, and sends nothing (`mode: "preflight"`, `sent: 0`). The
        // message leaves only on the operator's confirmation. A certification that clicked
        // once and then asserted an outbound message would be asserting against a send that
        // the product deliberately had not performed yet.
        const confirmDialog = page.locator('[data-cc-send-confirm-dialog="true"]');
        await expect(confirmDialog).toBeVisible({ timeout: SETTLE });
        await expect(confirmDialog).toHaveAttribute("data-cc-send-confirm-phase", "preflight");
        await expect(confirmDialog).toContainText("Gray Testfamily-0007");
        await confirmDialog.locator('[data-cc-send-confirm-action="true"]').first().click();
        await expect(confirmDialog.locator('[data-cc-send-success="true"]')).toBeVisible({ timeout: SETTLE });

        await expect
            .poll(
                async () => {
                    const outbound = (await messagesOn(page, scenario.threadId)).filter(
                        (m) => String(m.direction ?? "") === "outbound",
                    );
                    return outbound.some((m) => String(m.body ?? "").includes(replyBody));
                },
                { timeout: SETTLE },
            )
            .toBe(true);

        // STATED PLAINLY, because the H2 chain depends on knowing it: sending a reply does
        // NOT clear `attention_state`. `canonicalSend` never touches the column. The
        // conversation leaves the Work Items queue when an operator RESOLVES it, and a
        // convergence certification that expects the reply alone to converge would be
        // certifying behaviour this platform does not have.
        expect((await conversationFromAuthority(page, scenario.threadId))!.attention_state).toBe("needs_response");

        await resolveThroughTriage(page, scenario.threadId);
        expect((await conversationFromAuthority(page, scenario.threadId))!.attention_state).toBe("resolved");
    });
});
