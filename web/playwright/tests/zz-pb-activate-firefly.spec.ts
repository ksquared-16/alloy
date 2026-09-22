/**
 * §9 + §10 — activate Firefly through the canonical authority, and prove the surface tells the
 * truth the moment it is active.
 *
 * Provisioning is the activation. It goes through the authenticated route gated on `fin.write`,
 * never a direct scheduled_work insert.
 */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/periodic-billing";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("activate firefly", async ({ page }) => {
    await page.goto("/organization/financials?chapter=tuition&setup=frequencies", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(16_000);
    expect(page.url(), "signed in").not.toContain("/login");

    const build = await page.evaluate(async () => (await fetch("/api/build-info", { credentials: "include" })).json());
    log(`BUILD ${build.gitSha} ${build.gitBranch} ${build.nodeEnv} ${build.vercelDeploymentId} ${build.supabaseProjectRef}`);

    const before = await page.evaluate(async () =>
        (await fetch("/api/admin/financials/periodic-billing-status", { credentials: "include" })).json());
    log(`BEFORE ${JSON.stringify(before)}`);
    expect(before.automatic_billing_active, "not active before").toBe(false);

    const activation = await page.evaluate(async () => {
        const r = await fetch("/api/admin/financials/periodic-billing-activation", {
            method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        });
        return { status: r.status, body: await r.json().catch(() => null) };
    });
    log(`ACTIVATION ${JSON.stringify(activation)}`);
    expect(activation.status, "the canonical activation authority accepted").toBe(200);
    expect(activation.body.activated).toBe(true);

    const after = await page.evaluate(async () =>
        (await fetch("/api/admin/financials/periodic-billing-status", { credentials: "include" })).json());
    log(`AFTER ${JSON.stringify(after)}`);
    expect(after.automatic_billing_active).toBe(true);
    expect(after.schedule_exists).toBe(true);

    /* §10 — the operator surface, re-read from the live schedule. */
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(16_000);
    await expect(page.locator('[data-testid="periodic-billing-automation-status"]')).toHaveCount(1, { timeout: 40_000 });
    const flag = await page.locator("[data-periodic-billing-active]").first().getAttribute("data-periodic-billing-active");
    const claim = await page.locator('[data-testid="periodic-billing-automation-status"]').first().innerText();
    log(`UI (${flag}): ${claim}`);
    expect(flag).toBe("true");
    expect(claim).toMatch(/billed automatically/);
    expect(claim, "and it does not expose scheduler internals").not.toMatch(/lease|claim|occurrence|worker/i);

    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/firefly-activation.json`, JSON.stringify({ build, before, activation, after, flag, claim }, null, 2));
    await page.screenshot({ path: `${OUT}/firefly-active-ui.png`, fullPage: true });
});
