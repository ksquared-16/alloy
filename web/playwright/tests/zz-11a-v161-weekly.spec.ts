/**
 * §5/§6 — the Weekly billing frequency and whatever weekly rate already stands behind it.
 *
 * The frequencies surface reports Weekly as Active with ONE plan using it, so the first question is
 * not "create it" but "which plan, and at what rate" — creating a second Weekly frequency because a
 * probe did not look would be configuration damage, not progress. Reload proves persistence.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-v161";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(300_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("weekly frequency + weekly rate", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });

    // ── Persistence: a fresh navigation, not a client-side tab switch ──
    await page.goto("/organization/financials?chapter=tuition&setup=frequencies", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(10_000);
    const freqTable = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("tr")).map((r) => (r as HTMLElement).innerText.replace(/\t+/g, " | ").replace(/\s+/g, " ").trim());
        return rows.filter(Boolean).slice(0, 20);
    });
    await page.screenshot({ path: `${OUT}/weekly-frequencies.png`, fullPage: true });
    log(`FREQUENCIES (after a fresh load):\n${freqTable.join("\n")}`);

    // ── Which plans exist, on every status, and what cadence each is priced on ──
    await page.goto("/organization/financials?chapter=tuition", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(10_000);
    const filter = page.locator('[data-testid="tuition-plans-nav-filter"]');
    if (await filter.count()) await filter.selectOption({ label: "All" }).catch(() => undefined);
    await page.waitForTimeout(5000);
    const plans = await page.evaluate(() =>
        Array.from(document.querySelectorAll("button"))
            .map((b) => (b as HTMLElement).innerText.replace(/\s+/g, " ").trim())
            .filter((t) => /Active|Archived/.test(t) && /·/.test(t))
            .slice(0, 30),
    );
    await page.screenshot({ path: `${OUT}/weekly-plans.png`, fullPage: true });
    log(`\nPLANS (all statuses):\n${plans.join("\n")}`);

    // ── The catalog itself: what the commercial export offers, cadence by cadence ──
    const catalog = await page.evaluate(async () => {
        const j = async (u: string) => {
            const r = await fetch(u, { credentials: "include" });
            return { status: r.status, body: await r.json().catch(() => null) };
        };
        const rates = await j("/api/admin/commercial/tuition-rates");
        const body = rates.body as { rates?: Array<Record<string, unknown>>; data?: Array<Record<string, unknown>> } | null;
        const list = body?.rates ?? body?.data ?? (Array.isArray(rates.body) ? (rates.body as Array<Record<string, unknown>>) : []);
        return {
            status: rates.status,
            keys: rates.body && typeof rates.body === "object" ? Object.keys(rates.body as object) : null,
            count: list.length,
            byCadence: list.reduce<Record<string, number>>((acc, r) => {
                const c = String(r.cadence_key ?? r.cadenceKey ?? "?");
                acc[c] = (acc[c] ?? 0) + 1;
                return acc;
            }, {}),
            weekly: list.filter((r) => /week/i.test(String(r.cadence_key ?? r.cadenceKey ?? ""))).slice(0, 10),
        };
    });
    writeFileSync(`${OUT}/weekly.json`, JSON.stringify({ freqTable, plans, catalog }, null, 2));
    log(`\nCATALOG: status=${catalog.status} keys=${JSON.stringify(catalog.keys)} count=${catalog.count}`);
    log(`by cadence: ${JSON.stringify(catalog.byCadence)}`);
    log(`weekly rates: ${JSON.stringify(catalog.weekly, null, 1).slice(0, 1500)}`);
});
