/**
 * §8–§12 — the recurring preview, both generations, and both reruns.
 *
 * The previous reading of this surface was `Generate 0 · $0.00`, and it was CORRECT: there were no
 * accepted terms to bill. Two terms are now accepted through the mounted card, so the same gesture
 * on the same span is the honest test of whether accepted terms enter generation.
 *
 * Everything is taken off the wire — the action request and its execution result — rather than read
 * out of the summary line, because a summary is a rendering and an idempotency claim needs the
 * canonical counts.
 */
import { test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-fx";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

const wire: Array<Record<string, unknown>> = [];

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

async function runOnce(p: Page, tag: string) {
    await openGenerate(p);
    const month = p.locator('input[type="month"]').first();
    if (await month.count()) {
        await month.fill("2026-09");
        await p.waitForTimeout(1500);
    }
    await p.getByRole("button", { name: /^Preview run$/ }).first().click();
    await p.waitForTimeout(10_000);
    const previewText = await p.evaluate(() => (document.body.innerText || "").replace(/\n+/g, " / "));
    const i = previewText.indexOf("Preview run");
    const previewSlice = previewText.slice(Math.max(0, i - 200), i + 1200);
    await p.screenshot({ path: `${OUT}/gen-${tag}-preview.png`, fullPage: true });
    log(`\n[${tag}] PREVIEW: ${previewSlice}`);

    const commit = p.getByRole("button", { name: /^(Generate|Run|Confirm|Generate charges|Post run)$/i }).first();
    let committed = false;
    if (await commit.count()) {
        await commit.click();
        await p.waitForTimeout(16_000);
        committed = true;
        await p.screenshot({ path: `${OUT}/gen-${tag}-after.png`, fullPage: true });
        log(`[${tag}] AFTER: ${(await p.evaluate(() => (document.body.innerText || "").replace(/\n+/g, " / "))).slice(0, 600)}`);
    } else {
        log(`[${tag}] NO COMMIT CONTROL`);
    }
    return { previewSlice, committed };
}

test("preview, generate, rerun", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    page.on("response", async (res) => {
        if (res.request().method() === "GET" || !res.url().includes("/api/")) return;
        let body: unknown = null; let req: unknown = null;
        try { body = await res.json(); } catch { body = "(unparseable)"; }
        try { req = JSON.parse(res.request().postData() ?? "null"); } catch { req = null; }
        const u = res.url().replace(/^https?:\/\/[^/]+/, "");
        if (!/actions\/execute|tuition|charge/i.test(u + JSON.stringify(req))) return;
        wire.push({ url: u, status: res.status(), request: req, response: body });
        writeFileSync(`${OUT}/gen-wire.json`, JSON.stringify(wire, null, 2));
    });

    const first = await runOnce(page, "run1");
    const second = await runOnce(page, "run2");

    writeFileSync(`${OUT}/gen.json`, JSON.stringify({ first, second, wire }, null, 2));
    const gen = wire.filter((w) => /generate_tuition/i.test(JSON.stringify(w.request)));
    log(`\n=== GENERATION CALLS: ${gen.length} ===`);
    for (const g of gen) {
        log(JSON.stringify({ payload: (g.request as { payload?: unknown })?.payload, mode: (g.request as { mode?: unknown })?.mode }, null, 0));
        log(JSON.stringify(g.response).slice(0, 2500));
    }
});
