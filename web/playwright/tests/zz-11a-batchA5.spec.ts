/** §3F multi-child in the Workspace once a CHILD is chosen · §3D household selected deliberately. */
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

/** The APPLIES TO select is the grain control — the second select on the Add surface. */
const grainSelect = (p: Page) => p.locator('[data-financials-overlay="add_charge"] select').nth(1);
const shape = (p: Page) => p.evaluate(() => {
    const scope = document.querySelector('[data-financials-overlay="add_charge"]') as HTMLElement | null;
    const sels = Array.from(scope?.querySelectorAll("select") ?? []);
    return {
        grainValue: sels[1]?.value ?? null,
        grainText: sels[1] ? sels[1].options[sels[1].selectedIndex]?.text.trim() : null,
        childBoxes: Array.from(document.querySelectorAll("[data-addcharge-child]")).map((e) => e.getAttribute("data-addcharge-child")),
        childSum: (document.querySelector("[data-addcharge-childsum]") as HTMLElement | null)?.innerText?.replace(/\n/g, " ") ?? null,
        responsibility: /RESPONSIBILITY\s*\n?\s*([^\n]+)/.exec(scope?.innerText ?? "")?.[1] ?? null,
        text: (scope?.innerText ?? "").slice(0, 700),
    };
});

test("S3F · choosing a child in the Workspace reveals the same ALSO BILL", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    await page.getByRole("button", { name: /Financials — the financial work/ }).first().click();
    await page.waitForTimeout(9000);
    await page.getByRole("tab", { name: /^Accounts$/ }).or(page.getByRole("button", { name: /^Accounts$/ })).first().click({ timeout: 20_000 });
    await page.waitForTimeout(6000);
    await page.getByText(/Certhouse Family/).first().click();
    await page.waitForTimeout(8000);
    await page.getByRole("button", { name: /^Add$/ }).first().click({ timeout: 20_000 });
    await page.waitForTimeout(4500);

    const before = await shape(page);
    rec("3F-4", "the Workspace Add opens at HOUSEHOLD grain, so no sibling list applies",
        before.grainText === "Household" && before.childBoxes.length === 0,
        `grain="${before.grainText}" (${before.grainValue}) boxes=${before.childBoxes.length}`);

    // Choose a CHILD — the multi-child affordance must appear, same as the Focus Panel.
    await grainSelect(page).selectOption({ label: "Certa Certhouse" });
    await page.waitForTimeout(3500);
    const after = await shape(page);
    writeFileSync(`${OUT}/s3f-child-selected.json`, JSON.stringify(after, null, 2));
    log(`WS after child: grain="${after.grainText}" boxes=${JSON.stringify(after.childBoxes)}`);
    log(`WS text:\n${after.text}`);
    await page.screenshot({ path: `${OUT}/s3f-child-selected.png` });
    rec("3F-2b", "choosing a child in the Workspace reveals the SAME sibling selection",
        after.childBoxes.length > 0, `grain="${after.grainText}" boxes=${after.childBoxes.length}`);

    if (after.childBoxes.length) {
        await page.locator("[data-addcharge-child]").first().check();
        await page.waitForTimeout(3000);
        const multi = await shape(page);
        rec("3F-5", "the Workspace states the SAME per-child economics",
            /per child/i.test(multi.childSum ?? ""), multi.childSum ?? "no summary");
        await page.screenshot({ path: `${OUT}/s3f-multichild.png` });
    }
});

test("S3D · household is selected deliberately on the Focus Panel", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    await page.getByRole("button", { name: /^Details$/ }).first().click();
    await page.waitForTimeout(8000);
    await page.getByRole("button", { name: /^Add$/ }).first().click();
    await page.waitForTimeout(4500);

    const dflt = await shape(page);
    rec("3D-4", "the default grain is a NAMED CHILD — blank never implicitly means household",
        dflt.grainText !== "Household" && !!dflt.grainValue,
        `default grain="${dflt.grainText}" value=${dflt.grainValue}`);

    await grainSelect(page).selectOption({ label: "Household" });
    await page.waitForTimeout(3500);
    const hh = await shape(page);
    writeFileSync(`${OUT}/s3d-household-selected.json`, JSON.stringify(hh, null, 2));
    log(`FP household: grain="${hh.grainText}" value=${hh.grainValue} boxes=${JSON.stringify(hh.childBoxes)}`);
    log(`FP text:\n${hh.text}`);
    await page.screenshot({ path: `${OUT}/s3d-household-selected.png` });
    rec("3D-5", "selecting Household is a deliberate, stated grain choice",
        hh.grainText === "Household", `grain="${hh.grainText}" value=${hh.grainValue} responsibility=${hh.responsibility}`);
    rec("3D-6", "household grain drops the per-child sibling list", hh.childBoxes.length === 0,
        `boxes=${hh.childBoxes.length}`);
});

test.afterAll(() => {
    writeFileSync(`${OUT}/batchA5.json`, JSON.stringify(F, null, 2));
    console.log(`\n=== BATCH A5 ${F.filter((f) => f.ok).length}/${F.length} ===`); // eslint-disable-line no-console
});
