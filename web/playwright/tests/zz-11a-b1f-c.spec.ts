/** §C — prepaid closeout: zero silence, and allocation through the canonical payment authority. */
import { test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-b1";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(280_000);
const F: Array<{ row: string; what: string; ok: boolean; observed: string }> = [];
const rec = (row: string, what: string, ok: boolean, observed: string) => {
    F.push({ row, what, ok, observed });
    console.log(`${ok ? "PASS" : "FAIL"} ${row.padEnd(4)} ${what} → ${observed}`); // eslint-disable-line no-console
};
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const save = () => writeFileSync(`${OUT}/b1f-c.json`, JSON.stringify(F, null, 2));

async function account(p: Page, name: RegExp) {
    await p.goto("/workspace", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(9000);
    await p.getByRole("button", { name: /Financials — the financial work/ }).first().click();
    await p.waitForTimeout(9000);
    await p.getByRole("tab", { name: /^Accounts$/ }).or(p.getByRole("button", { name: /^Accounts$/ })).first().click({ timeout: 20_000 });
    await p.waitForTimeout(11_000);
    const row = p.getByText(name).first();
    if (!(await row.count())) return false;
    await row.click();
    await p.waitForTimeout(9000);
    return true;
}

test("C1 · zero available prepaid stays silent", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    await page.getByRole("button", { name: /Financials — the financial work/ }).first().click();
    await page.waitForTimeout(9000);
    await page.getByRole("tab", { name: /^Accounts$/ }).or(page.getByRole("button", { name: /^Accounts$/ })).first().click({ timeout: 20_000 });
    await page.waitForTimeout(11_000);
    const queue = await page.evaluate(() => (document.body.innerText || "").replace(/\n+/g, " / "));
    log(`ACCOUNT QUEUE: ${queue.slice(queue.indexOf("Overview"), queue.indexOf("Overview") + 700)}`);

    // An account with no prepaid at all — the queue names several with nothing billed.
    const zero = page.getByText(/Alvarez Household|Brennan Household|Kurzman Family/).first();
    if (!(await zero.count())) { rec("C1", "a zero-prepaid account is reachable", false, "none listed"); save(); return; }
    const label = (await zero.innerText()).replace(/\n/g, " ").slice(0, 40);
    await zero.click();
    await page.waitForTimeout(9000);
    const shown = await page.evaluate(() => {
        const txt = (document.body.innerText || "");
        return {
            hasAvailableZero: /Available[\s/]*\$0\.00/.test(txt),
            hasAvailableAny: /Available/.test(txt),
            prepaidTestId: document.querySelectorAll('[data-testid="available-prepaid"]').length,
            excerpt: txt.slice(0, 400).replace(/\n+/g, " / "),
        };
    });
    log(`ZERO ACCOUNT (${label}): ${JSON.stringify(shown).slice(0, 400)}`);
    rec("C1", "an account with no available prepaid renders no Available $0.00 line",
        !shown.hasAvailableZero, `account="${label}" availableZeroShown=${shown.hasAvailableZero} prepaidNodes=${shown.prepaidTestId}`);
    await page.screenshot({ path: `${OUT}/b1f-c1.png` });
    save();
});

test("C3 · allocating available prepaid", async ({ page }) => {
    const wire: Array<Record<string, unknown>> = [];
    page.on("response", async (res) => {
        if (res.request().method() !== "POST" || !res.url().includes("/api/")) return;
        let body: unknown = null; let req: unknown = null;
        try { body = await res.json(); } catch { body = "(unparseable)"; }
        try { req = JSON.parse(res.request().postData() ?? "null"); } catch { req = null; }
        wire.push({ url: res.url().replace(/^https?:\/\/[^/]+/, ""), request: req, response: body });
        writeFileSync(`${OUT}/b1f-c3-wire.json`, JSON.stringify(wire, null, 2));
    });

    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    const before = await page.evaluate(() => {
        const c = document.querySelector('[data-financials-card="true"]') as HTMLElement | null;
        return (c?.innerText ?? "").replace(/\n+/g, " / ");
    });
    const avail0 = /Available\s*\/?\s*\$([\d,]+\.\d\d)/.exec(before)?.[1] ?? null;
    const bal0 = /Balance\s*\/?\s*(-?\$[\d,]+\.\d\d)/.exec(before)?.[1] ?? null;
    log(`BEFORE: balance=${bal0} available=${avail0}`);

    await page.getByRole("button", { name: /^Details$/ }).first().click();
    await page.waitForTimeout(8000);
    // The payments lens is where unapplied money and its application live.
    const payments = page.getByRole("button", { name: /^Payments/ }).first();
    if (await payments.count()) { await payments.click(); await page.waitForTimeout(5000); }
    const lens = await page.evaluate(() => {
        const txt = (document.body.innerText || "");
        return {
            applyControls: Array.from(document.querySelectorAll('[data-financials-row-action="apply"]')).length,
            buttons: [...new Set(Array.from(document.querySelectorAll("button")).map((b) => (b as HTMLElement).innerText.trim()).filter((t) => /appl|unapplied|allocate/i.test(t)))],
            unapplied: (txt.match(/unapplied[^/\n]{0,40}/gi) ?? []).slice(0, 4),
        };
    });
    log(`PAYMENTS LENS: ${JSON.stringify(lens)}`);
    await page.screenshot({ path: `${OUT}/b1f-c3-lens.png` });
    rec("C3-reach", "an allocation control for unapplied money is reachable",
        lens.applyControls > 0 || lens.buttons.length > 0, JSON.stringify({ applyControls: lens.applyControls, buttons: lens.buttons }));

    if (lens.applyControls > 0) {
        await page.locator('[data-financials-row-action="apply"]').first().click();
        await page.waitForTimeout(6000);
        await page.screenshot({ path: `${OUT}/b1f-c3-apply.png` });
        const surface = await page.evaluate(() => ({
            overlay: document.querySelector("[data-financials-overlay]")?.getAttribute("data-financials-overlay") ?? null,
            text: (document.body.innerText || "").slice(0, 700).replace(/\n+/g, " / "),
        }));
        log(`APPLY SURFACE: ${JSON.stringify(surface).slice(0, 500)}`);
    }
    save();
});
