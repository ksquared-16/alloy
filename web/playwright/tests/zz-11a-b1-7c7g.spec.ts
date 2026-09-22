/** §7E-C no-policy fallback · §7G charge-reversal concept on both hosts. */
import { test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-b1";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(290_000);
const F: Array<{ id: string; what: string; ok: boolean; observed: string }> = [];
const rec = (id: string, what: string, ok: boolean, observed: string) => {
    F.push({ id, what, ok, observed });
    console.log(`${ok ? "OK  " : "GAP "} ${id.padEnd(6)} ${what} → ${observed}`); // eslint-disable-line no-console
};
const log = (s: string) => console.log(s); // eslint-disable-line no-console

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

test("7E-C · a charge created before any policy keeps no configured terms", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    await page.getByRole("button", { name: /Financials — the financial work/ }).first().click();
    await page.waitForTimeout(9000);
    await page.getByRole("tab", { name: /^Charges$/ }).or(page.getByRole("button", { name: /^Charges$/ })).first().click({ timeout: 20_000 });
    await page.waitForTimeout(7000);
    await page.getByRole("tab", { name: /^Posted/ }).or(page.getByRole("button", { name: /^Posted/ })).first().click({ timeout: 15_000 });
    await page.waitForTimeout(6000);
    // $75 registration fee — created BEFORE any due-date policy existed.
    const row = page.getByRole("button", { name: /Certhouse Family \$75\.00/ }).first();
    if (!(await row.count())) { rec("7E-C", "a pre-policy charge is reachable", false, "no $75 row"); return; }
    await row.click({ timeout: 15_000 });
    await page.waitForTimeout(7000);
    const head = await page.evaluate(() => {
        const b = document.body.innerText || "";
        const i = b.indexOf("Account-wide financial detail");
        return b.slice(i, i + 300).replace(/\n+/g, " / ");
    });
    log(`PRE-POLICY CHARGE: ${head}`);
    rec("7E-C", "a charge created before any policy states no configured terms, never today",
        /No configured terms/.test(head), head.slice(0, 220));
    await page.screenshot({ path: `${OUT}/b1-7ec.png` });
    writeFileSync(`${OUT}/b1-7c7g.json`, JSON.stringify(F, null, 2));
});

test("7G · a charge-level reversal is a Reversal on both hosts", async ({ page }) => {
    // Reverse a real charge through the canonical row command, then read what it is called.
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    await page.getByRole("button", { name: /^Details$/ }).first().click();
    await page.waitForTimeout(8000);
    const before = await ledger(page);
    const beforeIds = new Set(before.map((r) => r.chargeId));

    // The Materials $18 for Certa — created this run, so reversing it adds no unexpected residue.
    /*
     * The Late pickup $25.00 for Certa — a certification charge this thread created, still
     * unresolved, so reversing it tests the path without touching anything Kelly's QA needs.
     */
    const target = before.find((r) => r.chargeId === "6005cf5f-24e8-4fd2-a624-0bc83496b977");
    log(`reverse target: ${JSON.stringify(target?.cells)}`);
    if (!target) { rec("7G", "a reversible specimen is present", false, "no Materials Certa Sep 18 row"); return; }

    await page.locator(`[data-financials-row-action="reverse"][data-charge-id="${target.chargeId}"]`).first().click();
    await page.waitForTimeout(4500);
    await page.getByTestId("charge-reverse-preview-button").click();
    await page.waitForTimeout(6000);
    await page.getByTestId("charge-reverse-confirm").click();
    await page.waitForTimeout(12_000);
    if (await page.evaluate(() => document.querySelector("[data-financials-overlay]")?.getAttribute("data-financials-overlay")) !== "detail") {
        await page.getByRole("button", { name: /^Details$/ }).first().click().catch(() => undefined);
        await page.waitForTimeout(9000);
    }
    const after = await ledger(page);
    const fresh = after.filter((r) => r.chargeId && !beforeIds.has(r.chargeId));
    log(`new rows: ${JSON.stringify(fresh.map((r) => (r.cells as string[]).slice(0, 6)))}`);
    writeFileSync(`${OUT}/b1-7g-fp.json`, JSON.stringify({ target, fresh }, null, 2));

    const rev = fresh.find((r) => /Reversal/i.test(String((r.cells as string[])[1])));
    const credit = fresh.find((r) => /^Credit$/i.test(String((r.cells as string[])[1]).trim()));
    rec("7G-FP", "the correction row is called Reversal on the Focus Panel, not Credit",
        Boolean(rev) && !credit,
        `types=${JSON.stringify(fresh.map((r) => (r.cells as string[])[1]))}`);
    const orig = after.find((r) => r.chargeId === target.chargeId);
    rec("7G-ORIG", "the original charge keeps its own identity",
        !/Reversal/i.test(String((orig?.cells as string[])?.[1])),
        `original type="${(orig?.cells as string[])?.[1]}" amount="${(orig?.cells as string[])?.[4]}"`);
    if (rev) log(`REVERSAL ROW: ${JSON.stringify(rev.cells)}`);
    await page.screenshot({ path: `${OUT}/b1-7g-fp.png` });

    // ── The same row, on the other deep host.
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    await page.getByRole("button", { name: /Financials — the financial work/ }).first().click();
    await page.waitForTimeout(9000);
    await page.getByRole("tab", { name: /^Accounts$/ }).or(page.getByRole("button", { name: /^Accounts$/ })).first().click({ timeout: 20_000 });
    await page.waitForTimeout(6000);
    await page.getByText(/Certhouse Family/).first().click();
    await page.waitForTimeout(8000);
    const ws = await ledger(page);
    const wsRev = ws.find((r) => r.chargeId === rev?.chargeId);
    rec("7G-WS", "the Workspace calls the same row a Reversal", Boolean(wsRev) && /Reversal/i.test(String((wsRev?.cells as string[])[1])),
        `type="${(wsRev?.cells as string[])?.[1]}" cells=${JSON.stringify((wsRev?.cells as string[])?.slice(0, 6))}`);
    await page.screenshot({ path: `${OUT}/b1-7g-ws.png` });
    writeFileSync(`${OUT}/b1-7c7g.json`, JSON.stringify(F, null, 2));
});
