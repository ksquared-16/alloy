/** Why the Focus Panel Financials card never leaves `empty=loading`. */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/w7-repair-1";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("the Focus Panel card read, observed", async ({ page }) => {
    const calls: Record<string, unknown>[] = [];
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));
    page.on("requestfailed", (r) => { if (r.url().includes("financials")) calls.push({ phase: "FAILED", url: r.url().split("?")[1] ?? r.url(), err: r.failure()?.errorText }); });
    page.on("response", async (r) => {
        if (!/\/api\/admin\/financials\/card/.test(r.url())) return;
        let body: Record<string, unknown> = {};
        try {
            const j = (await r.json()) as { ok?: boolean; vm?: unknown; error?: unknown; reason?: unknown };
            body = { ok: j?.ok ?? null, hasVm: !!j?.vm, error: j?.error ?? null, reason: j?.reason ?? null };
        } catch (e) { body = { parse: String(e).slice(0, 80) }; }
        calls.push({ phase: "RESPONSE", status: r.status(), query: r.url().split("?")[1], ms: Math.round(r.request().timing().responseEnd), ...body });
    });

    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    for (let i = 0; i < 12; i++) {
        await page.waitForTimeout(10_000);
        const s = await page.evaluate(() => ({
            skeleton: !!document.querySelector("[data-financials-card-skeleton]"),
            empty: document.querySelector("[data-financials-empty]")?.getAttribute("data-financials-empty") ?? null,
            nav: !!document.querySelector("[data-financials-nav='details']"),
        }));
        if (!s.skeleton || s.nav) { log(`RESOLVED at ${(i + 1) * 10}s: ${JSON.stringify(s)}`); break; }
        if (i % 3 === 0) log(`  ${(i + 1) * 10}s: ${JSON.stringify(s)}`);
    }
    log(`CARD CALLS (${calls.length}): ${JSON.stringify(calls, null, 1)}`);
    log(`CONSOLE ERRORS (${errors.length}): ${JSON.stringify(errors.slice(0, 8))}`);
    const final = await page.evaluate(() => ({
        skeleton: !!document.querySelector("[data-financials-card-skeleton]"),
        empty: document.querySelector("[data-financials-empty]")?.getAttribute("data-financials-empty") ?? null,
        reserved: document.querySelector("[data-financials-reserved]")?.getAttribute("data-financials-reserved") ?? null,
        subject: document.querySelector("[data-financials-subject]")?.getAttribute("data-financials-subject") ?? null,
    }));
    log(`FINAL: ${JSON.stringify(final)}`);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/focus-panel-read.json`, JSON.stringify({ calls, errors, final }, null, 2));
    await page.screenshot({ path: `${OUT}/focus-panel-stuck.png` });
    expect(calls.length + errors.length).toBeGreaterThanOrEqual(0);
});
