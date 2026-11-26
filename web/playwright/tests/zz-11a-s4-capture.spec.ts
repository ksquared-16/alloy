/**
 * §3 — CAPTURE THE ACTUAL RESOLVE RESPONSE. The previous run navigated away and lost it.
 *
 * Every call to the one executor is recorded off the wire — request payload and response body —
 * so the canonical action's own answer is evidence rather than inference.
 */
import { test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-s4";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(300_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

const TARGET = "6005cf5f-24e8-4fd2-a624-0bc83496b977";   // Late pickup $25.00 · Certa · Sep 18
const HISTORICAL = "f089a3f4-85a1-44b6-bb94-50588a581b00";

const ledger = (p: Page) => p.evaluate(() => {
    const out: Array<Record<string, unknown>> = [];
    document.querySelectorAll(".alloy-os-billingdetail__row").forEach((r) => {
        if (r.className.includes("--head")) return;
        const resp = r.querySelector("[data-financials-responsibility]");
        out.push({
            chargeId: r.querySelector("[data-charge-id]")?.getAttribute("data-charge-id") ?? null,
            responsibility: resp?.getAttribute("data-financials-responsibility") ?? null,
            responsibilityText: (resp as HTMLElement | null)?.innerText?.trim() ?? null,
            actions: Array.from(r.querySelectorAll("[data-financials-row-action]")).map((a) => a.getAttribute("data-financials-row-action")),
            cells: Array.from(r.querySelectorAll("span")).map((s) => (s as HTMLElement).innerText.trim()).filter(Boolean).slice(0, 9),
        });
    });
    return out;
});

test("S4 · the actual resolve response", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const wire: Array<Record<string, unknown>> = [];
    page.on("response", async (res) => {
        if (!res.url().includes("/api/admin/actions/execute")) return;
        let body: unknown = null;
        try { body = await res.json(); } catch { body = "(unparseable)"; }
        let req: unknown = null;
        try { req = JSON.parse(res.request().postData() ?? "null"); } catch { req = null; }
        wire.push({ status: res.status(), request: req, response: body });
    });

    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    await page.getByRole("button", { name: /^Details$/ }).first().click();
    await page.waitForTimeout(8000);

    const before = await ledger(page);
    const row = before.find((r) => r.chargeId === TARGET);
    log(`BEFORE ${TARGET}: ${JSON.stringify(row)}`);

    const ctl = page.locator(`[data-financials-row-action="resolveResponsibility"][data-charge-id="${TARGET}"]`).first();
    if (!(await ctl.count())) { log("NO RESOLVE CONTROL ON TARGET"); writeFileSync(`${OUT}/capture.json`, JSON.stringify({ before: row, wire }, null, 2)); return; }
    await ctl.click();
    await page.waitForTimeout(4000);

    await page.getByTestId("responsibility-preview-button").click();
    await page.waitForTimeout(7000);
    const afterPreview = await page.evaluate(() => ({
        preview: (document.querySelector('[data-testid="responsibility-preview"]') as HTMLElement | null)?.innerText?.replace(/\n/g, " / ") ?? null,
        error: (document.querySelector('[data-testid="responsibility-error"]') as HTMLElement | null)?.innerText ?? null,
    }));
    log(`PREVIEW dom: ${JSON.stringify(afterPreview)}`);

    await page.getByTestId("responsibility-confirm").click();
    await page.waitForTimeout(12_000);

    /* THE DECISIVE CAPTURE — read the shell WITHOUT navigating anywhere. */
    const afterConfirm = await page.evaluate(() => ({
        overlay: document.querySelector("[data-financials-overlay]")?.getAttribute("data-financials-overlay") ?? null,
        error: (document.querySelector('[data-testid="responsibility-error"]') as HTMLElement | null)?.innerText ?? null,
        preview: (document.querySelector('[data-testid="responsibility-preview"]') as HTMLElement | null)?.innerText?.replace(/\n/g, " / ") ?? null,
        current: (document.querySelector('[data-testid="responsibility-current"]') as HTMLElement | null)?.innerText ?? null,
    }));
    log(`\n=== AFTER CONFIRM (no navigation) ===\n${JSON.stringify(afterConfirm, null, 2)}`);
    await page.screenshot({ path: `${OUT}/s4-capture-after-confirm.png` });

    log(`\n=== WIRE (${wire.length} executor calls) ===`);
    for (const w of wire) log(JSON.stringify(w, null, 2).slice(0, 2200));
    writeFileSync(`${OUT}/capture-wire.json`, JSON.stringify(wire, null, 2));

    /* Now, and only now, re-read through the normal projection. */
    if (afterConfirm.overlay !== "detail") {
        await page.getByRole("button", { name: /^Details$/ }).first().click();
        await page.waitForTimeout(9000);
    }
    const after = await ledger(page);
    const rowAfter = after.find((r) => r.chargeId === TARGET);
    const hist = after.find((r) => r.chargeId === HISTORICAL);
    log(`\nAFTER  ${TARGET}: ${JSON.stringify(rowAfter)}`);
    log(`HISTORICAL ${HISTORICAL}: ${JSON.stringify(hist?.responsibility)} ("${hist?.responsibilityText}")`);
    writeFileSync(`${OUT}/capture.json`, JSON.stringify({ before: row, afterPreview, afterConfirm, after: rowAfter, historical: hist, wire }, null, 2));
});
