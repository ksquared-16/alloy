/** Which (program, attendance, site) the organisation has actually authored a rate for. */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/periodic-billing";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com" });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("authored rates", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    const r = await page.evaluate(async () => {
        const j = async (x: Response) => { const t = await x.text(); try { return JSON.parse(t); } catch { return t; } };
        const get = async (u: string) => { const x = await fetch(u, { credentials: "include" }); return { s: x.status, j: await j(x) }; };
        const plans = await get("/api/admin/financials/tuition-plans");
        /* Certa's own accepted term names the rate that demonstrably prices. */
        const certa = await get("/api/admin/financial-config/opportunity/e56e72d5-c7bc-41ff-8d34-f5d34fd4160a");
        const ca = ((certa.j as { assignments?: Array<Record<string, unknown>> })?.assignments ?? [])
            .find((a) => a.opportunityCustomerMemberId === "79f8011d-a236-4054-bee7-af10f1dbc632") ?? null;
        return {
            plansStatus: plans.s,
            plans: JSON.stringify(plans.j).slice(0, 3000),
            certaFacts: ca?.facts,
            certaRecommended: JSON.stringify(ca?.recommended ?? null).slice(0, 600),
            certaApplicable: JSON.stringify(ca?.applicable ?? []).slice(0, 600),
            certaAccepted: JSON.stringify(ca?.accepted ?? null).slice(0, 500),
        };
    });
    log(JSON.stringify(r, null, 1).slice(0, 6000));
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/authored-rates.json`, JSON.stringify(r, null, 2));
});
