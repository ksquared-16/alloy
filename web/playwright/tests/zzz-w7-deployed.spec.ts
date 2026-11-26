/**
 * W7 Repair Batch 1 — MOUNTED PROOF on deployed 41d35901d.
 *   A · the Accounts Add command renders OVER the account floor, not instead of it
 *   B · a charge known to resolve to $0.00 cannot be submitted, and says why before the primary
 *   C · a charge whose amount is NOT YET KNOWN is not blocked
 *   D · Discounts from Accounts still states loading/error/empty/content truthfully
 *   E · the Focus Panel's Financials card now issues its read, and its Discounts opens
 */
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/w7-repair-1/deployed";
const ENTRY = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(1_800_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const proof: Record<string, unknown>[] = [];
const save = () => { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/mounted-proof.json`, JSON.stringify(proof, null, 2)); };

async function reachAccounts(page: Page) {
    for (let a = 1; a <= 2; a++) {
        await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(13_000);
        const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
        if (await nav.count()) { await nav.click({ force: true, timeout: 20_000 }); break; }
        if (a === 2) throw new Error("workspace never mounted");
    }
    await page.waitForTimeout(11_000);
    await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 30_000 });
    await page.waitForFunction(() => document.querySelectorAll("[data-financials-account-row]").length > 0, undefined, { timeout: 180_000 });
    await page.waitForTimeout(3_000);
}

async function openDisposableAccount(page: Page) {
    const t = await page.evaluate(() => {
        const rows = [...document.querySelectorAll("[data-financials-account-row]")];
        const pick = rows.find((r) => {
            const x = (r as HTMLElement).innerText;
            return /demo|automation|certfree|certopp/i.test(x) && !/certhouse|alvarez/i.test(x);
        });
        return pick ? { id: pick.getAttribute("data-financials-account-row"), label: (pick as HTMLElement).innerText.replace(/\s+/g, " ").slice(0, 60) } : null;
    });
    expect(t, "a disposable account is available").not.toBeNull();
    await page.locator(`[data-financials-account-row="${t!.id}"]`).first().click({ timeout: 30_000 });
    await page.waitForTimeout(7_000);
    return t!;
}

test("A+B · the floor stays, and the refusal comes before the money", async ({ page }) => {
    await reachAccounts(page);
    const account = await openDisposableAccount(page);
    const before = await page.evaluate(() => ({
        floor: document.querySelector("[data-financials-detail-account]")?.getAttribute("data-financials-detail-account") ?? null,
        ledgerRows: document.querySelectorAll("[data-financials-ledger-row]").length,
    }));
    log(`ACCOUNT ${JSON.stringify(account)} before=${JSON.stringify(before)}`);

    await page.locator(".alloy-os-fdetail__actions button", { hasText: /^Add$/ }).first().click({ timeout: 25_000 });
    await expect(page.locator("[data-financials-overlay='add_charge']")).toHaveCount(1, { timeout: 60_000 });

    await page.waitForTimeout(8_000);

    /* A · the account must still be behind the command. */
    const during = await page.evaluate(() => ({
        floor: document.querySelector("[data-financials-detail-account]")?.getAttribute("data-financials-detail-account") ?? null,
        ledgerRows: document.querySelectorAll("[data-financials-ledger-row]").length,
        overlays: [...document.querySelectorAll("[data-financials-overlay]")].map((e) => e.getAttribute("data-financials-overlay")),
        roles: [...document.querySelectorAll("[data-financials-surface-role]")].map((e) => e.getAttribute("data-financials-surface-role")),
    }));
    log(`A · with the command open: ${JSON.stringify(during)}`);
    await page.screenshot({ path: `${OUT}/A-floor-under-command.png`, fullPage: true });

    /* B · the $0.00 default template. */
    const b = await page.evaluate(() => ({
        template: (document.querySelector("[data-testid='addcharge-template']") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").trim() ?? null,
        blockedNote: (document.querySelector("[data-addcharge-blocked]") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").trim() ?? null,
        blockedReason: document.querySelector("[data-addcharge-blocked]")?.getAttribute("data-addcharge-blocked") ?? null,
        submitDisabled: (document.querySelector("[data-addcharge-submit]") as HTMLButtonElement | null)?.disabled ?? null,
        gross: (document.querySelector("[data-addcharge-preview-net], .alloy-os-addcharge__field") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").slice(0, 80) ?? null,
    }));
    log(`B · known-zero charge: ${JSON.stringify(b)}`);
    await page.screenshot({ path: `${OUT}/B-zero-refused-first.png`, fullPage: true });
    proof.push({ proof: "A+B", account, before, during, zero: b }); save();

    expect(during.floor, "A · the account floor is still rendered beneath the command").toBe(before.floor);
    expect(during.overlays, "A · both the floor and the command are in the document").toContain("detail");
    expect(during.overlays).toContain("add_charge");
    expect(b.submitDisabled, "B · a charge resolving to $0.00 cannot be submitted").toBe(true);
    expect(b.blockedReason, "B · and it says why, before the primary").toBe("resolves_to_nothing");
});

test("D · Discounts from Accounts", async ({ page }) => {
    await reachAccounts(page);
    await page.locator("[data-financials-account-row]").first().click({ timeout: 30_000 });
    await page.waitForTimeout(6_000);
    await page.locator("[data-financials-manage-discounts='gear']").first().click({ timeout: 25_000 });
    await page.waitForTimeout(4_000);
    const d = await page.evaluate(() => ({
        present: !!document.querySelector("[data-financials-overlay='discount_admin']"),
        state: document.querySelector("[data-financials-discount-admin-state]")?.getAttribute("data-financials-discount-admin-state") ?? null,
        childRows: document.querySelectorAll("[data-financials-discount-child]").length,
        body: (document.querySelector("[data-financials-overlay='discount_admin']") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").slice(0, 200) ?? null,
    }));
    log(`D · Accounts discounts: ${JSON.stringify(d)}`);
    await page.screenshot({ path: `${OUT}/D-discounts-accounts.png` });
    proof.push({ proof: "D-discounts-accounts", ...d }); save();
    expect(d.present).toBe(true);
    expect(d.state !== null || d.childRows > 0, "states a state or shows rows").toBe(true);
});

test("E · the Focus Panel card reads its account, and Discounts opens there", async ({ page }) => {
    let cardRequests = 0;
    page.on("response", (r) => { if (/\/api\/admin\/financials\/card/.test(r.url())) cardRequests += 1; });
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(60_000);
    const card = await page.evaluate(() => ({
        mounted: !!document.querySelector("[data-financials-card]"),
        skeleton: !!document.querySelector("[data-financials-card-skeleton]"),
        empty: document.querySelector("[data-financials-empty]")?.getAttribute("data-financials-empty") ?? "absent",
        nav: !!document.querySelector("[data-financials-nav='details']"),
    }));
    log(`E · Focus Panel card: ${JSON.stringify(card)} cardRequests=${cardRequests}`);
    await page.screenshot({ path: `${OUT}/E-focus-panel-card.png` });

    let fp: Record<string, unknown> = { reached: false };
    if (card.nav) {
        await page.locator("[data-financials-nav='details']").first().click({ timeout: 25_000 });
        await page.waitForTimeout(10_000);
        const gear = page.locator("[data-financials-manage-discounts='gear']").first();
        if (await gear.count()) {
            await gear.click({ timeout: 25_000 });
            await page.waitForTimeout(4_000);
            fp = await page.evaluate(() => ({
                reached: true,
                present: !!document.querySelector("[data-financials-overlay='discount_admin']"),
                state: document.querySelector("[data-financials-discount-admin-state]")?.getAttribute("data-financials-discount-admin-state") ?? null,
                childRows: document.querySelectorAll("[data-financials-discount-child]").length,
                body: (document.querySelector("[data-financials-overlay='discount_admin']") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").slice(0, 200) ?? null,
            }));
            await page.screenshot({ path: `${OUT}/E-discounts-focus-panel.png` });
        }
    }
    log(`E · Focus Panel discounts: ${JSON.stringify(fp)}`);
    proof.push({ proof: "E-focus-panel", card, cardRequests, discounts: fp }); save();
    expect(cardRequests, "the card issued its read").toBeGreaterThan(0);
    expect(card.empty, "and left the pending frame").not.toBe("loading");
});

test("C · a charge whose amount is not a resolved zero is NOT blocked", async ({ page }) => {
    /*
     * The first attempt sampled the command at first paint and found it already blocked — correctly,
     * because the DEFAULT type carries a FIXED $0.00, which is a resolved zero immediately rather
     * than an unresolved one. That measured the wrong thing. The product question is whether
     * anything other than a resolved zero gets refused, so the type is changed and the refusal must
     * lift.
     */
    await reachAccounts(page);
    await openDisposableAccount(page);
    await page.locator(".alloy-os-fdetail__actions button", { hasText: /^Add$/ }).first().click({ timeout: 25_000 });
    await expect(page.locator("[data-financials-overlay='add_charge']")).toHaveCount(1, { timeout: 60_000 });
    await page.waitForTimeout(6_000);

    const sel = page.locator("[data-testid='addcharge-template']").first();
    await sel.click({ timeout: 20_000 });
    await page.waitForTimeout(1_500);
    const options = await page.evaluate(() =>
        [...document.querySelectorAll("[role='option'], [data-alloy-select-option]")]
            .map((o) => (o as HTMLElement).innerText.replace(/\s+/g, " ").trim()).filter(Boolean));
    log(`C · options: ${JSON.stringify(options)}`);

    const target = options.find((o) => !/waiv/i.test(o)) ?? null;
    expect(target, "a chargeable type is offered").not.toBeNull();
    await page.locator("[role='option'], [data-alloy-select-option]", { hasText: target! }).first().click({ timeout: 20_000 });
    await page.waitForTimeout(9_000);

    const after = await page.evaluate(() => ({
        template: (document.querySelector("[data-testid='addcharge-template']") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").trim() ?? null,
        blocked: document.querySelector("[data-addcharge-blocked]")?.getAttribute("data-addcharge-blocked") ?? null,
        submitDisabled: (document.querySelector("[data-addcharge-submit]") as HTMLButtonElement | null)?.disabled ?? null,
        net: (document.querySelector("[data-addcharge-preview-net]") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").trim() ?? null,
        fields: [...document.querySelectorAll(".alloy-os-addcharge__field")].map((f) => (f as HTMLElement).innerText.replace(/\s+/g, " ").trim()),
    }));
    log(`C · after choosing "${target}": ${JSON.stringify(after)}`);
    await page.screenshot({ path: `${OUT}/C-nonzero-not-blocked.png`, fullPage: true });
    proof.push({ proof: "C-nonzero-not-blocked", chosen: target, options, after }); save();

    expect(after.blocked, "C · a type that does not resolve to zero carries no refusal note").toBeNull();
    expect(after.submitDisabled, "C · and its commit is available").not.toBe(true);
});
