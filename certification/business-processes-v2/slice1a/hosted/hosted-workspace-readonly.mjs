// BP V2 Slice 1A — READ-ONLY hosted /workspace certification on deployed staging.
// Navigation and GET requests only. No hover, click, form input or non-GET request is issued.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const require = createRequire("/Users/vacilando/Code/alloy-worktrees/business-processes/web/package.json");
const { chromium } = require("playwright");

const BASE = "https://staging.workwithalloy.com";
const STORAGE = process.env.STORAGE_STATE;
const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });

const result = { base: BASE, started_at: new Date().toISOString(), console: [], page_errors: [], failed_requests: [], http_errors: [], non_get_requests: [] };

const browser = await chromium.launch();
const context = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") result.console.push({ type: m.type(), text: m.text().slice(0, 400), url: page.url() }); });
page.on("pageerror", (e) => result.page_errors.push({ message: String(e.message).slice(0, 400), url: page.url() }));
page.on("requestfailed", (r) => result.failed_requests.push({ url: r.url().slice(0, 200), method: r.method(), failure: r.failure()?.errorText }));
page.on("request", (r) => { if (r.method() !== "GET" && r.url().startsWith(BASE)) result.non_get_requests.push({ method: r.method(), url: r.url().slice(0, 200) }); });
page.on("response", (r) => { if (r.status() >= 400 && r.url().startsWith(BASE)) result.http_errors.push({ status: r.status(), url: r.url().slice(0, 200) }); });

result.build_info = await (await context.request.get(`${BASE}/api/build-info`)).json();

await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector("article[data-process-id]", { timeout: 60000 }).catch(() => null);
await page.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => null);
await page.waitForTimeout(4000);
result.final_url = page.url();
await page.screenshot({ path: join(OUT, "workspace-1440.png"), fullPage: true });

result.tiles = await page.$$eval("article[data-process-id]", (arts) => arts.map((a) => ({
    process_id: a.getAttribute("data-process-id"),
    title: a.querySelector("[data-process-title]")?.textContent?.trim() ?? null,
    subtitle: a.querySelector("[data-process-subtitle]")?.textContent?.trim() ?? null,
    status: a.querySelector("[data-process-status]")?.textContent?.trim() ?? null,
    answer: a.querySelector("[data-process-answer]")?.textContent?.replace(/\s+/g, " ").trim() ?? null,
    todays_work: [...a.querySelectorAll("[data-process-todays-work] a, [data-process-todays-work] li")].map((n) => n.textContent?.replace(/\s+/g, " ").trim()).filter(Boolean),
    todays_work_hrefs: [...a.querySelectorAll("[data-process-todays-work] a")].map((n) => n.getAttribute("href")),
    cta_href: a.querySelector("a[data-process-cta]")?.getAttribute("href") ?? null,
    cta_text: a.querySelector("[data-process-cta]")?.textContent?.trim() ?? null,
    unavailable: a.querySelector("[data-process-unavailable]")?.textContent?.trim() ?? null,
    link_count: a.querySelectorAll("a").length,
}))).catch(() => []);

result.sidebar = await page.$$eval("[data-sidebar-group-label='business-processes']", (labels) => {
    const label = labels[0];
    if (!label) return null;
    const box = label.parentElement;
    return {
        text: box?.innerText?.slice(0, 1500) ?? null,
        unavailable_rows: [...(box?.querySelectorAll("[data-sidebar-process-unavailable]") ?? [])].map((n) => n.textContent?.trim()),
        links: [...(box?.querySelectorAll("a") ?? [])].map((n) => ({ text: n.textContent?.trim(), href: n.getAttribute("href") })).slice(0, 40),
    };
}).catch(() => null);

for (const [key, path] of [["catalog", "/api/admin/lifecycle-catalog"], ["departments", "/api/admin/departments"]]) {
    const r = await context.request.get(`${BASE}${path}`);
    let body = null;
    try { body = await r.json(); } catch { body = null; }
    result[key] = { status: r.status(), body };
}

// Enrollment entry: open the tile's CTA destination by URL (navigation, not a click) and record what renders.
const enrollment = (result.tiles || []).find((t) => t.cta_href);
if (enrollment?.cta_href) {
    await page.goto(`${BASE}${enrollment.cta_href}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => null);
    await page.waitForTimeout(4000);
    result.entry = { url: page.url(), title: await page.title() };
    await page.screenshot({ path: join(OUT, "enrollment-entry-1440.png"), fullPage: false });
}

result.finished_at = new Date().toISOString();
writeFileSync(join(OUT, "hosted-workspace-readonly.json"), JSON.stringify(result, null, 2));
await browser.close();
console.log(JSON.stringify({ final_url: result.final_url, tiles: result.tiles.length, console: result.console.length, page_errors: result.page_errors.length, http_errors: result.http_errors.length, non_get: result.non_get_requests.length }));
