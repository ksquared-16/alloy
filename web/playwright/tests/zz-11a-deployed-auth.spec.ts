/** Is the stored deployed session still live? Asked before the deploy lands, so a dead one can be restored in parallel rather than serially. */
import { test } from "@playwright/test";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1400, height: 900 } });
test.setTimeout(240_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
test("deployed session liveness", async ({ page }) => {
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(14_000);
    const out = await page.evaluate(async () => {
        const r = await fetch("/api/admin/qa/financials-director", { credentials: "include", cache: "no-store" });
        const b = (await r.json().catch(() => null)) as { catalogVersion?: string; scenarios?: unknown[] } | null;
        return {
            url: location.pathname,
            head: (document.body.innerText || "").slice(0, 200).replace(/\n+/g, " / "),
            qaStatus: r.status,
            catalogVersion: b?.catalogVersion ?? null,
            scenarios: b?.scenarios?.length ?? null,
        };
    });
    log(JSON.stringify(out, null, 1));
});
