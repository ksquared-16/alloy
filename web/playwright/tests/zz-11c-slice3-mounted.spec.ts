/**
 * 11C SLICE 3 — MOUNTED CERTIFICATION.
 *
 * §34 FALSE-GREEN GUARD is the spine of this file: every assertion first proves it reached the
 * surface it is about. `reach()` fails loudly when the surface never opened, because an absence
 * read from an unopened surface is the defect that has cost this thread three false findings —
 * a removed affordance hunted as missing, a selector the product never emitted, and a control
 * counted on a page that had not loaded.
 *
 * Nothing here writes. Kelly's Human-QA fixture is read only.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11c-slice3-mounted";
const ENTRY = "/workspace/work-unit/enrolled-children";
const MERGE = "76a8f3fc840cf46ff250ee69a02a9b0cbe19c59c";

test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const save = (n: string, v: unknown) => { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/${n}.json`, JSON.stringify(v, null, 2)); };
const shot = async (page: Page, n: string) => { mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true }); };

/** §34 — prove arrival before asserting anything about a surface. */
async function reach(where: string, locator: Locator, timeout = 30_000) {
    await expect(locator, `§34 reached ${where}`).toHaveCount(1, { timeout });
}

async function openDetails(page: Page) {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    expect(page.url(), "the governed QA session is live").not.toContain("/login");
    const door = page.locator("[data-financials-card='true']").getByRole("button", { name: /^Details/ }).first();
    await reach("the Details door", door);
    await door.click({ timeout: 20_000 });
    await page.waitForTimeout(12_000);
    await reach("Financials Details", page.locator("[data-financials-payment-methods]").first());
}

