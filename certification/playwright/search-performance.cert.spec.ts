import { test, expect } from "@playwright/test";

/**
 * Search Platform V2 — latency baseline against the certification tenant.
 *
 * The DB here is LOCAL (54422), so unlike the previous sprint's measurement the
 * remote round-trip is removed and what remains is Search's own work plus Next
 * dev overhead. `[admin-timing] total_ms` in the server log isolates the former.
 */
test.use({ storageState: undefined });

const OPERATOR = { email: "qa.operator@northwind.invalid", password: "alloy-local-cert" };
const QUERIES = ["Joe Smith", "Smith", "Emma", "Kurzman", "Rivers", "Joe Smith schedule",
                 "Smith schedule", "Joe Smith enrollment", "Campus", "Jane"];

test("search latency baseline", async ({ page }) => {
    test.setTimeout(900_000);
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(OPERATOR.email);
    const pw = page.locator('input[type="password"]').first();
    await pw.fill(OPERATOR.password);
    await pw.press("Enter");
    await page.waitForURL("**/workspace**", { timeout: 600_000 });

    const measure = async (q: string) =>
        page.evaluate(async (query) => {
            const t0 = performance.now();
            const res = await fetch(`/api/admin/global-search?q=${encodeURIComponent(query)}&limit=20`, {
                credentials: "include",
            });
            const body = await res.json();
            return { ms: Math.round(performance.now() - t0), n: (body.results ?? []).length, ok: res.ok };
        }, q);

    // COLD: first call for each distinct query (config cache may be cold too).
    const cold = await measure("Joe Smith");
    console.log(`[PERF] cold ms=${cold.ms} results=${cold.n}`);

    const warm: Array<{ ms: number; n: number }> = [];
    for (let round = 0; round < 3; round += 1) {
        for (const q of QUERIES) {
            const r = await measure(q);
            expect(r.ok).toBe(true);
            warm.push({ ms: r.ms, n: r.n });
        }
    }

    const times = warm.map((w) => w.ms).sort((a, b) => a - b);
    const p = (q: number) => times[Math.min(times.length - 1, Math.floor(times.length * q))];
    const total = warm.reduce((a, w) => a + w.n, 0);
    console.log(
        `[PERF] samples=${times.length} results_total=${total} ` +
        `min=${times[0]} p50=${p(0.5)} p95=${p(0.95)} max=${times[times.length - 1]} ` +
        `mean=${Math.round(times.reduce((a, b) => a + b, 0) / times.length)}`
    );
});
