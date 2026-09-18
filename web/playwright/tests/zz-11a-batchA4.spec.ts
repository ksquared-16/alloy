/** §3D household-grain Add, mounted · §3F the Workspace Accounts host. */
import { test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-batchA";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(240_000);
const F: Array<{ id: string; what: string; ok: boolean; observed: string }> = [];
const rec = (id: string, what: string, ok: boolean, observed: string) => {
    F.push({ id, what, ok, observed });
    console.log(`${ok ? "OK  " : "GAP "} ${id.padEnd(6)} ${what} → ${observed}`); // eslint-disable-line no-console
};
const log = (s: string) => console.log(s); // eslint-disable-line no-console

/** Everything the Add surface is currently offering — discovered, never assumed. */
const addShape = (p: Page) => p.evaluate(() => {
    const scope = document.querySelector('[data-financials-overlay="add_charge"]') as HTMLElement | null;
    const txt = (e: Element) => (e as HTMLElement).innerText?.trim().replace(/\s+/g, " ").slice(0, 70) ?? "";
    return {
        present: !!scope,
        mode: scope?.getAttribute("data-financials-entry-mode") ?? null,
        subjectLine: [...(scope?.innerText ?? "").matchAll(/Subject[^\n]*/g)].map((m) => m[0]).slice(0, 3),
        childBoxes: Array.from(document.querySelectorAll("[data-addcharge-child]")).map((e) => ({
            id: e.getAttribute("data-addcharge-child"), checked: (e as HTMLInputElement).checked,
        })),
        childSum: (document.querySelector("[data-addcharge-childsum]") as HTMLElement | null)?.innerText ?? null,
        selects: Array.from(scope?.querySelectorAll("select") ?? []).map((s) => ({
            testid: s.getAttribute("data-testid"), value: s.value,
            options: Array.from(s.options).map((o) => o.text.trim()).slice(0, 14),
        })),
        text: (scope?.innerText ?? "").replace(/\n{2,}/g, "\n").slice(0, 1200),
    };
});

test("S3D · household-grain Add on the Focus Panel", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    await page.getByRole("button", { name: /^Details$/ }).first().click();
    await page.waitForTimeout(8000);

    // The subject filter is how an operator states WHO the money is for. Discover its options.
    const subj = page.locator('[data-testid="subject"]').first();
    const hasSubj = await subj.count();
    const opts = hasSubj ? await subj.locator("option").allTextContents() : [];
    rec("3D-1", "the subject filter offers an explicit household option", opts.some((o) => /household|everyone|all/i.test(o)),
        `options=${JSON.stringify(opts)}`);

    // Open Add WITHOUT touching the subject — the default must not silently mean household.
    await page.getByRole("button", { name: /^Add$/ }).first().click();
    await page.waitForTimeout(4500);
    const dflt = await addShape(page);
    writeFileSync(`${OUT}/s3d-default.json`, JSON.stringify(dflt, null, 2));
    log(`DEFAULT subject=${JSON.stringify(dflt.subjectLine)} boxes=${JSON.stringify(dflt.childBoxes)}`);
    log(`DEFAULT selects=${JSON.stringify(dflt.selects)}`);
    log(`DEFAULT text:\n${dflt.text}`);
    rec("3D-2", "the Add surface states the subject it will charge", dflt.subjectLine.length > 0 || dflt.childBoxes.length > 0,
        `subject=${JSON.stringify(dflt.subjectLine)} childBoxes=${dflt.childBoxes.length}`);
    await page.screenshot({ path: `${OUT}/s3d-default.png` });

    // Now choose a household-capable charge type and see what the surface offers for grain.
    const tpl = page.locator('[data-financials-overlay="add_charge"] select').first();
    if (await tpl.count()) {
        const tplOpts = await tpl.locator("option").allTextContents();
        log(`templates: ${JSON.stringify(tplOpts)}`);
        const idx = tplOpts.findIndex((o) => /registration|materials|late pickup/i.test(o));
        if (idx >= 0) { await tpl.selectOption({ index: idx }); await page.waitForTimeout(3000); }
        const after = await addShape(page);
        writeFileSync(`${OUT}/s3d-household-capable.json`, JSON.stringify(after, null, 2));
        log(`HH-CAPABLE (${tplOpts[idx]}) subject=${JSON.stringify(after.subjectLine)} boxes=${JSON.stringify(after.childBoxes)}`);
        log(`HH-CAPABLE text:\n${after.text}`);
        await page.screenshot({ path: `${OUT}/s3d-household-capable.png` });
        rec("3D-3", "a household-capable type offers a deliberate grain choice",
            after.childBoxes.length > 0 || /household/i.test(after.text),
            `boxes=${after.childBoxes.length} saysHousehold=${/household/i.test(after.text)}`);
    }
});

test("S3F · the Workspace Accounts host offers the same Add", async ({ page }) => {
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    await page.getByRole("button", { name: /Financials — the financial work/ }).first().click();
    await page.waitForTimeout(9000);
    await page.getByRole("tab", { name: /^Accounts$/ }).or(page.getByRole("button", { name: /^Accounts$/ })).first().click({ timeout: 20_000 });
    await page.waitForTimeout(6000);
    await page.getByText(/Certhouse Family/).first().click();
    await page.waitForTimeout(8000);

    await page.getByRole("button", { name: /^Add$/ }).first().click({ timeout: 20_000 });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${OUT}/s3f-workspace-add.png` });
    const shape = await addShape(page);
    writeFileSync(`${OUT}/s3f-workspace-add.json`, JSON.stringify(shape, null, 2));
    log(`WS ADD present=${shape.present} mode=${shape.mode} boxes=${JSON.stringify(shape.childBoxes)}`);
    log(`WS ADD selects=${JSON.stringify(shape.selects)}`);
    log(`WS ADD text:\n${shape.text}`);

    rec("3F-1", "the Workspace raises the SAME Add command surface",
        shape.present && shape.mode === "charge", `overlay=${shape.present} mode=${shape.mode}`);
    rec("3F-2", "the Workspace Add offers the same multi-child selection",
        shape.childBoxes.length > 0, `childBoxes=${shape.childBoxes.length}`);

    // The mode control must be the same tablist, not a Workspace-specific one.
    const tabs = await page.evaluate(() => Array.from(document.querySelectorAll("[data-financials-entry-mode-tab]")).map((e) => e.getAttribute("data-financials-entry-mode-tab")));
    rec("3F-3", "the same Charge/Adjustment tablist is present in the Workspace", tabs.length === 2, JSON.stringify(tabs));
});

test.afterAll(() => {
    writeFileSync(`${OUT}/batchA4.json`, JSON.stringify(F, null, 2));
    console.log(`\n=== BATCH A4 ${F.filter((f) => f.ok).length}/${F.length} ===`); // eslint-disable-line no-console
});