async function openPolicies(page: Page) {
    await page.goto("/organization/financials", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    const open = page.getByRole("button", { name: /open policies/i }).first();
    await reach("the Policies tile button", open);
    await open.click({ timeout: 20_000 });
    await page.waitForTimeout(12_000);
    await reach("the Policies rail", page.locator("[data-testid='policies-configuration-shell']").first());
}

test("§5 — the deployed build this evidence binds to", async ({ page }) => {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(10_000);
    const build = await page.evaluate(async () => (await fetch("/api/build-info", { credentials: "include" })).json());
    log(`BUILD ${JSON.stringify(build)}`);
    expect(build.gitSha, "the merged slice").toBe(MERGE);
    expect(build.gitBranch).toBe("staging");
    expect(build.nodeEnv, "production runtime, no HMR").toBe("production");
    expect(build.supabaseProjectRef).toBe("ikaxilmwmrmbagoidedu");
    save("build", build);
});

test("§6 §7 §8 §9 — the family Discount position, management and exception affordance", async ({ page }) => {
    const R: Record<string, unknown> = {};
    await openDetails(page);

    /* §6 — the position exists, reached by ordinary navigation and no internal route. */
    await reach("the Discount position", page.locator("[data-financials-discount-position]").first());
    R.position = await page.evaluate(() => {
        const root = document.querySelector("[data-financials-discount-position]") as HTMLElement | null;
        return {
            text: root?.innerText?.replace(/\s+/g, " ").trim() ?? null,
            policies: Array.from(root?.querySelectorAll("[data-financials-discount-policy]") ?? []).map((e) => ({
                policyId: e.getAttribute("data-financials-discount-policy"),
                text: (e as HTMLElement).innerText.replace(/\s+/g, " ").trim(),
            })),
            subjects: Array.from(root?.querySelectorAll("[data-financials-discount-subject]") ?? []).map(
                (e) => (e as HTMLElement).innerText.replace(/\s+/g, " ").trim(),
            ),
            gear: root?.querySelectorAll('[data-financials-manage-discounts="gear"]').length ?? 0,
            loading: root?.querySelectorAll("[data-financials-discount-loading]").length ?? 0,
            error: (root?.querySelector("[data-financials-discount-error]") as HTMLElement | null)?.innerText ?? null,
            none: root?.querySelectorAll("[data-financials-discount-none]").length ?? 0,
        };
    });
    log(`§6 POSITION: ${JSON.stringify(R.position)}`);

    /* §7 — geometry: does it belong, and does it displace anything? */
    R.anatomy = await page.evaluate(() => {
        const box = (sel: string) => {
            const el = document.querySelector(sel) as HTMLElement | null;
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
        };
        const payBtn = Array.from(document.querySelectorAll("button")).find((b) => /^Payment$/.test(b.textContent?.trim() ?? ""));
        return {
            discounts: box("[data-financials-discount-position]"),
            payerMethods: box("[data-financials-payment-methods]"),
            responsibilityFilter: box('[data-testid="financials-filter-responsible-party"]'),
            responsibilityGear: box('[data-financials-manage-responsibility="gear"]'),
            paymentButton: payBtn ? { top: Math.round(payBtn.getBoundingClientRect().top) } : null,
            prepaidNamed: /available prepaid/i.test(document.body.innerText),
            horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        };
    });
    log(`§7 ANATOMY: ${JSON.stringify(R.anatomy)}`);
    await shot(page, "A-family-discount-1680");

    /* §8 — management depth, reached through the gear. */
    const gear = page.locator('[data-financials-manage-discounts="gear"]').first();
    await reach("the Discount gear", gear);
    R.gearName = await gear.getAttribute("aria-label");
    await gear.click({ timeout: 20_000 });
    await page.waitForTimeout(9000);
    await reach("Discount management", page.locator('[data-financials-manage-discounts="open-panel"]').first());
    R.management = await page.evaluate(() => {
        const p = document.querySelector('[data-financials-manage-discounts="open-panel"]') as HTMLElement | null;
        return {
            text: p?.innerText?.replace(/\s+/g, " ").slice(0, 900) ?? null,
            policies: Array.from(p?.querySelectorAll("[data-financials-discount-manage-policy]") ?? []).map((e) =>
                e.getAttribute("data-financials-discount-manage-policy"),
            ),
            addException: p?.querySelectorAll("[data-add-policy-exception]").length ?? 0,
            endException: p?.querySelectorAll("[data-end-policy-exception]").length ?? 0,
            liveExceptions: p?.querySelectorAll("[data-financials-discount-exception]").length ?? 0,
            /* A policy EDITOR must not appear here — this is family truth, not configuration. */
            policyEditorFields: p?.querySelectorAll("input[name*='rate'],input[name*='percent'],select").length ?? 0,
        };
    });
    log(`§8 MANAGEMENT: ${JSON.stringify(R.management)}`);
    await shot(page, "B-discount-management-1680");

    /* §9 — the exception draft requires a reason. Opened and inspected; NOTHING is confirmed. */
    const add = page.locator("[data-add-policy-exception]").first();
    if (await add.count()) {
        await add.click({ timeout: 15_000 });
        await page.waitForTimeout(3000);
        await reach("the exception draft", page.locator("[data-financials-discount-exception-draft]").first());
        R.exceptionDraft = await page.evaluate(() => {
            const confirm = document.querySelector("[data-financials-discount-exception-confirm]") as HTMLButtonElement | null;
            const reason = document.querySelector("[data-financials-discount-exception-reason]") as HTMLInputElement | null;
            return {
                reasonFieldPresent: Boolean(reason),
                confirmDisabledWithEmptyReason: confirm?.disabled ?? null,
                /* No economic value is offered or previewed by the draft. */
                amountFields: document.querySelectorAll("[data-financials-discount-exception-draft] input[type=number]").length,
            };
        });
        log(`§9 EXCEPTION DRAFT: ${JSON.stringify(R.exceptionDraft)}`);
        expect((R.exceptionDraft as { confirmDisabledWithEmptyReason: boolean }).confirmDisabledWithEmptyReason,
            "Confirm is refused until a reason is given").toBe(true);
        await page.keyboard.press("Escape");
    }
    save("family-discount", R);
});
