/** Which tuition input is still missing, named rather than guessed. */
import { test } from "@playwright/test";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com" });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
test("facts", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    const r = await page.evaluate(async () => {
        const g = async (u: string) => (await (await fetch(u, { credentials: "include" })).json());
        const mineOf = (b: { assignments?: Array<Record<string, unknown>> }, ocm: string) =>
            (b.assignments ?? []).find((a) => a.opportunityCustomerMemberId === ocm) ?? null;
        const spec = mineOf(await g("/api/admin/financial-config/opportunity/ebe6cb44-957b-48f0-9a6d-603670443ec2"),
            "e9965c7c-608e-4f68-a15b-2475374e2ecf");
        const certa = mineOf(await g("/api/admin/financial-config/opportunity/e56e72d5-c7bc-41ff-8d34-f5d34fd4160a"),
            "79f8011d-a236-4054-bee7-af10f1dbc632");
        return {
            specimen: { facts: spec?.facts, factSources: spec?.factSources, state: spec?.state, reason: spec?.noMatchReason, rejected: spec?.rejected },
            certa_forComparison: { facts: certa?.facts, factSources: certa?.factSources, state: certa?.state },
        };
    });
    log(JSON.stringify(r, null, 1).slice(0, 3000));
});
