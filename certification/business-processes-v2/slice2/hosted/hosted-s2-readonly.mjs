// BP V2 Slice 2 — READ-ONLY hosted check on deployed staging. Navigation + GET only from this script.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const require = createRequire("/Users/vacilando/Code/alloy-worktrees/business-processes/web/package.json");
const { chromium } = require("playwright");
const BASE = "https://staging.workwithalloy.com";
const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });
const r = { console_errors: [], page_errors: [], http_errors: [], non_get: [], views: {} };
const browser = await chromium.launch();
const context = await browser.newContext({ storageState: process.env.STORAGE_STATE, viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.on("console", (m) => { if (m.type() === "error") r.console_errors.push({ text: m.text().slice(0, 300), url: page.url() }); });
page.on("pageerror", (e) => r.page_errors.push({ message: String(e.message).slice(0, 300), url: page.url() }));
page.on("response", (x) => { if (x.status() >= 400 && x.url().startsWith(BASE)) r.http_errors.push({ status: x.status(), url: x.url().replace(BASE, "").slice(0, 160) }); });
page.on("request", (q) => { if (q.method() !== "GET" && q.url().startsWith(BASE)) r.non_get.push(`${q.method()} ${q.url().replace(BASE, "").slice(0, 120)}`); });

r.build = (await (await context.request.get(`${BASE}/api/build-info`)).json()).gitSha;
await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector("article[data-process-id]", { timeout: 60000 }).catch(() => null);
await page.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => null);
await page.waitForTimeout(3000);
await page.screenshot({ path: join(OUT, "workspace-1440.png"), fullPage: true });
r.tiles = await page.$$eval("article[data-process-id]", (as) => as.map((a) => ({
    title: a.querySelector("[data-process-title]")?.textContent?.trim(),
    answer: a.querySelector("[data-process-answer]")?.textContent?.replace(/\s+/g, " ").trim(),
    cta: a.querySelector("a[data-process-cta]")?.getAttribute("href") ?? null,
    unavailable: a.querySelector("[data-process-unavailable]")?.textContent?.trim() ?? null,
    todays_work_rows: a.querySelectorAll("[data-process-todays-work] li, [data-process-todays-work] a").length,
})));
const cat = await (await context.request.get(`${BASE}/api/admin/lifecycle-catalog`)).json().catch(() => null);
r.catalog = (cat?.items ?? []).map((i) => ({ key: i.process_key, model: i.process_model, dept: i.department_key }));

for (const slug of ["new", "all"]) {
    await page.goto(`${BASE}/workspace/work-unit/${slug}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("[data-component='ProvisionedWorkUnitSurface']", { timeout: 60000 }).catch(() => null);
    await page.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => null);
    await page.waitForTimeout(4000);
    await page.screenshot({ path: join(OUT, `enrollment-${slug}-1440.png`), fullPage: false });
    r.views[slug] = await page.evaluate(() => {
        const s = document.querySelector("[data-component='ProvisionedWorkUnitSurface']");
        const b = document.querySelector("[data-focus-panel-boundary]");
        return {
            terminal: s?.getAttribute("data-terminal-outcome") ?? null,
            active_view: s?.getAttribute("data-active-work-view") ?? null,
            row_grain: s?.getAttribute("data-row-grain") ?? null,
            projection_domain: s?.getAttribute("data-projection-domain") ?? null,
            build_sha: s?.getAttribute("data-build-sha") ?? null,
            rows: document.querySelectorAll("[data-entity-type]").length,
            durable_rows: document.querySelectorAll("[data-entity-type='durable_subject']").length,
            pills: [...document.querySelectorAll("[role='tab']")].map((p) => p.textContent?.replace(/\s+/g, " ").trim()).slice(0, 12),
            focus_panel_state: b?.getAttribute("data-focus-panel-state") ?? null,
            focus_panel_projection: b?.getAttribute("data-projection-process") ?? null,
            opportunity_panel: Boolean(document.querySelector("[data-component='InlineOpportunityFocusPanel'], [data-alloy-section^='FP.']")),
        };
    });
}
const ans = await context.request.get(`${BASE}/api/admin/work-units/all/provisioning-answer?work_view_id=all`);
let body = null; try { body = await ans.json(); } catch {}
r.answer_all = { status: ans.status(), terminal: body?.terminal ?? body?.answer?.terminal ?? null, rows: (body?.rows ?? body?.answer?.rows ?? []).length };
writeFileSync(join(OUT, "hosted-s2-readonly.json"), JSON.stringify(r, null, 2));
await browser.close();
console.log(JSON.stringify({ build: r.build, tiles: r.tiles, catalog: r.catalog, views: r.views, answer_all: r.answer_all, console_errors: r.console_errors.length, page_errors: r.page_errors.length, http_errors: r.http_errors, non_get: [...new Set(r.non_get)] }, null, 1));
