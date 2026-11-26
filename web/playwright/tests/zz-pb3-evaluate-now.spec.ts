/**
 * §13 — ask for the evaluation, then stop issuing commands and let the clock work.
 */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/periodic-billing";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com" });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("evaluate now", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    expect(page.url()).not.toContain("/login");

    const build = await page.evaluate(async () => (await fetch("/api/build-info", { credentials: "include" })).json());
    log(`BUILD ${build.gitSha} ${build.gitBranch} ${build.nodeEnv} ${build.vercelDeploymentId}`);
    expect(build.gitSha).toBe("20c3dd7e2ee5c293df210011825734f36e45ff59");

    const before = await page.evaluate(async () =>
        (await fetch("/api/admin/financials/periodic-billing-status", { credentials: "include" })).json());
    log(`STATUS BEFORE ${JSON.stringify(before)}`);

    const req = await page.evaluate(async () => {
        const r = await fetch("/api/admin/financials/periodic-billing-evaluate-now", {
            method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        });
        return { status: r.status, body: await r.json().catch(() => null) };
    });
    log(`EVALUATE NOW ${JSON.stringify(req)}`);
    expect(req.status).toBe(200);
    expect(req.body.outcome).toBe("evaluation_requested");

    const after = await page.evaluate(async () =>
        (await fetch("/api/admin/financials/periodic-billing-status", { credentials: "include" })).json());
    log(`STATUS AFTER ${JSON.stringify(after)}`);

    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/evaluate-now-request.json`, JSON.stringify({ build, before, req, after }, null, 2));
});
