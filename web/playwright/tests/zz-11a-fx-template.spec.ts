/**
 * Every generated tuition charge came out at $400.00 — not the accepted $1,450.00 monthly or
 * $185.00 weekly. `resolveAmount` in `resolveChargeFromTemplate` returns the TEMPLATE's own amount
 * when `amount_strategy === "fixed"`, ignoring `ctx.resolvedAmountCents`, which is where the
 * accepted term's price arrives. This reads the tenant's tuition templates so the question
 * "configuration or product" is answered from the configuration itself.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-fx";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012" });
test.setTimeout(240_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("the tuition charge templates", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    const out = await page.evaluate(async () => {
        const r = await fetch("/api/admin/financial/charge-templates", { credentials: "include", cache: "no-store" });
        const b = (await r.json().catch(() => null)) as Record<string, unknown> | null;
        const rows = (Array.isArray(b) ? b : (b?.templates ?? b?.data ?? [])) as Array<Record<string, unknown>>;
        return {
            status: r.status,
            keys: b && !Array.isArray(b) ? Object.keys(b) : null,
            count: rows.length,
            tuition: rows.filter((t) => /tuition/i.test(String(t.template_key ?? "") + String(t.label ?? ""))).map((t) => ({
                key: t.template_key, label: t.label, strategy: t.amount_strategy,
                amount: t.amount_cents, active: t.is_active, from: t.effective_start, to: t.effective_end,
                category: t.charge_category,
            })),
            strategies: rows.reduce<Record<string, number>>((acc, t) => {
                const k = String(t.amount_strategy ?? "?");
                acc[k] = (acc[k] ?? 0) + 1;
                return acc;
            }, {}),
        };
    });
    writeFileSync(`${OUT}/templates.json`, JSON.stringify(out, null, 2));
    log(`status=${out.status} keys=${JSON.stringify(out.keys)} count=${out.count} strategies=${JSON.stringify(out.strategies)}`);
    log(JSON.stringify(out.tuition, null, 1));
});
