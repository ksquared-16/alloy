/**
 * Review verification — captures the four Kelly-feedback fixes against real authenticated data:
 * equal action buttons, owner-heading nav, composer footer (Send later / BOS Assist), and the
 * instant (warm, loader-free) Schedule tour. Writes screenshots + a small proof JSON.
 */
import * as fs from "fs";
import * as path from "path";
import { test, expect } from "@playwright/test";

const OUT = path.join(__dirname, "../../../docs/sprints/active/assets/whats-next-review");

test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

test("whats-next review — buttons, owner nav, composer footer, instant tour", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.addInitScript(() => {
        (window as unknown as { __ALLOY_WN_DEBUG?: boolean }).__ALLOY_WN_DEBUG = true;
    });

    const proof: Record<string, unknown> = {};

    await page.goto("/adminV2/workspace", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    const entry = await page.$('a[href*="/work-unit/"]');
    if (entry) await entry.click({ timeout: 15_000 }).catch(() => {});

    const card = page.locator('[data-work-card="true"]').first();
    await card.waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(3500); // settle + warm-on-intent fires

    // 1) Summary card — equal buttons + owner-heading nav, no "Open X →", no stacked "View details".
    const cardHtml = (await card.innerHTML().catch(() => "")) as string;
    proof.hasOwnerLink = cardHtml.includes("readiness-owner--link");
    proof.hasOldOpenChildrenAffordance = /Open \w+ →/.test(cardHtml);
    proof.viewDetailsInFooter = cardHtml.includes("open-focused");
    const actionButtons = await card.locator('[data-work-primary-row] > button, [data-work-focused-actions] > button').all();
    const widths: number[] = [];
    for (const b of actionButtons) {
        const box = await b.boundingBox().catch(() => null);
        if (box) widths.push(Math.round(box.width));
    }
    proof.actionButtonWidths = widths;
    proof.actionButtonsEqual = widths.length > 1 ? Math.max(...widths) - Math.min(...widths) <= 2 : null;
    const summaryLabels = (await card.locator('[data-work-primary-row] > button').allInnerTexts()).map((t) => t.trim());
    proof.summaryButtons = summaryLabels;
    await card.screenshot({ path: path.join(OUT, "1-summary-card.png") }).catch(() => {});

    // 1b) "View details" (focused surface) — the action buttons MUST match the summary.
    const viewDetails = card.locator('[data-work-action="open-focused"]').first();
    if (await viewDetails.count()) {
        await viewDetails.click({ timeout: 10_000 }).catch(() => {});
        await page.waitForTimeout(1500);
        const focusedButtons = (await page.locator('[data-work-focused-actions] > button').allInnerTexts()).map((t) => t.trim());
        proof.focusedButtons = focusedButtons;
        proof.focusedMatchesSummary = JSON.stringify(focusedButtons) === JSON.stringify(summaryLabels);
        await page.screenshot({ path: path.join(OUT, "1b-view-details.png"), animations: "disabled" }).catch(() => {});
        // back to summary
        await page.locator('[data-work-action="close-focused"]').first().click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(600);
    }

    // 2) Schedule tour — click and measure time-to-availability + absence of the bootstrap loader.
    const tourBtn = card.locator('button', { hasText: /^Schedule tour$/ }).first();
    if (await tourBtn.count()) {
        const clickAt = Date.now();
        await tourBtn.click({ timeout: 10_000 }).catch(() => {});
        // Availability is "Pick a time slot" (or reschedule) — wait for it, note if the bootstrap loader showed.
        const bootstrapSeen = { value: false };
        const pollEnd = Date.now() + 8000;
        let availableAt = 0;
        while (Date.now() < pollEnd) {
            const body = (await page.locator('[data-work-focused-surface="true"], [data-tour-schedule-inline]').first().innerText().catch(() => "")) as string;
            if (/Checking tour bookings/i.test(body)) bootstrapSeen.value = true;
            if (/Pick a time slot|Reschedule tour|No availability|Choose a day/i.test(body)) { availableAt = Date.now(); break; }
            await page.waitForTimeout(120);
        }
        proof.tour = {
            clickToAvailabilityMs: availableAt ? availableAt - clickAt : null,
            bootstrapLoaderShown: bootstrapSeen.value,
        };
        await page.screenshot({ path: path.join(OUT, "2-schedule-tour.png"), animations: "disabled" }).catch(() => {});
        // close the tour host back to actions
        await page.locator('button', { hasText: /^Close$/ }).first().click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(500);
    } else {
        proof.tour = "no Schedule tour action on this record";
    }

    // 3) Message composer — Send later + BOS Assist present.
    const msgBtn = card.locator('button', { hasText: /^Message$/ }).first();
    if (await msgBtn.count()) {
        const msgClickAt = Date.now();
        await msgBtn.click({ timeout: 10_000 }).catch(() => {});
        // Measure time to a usable composer (recipient/compose visible) + whether the loading gate showed.
        let composerReadyAt = 0;
        let loadingSeen = false;
        const msgPollEnd = Date.now() + 8000;
        while (Date.now() < msgPollEnd) {
            const t = (await page.locator('.alloy-os-currentwork__composer-host').first().innerText().catch(() => "")) as string;
            if (/Loading conversation|once this record loads/i.test(t)) loadingSeen = true;
            if (/Email|Write a new message|Add another email|Send/i.test(t)) { composerReadyAt = Date.now(); break; }
            await page.waitForTimeout(120);
        }
        proof.message = {
            clickToComposerMs: composerReadyAt ? composerReadyAt - msgClickAt : null,
            loadingConversationShown: loadingSeen,
        };
        await page.waitForTimeout(1200);
        const composerText = (await page.locator('[data-work-action-surface="communications_composer"], .alloy-os-currentwork__composer-host').first().innerText().catch(() => "")) as string;
        const hostBox = await page.locator('.alloy-os-currentwork__composer-host').first().boundingBox().catch(() => null);
        const laterBox = await page.locator('[aria-label="Send later"]').first().boundingBox().catch(() => null);
        const bosBox = await page.locator('[aria-label="BOS Assist"], [data-bos-assist-button]').first().boundingBox().catch(() => null);
        const within = (b: { x: number; width: number } | null) =>
            !!(b && hostBox && b.x >= hostBox.x - 1 && b.x + b.width <= hostBox.x + hostBox.width + 1);
        proof.composer = {
            hasSendLater: /Send later/i.test(composerText) || (await page.locator('[aria-label="Send later"]').count()) > 0,
            hasBosAssist: /BOS Assist/i.test(composerText) || (await page.locator('[aria-label="BOS Assist"], [data-bos-assist-button]').count()) > 0,
            hasSend: /\bSend\b/i.test(composerText),
            sendLaterWithinComposer: within(laterBox),
            bosWithinComposer: within(bosBox),
        };
        await page.screenshot({ path: path.join(OUT, "3-message-composer.png"), animations: "disabled" }).catch(() => {});
    } else {
        proof.composer = "no Message action on this record";
    }

    const tourEvents = (await page.evaluate(() => {
        const ev = (window as unknown as { __ALLOY_WN_EVENTS?: { t: number; phase: string; note?: string; cache?: string }[] }).__ALLOY_WN_EVENTS ?? [];
        return ev.filter((e) => /^tour\./.test(e.phase)).map((e) => `+${e.t}ms ${e.phase} ${e.note ?? e.cache ?? ""}`);
    })) as string[];
    proof.tourEvents = tourEvents;

    fs.writeFileSync(path.join(OUT, "proof.json"), JSON.stringify(proof, null, 2));
    // eslint-disable-next-line no-console
    console.log("WN-REVIEW-PROOF " + JSON.stringify(proof));
    expect(page.url()).not.toContain("/login");
});
