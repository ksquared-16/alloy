/** §E3/E2/E6 — recurring generation through the operator surface, twice. */
import { test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-b1";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(280_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

async function charges(p: Page) {
    await p.goto("/workspace", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(9000);
    await p.getByRole("button", { name: /Financials — the financial work/ }).first().click();
    await p.waitForTimeout(9000);
    await p.getByRole("tab", { name: /^Charges$/ }).or(p.getByRole("button", { name: /^Charges$/ })).first().click({ timeout: 20_000 });
    await p.waitForTimeout(7000);
}

test("E · generate a period's tuition, then again", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const wire: Array<Record<string, unknown>> = [];
    page.on("response", async (res) => {
        if (res.request().method() === "GET" || !res.url().includes("/api/")) return;
        let body: unknown = null; let req: unknown = null;
        try { body = await res.json(); } catch { body = "(unparseable)"; }
        try { req = JSON.parse(res.request().postData() ?? "null"); } catch { req = null; }
        wire.push({ url: res.url().replace(/^https?:\/\/[^/]+/, ""), status: res.status(), request: req, response: body });
        writeFileSync(`${OUT}/b1e-wire.json`, JSON.stringify(wire, null, 2));
    });

    await charges(page);
    const gen = page.getByRole("button", { name: /Generate a period's tuition/i }).first();
    log(`generate control: ${await gen.count()}`);
    if (!(await gen.count())) { log("NO GENERATE CONTROL"); return; }
    await gen.click();
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${OUT}/b1e-gen-open.png` });
    const form = await page.evaluate(() => ({
        selects: Array.from(document.querySelectorAll("select")).map((s) => ({
            id: s.getAttribute("data-testid") ?? s.getAttribute("name"), value: s.value,
            options: Array.from(s.options).map((o) => o.text.trim()).slice(0, 14),
        })),
        inputs: Array.from(document.querySelectorAll("input")).map((i) => ({ type: i.type, id: i.getAttribute("data-testid") ?? i.getAttribute("name"), value: i.value })).slice(0, 12),
        buttons: [...new Set(Array.from(document.querySelectorAll("button")).map((b) => (b as HTMLElement).innerText.trim()).filter(Boolean))].slice(0, 26),
        text: (document.body.innerText || "").slice(0, 900).replace(/\n+/g, " / "),
    }));
    log(`GEN FORM selects=${JSON.stringify(form.selects)}`);
    log(`GEN FORM inputs=${JSON.stringify(form.inputs)}`);
    log(`GEN FORM buttons=${form.buttons.join(" | ").slice(0, 300)}`);
    writeFileSync(`${OUT}/b1e-genform.json`, JSON.stringify(form, null, 2));
});
