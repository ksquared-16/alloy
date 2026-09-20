/**
 * The two gaps, measured instead of guessed at again.
 *
 * C2 reported no lenses and no filters while C1 had six stat labels open beside it, and J3 found
 * zero policy types while J4 "passed" on the same empty list — a pass that is vacuous and worth
 * nothing. Both readings are more likely my selectors than a deployed regression: this thread has
 * recorded six probe artifacts already. So this dumps the controls rather than asserting on guessed
 * labels.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11a-freeze";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("what the two gaps actually render", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });

    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(24_000);
    const details = page.getByRole("button", { name: /Details/, exact: false }).first();
    if (await details.count()) { await details.click(); await page.waitForTimeout(18_000); }
    const detail = await page.evaluate(() => {
        const scope = document.querySelector(".alloy-os-fdetail") ?? document.body;
        return {
            buttons: [...new Set(Array.from(scope.querySelectorAll("button")).map((b) => (b as HTMLElement).innerText.replace(/\s+/g, " ").trim()).filter(Boolean))].slice(0, 40),
            selects: Array.from(scope.querySelectorAll("select")).map((s) => ({
                testid: s.getAttribute("data-testid"), name: s.getAttribute("name"),
                options: Array.from((s as HTMLSelectElement).options).map((o) => o.text.trim()).slice(0, 10),
            })),
            lensMarkers: Array.from(scope.querySelectorAll("[data-lens], [data-financials-lens], [role=tab]")).map((e) => ({
                lens: e.getAttribute("data-lens") ?? e.getAttribute("data-financials-lens"),
                text: (e as HTMLElement).innerText.replace(/\s+/g, " ").trim().slice(0, 40),
            })).slice(0, 20),
            testids: [...new Set(Array.from(scope.querySelectorAll("[data-testid]")).map((e) => e.getAttribute("data-testid")))].slice(0, 30),
        };
    });
    await page.screenshot({ path: `${OUT}/gap-details.png`, fullPage: true });
    log(`DETAIL buttons: ${detail.buttons.join(" | ").slice(0, 700)}`);
    log(`DETAIL selects: ${JSON.stringify(detail.selects)}`);
    log(`DETAIL lens markers: ${JSON.stringify(detail.lensMarkers)}`);
    log(`DETAIL testids: ${detail.testids.join(", ")}`);

    await page.goto("/organization/financials?chapter=policies", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(18_000);
    const before = await page.evaluate(() => ({
        text: (document.body.innerText || "").slice(0, 900).replace(/\n+/g, " / "),
        buttons: [...new Set(Array.from(document.querySelectorAll("button")).map((b) => (b as HTMLElement).innerText.replace(/\s+/g, " ").trim()).filter(Boolean))].slice(0, 30),
    }));
    log(`\nPOLICIES chapter text: ${before.text}`);
    log(`POLICIES buttons: ${before.buttons.join(" | ").slice(0, 500)}`);
    const np = page.getByRole("button", { name: /New Policy/i }).first();
    log(`New Policy control count: ${await np.count()}`);
    if (await np.count()) { await np.click(); await page.waitForTimeout(9000); }
    const form = await page.evaluate(() => ({
        selects: Array.from(document.querySelectorAll("select")).map((s) => ({
            testid: s.getAttribute("data-testid"), name: s.getAttribute("name"),
            options: Array.from((s as HTMLSelectElement).options).map((o) => o.text.trim()),
        })),
        buttons: [...new Set(Array.from(document.querySelectorAll("button")).map((b) => (b as HTMLElement).innerText.replace(/\s+/g, " ").trim()).filter(Boolean))].slice(0, 30),
        text: (document.body.innerText || "").slice(0, 900).replace(/\n+/g, " / "),
    }));
    await page.screenshot({ path: `${OUT}/gap-policies.png`, fullPage: true });
    log(`\nPOLICY FORM selects: ${JSON.stringify(form.selects).slice(0, 1200)}`);
    log(`POLICY FORM text: ${form.text.slice(0, 700)}`);
    writeFileSync(`${OUT}/gap.json`, JSON.stringify({ detail, before, form }, null, 2));
});
