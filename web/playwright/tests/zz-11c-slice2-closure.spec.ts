/**
 * 11C SLICE 2 — FINAL MOUNTED CLOSURE against the repaired build.
 *
 * Nothing here writes. Where a proof would require mutating the designated Human-QA fixture, the
 * limit is reported and the effect is left to its deterministic lock — an unrun gate is never
 * converted into a PASS.
 */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

import { activeElementDescriptor, alloyOptions, isAlloyControl, openAlloy } from "../helpers/alloyControls";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11c-slice2";
const ENTRY = "/workspace/work-unit/enrolled-children";
const REPAIRED = "41a17c2a4aaef56fc4d81bf28f0ea448c9635bce";

test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(700_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const save = (n: string, v: unknown) => { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/${n}.json`, JSON.stringify(v, null, 2)); };

async function openDetails(page: import("@playwright/test").Page) {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    expect(page.url(), "QA session is live").not.toContain("/login");
    const d = page.locator("[data-financials-card='true']").getByRole("button", { name: /^Details/ }).first();
    await expect(d, "the Financials card offers a Details door").toHaveCount(1);
    await d.click({ timeout: 20_000 });
    await page.waitForTimeout(12_000);
    await expect(
        page.locator("[data-financials-payment-methods]").first(),
        "Details actually opened",
    ).toHaveCount(1, { timeout: 30_000 });
}

/** Everything §2 says must survive dismissing a depth card. */
async function fingerprint(page: import("@playwright/test").Page) {
    return page.evaluate(() => ({
        detailsOpen: document.querySelectorAll("[data-financials-payment-methods]").length,
        lens: document.querySelector("[data-financials-lens][aria-pressed='true'],[data-financials-lens].is-active")
            ?.getAttribute("data-financials-lens")
            ?? document.querySelector("[data-financials-lens]")?.getAttribute("data-financials-lens") ?? null,
        rows: document.querySelectorAll("[data-financials-ledger-row],[data-charge-row]").length,
        filters: Array.from(document.querySelectorAll("[data-testid^='financials-filter-']"))
            .map((e) => `${e.getAttribute("data-testid")}=${(e.querySelector(".alloy-select__value") as HTMLElement | null)?.innerText?.trim() ?? ""}`),
        gear: document.querySelectorAll('[data-financials-manage-responsibility="gear"]').length,
        panel: document.querySelectorAll('[data-testid="responsibility-scope"]').length,
    }));
}

test("§1 — the repaired build", async ({ page }) => {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(10_000);
    const build = await page.evaluate(async () => (await fetch("/api/build-info", { credentials: "include" })).json());
    log(`BUILD ${JSON.stringify(build)}`);
    expect(build.gitSha).toBe(REPAIRED);
    expect(build.gitBranch).toBe("staging");
    expect(build.nodeEnv).toBe("production");
    expect(build.supabaseProjectRef).toBe("ikaxilmwmrmbagoidedu");
    save("closure-build", build);
});

test("§2 §3 §14 — Escape dismisses the card and nothing else", async ({ page }) => {
    const R: Record<string, unknown> = {};
    await openDetails(page);
    R.before = await fingerprint(page);

    const gear = page.locator('[data-financials-manage-responsibility="gear"]').first();
    await expect(gear, "the gear is beside the filter").toHaveCount(1);
    await gear.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(9000);
    R.opened = await fingerprint(page);
    expect((R.opened as { panel: number }).panel, "the panel opened").toBeGreaterThan(0);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(4000);
    R.afterEscape = await fingerprint(page);
    R.focusAfterEscape = await activeElementDescriptor(page);
    log(`§2 before=${JSON.stringify(R.before)}`);
    log(`§2 afterEscape=${JSON.stringify(R.afterEscape)} focus=${R.focusAfterEscape}`);

    const a = R.afterEscape as Record<string, unknown>;
    const b = R.before as Record<string, unknown>;
    expect(a.panel, "the responsibility panel closed").toBe(0);
    expect(a.detailsOpen, "Details REMAINS open").toBeGreaterThan(0);
    expect(a.lens, "same lens").toBe(b.lens);
    expect(a.rows, "ledger context intact").toBe(b.rows);
    expect(a.filters, "same filters").toEqual(b.filters);
    expect(a.gear, "the gear is still there").toBeGreaterThan(0);
    expect(String(R.focusAfterEscape), "focus returns to the gear").toContain("Manage responsibility");

    /* §3 — outside click, the other supported dismissal. */
    await gear.click({ timeout: 15_000 });
    await page.waitForTimeout(8000);
    expect((await fingerprint(page)).panel, "reopened").toBeGreaterThan(0);
    await page.mouse.click(12, 12);
    await page.waitForTimeout(4000);
    R.afterOutsideClick = await fingerprint(page);
    log(`§3 afterOutsideClick=${JSON.stringify(R.afterOutsideClick)}`);
    save("closure-depth", R);
});

test("§4 — the Adjustment view model, read before any claim", async ({ page }) => {
    await openDetails(page);
    const diag = await page.evaluate(async () => {
        /* The card's own endpoint, with the query the card itself uses. */
        const perf = performance.getEntriesByType("resource").map((e) => e.name);
        const cardCall = perf.find((n) => n.includes("/api/admin/financials/card?"));
        if (!cardCall) return { error: "the card endpoint was not observed on this load", perfSample: perf.slice(0, 8) };
        const res = await fetch(cardCall, { credentials: "include" });
        const body = await res.json();
        const vm = body?.vm ?? body;
        const subjects = (vm?.subjects ?? []) as Array<Record<string, unknown>>;
        return {
            status: res.status,
            call: cardCall.replace(/^https?:\/\/[^/]+/, ""),
            subjectCount: subjects.length,
            subjects: subjects.map((s) => ({
                label: s.displayName ?? s.label ?? null,
                customerMemberId: s.customerMemberId ?? null,
                agreementId: s.agreementId ?? null,
            })),
            adjustableSubjects: subjects.filter((s) => s.agreementId).length,
        };
    });
    log(`§4 VIEW MODEL: ${JSON.stringify(diag, null, 1)}`);
    save("closure-adjustment-vm", diag);
});

test("§9 — Accounts parity, same panel and same depth contract", async ({ page }) => {
    const R: Record<string, unknown> = {};
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
    if (await nav.count()) { await nav.click({ force: true, timeout: 15_000 }); await page.waitForTimeout(13_000); }
    const tab = page.locator("[data-workspace-section-tab='accounts']").first();
    if (await tab.count()) { await tab.click({ timeout: 15_000 }); await page.waitForTimeout(13_000); }
    const row = page.locator("[data-financials-account-row]").first();
    if (await row.count()) { await row.click({ timeout: 15_000 }); await page.waitForTimeout(11_000); }

    R.filter = await page.locator('[data-testid="responsible-party"]').count();
    const gear = page.locator('[data-financials-manage-responsibility="gear"]').first();
    R.gear = await gear.count();
    R.beforeRows = await page.locator("[data-financials-account-row]").count();
    if (R.gear) {
        await gear.focus();
        await page.keyboard.press("Enter");
        await page.waitForTimeout(9000);
        R.panelOpened = await page.locator('[data-testid="responsibility-scope"]').count();
        R.scopes = R.panelOpened ? (await alloyOptions(page, "responsibility-scope")).map((o) => o.label) : [];
        await page.keyboard.press("Escape");
        await page.waitForTimeout(4000);
        R.afterEscape = {
            panel: await page.locator('[data-testid="responsibility-scope"]').count(),
            accountRows: await page.locator("[data-financials-account-row]").count(),
            gear: await page.locator('[data-financials-manage-responsibility="gear"]').count(),
            focus: await activeElementDescriptor(page),
        };
    }
    log(`§9 ACCOUNTS: filter=${R.filter} gear=${R.gear} scopes=${JSON.stringify(R.scopes)}`);
    log(`§9 afterEscape=${JSON.stringify(R.afterEscape)}`);
    save("closure-accounts-parity", R);
});

test("§13 §26 — single-select accessibility on the strongest specimen", async ({ page }) => {
    const R: Record<string, unknown> = {};
    await openDetails(page);
    const pay = page.getByRole("button", { name: /^Payment$/ }).first();
    await expect(pay).toHaveCount(1);
    await pay.click({ timeout: 20_000 });
    await page.waitForTimeout(9000);

    const id = "financials-payment-method";
    R.canonical = await isAlloyControl(page, id);
    const options = await alloyOptions(page, id);
    R.options = options;
    const disabledIndex = options.findIndex((o) => o.disabled);
    R.disabled = options.filter((o) => o.disabled).map((o) => o.label);

    /* Tab must REACH the trigger — not scripted focus. */
    await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
    let reached = false;
    for (let i = 0; i < 60 && !reached; i += 1) {
        await page.keyboard.press("Tab");
        reached = await page.evaluate((testId) => {
            const a = document.activeElement;
            return Boolean(a?.closest(`[data-testid="${testId}"]`));
        }, id);
    }
    R.tabReachedTrigger = reached;

    if (reached) {
        await page.keyboard.press("Enter");
        await page.waitForTimeout(700);
        R.openedWithEnter = (await page.locator(`[data-testid="${id}"] [role=listbox]`).count()) > 0;
        /* Arrow onto the disabled row deliberately: it must refuse to be the destination. */
        await page.keyboard.press("Home");
        for (let i = 0; i < disabledIndex; i += 1) await page.keyboard.press("ArrowDown");
        R.landedBeforeDisabled = await page.evaluate(() => {
            const a = document.activeElement as HTMLElement | null;
            return { text: a?.innerText?.replace(/\s+/g, " ").trim() ?? null, disabled: a?.getAttribute("aria-disabled") };
        });
        await page.keyboard.press("ArrowDown");
        R.afterArrowingPastDisabled = await page.evaluate(() => {
            const a = document.activeElement as HTMLElement | null;
            return { text: a?.innerText?.replace(/\s+/g, " ").trim() ?? null, disabled: a?.getAttribute("aria-disabled") };
        });
        await page.keyboard.press("Escape");
        await page.waitForTimeout(800);
        R.listAfterEscape = await page.locator(`[data-testid="${id}"] [role=listbox]`).count();
        R.focusAfterEscape = await activeElementDescriptor(page);
    }
    log(`§26 ${JSON.stringify({ tab: R.tabReachedTrigger, enter: R.openedWithEnter, disabled: R.disabled, past: R.afterArrowingPastDisabled, esc: R.listAfterEscape, focus: R.focusAfterEscape })}`);
    save("closure-single-select-a11y", R);
});

test("§16 §17 — runtime census and Responsibility at three widths", async ({ page }) => {
    const R: Record<string, unknown> = {};
    for (const width of [1280, 1440, 1680]) {
        await page.setViewportSize({ width, height: 1050 });
        await openDetails(page);
        const gear = page.locator('[data-financials-manage-responsibility="gear"]').first();
        if (await gear.count()) { await gear.click({ timeout: 15_000 }); await page.waitForTimeout(8000); }
        R[`w${width}`] = await page.evaluate(() => {
            const panel = document.querySelector('[data-financials-manage-responsibility="open-panel"]') as HTMLElement | null;
            const r = panel?.getBoundingClientRect();
            return {
                nativeSelects: document.querySelectorAll("select").length,
                alloySelects: document.querySelectorAll(".alloy-select:not(.alloy-select--multi)").length,
                alloyMultiSelects: document.querySelectorAll(".alloy-select--multi").length,
                panelOpen: Boolean(panel),
                panelWithinViewport: r ? r.left >= -1 && r.right <= window.innerWidth + 1 : null,
                horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
                overflowBy: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            };
        });
        log(`${width}: ${JSON.stringify(R[`w${width}`])}`);
        await page.screenshot({ path: `${OUT}/closure-responsibility-${width}.png`, fullPage: true });
        await page.keyboard.press("Escape");
    }
    save("closure-census-responsive", R);
});
