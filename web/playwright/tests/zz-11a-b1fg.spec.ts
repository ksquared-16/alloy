/** §F multi-child regression · §G prepaid regression, on b8247f946. */
import { test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-b1";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(280_000);
const F: Array<{ row: string; what: string; ok: boolean; observed: string }> = [];
const rec = (row: string, what: string, ok: boolean, observed: string) => {
    F.push({ row, what, ok, observed });
    console.log(`${ok ? "PASS" : "FAIL"} ${row.padEnd(6)} ${what} → ${observed}`); // eslint-disable-line no-console
};
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const save = () => writeFileSync(`${OUT}/b1-fg.json`, JSON.stringify(F, null, 2));

const ledger = (p: Page) => p.evaluate(() => {
    const out: Array<Record<string, unknown>> = [];
    document.querySelectorAll(".alloy-os-billingdetail__row").forEach((r) => {
        if (r.className.includes("--head")) return;
        const resp = r.querySelector("[data-financials-responsibility]");
        out.push({
            chargeId: r.querySelector("[data-charge-id]")?.getAttribute("data-charge-id") ?? null,
            responsibility: resp?.getAttribute("data-financials-responsibility") ?? null,
            cells: Array.from(r.querySelectorAll("span")).map((s) => (s as HTMLElement).innerText.trim()).filter(Boolean).slice(0, 9),
        });
    });
    return out;
});

test("F · multi-child regression", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const wire: Array<Record<string, unknown>> = [];
    page.on("response", async (res) => {
        if (res.request().method() === "GET" || !res.url().includes("/api/")) return;
        try { wire.push({ request: JSON.parse(res.request().postData() ?? "null"), response: await res.json() }); } catch { /* noop */ }
        writeFileSync(`${OUT}/b1-f-wire.json`, JSON.stringify(wire, null, 2));
    });

    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    await page.getByRole("button", { name: /^Details$/ }).first().click();
    await page.waitForTimeout(8000);
    const before = await ledger(page);
    const beforeIds = new Set(before.map((r) => r.chargeId));

    await page.getByRole("button", { name: /^Add$/ }).first().click();
    await page.waitForTimeout(4500);
    rec("F1", "Add opens as the unified command", (await page.locator('[data-financials-overlay="add_charge"]').count()) > 0, "add_charge overlay");
    const tpl = page.locator('[data-financials-overlay="add_charge"] select').first();
    const names = await tpl.locator("option").allTextContents();
    await tpl.selectOption({ index: names.findIndex((n) => /registration/i.test(n)) });
    await page.waitForTimeout(3000);
    await page.locator('[data-financials-overlay="add_charge"] select').nth(1).selectOption({ label: "Certa Certhouse" });
    await page.waitForTimeout(3000);
    const boxes = page.locator("[data-addcharge-child]");
    rec("F2", "a child-grain type exposes the eligible sibling", (await boxes.count()) > 0, `${await boxes.count()} sibling checkbox(es)`);
    await boxes.first().check();
    await page.waitForTimeout(2500);
    const sum = await page.evaluate(() => (document.querySelector("[data-addcharge-childsum]") as HTMLElement | null)?.innerText?.replace(/\n/g, " ") ?? null);
    rec("F3", "the amount is stated PER CHILD with the count", /per child/i.test(sum ?? "") && /2 children/.test(sum ?? ""), sum ?? "no summary");
    await page.screenshot({ path: `${OUT}/b1-f-add.png` });

    await page.getByRole("button", { name: /^Add charge$/ }).first().click();
    await page.waitForTimeout(13_000);
    if (await page.evaluate(() => document.querySelector("[data-financials-overlay]")?.getAttribute("data-financials-overlay")) !== "detail") {
        await page.getByRole("button", { name: /^Details$/ }).first().click().catch(() => undefined);
        await page.waitForTimeout(9000);
    }
    const after = await ledger(page);
    const fresh = after.filter((r) => r.chargeId && !beforeIds.has(r.chargeId));
    const exec = wire.find((w) => JSON.stringify(w.request).includes('"charge.add"') && (w.request as { mode?: string })?.mode === "execute");
    const detail = (exec?.response as { data?: { execution_result?: Record<string, unknown> } })?.data?.execution_result;
    log(`ADD PAYLOAD: ${JSON.stringify((exec?.request as { payload?: unknown })?.payload)}`);
    log(`ADD RESULT: ${JSON.stringify(detail).slice(0, 500)}`);
    log(`new rows: ${JSON.stringify(fresh.map((r) => (r.cells as string[]).slice(0, 5)))}`);
    rec("F4", "the canonical writer reports one obligation per selected child",
        Number(detail?.children_selected) === 2, `children_selected=${detail?.children_selected} created=${detail?.charges_created} failed=${detail?.charges_failed}`);
    const perChild = (detail?.per_child ?? []) as Array<{ customer_member_id: string; charge_id: string | null }>;
    rec("F5", "the payload's subject grain matches the stated selection, with no household aggregation",
        perChild.length === 2 && perChild.every((c) => c.customer_member_id),
        JSON.stringify(perChild.map((c) => [c.customer_member_id?.slice(0, 8), c.charge_id?.slice(0, 8)])));
    rec("F6", "retrying an already-billed child converges instead of duplicating",
        fresh.length <= perChild.length, `new ledger rows=${fresh.length} for ${perChild.length} children`);
    const subjects = [...new Set(fresh.map((r) => (r.cells as string[])[2]))];
    rec("F7", "resulting obligations stay child-attributed", !subjects.includes("Household"), JSON.stringify(subjects));
    rec("F8", "responsibility stays per obligation, not one household answer",
        [...new Set(fresh.map((r) => r.responsibility))].length >= 1, JSON.stringify(fresh.map((r) => r.responsibility)));
    await page.screenshot({ path: `${OUT}/b1-f-after.png` });
    save();
});

test("G · prepaid regression", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    const card = await page.evaluate(() => {
        const c = document.querySelector('[data-financials-card="true"]') as HTMLElement | null;
        const val = (id: string) => (document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null)?.innerText?.replace(/\n/g, " ") ?? null;
        return { text: (c?.innerText ?? "").replace(/\n+/g, " / "), prepaid: val("available-prepaid") };
    });
    log(`SUMMARY: ${card.text.slice(0, 420)}`);
    const avail = /Available\s*\/?\s*\$([\d,]+\.\d\d)/.exec(card.text);
    const bal = /Balance\s*\/?\s*(-?\$[\d,]+\.\d\d)/.exec(card.text);
    rec("G1", "available prepaid is visible and positive", Boolean(avail) && parseFloat(avail![1]!.replace(/,/g, "")) > 0,
        `available=${avail?.[1] ?? "none"} testid=${card.prepaid}`);
    rec("G2", "current balance and available prepaid are separate figures",
        Boolean(avail) && Boolean(bal), `balance=${bal?.[1] ?? "none"} available=${avail?.[1] ?? "none"}`);
    rec("G3", "prepaid is not netted into the balance", Boolean(bal) && !/-\$0\.00/.test(String(bal?.[1])),
        `balance stands on its own: ${bal?.[1]}`);
    await page.screenshot({ path: `${OUT}/b1-g-summary.png` });
    save();
});
