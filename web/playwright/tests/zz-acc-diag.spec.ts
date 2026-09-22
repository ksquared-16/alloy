import { test, expect } from "@playwright/test";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(240_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
test("what does adopt answer", async ({ page }) => {
    await page.goto("/organization/financials?chapter=accounting", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    expect(page.url()).not.toContain("/login");
    const out = await page.evaluate(async () => {
        const call = async (entity_id: string) => {
            const r = await fetch("/api/admin/actions/execute", {
                method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action_key: "billing.adopt_accounting_calendar", entity_type: "person", entity_id,
                    mode: "execute", confirmation: { confirmed: true }, payload: { start_year: 2026 },
                }),
            });
            return { entity_id: entity_id || "(empty)", status: r.status, body: JSON.stringify(await r.json().catch(() => null)).slice(0, 500) };
        };
        return { empty: await call("") };
    });
    log(JSON.stringify(out, null, 1));
});
