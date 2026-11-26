// BP V2 Slice 4A (from the Slice 4 script) — READ-ONLY hosted check on deployed staging. Every non-GET request to the app is ABORTED
// (and recorded), so no click can write. Run once before and once after the deploy; compare.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const require = createRequire("/Users/vacilando/Code/alloy-worktrees/business-processes/web/package.json");
const { chromium } = require("playwright");
const BASE = "https://staging.workwithalloy.com";
const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });
const KEYS = ["current_assignments", "assignments_ending_soon", "assignments_upcoming_changes", "schedule_gaps", "assignments_proposed_incomplete", "charges_needing_review"];
const r = { console_errors: [], page_errors: [], http_errors: [], blocked_non_get: [], views: {}, scripts: new Set() };
const browser = await chromium.launch();
const context = await browser.newContext({ storageState: process.env.STORAGE_STATE, viewport: { width: 1440, height: 1000 } });
await context.route("**/*", (route) => {
    const q = route.request();
    const readPost = q.method() === "POST" && q.url().startsWith(`${BASE}/api/admin/queue-view-totals`); // read-only counts endpoint (no writes in the route)
    if (!readPost && q.method() !== "GET" && q.method() !== "HEAD" && q.url().startsWith(BASE)) {
        r.blocked_non_get.push(`${q.method()} ${q.url().replace(BASE, "").slice(0, 120)}`);
        return route.abort();
    }
    return route.continue();
});
const page = await context.newPage();
page.on("console", (m) => { if (m.type() === "error") r.console_errors.push({ text: m.text().slice(0, 300), url: page.url().replace(BASE, "") }); });
page.on("pageerror", (e) => r.page_errors.push({ message: String(e.message).slice(0, 300), url: page.url().replace(BASE, "") }));
page.on("response", (x) => {
    if (x.url().startsWith(BASE) && /\.js(\?|$)/.test(x.url())) r.scripts.add(x.url());
    if (x.status() >= 400 && x.url().startsWith(BASE)) r.http_errors.push({ status: x.status(), url: x.url().replace(BASE, "").slice(0, 160) });
});
const settle = async (ms = 4000) => { await page.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => null); await page.waitForTimeout(ms); };
const surface = () => page.evaluate(() => {
    const s = document.querySelector("[data-component='ProvisionedWorkUnitSurface']");
    const b = document.querySelector("[data-focus-panel-boundary]");
    return {
        url: location.pathname + location.search,
        terminal: s?.getAttribute("data-terminal-outcome") ?? null,
        active_view: s?.getAttribute("data-active-work-view") ?? null,
        row_grain: s?.getAttribute("data-row-grain") ?? null,
        projection_domain: s?.getAttribute("data-projection-domain") ?? null,
        rows: document.querySelectorAll("[data-entity-type]").length,
        durable_rows: document.querySelectorAll("[data-entity-type='durable_subject']").length,
        pills: [...document.querySelectorAll("[role='tab']")].map((p) => p.textContent?.replace(/\s+/g, " ").trim()).slice(0, 12),
        focus_panel_state: b?.getAttribute("data-focus-panel-state") ?? null,
        focus_panel_projection: b?.getAttribute("data-projection-process") ?? null,
        durable_surface: Boolean(document.querySelector("[data-durable-surface], [data-component='DurableRecordSurface']")),
        opportunity_panel: Boolean(document.querySelector("[data-component='InlineOpportunityFocusPanel'], [data-alloy-section^='FP.']")),
    };
});

r.build = (await (await context.request.get(`${BASE}/api/build-info`)).json()).gitSha;
await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector("article[data-process-id]", { timeout: 60000 }).catch(() => null);
await settle(3000);
r.tiles = await page.$$eval("article[data-process-id]", (as) => as.map((a) => ({
    title: a.querySelector("[data-process-title]")?.textContent?.trim(),
    answer: a.querySelector("[data-process-answer]")?.textContent?.replace(/\s+/g, " ").trim(),
    unavailable: a.querySelector("[data-process-unavailable]")?.textContent?.trim() ?? null,
})));
const cat = await (await context.request.get(`${BASE}/api/admin/lifecycle-catalog`)).json().catch(() => null);
r.catalog = (cat?.items ?? []).map((i) => ({ key: i.process_key, model: i.process_model, dept: i.department_key }));

