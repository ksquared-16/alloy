/**
 * R11 — discover the tenant's opportunity subjects.
 *
 * Subjects come from the queue API responses the app itself makes, not from a DOM scrape: the queue
 * rows do not carry the anchored opportunity id as an attribute, so scraping silently finds nothing
 * and reads exactly like "this tenant has no subjects".
 *
 * Writes working state (real ids, needed to query) to R11_OUT_DIR, which is gitignored. Durable
 * evidence written by the other harnesses is redacted.
 */
import { chromium } from "playwright";
import fs from "fs";
import { join } from "path";
import { BASE, STORAGE, OUT_DIR, assertLocalBase, withResource } from "./r11Env.mjs";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

assertLocalBase();
const uuids = await withResource(
    () => chromium.launch({ headless: true }),
    (b) => b.close(),
    async (browser) => {
        const ctx = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 960 } });
        const page = await ctx.newPage();
        const seen = new Set();
        page.on("response", async (res) => {
            const u = res.url();
            if (!u.includes("/api/admin/") || !/queues|queue-view|work-units|records|search/i.test(u)) return;
            try {
                for (const m of (await res.text()).matchAll(UUID)) seen.add(m[0]);
            } catch { /* body already consumed or binary */ }
        });
        await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 120000 });
        await page.waitForFunction(
            () => document.querySelectorAll('a[href^="/workspace/work-unit/"]').length > 0,
            undefined,
            { timeout: 90000 },
        );
        const links = [...new Set(await page.$$eval('a[href^="/workspace/work-unit/"]', (as) => as.map((a) => a.getAttribute("href"))))];
        for (const href of links) {
            try {
                await page.goto(`${BASE}${href}`, { waitUntil: "domcontentloaded", timeout: 90000 });
                await page.waitForTimeout(10000);
            } catch { /* a work unit that will not open is not a subject source */ }
            console.log(`  ${href}: ${seen.size} candidate ids seen`);
        }
        return [...seen];
    },
);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(join(OUT_DIR, "candidates.json"), JSON.stringify(uuids, null, 1));
console.log(`total candidate ids: ${uuids.length} -> ${join(OUT_DIR, "candidates.json").replace(process.cwd() + "/", "")}`);
