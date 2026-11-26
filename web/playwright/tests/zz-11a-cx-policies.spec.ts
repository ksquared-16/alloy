/**
 * §15 — why "No configured terms" on a generated tuition charge.
 *
 * `dueDateForIntent` resolves `due_date` scoped to the TEMPLATE's `service_id`, and the tenant's
 * tuition template carries `service_id: null`. So the question is whether the authored due-date
 * policies are service-scoped — in which case a null-service template matches none of them.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-cx";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012" });
test.setTimeout(240_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("the financial policies", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    const out = await page.evaluate(async () => {
        const j = async (u: string) => {
            const r = await fetch(u, { credentials: "include", cache: "no-store" });
            return { status: r.status, body: await r.json().catch(() => null) };
        };
        const pol = await j("/api/admin/financial/policies");
        const b = pol.body as Record<string, unknown> | null;
        const rows = (Array.isArray(b) ? b : (b?.policies ?? b?.data ?? [])) as Array<Record<string, unknown>>;
        return {
            status: pol.status,
            keys: b && !Array.isArray(b) ? Object.keys(b) : null,
            count: rows.length,
            byType: rows.reduce<Record<string, number>>((a, p) => {
                const k = String(p.policy_type ?? p.type ?? "?");
                a[k] = (a[k] ?? 0) + 1;
                return a;
            }, {}),
            dueDate: rows.filter((p) => /due_date/.test(String(p.policy_type ?? p.type ?? ""))).map((p) => ({
                id: p.id, type: p.policy_type ?? p.type, label: p.label ?? p.name,
                service: p.service_id, location: p.location_id, ratePlan: p.rate_plan_id,
                active: p.is_active, from: p.effective_start, to: p.effective_end, value: p.value,
            })),
        };
    });
    writeFileSync(`${OUT}/policies.json`, JSON.stringify(out, null, 2));
    log(`status=${out.status} keys=${JSON.stringify(out.keys)} count=${out.count} byType=${JSON.stringify(out.byType)}`);
    log(JSON.stringify(out.dueDate, null, 1).slice(0, 2500));
});
