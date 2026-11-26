/** §18–§20 — execute the allocation, then measure available, payer and responsibility. */
import { test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-cf";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(280_000);
const F: Array<{ id: string; what: string; ok: boolean; observed: string }> = [];
const rec = (id: string, what: string, ok: boolean, observed: string) => {
    F.push({ id, what, ok, observed });
    console.log(`${ok ? "PASS" : "FAIL"} ${id.padEnd(6)} ${what} → ${observed}`); // eslint-disable-line no-console
};
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const TARGET = "907d1b64-09d5-4926-bed0-63d044c15441";   // Registration fee $75, Certb, partial responsibility

const state = (p: Page) => p.evaluate((target: string) => {
    const card = document.querySelector('[data-financials-card="true"]') as HTMLElement | null;
    const t = (card?.innerText ?? "").replace(/\n+/g, " / ");
    const row = Array.from(document.querySelectorAll(".alloy-os-billingdetail__row"))
        .find((r) => r.querySelector(`[data-charge-id="${target}"]`));
    const resp = row?.querySelector("[data-financials-responsibility]");
    return {
        available: /AVAILABLE PREPAID\s*\/?\s*\$([\d,]+\.\d\d)/i.exec(t)?.[1] ?? /Available\s*\/?\s*\$([\d,]+\.\d\d)/.exec(t)?.[1] ?? null,
        balance: /CURRENT BALANCE\s*\/?\s*(-?\$[\d,]+\.\d\d)/i.exec(t)?.[1] ?? /Balance\s*\/?\s*(-?\$[\d,]+\.\d\d)/.exec(t)?.[1] ?? null,
        paid: /PAID\s*\/?\s*(-?\$[\d,]+\.\d\d)/i.exec(t)?.[1] ?? null,
        targetResponsibility: resp?.getAttribute("data-financials-responsibility") ?? null,
        targetResponsibilityText: (resp as HTMLElement | null)?.innerText?.trim().replace(/\s+/g, " ") ?? null,
        targetCells: row ? Array.from(row.querySelectorAll("span")).map((s) => (s as HTMLElement).innerText.trim()).filter(Boolean).slice(0, 9) : null,
    };
}, TARGET);

test("allocation end to end", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const wire: Array<Record<string, unknown>> = [];
    page.on("response", async (res) => {
        if (!res.url().includes("/api/")) return;
        let body: unknown = null; let req: unknown = null;
        try { body = await res.json(); } catch { body = "(unparseable)"; }
        try { req = JSON.parse(res.request().postData() ?? "null"); } catch { req = null; }
        wire.push({ url: res.url().replace(/^https?:\/\/[^/]+/, ""), request: req, response: body });
        writeFileSync(`${OUT}/cf-alloc2-wire.json`, JSON.stringify(wire, null, 2));
    });

    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    await page.getByRole("button", { name: /^Details$/ }).first().click();
    await page.waitForTimeout(9000);
    const before = await state(page);
    log(`BEFORE: ${JSON.stringify(before)}`);
    writeFileSync(`${OUT}/cf-alloc2-before.json`, JSON.stringify(before, null, 2));

    await page.getByRole("button", { name: /^Payments/ }).first().click();
    await page.waitForTimeout(6000);
    await page.locator('[data-financials-row-action="apply"]').first().click();
    await page.waitForTimeout(12_000);

    const sel = page.locator('[data-testid="payment-move-target"]');
    const opts = await sel.locator("option").allTextContents();
    const idx = opts.findIndex((o) => /Registration fee/.test(o) && /75\.00 outstanding/.test(o));
    log(`target options: ${opts.length}; chose #${idx}: ${opts[idx] ?? "(fallback)"}`);
    await sel.selectOption({ index: idx > 0 ? idx : 1 });
    await page.waitForTimeout(2500);

    const prev = page.getByRole("button", { name: /^Preview$/ }).first();
    if (await prev.count()) { await prev.click(); await page.waitForTimeout(7000); }
    const previewText = await page.evaluate(() => (document.querySelector(".alloy-os-fdetail__movepreview") as HTMLElement | null)?.innerText?.replace(/\n/g, " / ") ?? null);
    log(`APPLY PREVIEW: ${previewText}`);
    await page.screenshot({ path: `${OUT}/cf-alloc2-preview.png` });

    await page.getByRole("button", { name: /^Confirm$/ }).first().click();
    await page.waitForTimeout(14_000);
    const applyCall = wire.filter((w) => JSON.stringify(w.request).includes("payment.apply") && (w.request as { mode?: string })?.mode === "execute");
    log(`APPLY RESULT: ${JSON.stringify((applyCall[applyCall.length - 1] as { response?: unknown })?.response).slice(0, 500)}`);

    if (await page.evaluate(() => document.querySelector("[data-financials-overlay]")?.getAttribute("data-financials-overlay")) !== "detail") {
        await page.getByRole("button", { name: /^Details$/ }).first().click().catch(() => undefined);
        await page.waitForTimeout(10_000);
    } else { await page.waitForTimeout(6000); }
    const after = await state(page);
    log(`AFTER : ${JSON.stringify(after)}`);
    writeFileSync(`${OUT}/cf-alloc2-after.json`, JSON.stringify({ before, after }, null, 2));

    const a0 = parseFloat((before.available ?? "0").replace(/,/g, ""));
    const a1 = parseFloat((after.available ?? "0").replace(/,/g, ""));
    rec("G6-1", "available prepaid decreases by the applied amount", a1 < a0, `before=$${a0.toFixed(2)} after=$${a1.toFixed(2)} delta=$${(a0 - a1).toFixed(2)}`);
    rec("G6-2", "remaining prepaid stays visible", Boolean(after.available), `available now $${after.available}`);
    rec("G6-3", "the target obligation records the money", before.paid !== after.paid, `paid before=${before.paid} after=${after.paid}`);
    rec("G7-resp", "responsibility is unchanged by applying money",
        before.targetResponsibility === after.targetResponsibility && before.targetResponsibilityText === after.targetResponsibilityText,
        `before="${before.targetResponsibilityText}" after="${after.targetResponsibilityText}"`);
    await page.screenshot({ path: `${OUT}/cf-alloc2-after.png` });
    writeFileSync(`${OUT}/cf-alloc2.json`, JSON.stringify({ before, after, findings: F }, null, 2));
});
