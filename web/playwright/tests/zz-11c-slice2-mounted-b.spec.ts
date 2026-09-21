/**
 * 11C SLICE 2 — MOUNTED CERTIFICATION, part B: Adjustment, Payment, responsibility, the
 * administration row, the deployed native-select census, responsive and the depth contract.
 *
 * Deployed staging, production runtime. NOTHING IS WRITTEN — the Human-QA fixture is read only.
 */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

import { activeElementDescriptor, alloyOptions, isAlloyControl, openAlloy } from "../helpers/alloyControls";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11c-slice2";
const ENTRY = "/workspace/work-unit/enrolled-children";

test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(700_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const save = (n: string, v: unknown) => {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/${n}.json`, JSON.stringify(v, null, 2));
};

async function openDetails(page: import("@playwright/test").Page) {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    expect(page.url()).not.toContain("/login");
    /*
     * The door is the card's own "Details →" button. `[data-financials-open-details]` does NOT
     * exist on the deployed build — an earlier pass used it, silently stayed on the entry card,
     * and reported the Details controls as absent. A probe that cannot open the surface it is
     * measuring must fail, not report zeros, so this asserts the door before going through it.
     */
    const details = page.locator("[data-financials-card='true']")
        .getByRole("button", { name: /^Details/ })
        .first();
    await expect(details, "the Financials card offers a Details door").toHaveCount(1);
    await details.click({ timeout: 20_000 });
    await page.waitForTimeout(12_000);
    await expect(
        page.locator("[data-financials-payment-methods], [data-testid='financials-filter-responsible-party']").first(),
        "Details actually opened — measured by a control only Details has",
    ).toHaveCount(1, { timeout: 30_000 });
}

/** What the surface looks like before a depth panel opens, for the §29 return-to-state check. */
async function detailsFingerprint(page: import("@playwright/test").Page) {
    return page.evaluate(() => ({
        url: location.pathname + location.search,
        rows: document.querySelectorAll("[data-financials-ledger-row],[data-charge-row]").length,
        panels: document.querySelectorAll("[data-testid=adjustment-panel],[data-testid=payment-move-panel]").length,
    }));
}

test("§10 §29 — Adjustment, canonical controls and a depth stack that returns", async ({ page }) => {
    const R: Record<string, unknown> = {};
    await openDetails(page);
    R.before = await detailsFingerprint(page);

    const adjust = page.getByText("Add adjustment", { exact: false }).first();
    R.reachable = (await adjust.count()) > 0;
    if (!R.reachable) {
        log("ADJUSTMENT: no 'Add adjustment' affordance here — recorded, not asserted around");
        save("adjustment", R);
        return;
    }
    await adjust.click({ timeout: 20_000 });
    await page.waitForTimeout(9000);

    const controls: Record<string, unknown> = {};
    for (const id of ["adjustment-agreement", "adjustment-source-charge", "adjustment-category"]) {
        controls[id] = {
            canonical: await isAlloyControl(page, id),
            options: (await alloyOptions(page, id)).map((o) => o.label).slice(0, 6),
        };
    }
    /* Direction exists only for an adjustment, not a credit — its absence under credit is correct. */
    controls["adjustment-direction"] = { present: await page.locator('[data-testid="adjustment-direction"]').count() };
    R.controls = controls;
    R.nativeSelectsOnSurface = await page.locator("select").count();
    log(`ADJUSTMENT: ${JSON.stringify(controls)} nativeSelects=${R.nativeSelectsOnSurface}`);
    expect(R.nativeSelectsOnSurface, "no native select on the Adjustment surface").toBe(0);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(4000);
    R.afterEscape = await detailsFingerprint(page);
    log(`DEPTH before=${JSON.stringify(R.before)} afterEscape=${JSON.stringify(R.afterEscape)}`);
    save("adjustment", R);
});

test("§11 — Payment: method, payer, allocation, and a disabled option the keyboard respects", async ({ page }) => {
    const R: Record<string, unknown> = {};
    await openDetails(page);
    const pay = page.getByRole("button", { name: /^Payment$/ }).first();
    R.reachable = (await pay.count()) > 0;
    if (!R.reachable) {
        log("PAYMENT: no Payment command here — recorded");
        save("payment", R);
        return;
    }
    await pay.click({ timeout: 20_000 });
    await page.waitForTimeout(9000);

    const options = await alloyOptions(page, "financials-payment-method");
    R.method = { canonical: await isAlloyControl(page, "financials-payment-method"), options };
    const disabled = options.filter((o) => o.disabled);
    R.disabledOptions = disabled.map((d) => d.label);
    log(`PAYMENT METHOD: ${JSON.stringify(options)}`);

    /* A disabled option is VISIBLE and not a destination — arrowing must pass it by. */
    if (disabled.length > 0) {
        await openAlloy(page, "financials-payment-method");
        for (let i = 0; i < 12; i += 1) await page.keyboard.press("ArrowDown");
        const active = await page.evaluate(() => {
            const a = document.activeElement as HTMLElement | null;
            return { text: a?.innerText?.replace(/\s+/g, " ").trim() ?? null, disabled: a?.getAttribute("aria-disabled") };
        });
        R.keyboardLandedOnDisabled = active.disabled === "true";
        log(`ARROW WALK landed on: ${JSON.stringify(active)}`);
        expect(R.keyboardLandedOnDisabled, "arrowing never parks on a disabled option").toBe(false);
        await page.keyboard.press("Escape");
    }

    R.payer = {
        present: await page.locator('[data-testid="financials-payment-payer"]').count(),
        canonical: await isAlloyControl(page, "financials-payment-payer"),
    };
    R.nativeSelectsOnSurface = await page.locator("select").count();
    log(`PAYER: ${JSON.stringify(R.payer)} nativeSelects=${R.nativeSelectsOnSurface}`);
    expect(R.nativeSelectsOnSurface, "no native select on the Payment surface").toBe(0);
    save("payment", R);
    await page.keyboard.press("Escape");
});

test("§12 §13 §16 §17 §21 §28 — responsibility, payer administration, Prepaid", async ({ page }) => {
    const R: Record<string, unknown> = {};
    await openDetails(page);

    R.filterPresent = await page.locator('[data-testid="financials-filter-responsible-party"]').count();
    R.gearPresent = await page.locator('[data-financials-manage-responsibility="gear"]').count();
    R.geometry = await page.evaluate(() => {
        const f = document.querySelector('[data-testid="financials-filter-responsible-party"]');
        const g = document.querySelector('[data-financials-manage-responsibility="gear"]');
        if (!f || !g) return null;
        const fr = f.getBoundingClientRect(), gr = g.getBoundingClientRect();
        return { verticalDelta: Math.round(Math.abs(fr.top - gr.top)), horizontalGap: Math.round(gr.left - fr.right) };
    });
    log(`§12 filter=${R.filterPresent} gear=${R.gearPresent} geometry=${JSON.stringify(R.geometry)}`);

    R.prepaid = await page.evaluate(() => {
        const t = document.body.innerText.replace(/\s+/g, " ");
        return {
            availablePrepaid: (/Available prepaid\s*\$[\d,]+\.\d{2}/i.exec(t) || [null])[0],
            balance: (/Balance\s*\$[\d,]+\.\d{2}/i.exec(t) || [null])[0],
            heldNamed: /held/i.test(t),
            depositNamed: /deposit/i.test(t),
            prepaidGear: document.querySelectorAll("[data-financials-manage-prepaid]").length,
        };
    });
    log(`§21 PREPAID: ${JSON.stringify(R.prepaid)}`);
    expect((R.prepaid as { prepaidGear: number }).prepaidGear, "Prepaid is a position, not an authored policy").toBe(0);

    R.payerRow = await page.evaluate(() => {
        const sec = document.querySelector("[data-financials-payment-methods]");
        const t = (sec as HTMLElement | null)?.innerText?.replace(/\s+/g, " ") ?? "";
        const payBtn = Array.from(document.querySelectorAll("button")).find((b) => /^Payment$/.test(b.textContent?.trim() ?? ""));
        return {
            present: Boolean(sec),
            text: t.slice(0, 400),
            providerStateStated: /not connected|no method on file|cannot|unavailable|add a method/i.test(t),
            belowCommandRow: sec && payBtn ? sec.getBoundingClientRect().top > payBtn.getBoundingClientRect().top : null,
            deadLinks: Array.from(sec?.querySelectorAll("a[href='#'],a:not([href])") ?? []).length,
        };
    });
    log(`§16/§17 PAYER ROW: ${JSON.stringify(R.payerRow)}`);

    if (R.gearPresent) {
        const gear = page.locator('[data-financials-manage-responsibility="gear"]').first();
        R.gearAccessibleName = await gear.getAttribute("aria-label");
        /* §28 — keyboard-activate the gear, not click it. */
        await gear.focus();
        R.gearFocused = await activeElementDescriptor(page);
        await page.keyboard.press("Enter");
        await page.waitForTimeout(10_000);
        R.panel = await page.evaluate(() => {
            const t = document.body.innerText.replace(/\s+/g, " ");
            return {
                opened: /applies to|responsib/i.test(t),
                scopeControls: document.querySelectorAll('[data-testid="responsibility-scope"]').length,
                householdNamed: /household/i.test(t),
                text: t.slice(0, 900),
            };
        });
        R.scopeOptions = (await page.locator('[data-testid="responsibility-scope"]').count())
            ? (await alloyOptions(page, "responsibility-scope")).map((o) => o.label)
            : [];
        log(`§13 PANEL: ${JSON.stringify(R.panel)}`);
        log(`§13 SCOPES: ${JSON.stringify(R.scopeOptions)}`);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(3000);
        R.focusAfterEscape = await activeElementDescriptor(page);
        log(`§28 gearFocused=${R.gearFocused} afterEscape=${R.focusAfterEscape}`);
    }
    save("responsibility-details", R);
});

test("§22 §23 §24 §25 — deployed native-select census and responsive", async ({ page }) => {
    const R: Record<string, unknown> = {};
    for (const width of [1280, 1440, 1680]) {
        await page.setViewportSize({ width, height: 1050 });
        await openDetails(page);
        R[`w${width}`] = await page.evaluate(() => ({
            nativeSelects: document.querySelectorAll("select").length,
            alloyControls: document.querySelectorAll(".alloy-select").length,
            horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
            overflowBy: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            prepaidNamed: /available prepaid/i.test(document.body.innerText),
            gear: document.querySelectorAll('[data-financials-manage-responsibility="gear"]').length,
        }));
        log(`${width}: ${JSON.stringify(R[`w${width}`])}`);
        await page.screenshot({ path: `${OUT}/responsive-${width}.png`, fullPage: true });
    }
    save("responsive-and-census", R);
});
