/**
 * §10/§12 — what September ACTUALLY holds, counted.
 *
 * Both reruns reported `generated: 5` and `generated: 1` again, which is either idempotency
 * recognising existing rows and still counting them, or five and one duplicates. A summary line
 * cannot answer that; the ledger can.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-fx";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012" });
test.setTimeout(300_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("count the september tuition", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    const out = await page.evaluate(async () => {
        const r = await fetch("/api/admin/financials/ledger?date_from=2026-09-01&date_to=2026-09-30&limit=500", { credentials: "include", cache: "no-store" });
        const b = (await r.json().catch(() => null)) as Record<string, unknown> | null;
        const rows = (Array.isArray(b) ? b : (b?.rows ?? b?.entries ?? b?.data ?? [])) as Array<Record<string, unknown>>;
        return {
            status: r.status,
            keys: b && !Array.isArray(b) ? Object.keys(b) : null,
            total: rows.length,
            sample: rows.slice(0, 3),
            tuition: rows
                .filter((x) => /tuition/i.test(JSON.stringify(x)))
                .map((x) => ({
                    id: x.id, date: x.date ?? x.service_date ?? x.invoice_date,
                    amount: x.amount_cents ?? x.amount, label: x.label ?? x.description ?? x.title,
                    member: x.customer_member_id, period: x.period_key ?? x.billing_period_key,
                    resolution: x.resolution_key, status: x.status,
                })),
        };
    });
    writeFileSync(`${OUT}/ledger.json`, JSON.stringify(out, null, 2));
    log(`status=${out.status} keys=${JSON.stringify(out.keys)} total=${out.total} tuitionRows=${out.tuition.length}`);
    log(JSON.stringify(out.tuition, null, 1).slice(0, 4000));
    log(`sample: ${JSON.stringify(out.sample, null, 1).slice(0, 1500)}`);
});
