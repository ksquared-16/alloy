/** Read the AUTHORITATIVE published Focus Panel layout and report the Financials placement. */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-regression";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012" });
test.setTimeout(240_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("published focus panel layout — financials placement", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    // Driven from INSIDE the browser context: an authenticated curl rotates the single-use refresh
    // token and kills the session for everything else.
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    const data = await page.evaluate(async () => {
        const r = await fetch("/api/admin/entity-layouts/focus-panel-summary", { credentials: "include" });
        return { status: r.status, body: await r.json().catch(() => null) };
    });
    writeFileSync(`${OUT}/published-layout.json`, JSON.stringify(data, null, 2));
    /* eslint-disable no-console */
    log(`status ${data.status}`);
    const pub = data.body?.published;
    log(`published id=${pub?.id} version=${pub?.version} status=${pub?.status} layoutKey=${pub?.layoutKey}`);
    const s = JSON.stringify(pub ?? {});
    const m = s.match(/\{[^{}]*"cardKey"\s*:\s*"financials"[^{}]*\}/g) ?? s.match(/\{[^{}]*financials[^{}]*\}/g);
    log(`financials placement fragments: ${JSON.stringify(m)}`);
    log(`doc keys: ${Object.keys(pub ?? {}).join(", ")}`);
    /* eslint-enable no-console */
});
