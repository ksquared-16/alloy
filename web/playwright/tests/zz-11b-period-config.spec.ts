/** §25 — the two configured period systems, mounted: Billing Frequencies and the Accounting calendar. */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-setup";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("period configuration", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const out: Record<string, unknown> = {};

    // ── BILLING FREQUENCIES (commercial configuration) ──
    // The subnav is a route param, not a tab button: TuitionSetupSubnav → ?setup=frequencies.
    await page.goto("/organization/financials?chapter=tuition&setup=frequencies", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(17_000);
    out.frequencies = await page.evaluate(() => {
        const panel = document.querySelector("[data-testid='tuition-billing-frequencies-panel']") as HTMLElement | null;
        const heads = Array.from(document.querySelectorAll("[data-testid='billing-frequencies-table'] thead th")).map((t) => (t as HTMLElement).innerText.trim());
        const rows = Array.from(document.querySelectorAll("[data-testid='billing-frequencies-table'] tbody tr")).map((tr) => ({
            cells: Array.from(tr.querySelectorAll("td")).map((td) => (td as HTMLElement).innerText.trim()).filter(Boolean),
            key: tr.querySelector("[data-billing-recurrence]")?.getAttribute("data-billing-recurrence") ?? null,
            billable: tr.querySelector("[data-billing-recurrence]")?.getAttribute("data-billing-recurrence-billable") ?? null,
        }));
        return { reachable: Boolean(panel), intro: panel?.querySelector("p")?.textContent?.trim() ?? null, heads, rows };
    });
    log(`FREQUENCIES reachable=${(out.frequencies as { reachable: boolean }).reachable}`);
    log(`heads: ${JSON.stringify((out.frequencies as { heads: string[] }).heads)}`);
    for (const r of (out.frequencies as { rows: Array<Record<string, unknown>> }).rows) log(`  ${JSON.stringify(r)}`);
    log(`intro: ${(out.frequencies as { intro: string }).intro}`);
    await page.screenshot({ path: `${OUT}/config-frequencies.png`, fullPage: true });

    // ── ACCOUNTING CALENDAR (accounting configuration) ──
    await page.goto("/organization/financials?chapter=accounting", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(15_000);
    out.accounting = await page.evaluate(() => {
        const panel = document.querySelector("[data-testid='accounting-calendar-panel']") as HTMLElement | null;
        const text = panel?.innerText ?? "";
        return {
            panelPresent: Boolean(panel),
            text: text.replace(/\n+/g, " / ").slice(0, 1200),
            absent: Boolean(document.querySelector("[data-testid='accounting-calendar-absent']")),
            summary: (document.querySelector("[data-testid='accounting-calendar-summary']") as HTMLElement | null)?.innerText?.replace(/\n+/g, " · ") ?? null,
            saysCurrent: /Current/i.test(text),
            saysOpenClosed: /\bOpen\b|\bClosed\b/.test(text),
            /* §16: only controls the authority supports — there is no governed close action. */
            offersClose: Array.from(document.querySelectorAll("button")).some((b) => /close period|reopen/i.test((b as HTMLElement).innerText)),
        };
    });
    log(`\nACCOUNTING: ${JSON.stringify(out.accounting, null, 1)}`);
    await page.screenshot({ path: `${OUT}/config-accounting.png`, fullPage: true });
    writeFileSync(`${OUT}/period-config.json`, JSON.stringify(out, null, 2));
});
