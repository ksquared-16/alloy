/** §2–§10, §20–§21 — the gear, the depth card, the scope read-back, responsive and keyboard. */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-setup";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(560_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("manage responsibility", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const out: Record<string, unknown> = {};
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    expect(page.url()).not.toContain("/login");
    await page.locator('[data-adminv2-sidebar-modal-nav="financials"]').first().click({ force: true });
    await page.waitForTimeout(9000);
    await page.locator('[data-workspace-section-tab="accounts"]').first().click({ force: true });
    await page.waitForTimeout(11_000);
    await page.locator("[data-financials-account-row]").first().click({ force: true });
    await page.waitForTimeout(12_000);

    // Leave Details in a distinctive state so dismissal can be checked against it.
    const lensBtn = page.getByRole("button", { name: /Charges\d/ }).first();
    if (await lensBtn.count()) { await lensBtn.click({ force: true }).catch(() => {}); await page.waitForTimeout(4000); }
    const stateBefore = await page.evaluate(() => ({
        scrollTop: (document.querySelector("[data-financials-activity-scroll]") as HTMLElement | null)?.scrollTop ?? null,
        activeLens: Array.from(document.querySelectorAll("button")).find((b) => b.getAttribute("aria-current"))?.textContent?.trim() ?? null,
        rows: document.querySelectorAll("[data-financials-ledger-row]").length,
    }));

    const gear = page.locator('[data-financials-manage-responsibility="gear"]');
    out.gear = { count: await gear.count(), name: await gear.first().getAttribute("aria-label").catch(() => null) };
    log(`GEAR: ${JSON.stringify(out.gear)}`);

    // §21 keyboard: the gear takes focus and Enter opens it.
    await gear.first().focus();
    const focused = await page.evaluate(() => document.activeElement?.getAttribute("data-financials-manage-responsibility") ?? null);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(9000);

    out.card = await page.evaluate(() => {
        const card = document.querySelector('[data-financials-manage-responsibility="depth-card"]') as HTMLElement | null;
        const sel = card?.querySelector("[data-testid='responsibility-scope']") as HTMLSelectElement | null;
        return {
            open: Boolean(card),
            /* APPLIES TO is the first control in the card. */
            firstLabel: card?.querySelector("label")?.innerText.split("\n")[0]?.trim() ?? null,
            options: sel ? Array.from(sel.querySelectorAll("option")).map((o) => ({ v: (o as HTMLOptionElement).value, t: (o as HTMLOptionElement).textContent?.trim() })) : [],
            scope: card?.querySelector("[data-financials-arrangement-scope]")?.getAttribute("data-financials-arrangement-scope") ?? null,
            readback: card?.querySelector("[data-financials-scope-arrangement]")?.getAttribute("data-financials-scope-arrangement") ?? null,
            readbackText: (card?.querySelector("[data-financials-scope-arrangement]") as HTMLElement | null)?.innerText ?? null,
            text: card?.innerText.replace(/\n+/g, " / ").slice(0, 700) ?? null,
        };
    });
    log(`gear focusable=${focused} · card open via Enter=${(out.card as Record<string, unknown>).open}`);
    log(`APPLIES TO first=${JSON.stringify((out.card as Record<string, unknown>).firstLabel)}`);
    log(`OPTIONS: ${JSON.stringify((out.card as Record<string, unknown>).options)}`);
    log(`HOUSEHOLD read-back [${(out.card as Record<string, unknown>).readback}]: ${(out.card as Record<string, unknown>).readbackText}`);
    await page.screenshot({ path: `${OUT}/manage-responsibility-household.png`, fullPage: true });

    // §6 — switch to each child and read what governs that scope.
    const perScope: Record<string, unknown> = {};
    const opts = (out.card as { options: { v: string; t: string }[] }).options.filter((o) => o.v !== "__household__");
    for (const o of opts) {
        await page.selectOption("[data-testid='responsibility-scope']", o.v).catch(() => {});
        await page.waitForTimeout(7000);
        perScope[o.t] = await page.evaluate(() => ({
            scope: document.querySelector("[data-financials-arrangement-scope]")?.getAttribute("data-financials-arrangement-scope") ?? null,
            member: document.querySelector("[data-financials-arrangement-member]")?.getAttribute("data-financials-arrangement-member") ?? null,
            kind: document.querySelector("[data-financials-scope-arrangement]")?.getAttribute("data-financials-scope-arrangement") ?? null,
            text: (document.querySelector("[data-financials-scope-arrangement]") as HTMLElement | null)?.innerText ?? null,
        }));
        log(`\n${o.t}: ${JSON.stringify(perScope[o.t], null, 1)}`);
    }
    out.perScope = perScope;
    await page.screenshot({ path: `${OUT}/manage-responsibility-child.png`, fullPage: true });

    // §10 — Escape returns to the same Details state.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(3000);
    const cancel = page.getByRole("button", { name: /^Cancel$/ }).first();
    if (await cancel.count()) { await cancel.click({ force: true }).catch(() => {}); await page.waitForTimeout(4000); }
    out.dismissal = await page.evaluate(() => ({
        cardGone: !document.querySelector('[data-financials-manage-responsibility="depth-card"]'),
        detailStillOpen: Boolean(document.querySelector("[data-financials-filter-slot]")),
        activeLens: Array.from(document.querySelectorAll("button")).find((b) => b.getAttribute("aria-current"))?.textContent?.trim() ?? null,
        rows: document.querySelectorAll("[data-financials-ledger-row]").length,
    }));
    log(`\nBEFORE: ${JSON.stringify(stateBefore)}`);
    log(`DISMISSAL: ${JSON.stringify(out.dismissal)}`);

    // §20 — responsive: the gear stays in the filter row and nothing clips.
    const resp: Record<string, unknown> = {};
    for (const w of [1280, 1440, 1680]) {
        await page.setViewportSize({ width: w, height: 1000 });
        await page.waitForTimeout(2500);
        resp[w] = await page.evaluate(() => {
            const slot = document.querySelector("[data-financials-filter-slot]") as HTMLElement | null;
            const g = document.querySelector('[data-financials-manage-responsibility="gear"]') as HTMLElement | null;
            const f = document.querySelector("[data-testid='financials-filter-responsible-party']") as HTMLElement | null;
            if (!slot || !g) return { missing: true };
            const sr = slot.getBoundingClientRect(); const gr = g.getBoundingClientRect(); const fr = f?.getBoundingClientRect();
            return {
                gearVisible: gr.width > 0 && gr.height > 0,
                sameRowAsFilter: fr ? Math.abs((gr.top + gr.height / 2) - (fr.top + fr.height / 2)) < 8 : null,
                gearInsideSlot: gr.left >= sr.left - 1 && gr.right <= sr.right + 1,
                slotClipped: slot.scrollWidth > slot.clientWidth + 1,
                gearPx: Math.round(gr.width),
            };
        });
        log(`${w}: ${JSON.stringify(resp[w])}`);
        await page.screenshot({ path: `${OUT}/manage-resp-${w}.png` });
    }
    out.responsive = resp;
    writeFileSync(`${OUT}/manage-responsibility.json`, JSON.stringify(out, null, 2));
});
