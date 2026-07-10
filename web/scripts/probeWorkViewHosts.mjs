import path from "path";
import { fileURLToPath } from "url";
import { config as loadEnv } from "dotenv";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(__dirname, "../.env.local") });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: "http://127.0.0.1:3001" });
const page = await context.newPage();
const { ensureAdminPlaywrightSession } = await import("../playwright/helpers/adminSessionAuth.ts");
await ensureAdminPlaywrightSession(page);
await page.goto("/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForTimeout(4000);

const data = await page.evaluate(async () => {
    const slug = await fetch("/api/admin/work-units/by-slug/new-leads", { credentials: "include" }).then((r) =>
        r.json(),
    );
    const deptId = slug.department_id;
    const wuId = slug.work_unit_id;
    const deptRes = await fetch(`/api/admin/departments/${deptId}`, { credentials: "include" }).then((r) =>
        r.json(),
    );
    const wusRes = await fetch(`/api/admin/work-units?department_id=${encodeURIComponent(deptId)}`, {
        credentials: "include",
    }).then((r) => r.json());
    const meta = deptRes?.department?.metadata || deptRes?.metadata || {};
    const rawViews = meta?.work_views_v1?.views || meta?.work_views_v1 || [];
    const views = Array.isArray(rawViews) ? rawViews : [];
    const list = Array.isArray(wusRes) ? wusRes : wusRes.work_units || wusRes.items || [];
    const workUnits = (Array.isArray(list) ? list : []).map((w) => ({
        id: w.id,
        key: w.key,
        name: w.name,
    }));
    return {
        wuId,
        deptId,
        viewSummaries: views.map((v) => ({
            id: v.id,
            label: v.label,
            host_work_unit_id: v.host_work_unit_id || v.work_unit_id || v.canonical_work_unit_id || null,
            base_queue_key: v.base_queue_key || v.queue_key || null,
            keys: Object.keys(v || {}),
        })),
        workUnits,
        rawViewsSample: views.slice(0, 2),
    };
});

console.log(JSON.stringify(data, null, 2));
await browser.close();
