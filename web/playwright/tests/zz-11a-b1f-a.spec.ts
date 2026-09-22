/** §A — multi-child wire truth. Assert the selection, then Confirm, with nothing in between. */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-b1";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(280_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("A4 · the same governed intent again", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const wire: Array<Record<string, unknown>> = [];
    page.on("request", (req) => {
        if (req.method() === "POST" && req.url().includes("/api/admin/actions/execute")) {
            try { wire.push({ phase: "request", payload: JSON.parse(req.postData() ?? "null") }); } catch { /* noop */ }
        }
    });
    page.on("response", async (res) => {
        if (res.request().method() !== "POST" || !res.url().includes("/api/admin/actions/execute")) return;
        try { wire.push({ phase: "response", body: await res.json() }); } catch { /* noop */ }
        writeFileSync(`${OUT}/b1f-a-wire.json`, JSON.stringify(wire, null, 2));
    });

    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    await page.getByRole("button", { name: /^Details$/ }).first().click();
    await page.waitForTimeout(8000);
    await page.getByRole("button", { name: /^Add$/ }).first().click();
    await page.waitForTimeout(4500);

    // Field trip is CHILD_OR_HOUSEHOLD and carries a service date, so the two children have not
    // already been billed for it today — a clean multi-child specimen rather than a converged one.
    const tpl = page.locator('[data-financials-overlay="add_charge"] select').first();
    const names = await tpl.locator("option").allTextContents();
    await tpl.selectOption({ index: names.findIndex((n) => /field trip/i.test(n)) });
    await page.waitForTimeout(3000);
    await page.locator('[data-financials-overlay="add_charge"] select').nth(1).selectOption({ label: "Certa Certhouse" });
    await page.waitForTimeout(3000);
    const box = page.locator("[data-addcharge-child]").first();
    log(`checkbox before check: checked=${await box.isChecked()}`);
    await box.check();
    await page.waitForTimeout(2500);

    const svc = page.locator("[data-addcharge-servicedate], input[type='date']").first();
    if (await svc.count()) { await svc.fill("2026-09-18"); await page.waitForTimeout(2000); }

    /* THE ASSERTION, in one evaluate, with no navigation or waiting after it. */
    const preConfirm = await page.evaluate(() => {
        const scope = document.querySelector('[data-financials-overlay="add_charge"]') as HTMLElement | null;
        const boxes = Array.from(document.querySelectorAll("[data-addcharge-child]")).map((e) => ({
            id: e.getAttribute("data-addcharge-child"), checked: (e as HTMLInputElement).checked,
        }));
        const sels = Array.from(scope?.querySelectorAll("select") ?? []);
        return {
            boxes,
            checkedCount: boxes.filter((b) => b.checked).length,
            childSum: (document.querySelector("[data-addcharge-childsum]") as HTMLElement | null)?.innerText?.replace(/\n/g, " ") ?? null,
            grain: sels[1] ? sels[1].options[sels[1].selectedIndex]?.text : null,
            mode: document.querySelector("[data-financials-entry-mode]")?.getAttribute("data-financials-entry-mode") ?? null,
            addDisabled: (Array.from(scope?.querySelectorAll("button") ?? [])
                .find((b) => /^Add charge$/.test((b as HTMLElement).innerText.trim())) as HTMLButtonElement | undefined)?.disabled ?? null,
        };
    });
    log(`\n=== PRE-CONFIRM ===\n${JSON.stringify(preConfirm, null, 1)}`);
    writeFileSync(`${OUT}/b1f-a-preconfirm.json`, JSON.stringify(preConfirm, null, 2));
    await page.screenshot({ path: `${OUT}/b1f-a-preconfirm.png` });

    await page.getByRole("button", { name: /^Add charge$/ }).first().click();
    await page.waitForTimeout(13_000);
    /* A4 — the identical intent a second time, through the same surface. */
    if (await page.evaluate(() => document.querySelector("[data-financials-overlay]")?.getAttribute("data-financials-overlay")) !== "detail") {
        await page.getByRole("button", { name: /^Details$/ }).first().click().catch(() => undefined);
        await page.waitForTimeout(9000);
    }
    await page.getByRole("button", { name: /^Add$/ }).first().click();
    await page.waitForTimeout(4500);
    const tpl2 = page.locator('[data-financials-overlay="add_charge"] select').first();
    const names2 = await tpl2.locator("option").allTextContents();
    await tpl2.selectOption({ index: names2.findIndex((n) => /field trip/i.test(n)) });
    await page.waitForTimeout(3000);
    await page.locator('[data-financials-overlay="add_charge"] select').nth(1).selectOption({ label: "Certa Certhouse" });
    await page.waitForTimeout(3000);
    await page.locator("[data-addcharge-child]").first().check();
    await page.waitForTimeout(2500);
    const svc2 = page.locator("input[type='date']").first();
    if (await svc2.count()) { await svc2.fill("2026-09-18"); await page.waitForTimeout(2000); }
    const pre2 = await page.evaluate(() => (document.querySelector("[data-addcharge-childsum]") as HTMLElement | null)?.innerText?.replace(/\n/g, " ") ?? null);
    log(`RERUN pre-confirm childSum: ${pre2}`);
    await page.getByRole("button", { name: /^Add charge$/ }).first().click();
    await page.waitForTimeout(13_000);

    const execs = wire.filter((w) => w.phase === "request" && (w.payload as { mode?: string })?.mode === "execute");
    log(`\n=== WIRE (${execs.length} execute) ===`);
    for (const e of execs) log(JSON.stringify((e.payload as { payload?: unknown })?.payload));
    const resp = wire.filter((w) => w.phase === "response");
    log(`LAST RESPONSE: ${JSON.stringify((resp[resp.length - 1] as { body?: unknown })?.body).slice(0, 700)}`);
    writeFileSync(`${OUT}/b1f-a-wire.json`, JSON.stringify(wire, null, 2));
});
