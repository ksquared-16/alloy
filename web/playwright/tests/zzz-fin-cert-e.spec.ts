/** FINANCIALS FINAL MOUNTED CERTIFICATION — STAGE E: identity, responsive, keyboard, non-regression smoke. Read only. */
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/final-mounted";
const ENTRY = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(1_200_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const save = (n: string, v: unknown) => { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/${n}.json`, JSON.stringify(v, null, 2)); };
const shot = async (p: Page, n: string) => { mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: `${OUT}/${n}.png` }); };

async function openAccounts(page: Page) {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    expect(page.url(), "the governed QA session is live").not.toContain("/login");
    await page.locator("[data-adminv2-sidebar-modal-nav='financials']").first().click({ force: true, timeout: 20_000 });
    await page.waitForTimeout(10_000);
    await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-detail='true']")).toHaveCount(1, { timeout: 120_000 });
    await page.waitForTimeout(8000);
}

test("§11 — the account surface and the relationship row at 1280 / 1440 / 1680", async ({ page }) => {
    const rows: Record<string, unknown>[] = [];
    for (const width of [1280, 1440, 1680]) {
        await page.setViewportSize({ width, height: 900 });
        await openAccounts(page);
        const r = await page.evaluate(() => {
            const box = (s: string) => { const e = document.querySelector(s) as HTMLElement | null; if (!e) return null; const b = e.getBoundingClientRect();
                return { top: Math.round(b.top), left: Math.round(b.left), right: Math.round(b.right), width: Math.round(b.width), height: Math.round(b.height) }; };
            const detail = document.querySelector("[data-financials-detail='true']") as HTMLElement | null;
            const clipped = Array.from(document.querySelectorAll("[data-financials-detail='true'] *"))
                .filter((e) => (e as HTMLElement).scrollWidth > (e as HTMLElement).clientWidth + 2 && getComputedStyle(e).overflowX === "hidden").length;
            return {
                viewport: window.innerWidth,
                detail: box("[data-financials-detail='true']"),
                row: box("[data-financials-payer-row='true']"),
                identity: box("[data-financials-row-group='identity']"),
                discount: box("[data-financials-row-group='discount']"),
                payment: box("[data-financials-row-group='payment']"),
                methodState: box("[data-financials-method-state='true']"),
                managePayments: box("[data-financials-manage-payments='open']"),
                rowText: (document.querySelector("[data-financials-payer-row='true']") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").trim() ?? null,
                horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
                clippedNodes: clipped,
                detailInsideViewport: detail ? detail.getBoundingClientRect().right <= window.innerWidth + 1 : null,
            };
        });
        log(`§11 @${width} ${JSON.stringify(r)}`);
        rows.push(r);
        await shot(page, `E1-accounts-${width}`);
    }
    save("E-responsive", rows);
});

test("§7 §12 — identity resolution and keyboard reach", async ({ page }) => {
    await openAccounts(page);
    /* §7 — the same entity, across the ledger, the relationship row and the Discounts card. */
    const identity = await page.evaluate(() => {
        const names = (root: ParentNode) => Array.from(root.querySelectorAll("*"))
            .map((e) => (e as HTMLElement).innerText ?? "")
            .join(" ");
        const ledgerChildren = Array.from(document.querySelectorAll("[data-financials-detail='true'] td, [data-financials-detail='true'] [class*='child']"))
            .map((e) => (e as HTMLElement).innerText.replace(/\s+/g, " ").trim())
            .filter((t) => /Cert[ab] Certhouse/.test(t));
        return {
            rowIdentity: (document.querySelector("[data-financials-row-group='identity']") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").trim() ?? null,
            rowAvatars: document.querySelectorAll("[data-financials-row-group='identity'] img, [data-financials-row-group='identity'] [class*='avatar']").length,
            ledgerChildNames: Array.from(new Set(ledgerChildren)).slice(0, 10),
            surfaceImages: Array.from(document.querySelectorAll("[data-financials-detail='true'] img")).map((i) => ({ alt: (i as HTMLImageElement).alt, src: ((i as HTMLImageElement).src || "").slice(0, 80) })),
            bodyMentionsCertt: /Certt Certhouse/.test(names(document.body)),
        };
    });
    log(`§7 IDENTITY (surface) ${JSON.stringify(identity, null, 1)}`);

    /* The Discounts card's own identity treatment, for the same two children. */
    await page.locator("[data-financials-manage-discounts='gear']").first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-overlay='discount_admin']")).toHaveCount(1, { timeout: 90_000 });
    await page.waitForTimeout(5000);
    const discIdentity = await page.evaluate(() => {
        const root = document.querySelector("[data-financials-overlay='discount_admin']") as HTMLElement | null;
        const avatars = Array.from(root?.querySelectorAll("[class*='avatar'],[data-identity-avatar],[data-card-avatar]") ?? []);
        return {
            children: Array.from(root?.querySelectorAll("*") ?? []).map((e) => (e as HTMLElement).innerText ?? "")
                .filter((t) => /^Cert[ab] Certhouse$/.test(t.trim())).length,
            avatarCount: avatars.length,
            avatarText: avatars.map((a) => (a as HTMLElement).innerText.replace(/\s+/g, " ").trim()).slice(0, 6),
            avatarImages: avatars.map((a) => a.querySelector("img") != null),
            imagesInCard: root?.querySelectorAll("img").length ?? 0,
        };
    });
    log(`§7 IDENTITY (Discounts) ${JSON.stringify(discIdentity, null, 1)}`);
    save("E-identity", { identity, discIdentity });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(2000);

    /* §12 — reach the three doors by keyboard alone and confirm names and visible focus. */
    const kb = await page.evaluate(() => {
        const targets = [
            ["responsibility", "[data-financials-manage-responsibility='gear']"],
            ["discounts", "[data-financials-manage-discounts='gear']"],
            ["payments", "[data-financials-manage-payments='open']"],
        ] as const;
        return targets.map(([k, sel]) => {
            const e = document.querySelector(sel) as HTMLElement | null;
            if (!e) return { k, present: false };
            const cs = getComputedStyle(e);
            return {
                k, present: true, tag: e.tagName,
                tabIndex: e.tabIndex,
                name: (e.getAttribute("aria-label") || e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 50),
                disabled: (e as HTMLButtonElement).disabled ?? null,
                outlineStyle: cs.outlineStyle,
            };
        });
    });
    log(`§12 DOORS ${JSON.stringify(kb, null, 1)}`);

    /* Tab until one of the doors holds focus, then open it with the keyboard. */
    let reached: string | null = null;
    for (let i = 0; i < 90 && !reached; i++) {
        await page.keyboard.press("Tab");
        reached = await page.evaluate(() => {
            const a = document.activeElement as HTMLElement | null;
            if (!a) return null;
            if (a.getAttribute("data-financials-manage-responsibility")) return "responsibility";
            if (a.getAttribute("data-financials-manage-discounts")) return "discounts";
            if (a.getAttribute("data-financials-manage-payments")) return "payments";
            return null;
        });
    }
    log(`§12 TAB REACHED ${reached ?? "NONE within 90 stops"}`);
    let opened: Record<string, unknown> = {};
    if (reached) {
        const focusRing = await page.evaluate(() => {
            const a = document.activeElement as HTMLElement | null; if (!a) return null;
            const cs = getComputedStyle(a);
            return { outline: cs.outline, outlineWidth: cs.outlineWidth, boxShadow: cs.boxShadow.slice(0, 80) };
        });
        await page.keyboard.press("Enter");
        await page.waitForTimeout(6000);
        opened = await page.evaluate(() => ({
            overlays: Array.from(document.querySelectorAll("[data-financials-overlay]")).map((e) => e.getAttribute("data-financials-overlay")),
        }));
        log(`§12 KEYBOARD OPEN ${JSON.stringify({ focusRing, ...opened })}`);
        save("E-keyboard", { doors: kb, reached, focusRing, ...opened });
        await page.keyboard.press("Escape");
        await page.waitForTimeout(2000);
        const back = await page.evaluate(() => ({
            overlays: document.querySelectorAll("[data-financials-overlay]").length,
            detailAlive: document.querySelectorAll("[data-financials-detail='true']").length,
            refocused: (document.activeElement as HTMLElement | null)?.getAttribute("data-financials-manage-responsibility")
                ?? (document.activeElement as HTMLElement | null)?.getAttribute("data-financials-manage-discounts")
                ?? (document.activeElement as HTMLElement | null)?.getAttribute("data-financials-manage-payments") ?? null,
        }));
        log(`§12 ESCAPE-BACK ${JSON.stringify(back)}`);
        save("E-keyboard-escape", back);
    } else save("E-keyboard", { doors: kb, reached: null });
});

test("§14 — narrow non-regression smoke", async ({ page }) => {
    await openAccounts(page);
    const smoke = await page.evaluate(() => {
        const text = document.body.innerText;
        const detail = document.querySelector("[data-financials-detail='true']") as HTMLElement | null;
        const primary = Array.from(document.querySelectorAll("button")).find((b) => /^Payment$/.test((b.textContent || "").trim()));
        return {
            prepaidNamed: /available prepaid/i.test(text),
            prepaidSeparateFromBalance: /AVAILABLE PREPAID/i.test(text) && /CURRENT BALANCE/i.test(text),
            paymentControl: primary != null,
            paymentColor: primary ? getComputedStyle(primary).backgroundColor : null,
            paymentColorVar: primary ? getComputedStyle(primary).getPropertyValue("--tw-bg-opacity") : null,
            billingPeriodPresent: /billing period/i.test(text),
            glAccountColumn: /GL ACCOUNT/i.test(text),
            autopayOnSurface: /autopay/i.test(detail?.innerText ?? ""),
            nativeFinancialControls: detail ? detail.querySelectorAll("select,input[type=number],input[type=date]").length : null,
        };
    });
    log(`§14 SMOKE ${JSON.stringify(smoke, null, 1)}`);
    /* Payment and Adjustment shells open (nothing committed). */
    const pay = page.getByRole("button", { name: /^Payment$/ }).first();
    let payShell: string[] = [];
    if (await pay.count()) {
        await pay.click({ timeout: 20_000 });
        await page.waitForTimeout(6000);
        payShell = await page.evaluate(() => Array.from(document.querySelectorAll("[data-financials-overlay]")).map((e) => e.getAttribute("data-financials-overlay") || ""));
        await shot(page, "E2-payment-shell");
        await page.keyboard.press("Escape");
        await page.waitForTimeout(2500);
    }
    log(`§14 PAYMENT SHELL ${JSON.stringify(payShell)}`);
    const add = page.getByRole("button", { name: /^Add$/ }).first();
    let adjust: Record<string, unknown> = {};
    if (await add.count()) {
        await add.click({ timeout: 20_000 });
        await page.waitForTimeout(4000);
        const adjTab = page.getByRole("button", { name: /^Adjustment$/ }).first();
        if (await adjTab.count()) {
            await adjTab.click({ timeout: 20_000 });
            await page.waitForTimeout(5000);
            adjust = await page.evaluate(() => {
                const root = document.querySelector("[data-financials-overlay='add_charge']") as HTMLElement | null;
                return { text: root?.innerText.replace(/\s+/g, " ").trim().slice(0, 900) ?? null };
            });
            await shot(page, "E3-adjustment");
        }
        await page.keyboard.press("Escape");
    }
    log(`§14 ADJUSTMENT ${JSON.stringify(adjust)}`);
    save("E-smoke", { smoke, payShell, adjust });
});
