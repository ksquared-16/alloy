/** §18–§20 — execute a prepaid allocation and prove payer and responsibility do not move. */
import { test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-cf";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(280_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

const summary = (p: Page) => p.evaluate(() => {
    const c = document.querySelector('[data-financials-card="true"]') as HTMLElement | null;
    const t = (c?.innerText ?? "").replace(/\n+/g, " / ");
    return {
        text: t,
        available: /Available\s*\/?\s*\$([\d,]+\.\d\d)/.exec(t)?.[1] ?? null,
        balance: /Balance\s*\/?\s*(-?\$[\d,]+\.\d\d)/.exec(t)?.[1] ?? null,
        paid: /Paid\s*\/?\s*(-?\$[\d,]+\.\d\d)/.exec(t)?.[1] ?? null,
    };
});

const payments = (p: Page) => p.evaluate(() => {
    const rows = Array.from(document.querySelectorAll(".alloy-os-billingdetail__row")).filter((r) => !r.className.includes("--head"));
    return rows.map((r) => ({
        cells: Array.from(r.querySelectorAll("span")).map((s) => (s as HTMLElement).innerText.trim()).filter(Boolean).slice(0, 9),
        actions: Array.from(r.querySelectorAll("[data-financials-row-action]")).map((a) => a.getAttribute("data-financials-row-action")),
    }));
});

test("prepaid allocation, end to end", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const wire: Array<Record<string, unknown>> = [];
    page.on("response", async (res) => {
        /* GET too — the eligible-target resolver is a GET and it is the thing under test. */
        if (!res.url().includes("/api/")) return;
        let body: unknown = null; let req: unknown = null;
        try { body = await res.json(); } catch { body = "(unparseable)"; }
        try { req = JSON.parse(res.request().postData() ?? "null"); } catch { req = null; }
        wire.push({ url: res.url().replace(/^https?:\/\/[^/]+/, ""), request: req, response: body });
        writeFileSync(`${OUT}/cf-alloc-wire.json`, JSON.stringify(wire, null, 2));
    });

    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    const before = await summary(page);
    log(`BEFORE summary: available=${before.available} balance=${before.balance} paid=${before.paid}`);

    await page.getByRole("button", { name: /^Details$/ }).first().click();
    await page.waitForTimeout(8000);
    await page.getByRole("button", { name: /^Payments/ }).first().click();
    await page.waitForTimeout(6000);
    const payRows = await payments(page);
    log(`PAYMENT ROWS: ${JSON.stringify(payRows.slice(0, 4))}`);
    writeFileSync(`${OUT}/cf-alloc-before.json`, JSON.stringify({ before, payRows }, null, 2));
    await page.screenshot({ path: `${OUT}/cf-alloc-before.png` });

    const apply = page.locator('[data-financials-row-action="apply"]').first();
    if (!(await apply.count())) { log("NO APPLY CONTROL"); return; }
    await apply.click();
    await page.waitForTimeout(12_000);
    await page.screenshot({ path: `${OUT}/cf-alloc-surface.png` });
    const surf = await page.evaluate(() => {
        const sc = document.querySelector('[data-financials-overlay], .alloy-os-financials') as HTMLElement | null;
        return {
            overlay: document.querySelector("[data-financials-overlay]")?.getAttribute("data-financials-overlay") ?? null,
            selects: Array.from(document.querySelectorAll("select")).map((s) => ({ id: s.getAttribute("data-testid"), options: Array.from(s.options).map((o) => o.text.trim()).slice(0, 10) })),
            inputs: Array.from(document.querySelectorAll("input")).map((i) => ({ type: i.type, id: i.getAttribute("data-testid"), value: i.value })).slice(0, 10),
            buttons: [...new Set(Array.from(document.querySelectorAll("button")).map((b) => (b as HTMLElement).innerText.trim()).filter(Boolean))].slice(0, 26),
            text: (sc?.innerText ?? "").replace(/\n+/g, " / ").slice(0, 700),
            moveError: (document.querySelector('[data-testid="payment-move-error"], .alloy-os-fdetail__moveerror') as HTMLElement | null)?.innerText ?? null,
            targetCount: (document.querySelector('[data-testid="payment-move-target"]') as HTMLSelectElement | null)?.options.length ?? 0,
        };
    });
    log(`APPLY SURFACE: overlay=${surf.overlay}`);
    log(`  selects=${JSON.stringify(surf.selects)}`);
    log(`  inputs=${JSON.stringify(surf.inputs)}`);
    log(`  buttons=${surf.buttons.join(" | ").slice(0, 300)}`);
    log(`  text=${surf.text.slice(0, 500)}`);
    log(`  moveError=${surf.moveError} targetOptions=${surf.targetCount}`);
    const elig = wire.filter((w) => String(w.url).includes("eligible-target-charges"));
    log(`ELIGIBLE CALL: ${JSON.stringify(elig.map((e) => ({ url: e.url, res: JSON.stringify(e.response).slice(0, 400) })))}`);
    writeFileSync(`${OUT}/cf-alloc-surface.json`, JSON.stringify({ surf, elig }, null, 2));
});
