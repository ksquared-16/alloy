/**
 * W7-F003 — Manage Responsibility, reproduced against the deployed build.
 *
 * Read-only: it types into an unsaved form and never presses Confirm, so no money moves and no
 * arrangement is written.
 */
import { expect, test } from "@playwright/test";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("F003 A/B/C/D on the deployed Manage Responsibility surface", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    /* Wait for the surface rather than for a stopwatch: the workspace's first paint varies. */
    const details = page.locator("[data-financials-card='true']").getByRole("button", { name: /^Details/ }).first();
    await expect(details).toHaveCount(1, { timeout: 90_000 });
    await details.click({ timeout: 20_000 });
    await page.waitForTimeout(12_000);

    const gear = page.locator('[data-financials-manage-responsibility="gear"]').first();
    log(`GEAR_COUNT ${await gear.count()}`);
    if ((await gear.count()) === 0) { log("F003 NOT_REACHED: no manage-responsibility affordance on this account"); return; }
    await gear.click({ timeout: 20_000 });
    await page.waitForTimeout(10_000);

    /* ── A: which parties are offered, and are current shares seeded? ───────────────────────── */
    const partyState = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("[data-financials-responsibility-share]"));
        return {
            rowCount: rows.length,
            rows: rows.map((el) => ({
                party: el.getAttribute("data-financials-responsibility-share"),
                method: el.getAttribute("data-share-method"),
                value: (el as HTMLInputElement).value ?? null,
                tag: el.tagName,
            })),
            /* What the surface says the CURRENT arrangement is, if anything. */
            bodyMentionsCurrent: /current|currently/i.test(document.body.innerText || ""),
            addAffordance: /add responsible|add member|\+ add/i.test(document.body.innerText || ""),
        };
    });
    log(`F003A ${JSON.stringify(partyState, null, 1)}`);

    /* ── B: vertical extent of the editor ───────────────────────────────────────────────────── */
    const geometry = await page.evaluate(() => {
        const card = document.querySelector('.alloy-os-ucard[data-universal-card-modal="command"]');
        const body = card?.querySelector(".alloy-os-ucard__body") ?? null;
        const r = (el: Element | null) => (el ? { h: Math.round(el.getBoundingClientRect().height), scrollH: el.scrollHeight, clientH: el.clientHeight } : null);
        return { card: r(card), body: r(body), viewport: window.innerHeight };
    });
    log(`F003B ${JSON.stringify(geometry)}`);

    /* ── C: does a fixed-amount input keep focus across two characters? ─────────────────────── */
    const firstAmount = page.locator('input[data-financials-responsibility-share][data-share-method="fixed"]').first();
    const have = await firstAmount.count();
    log(`F003C_INPUTS ${have}`);
    if (have > 0) {
        await firstAmount.click();
        await page.keyboard.type("1");
        await page.waitForTimeout(1200);
        const afterOne = await page.evaluate(() => {
            const a = document.activeElement as HTMLElement | null;
            return { active: a?.tagName ?? null, activeIsShare: a?.hasAttribute?.("data-financials-responsibility-share") ?? false };
        });
        await page.keyboard.type("3");
        await page.waitForTimeout(1200);
        const afterTwo = await page.evaluate(() => {
            const a = document.activeElement as HTMLElement | null;
            const el = document.querySelector('input[data-financials-responsibility-share][data-share-method="fixed"]') as HTMLInputElement | null;
            return {
                active: a?.tagName ?? null,
                activeIsShare: a?.hasAttribute?.("data-financials-responsibility-share") ?? false,
                firstInputValue: el?.value ?? null,
            };
        });
        log(`F003C_AFTER_ONE ${JSON.stringify(afterOne)}`);
        log(`F003C_AFTER_TWO ${JSON.stringify(afterTwo)}`);
    }

    /* ── D: Confirm disabled, and is anything explaining it? ────────────────────────────────── */
    const confirmState = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const confirm = buttons.find((b) => /resolve responsibility|reallocate|confirm|save/i.test(b.textContent ?? ""));
        const preview = buttons.find((b) => /^preview$/i.test((b.textContent ?? "").trim()));
        return {
            confirmLabel: confirm?.textContent?.trim() ?? null,
            confirmDisabled: confirm ? (confirm as HTMLButtonElement).disabled : null,
            previewPresent: Boolean(preview),
            reconciliationMessage:
                (document.querySelector("[data-financials-responsibility-reconciliation]") as HTMLElement | null)?.innerText ?? null,
            reconciliationState:
                document.querySelector("[data-financials-responsibility-reconciliation]")?.getAttribute("data-financials-responsibility-reconciliation") ?? null,
            anyVisibleRequirement: /preview first|must preview|required/i.test(document.body.innerText || ""),
        };
    });
    log(`F003D ${JSON.stringify(confirmState, null, 1)}`);

    await page.screenshot({ path: "../certification/financials/w7-repair-1/f003-manage-responsibility.png" });
});
