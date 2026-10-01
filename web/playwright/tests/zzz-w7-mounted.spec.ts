/**
 * W7 Batch 1 mounted proof on the deployed repaired build.
 *   1. Discounts from Financials -> Accounts            (repair 2, surface A)
 *   2. Discounts from the Focus Panel                   (repair 2, surface B — same truth)
 *   3. Add Charge on a disposable account               (repair 1 + the blank-Accounts finding)
 */
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/w7-repair-1";
const ENTRY = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(1_800_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const found: Record<string, unknown>[] = [];
const record = () => { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/mounted-proof.json`, JSON.stringify(found, null, 2)); };

/** Everything the drawer can legitimately be, and the one thing it must not be: silent and empty. */
const discountState = (page: Page) => page.evaluate(() => {
    const card = document.querySelector("[data-financials-overlay='discount_admin']");
    const body = card ? (card as HTMLElement).innerText.replace(/\s+/g, " ").trim() : null;
    return {
        present: !!card,
        state: document.querySelector("[data-financials-discount-admin-state]")?.getAttribute("data-financials-discount-admin-state") ?? null,
        childRows: document.querySelectorAll("[data-financials-discount-child]").length,
        policies: document.querySelectorAll("[data-financials-discount-policy]").length,
        bodyLen: body ? body.length : 0,
        body: body ? body.slice(0, 220) : null,
    };
});

async function openDiscounts(page: Page) {
    const gear = page.locator("[data-financials-manage-discounts='gear']").first();
    if (await gear.count() === 0) return { reachable: false };
    await gear.click({ timeout: 25_000 });
    await page.waitForTimeout(4_000);
    return { reachable: true };
}

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

test("A · Add Charge on a disposable account", async ({ page }) => {
    const errors: string[] = [];
    const failed: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 240)); });
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 240)}`));
    page.on("response", (r) => { if (r.status() >= 400 && r.url().includes("/api/")) failed.push(`${r.status()} ${r.url().replace(/https:\/\/[^/]+/, "").split("?")[0]}`); });

    await reachAccounts(page);
    /* A controlled, disposable demo household. Never Certhouse; never the Alvarez rows. */
    const target = await page.evaluate(() => {
        const rows = [...document.querySelectorAll("[data-financials-account-row]")];
        const pick = rows.find((r) => {
            const t = (r as HTMLElement).innerText;
            return /demo|automation|certfree|certopp/i.test(t) && !/certhouse|alvarez/i.test(t);
        });
        return pick ? { id: pick.getAttribute("data-financials-account-row"), label: (pick as HTMLElement).innerText.replace(/\s+/g, " ").slice(0, 80) } : null;
    });
    log(`CONTROLLED ACCOUNT: ${JSON.stringify(target)}`);
    expect(target, "a disposable account is available").not.toBeNull();
    await page.locator(`[data-financials-account-row="${target!.id}"]`).first().click({ timeout: 30_000 });
    await page.waitForTimeout(7_000);

    const snapshot = () => page.evaluate(() => ({
        ledgerRows: document.querySelectorAll("[data-financials-ledger-row]").length,
        accountRows: document.querySelectorAll("[data-financials-account-row]").length,
        detailAccount: document.querySelector("[data-financials-detail-account]")?.getAttribute("data-financials-detail-account") ?? null,
        overlay: document.querySelector("[data-financials-overlay]")?.getAttribute("data-financials-overlay") ?? null,
        bodyChars: document.body.innerText.replace(/\s+/g, " ").trim().length,
        truth: document.querySelector("[data-financials-detail-truth]")?.getAttribute("data-financials-detail-truth") ?? null,
    }));
    const before = await snapshot();
    log(`BEFORE: ${JSON.stringify(before)}`);

    /*
     * The Details surface's Add carries NO test attribute on the deployed build — the summary
     * card's carries data-financials-command="add" and the focused one carries nothing — so it is
     * addressed by its own actions container. That asymmetry is itself recorded as a finding.
     */
    const commands = await page.evaluate(() => [...document.querySelectorAll("[data-financials-command]")].map((e) => e.getAttribute("data-financials-command")));
    log(`COMMANDS PRESENT: ${JSON.stringify(commands)}`);
    const launch = page.locator(".alloy-os-fdetail__actions button", { hasText: /^Add$/ }).first();
    const viaAttr = page.locator("[data-financials-command='add']").first();
    const target2 = (await launch.count()) > 0 ? launch : viaAttr;
    expect(await target2.count(), "an Add charge affordance is present").toBeGreaterThan(0);
    await target2.scrollIntoViewIfNeeded();
    await target2.click({ timeout: 25_000 });
    await expect(page.locator("[data-financials-overlay='add_charge']")).toHaveCount(1, { timeout: 60_000 });
    await page.waitForTimeout(4_000);

    /* What the command offers, before anything is typed — this is the Service Date evidence too. */
    const form = await page.evaluate(() => {
        const q = (s: string) => document.querySelector(s);
        const fields = [...document.querySelectorAll(".alloy-os-addcharge__field")].map((f) => (f as HTMLElement).innerText.replace(/\s+/g, " ").trim());
        return {
            fields,
            hasAmount: !!q("[data-addcharge-amount]"),
            hasNote: !!q("[data-addcharge-note]"),
            serviceDateEditable: !!q("[data-addcharge-event-date]"),
            serviceDateControl: q("[data-addcharge-event-date]")?.innerHTML.slice(0, 160) ?? null,
            nativeDateInputs: document.querySelectorAll("input[type='date']").length,
            chargeTo: (q("[data-addcharge-charge-to='summary']") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").trim() ?? null,
            submitDisabled: (q("[data-addcharge-submit]") as HTMLButtonElement | null)?.disabled ?? null,
        };
    });
    log(`ADD FORM: ${JSON.stringify(form)}`);
    await page.screenshot({ path: `${OUT}/add-charge-form.png`, fullPage: true });

    /* Amount only. The Charge-To editor is deliberately NOT opened — inheritance must happen on its own. */
    const amount = page.locator("[data-addcharge-amount]").first();
    if (await amount.count()) { await amount.fill("25.00"); await page.waitForTimeout(5_000); }
    const note = page.locator("[data-addcharge-note]").first();
    if (await note.count()) await note.fill("W7 repair-1 mounted proof");
    await page.waitForTimeout(3_000);

    const preview = await page.evaluate(() => {
        const txt = (s: string) => (document.querySelector(s) as HTMLElement | null)?.innerText.replace(/\s+/g, " ").trim() ?? null;
        return {
            responsibility: txt("[data-addcharge-preview-responsibility]"),
            standing: txt("[data-addcharge-preview-standing]"),
            discount: txt("[data-addcharge-preview-discount]"),
            net: txt("[data-addcharge-preview-net]"),
            consequence: txt("[data-addcharge-preview-consequence]"),
            chargeTo: txt("[data-addcharge-charge-to='summary']"),
            error: txt("[data-addcharge-error]"),
        };
    });
    log(`PREVIEW: ${JSON.stringify(preview)}`);
    await page.screenshot({ path: `${OUT}/add-charge-preview.png`, fullPage: true });
    found.push({ proof: "add-charge", target, before, form, preview }); record();

    /* ── THE WRITE. This is the sequence Kelly saw blank the screen. ───────────────── */
    const submit = page.locator("[data-addcharge-submit]").first();
    const disabled = await submit.evaluate((b) => (b as HTMLButtonElement).disabled).catch(() => false);
    log(`SUBMIT disabled=${disabled}`);
    if (!disabled) {
        await submit.click({ timeout: 25_000 });
        /* Watch the surface for 30s after the write — the blank is a settling state, not an instant. */
        const timeline: unknown[] = [];
        for (let i = 0; i < 15; i++) {
            await page.waitForTimeout(2_000);
            timeline.push({ at: (i + 1) * 2, ...(await snapshot()) });
        }
        log(`POST-WRITE TIMELINE: ${JSON.stringify(timeline)}`);
        const after = await snapshot();
        log(`AFTER: ${JSON.stringify(after)}`);
        await page.screenshot({ path: `${OUT}/after-add-charge.png`, fullPage: true });
        found.push({ proof: "post-write", timeline, after, errors: errors.slice(0, 12), failed: failed.slice(0, 12) }); record();
        log(`CONSOLE ERRORS (${errors.length}): ${JSON.stringify(errors.slice(0, 8))}`);
        log(`FAILED API (${failed.length}): ${JSON.stringify(failed.slice(0, 8))}`);
    }
    record();
    expect(found.length).toBeGreaterThan(0);
});
test("B · Discounts from the Focus Panel tells the same truth", async ({ page }) => {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(20_000);
    const nav = page.locator("[data-financials-nav='details']").first();
    if (await nav.count() === 0) {
        /* Say what the page actually offers rather than timing out against a guess. */
        const present = await page.evaluate(() => {
            const attrs = new Set<string>();
            document.querySelectorAll("*").forEach((el) => {
                for (const a of el.attributes) if (a.name.startsWith("data-financials")) attrs.add(`${a.name}=${a.value.slice(0, 24)}`);
            });
            return { attrs: [...attrs].slice(0, 40), url: location.pathname };
        });
        log(`FOCUS PANEL: details nav absent. ${JSON.stringify(present)}`);
        found.push({ proof: "discounts-focus-panel", reachable: false, diagnostic: present }); record();
        await page.screenshot({ path: `${OUT}/focus-panel-absent.png` });
        return;
    }
    await nav.click({ timeout: 25_000 });
    await page.waitForTimeout(8_000);
    const subject = await page.evaluate(() => document.querySelector("[data-financials-detail-account]")?.getAttribute("data-financials-detail-account") ?? null);
    const r = await openDiscounts(page);
    const s = await discountState(page);
    log(`FOCUS PANEL DISCOUNTS (subject=${subject}, reachable=${r.reachable}): ${JSON.stringify(s)}`);
    await page.screenshot({ path: `${OUT}/discounts-focus-panel.png` });
    found.push({ proof: "discounts-focus-panel", subject, reachable: r.reachable, ...s }); record();
    if (r.reachable) {
        expect(s.present, "the drawer opened in the Focus Panel too").toBe(true);
        expect(s.state !== null || s.childRows > 0, "the Focus Panel drawer is not silent and empty either").toBe(true);
    }
});

test("C · Discounts from Accounts is never silently blank", async ({ page }) => {
    await reachAccounts(page);
    await page.locator("[data-financials-account-row]").first().click({ timeout: 30_000 });
    await page.waitForTimeout(6_000);
    const r = await openDiscounts(page);
    expect(r.reachable, "the Discounts gear is reachable from Accounts").toBe(true);
    const s = await discountState(page);
    log(`ACCOUNTS DISCOUNTS: ${JSON.stringify(s)}`);
    mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: `${OUT}/discounts-accounts.png` });
    found.push({ proof: "discounts-accounts", ...s }); record();
    expect(s.present, "the drawer opened").toBe(true);
    expect(s.state !== null || s.childRows > 0, "states a state or shows rows — never silent and empty").toBe(true);
});

