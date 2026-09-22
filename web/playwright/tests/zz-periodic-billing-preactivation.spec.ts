/**
 * §4 + §17 — PROMOTION ALONE ACTIVATED NOTHING, proven on the deployed product.
 *
 * The handler is productized and deployed. This tenant has no Periodic Billing schedule, so
 * automatic billing is not active for it — and the surface that an operator reads must say so
 * rather than inferring activation from a deploy.
 */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/periodic-billing";
const MERGE = "c361680a9c7d35bd03c9a42fedd085cbe8cd8339";

test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("pre-activation state", async ({ page }) => {
    await page.goto("/organization/financials?chapter=tuition&setup=frequencies", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(16_000);
    expect(page.url(), "signed in").not.toContain("/login");

    const build = await page.evaluate(async () => (await fetch("/api/build-info", { credentials: "include" })).json());
    log(`BUILD ${JSON.stringify(build)}`);
    expect(build.gitSha).toBe(MERGE);
    expect(build.gitBranch).toBe("staging");
    expect(build.nodeEnv).toBe("production");
    expect(build.supabaseProjectRef).toBe("ikaxilmwmrmbagoidedu");

    /* The status route exists only in the promoted candidate — its presence IS the deploy proof. */
    const status = await page.evaluate(async () => {
        const r = await fetch("/api/admin/financials/periodic-billing-status", { credentials: "include" });
        return { status: r.status, body: r.ok ? await r.json() : null };
    });
    log(`STATUS ${JSON.stringify(status)}`);
    expect(status.status, "the productized status route is deployed").toBe(200);
    expect(status.body.automatic_billing_active, "this tenant is NOT active").toBe(false);
    expect(status.body.schedule_exists, "this tenant has no schedule").toBe(false);
    expect(status.body.automatic_catch_up_period_limit).toBe(2);

    /* §17 — and the surface says so. */
    await expect(page.locator('[data-testid="tuition-billing-frequencies-panel"]')).toHaveCount(1, { timeout: 40_000 });
    await expect(page.locator('[data-testid="periodic-billing-automation-status"]')).toHaveCount(1, { timeout: 40_000 });
    const claim = await page.locator('[data-testid="periodic-billing-automation-status"]').first().innerText();
    const flag = await page.locator("[data-periodic-billing-active]").first().getAttribute("data-periodic-billing-active");
    log(`UI CLAIM (${flag}): ${claim}`);
    expect(flag).toBe("false");
    expect(claim).toMatch(/NOT billed automatically/);

    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/pre-activation-mounted.json`, JSON.stringify({ build, status, flag, claim }, null, 2));
    await page.screenshot({ path: `${OUT}/pre-activation-ui.png`, fullPage: true });
});
