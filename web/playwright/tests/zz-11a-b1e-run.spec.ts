/** §E3 monthly generation · §E2 rerun idempotency · §E6 due date on generated charges. */
import { test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-b1";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(280_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

async function openGenerate(p: Page) {
    await p.goto("/workspace", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(9000);
    await p.getByRole("button", { name: /Financials — the financial work/ }).first().click();
    await p.waitForTimeout(9000);
    await p.getByRole("tab", { name: /^Charges$/ }).or(p.getByRole("button", { name: /^Charges$/ })).first().click({ timeout: 20_000 });
    await p.waitForTimeout(7000);
    await p.getByRole("button", { name: /Generate a period's tuition/i }).first().click();
    await p.waitForTimeout(5000);
}

test("E · preview, generate, regenerate", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const wire: Array<Record<string, unknown>> = [];
    page.on("response", async (res) => {
        if (res.request().method() === "GET" || !res.url().includes("/api/")) return;
        let body: unknown = null; let req: unknown = null;
        try { body = await res.json(); } catch { body = "(unparseable)"; }
        try { req = JSON.parse(res.request().postData() ?? "null"); } catch { req = null; }
        wire.push({ url: res.url().replace(/^https?:\/\/[^/]+/, ""), request: req, response: body });
        writeFileSync(`${OUT}/b1e-run-wire.json`, JSON.stringify(wire, null, 2));
    });

    await openGenerate(page);
    await page.getByRole("button", { name: /^Preview run$/ }).first().click();
    await page.waitForTimeout(9000);
    const preview = await page.evaluate(() => (document.body.innerText || "").replace(/\n+/g, " / "));
    const i = preview.indexOf("Preview run");
    log(`PREVIEW: ${preview.slice(Math.max(0, i - 120), i + 900)}`);
    await page.screenshot({ path: `${OUT}/b1e-preview.png` });
    const buttons = await page.evaluate(() => [...new Set(Array.from(document.querySelectorAll("button")).map((b) => (b as HTMLElement).innerText.trim()).filter(Boolean))]);
    log(`buttons now: ${buttons.filter((b) => /run|generate|confirm|post/i.test(b)).join(" | ")}`);

    // Commit the run, whatever the surface calls it.
    const commit = page.getByRole("button", { name: /^(Generate|Run|Confirm|Generate charges|Post run)$/i }).first();
    if (await commit.count()) {
        await commit.click();
        await page.waitForTimeout(14_000);
        log(`after commit: ${(await page.evaluate(() => (document.body.innerText || "").replace(/\n+/g, " / "))).slice(0, 420)}`);
        await page.screenshot({ path: `${OUT}/b1e-run1.png` });
    } else {
        log("NO COMMIT CONTROL — preview only");
    }

    // ── SECOND RUN, identical inputs.
    await openGenerate(page);
    await page.getByRole("button", { name: /^Preview run$/ }).first().click();
    await page.waitForTimeout(9000);
    const preview2 = await page.evaluate(() => (document.body.innerText || "").replace(/\n+/g, " / "));
    const j = preview2.indexOf("Preview run");
    log(`PREVIEW 2: ${preview2.slice(Math.max(0, j - 120), j + 900)}`);
    await page.screenshot({ path: `${OUT}/b1e-preview2.png` });

    const gen = wire.filter((w) => /generate_tuition|tuition/i.test(JSON.stringify(w.request)));
    log(`\nGENERATION CALLS: ${gen.length}`);
    for (const g of gen) log(JSON.stringify({ url: g.url, req: (g.request as { payload?: unknown })?.payload, res: JSON.stringify(g.response).slice(0, 600) }));
});