for (const slug of ["new", "all"]) {
    await page.goto(`${BASE}/workspace/work-unit/${slug}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("[data-component='ProvisionedWorkUnitSurface']", { timeout: 60000 }).catch(() => null);
    await settle();
    r.views[slug] = await surface();
}
// Queue navigation: click the second Work View pill, then select the first row.
const tabs = page.locator("[role='tab']");
if ((await tabs.count()) > 1) {
    await tabs.nth(1).click().catch(() => null);
    await settle();
    r.views.after_pill = await surface();
}
const firstRow = page.locator("[data-entity-type]").first();
if (await firstRow.count()) {
    r.selected_row = await firstRow.evaluate((el) => ({ type: el.getAttribute("data-entity-type"), id: el.getAttribute("data-entity-id") ?? el.getAttribute("data-row-id") }));
    await firstRow.click().catch(() => null);
    await settle(5000);
    r.views.after_row = await surface();
    await page.screenshot({ path: join(OUT, "enrollment-focus-1440.png"), fullPage: false });
}
// Site filter: a lifecycle (Enrollment) answer ignores workspace_site_id — rows must be identical.
const answer = async (q) => {
    const x = await context.request.get(`${BASE}/api/admin/work-units/all/provisioning-answer?work_view_id=all${q}`);
    let b = null; try { b = await x.json(); } catch {}
    const rows = b?.rows ?? b?.answer?.rows ?? [];
    return { status: x.status(), terminal: b?.terminal ?? b?.answer?.terminal ?? null, rows: rows.length, ids: rows.map((w) => w.id ?? w.row_id ?? w.subject_id).slice(0, 50).join(",") };
};
const plain = await answer("");
const sited = await answer("&workspace_site_id=00000000-0000-4000-8000-0000000000ff");
r.site_filter_enrollment = { plain: { ...plain, ids: undefined }, with_site: { ...sited, ids: undefined }, identical_rows: plain.ids === sited.ids && plain.rows === sited.rows };
// Settings (read-only view): the projection catalog ships with the Business Process Work Views editor.
for (const path of ["/settings/business-processes", "/adminV2/settings/business-processes"]) {
    const resp = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null);
    await settle(3000);
    r.settings = { path, status: resp?.status() ?? null, final: page.url().replace(BASE, "") };
    if (resp && resp.status() < 400) break;
}
// Bundle: which projection keys ship in the client chunks loaded across these pages.
const found = Object.fromEntries(KEYS.map((k) => [k, false]));
const S4_MARKERS = ["domain_projection_record_changed", "has changed since the list was read", "data-scheduling-focus-notice"];
const s4 = Object.fromEntries(S4_MARKERS.map((k) => [k, false]));
for (const u of r.scripts) {
    const t = await (await context.request.get(u)).text().catch(() => "");
    for (const k of KEYS) if (t.includes(`"${k}"`) || t.includes(`'${k}'`)) found[k] = true;
    for (const k of S4_MARKERS) if (t.includes(k)) s4[k] = true;
}
r.bundle_keys = found; r.s4_bundle_markers = s4; r.scripts_scanned = r.scripts.size; delete r.scripts;
writeFileSync(join(OUT, "hosted-s4a-readonly.json"), JSON.stringify(r, null, 2));
await browser.close();
console.log(JSON.stringify({ ...r, console_errors: r.console_errors.slice(0, 8), console_error_count: r.console_errors.length, http_errors: r.http_errors.slice(0, 10), blocked_non_get: [...new Set(r.blocked_non_get)] }, null, 1));
