/** Structure first. Guessing a row selector has already cost this thread three probes. */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-v161";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(240_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("lane dom", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(15_000);
    const dom = await page.evaluate(() => {
        const names = new Map<string, number>();
        for (const el of Array.from(document.querySelectorAll("*"))) {
            for (const a of Array.from(el.attributes)) {
                if (a.name.startsWith("data-")) names.set(a.name, (names.get(a.name) ?? 0) + 1);
            }
        }
        const rowish = Array.from(names.keys()).filter((n) => /row|queue|subject|participant|member|child|select/.test(n));
        const sample = (sel: string) => Array.from(document.querySelectorAll(sel)).slice(0, 8).map((e) => {
            const o: Record<string, string> = { tag: e.tagName.toLowerCase() };
            for (const a of Array.from(e.attributes)) if (a.name.startsWith("data-")) o[a.name] = a.value.slice(0, 60);
            o._text = (e as HTMLElement).innerText.replace(/\s+/g, " ").slice(0, 70);
            return o;
        });
        return {
            rowish: rowish.map((n) => `${n} (${names.get(n)})`),
            queueSamples: Object.fromEntries(rowish.slice(0, 14).map((n) => [n, sample(`[${n}]`)])),
        };
    });
    writeFileSync(`${OUT}/v161-dom.json`, JSON.stringify(dom, null, 2));
    log(`row-ish attributes:\n${dom.rowish.join("\n")}`);
});
