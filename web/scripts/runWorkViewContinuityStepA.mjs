/**
 * Step A — Work View continuity browser reproduction + canonical count trace.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config as loadEnv } from "dotenv";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
loadEnv({ path: path.join(webRoot, ".env.local") });

const outPath = path.join(webRoot, "../docs/sprints/07_2026/work-view-continuity-step-a-report.json");
const WU_PATH = "/workspace/work-unit/new-leads";

function median(nums) {
    const a = nums.filter((n) => typeof n === "number").sort((x, y) => x - y);
    if (!a.length) return null;
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

async function readPillStrip(page) {
    return page.evaluate(() => {
        const strip = document.querySelector('[data-work-view-pill-strip="true"]');
        const pills = [...document.querySelectorAll('[data-work-view-id][role="tab"]')].map((el) => {
            const rect = el.getBoundingClientRect();
            const badge = el.querySelector(".tabular-nums");
            const spans = [...el.querySelectorAll("span")];
            const label = spans[0]?.textContent?.trim() ?? el.textContent?.trim() ?? "";
            return {
                id: el.getAttribute("data-work-view-id"),
                label,
                ariaSelected: el.getAttribute("aria-selected"),
                countText: badge?.textContent?.trim() ?? null,
                countVisible: Boolean(badge),
                width: rect.width,
                left: rect.left,
            };
        });
        return { stripPresent: Boolean(strip), pillCount: pills.length, pills };
    });
}

async function readQueueState(page) {
    return page.evaluate(() => {
        const region = document.querySelector('[data-queue-region="true"]');
        const rows = document.querySelectorAll('[data-queue-row-entity-id]');
        const empty = document.querySelector('[data-queue-empty="true"]');
        const skeleton = document.querySelector('[data-queue-skeleton="true"]');
        const focusInline = document.querySelector('[data-inline-focus-panel="true"]');
        const focusPlaceholder = document.querySelector('[data-focus-panel-placeholder="true"]');
        const bodyText = document.body?.innerText ?? "";
        return {
            queueWorkViewId: region?.getAttribute("data-work-view-id") ?? null,
            queueBusy: region?.getAttribute("aria-busy") ?? null,
            rowCount: rows.length,
            rowIds: [...rows].map((r) => r.getAttribute("data-queue-row-entity-id")),
            emptyVisible: Boolean(empty),
            skeletonVisible: Boolean(skeleton),
            genericLoading: /\bLoading…\b/.test(bodyText) || /\bLoading\.\.\.\b/.test(bodyText),
            focusInline: Boolean(focusInline),
            focusResolved: focusInline?.getAttribute("data-inline-focus-panel-resolved") ?? null,
            focusPlaceholder: Boolean(focusPlaceholder),
        };
    });
}

async function readPerfMarks(page) {
    return page.evaluate(() =>
        performance.getEntriesByType("mark").filter((m) => m.name.includes("[perf:perceived]")).map((m) => ({ name: m.name, startTime: m.startTime })),
    );
}

async function findPillByLabel(page, labelPart) {
    const pills = page.locator('[data-work-view-id][role="tab"]');
    const n = await pills.count();
    for (let i = 0; i < n; i++) {
        const t = (await pills.nth(i).innerText()).trim();
        if (t.toLowerCase().includes(labelPart.toLowerCase())) return pills.nth(i);
    }
    return null;
}

async function canonicalTrace(request, slugRes, deptRow, workUnits) {
    const { resolveWorkViewCanonicalLocation } = await import("../lib/workspace/resolveWorkViewCanonicalLocation.ts");
    const { lifecycleBuilderFromDepartmentMetadata } = await import("../lib/lifecycle/lifecycleBuilderConfig.ts");
    const { resolveProcessWorkViews } = await import("../lib/lifecycle/workViewsCompatibility.ts");
    const { queueRowsRouteForView } = await import("../lib/presentation/runtime/useWorkViewTotals.ts");
    const { diagnoseRecordWorkViewPlacement } = await import("../lib/lifecycle/operationalProjection.ts");

    const lb = lifecycleBuilderFromDepartmentMetadata(deptRow.metadata);
    const process = lb.processes.find((p) => p.id === lb.active_process_id) ?? lb.processes[0];
    const workViews = resolveProcessWorkViews({ process, saved: process?.work_views_v1 ?? null });

    const findView = (needle) =>
        workViews.find((v) => v.label?.toLowerCase().includes(needle.toLowerCase())) ??
        workViews.find((v) => v.id?.toLowerCase().includes(needle.replace(/\s+/g, "_").toLowerCase()));

    const newLeadsView = findView("new leads");
    const allLeadsView = findView("all leads") ?? findView("all stages");
    const viewsToTrace = [newLeadsView, allLeadsView].filter(Boolean);
    const canonicalByView = [];
    let recordTraces = [];

    for (const view of viewsToTrace) {
        const location = resolveWorkViewCanonicalLocation(view, workUnits, deptRow.id);
        const route = location
            ? queueRowsRouteForView({
                  workUnitId: location.workUnitId,
                  baseQueueKey: location.baseQueueKey,
                  workViewId: view.id,
                  limit: view.id === newLeadsView?.id ? 50 : 1,
                  selectedSiteId: null,
              })
            : null;
        let apiJson = null;
        if (route) {
            const res = await request.get(route);
            apiJson = res.ok() ? await res.json() : { error: res.status() };
        }
        canonicalByView.push({
            viewId: view.id,
            label: view.label,
            compat_queue_key: view.compat_queue_key ?? null,
            filters_v1: view.filters_v1 ?? [],
            match: view.match ?? null,
            canonical: location,
            rowsApiUrl: route,
            apiTotal: apiJson?.total ?? apiJson?.queue?.total ?? null,
            apiItemCount: Array.isArray(apiJson?.items) ? apiJson.items.length : null,
            apiTotalOmitted: apiJson?.total_omitted ?? null,
            apiError: apiJson?.error ?? null,
        });
    }

    if (newLeadsView && allLeadsView) {
        const nlLoc = resolveWorkViewCanonicalLocation(newLeadsView, workUnits, deptRow.id);
        if (nlLoc) {
            const rowsRoute = queueRowsRouteForView({
                workUnitId: nlLoc.workUnitId,
                baseQueueKey: nlLoc.baseQueueKey,
                workViewId: newLeadsView.id,
                limit: 50,
                selectedSiteId: null,
            });
            const rowsRes = await request.get(rowsRoute);
            if (rowsRes.ok()) {
                const rowsJson = await rowsRes.json();
                for (const item of (rowsJson.items ?? []).slice(0, 10)) {
                    const diag = diagnoseRecordWorkViewPlacement({ record: item, workViews, statusStageMap: null });
                    const allLeadsPlacement = diag.views.find((v) => v.id === allLeadsView.id);
                    recordTraces.push({
                        recordId: diag.recordId,
                        status_key: diag.status_key,
                        stage_key: diag.stage_key,
                        allLeadsPass: allLeadsPlacement?.pass ?? null,
                        allLeadsFilters: allLeadsPlacement?.filters ?? null,
                        viewPlacements: diag.views.filter((v) => v.pass).map((v) => v.label),
                    });
                }
            }
        }
    }

    return {
        departmentId: deptRow.id,
        activeProcessId: lb.active_process_id,
        workViewLabels: workViews.map((v) => ({ id: v.id, label: v.label, compat_queue_key: v.compat_queue_key })),
        canonicalByView,
        recordTraces,
        hostWorkUnitIdFromSlug: slugRes.work_unit_id,
    };
}

async function runBrowserPass(page, runIndex) {
    const networkLog = [];
    page.on("response", async (res) => {
        const url = res.url();
        if (!url.includes("/api/admin/queues/")) return;
        let json = null;
        try { json = await res.json(); } catch { json = null; }
        networkLog.push({
            url,
            status: res.status(),
            total: json?.total ?? null,
            itemCount: Array.isArray(json?.items) ? json.items.length : null,
            work_view_id: new URL(url).searchParams.get("work_view_id"),
            count_mode: new URL(url).searchParams.get("count_mode"),
            limit: new URL(url).searchParams.get("limit"),
        });
    });

    await page.goto(WU_PATH, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForSelector('[data-work-view-id][role="tab"]', { timeout: 120000 });
    await page.waitForTimeout(1500);

    const initialStrip = await readPillStrip(page);
    const initialQueue = await readQueueState(page);
    const allLeadsPill = await findPillByLabel(page, "all leads");
    const newLeadsPill = await findPillByLabel(page, "new leads");

    let switchToAllMs = null, switchBackMs = null;
    let midSwitchStrip = null, midSwitchQueue = null;
    let afterAllLeadsStrip = null, afterAllLeadsQueue = null;

    if (allLeadsPill) {
        const t0 = Date.now();
        await allLeadsPill.click();
        for (let i = 0; i < 40; i++) {
            if ((await allLeadsPill.getAttribute("aria-selected")) === "true") { switchToAllMs = Date.now() - t0; break; }
            await page.waitForTimeout(16);
        }
        midSwitchStrip = await readPillStrip(page);
        midSwitchQueue = await readQueueState(page);
        await page.waitForTimeout(1200);
        afterAllLeadsStrip = await readPillStrip(page);
        afterAllLeadsQueue = await readQueueState(page);
    }

    if (newLeadsPill) {
        const t1 = Date.now();
        await newLeadsPill.click();
        for (let i = 0; i < 40; i++) {
            if ((await newLeadsPill.getAttribute("aria-selected")) === "true") { switchBackMs = Date.now() - t1; break; }
            await page.waitForTimeout(16);
        }
        await page.waitForTimeout(1200);
    }

    const finalStrip = await readPillStrip(page);
    const finalQueue = await readQueueState(page);
    const perfMarks = await readPerfMarks(page);

    const getCount = (strip, label) => strip?.pills?.find((p) => p.label.toLowerCase().includes(label))?.countText ?? null;

    return {
        run: runIndex,
        newLeadsCountInitial: getCount(initialStrip, "new leads"),
        allLeadsCountInitial: getCount(initialStrip, "all leads"),
        activePillInitial: initialStrip.pills.find((p) => p.ariaSelected === "true")?.label ?? null,
        activePillAfterAllLeads: afterAllLeadsStrip?.pills?.find((p) => p.ariaSelected === "true")?.label ?? null,
        activePillFinal: finalStrip.pills.find((p) => p.ariaSelected === "true")?.label ?? null,
        switchToAllMs,
        switchBackMs,
        pillCountStable: initialStrip.pillCount === finalStrip.pillCount,
        pillsDisappeared: finalStrip.pillCount < initialStrip.pillCount,
        countsDisappeared: [initialStrip, midSwitchStrip, afterAllLeadsStrip, finalStrip].filter(Boolean).some((s) => s.pills.some((p) => !p.countVisible && /leads/i.test(p.label))),
        pillWidthsChanged: initialStrip.pills.some((p, i) => finalStrip.pills[i] && Math.abs(p.width - finalStrip.pills[i].width) > 2),
        initialQueue,
        midSwitchQueue,
        afterAllLeadsQueue,
        finalQueue,
        focusClosedOnSwitch: midSwitchQueue?.focusPlaceholder === true || (!midSwitchQueue?.focusInline && !midSwitchQueue?.focusPlaceholder),
        perfMarks,
        networkLog,
    };
}

async function main() {
    const baseUrl = process.env.WORK_VIEW_STEP_A_URL ?? "http://127.0.0.1:3001";
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 960 } });
    const page = await context.newPage();
    const request = page.request;
    const { ensureAdminPlaywrightSession } = await import("../playwright/helpers/adminSessionAuth.ts");
    await ensureAdminPlaywrightSession(page);

    const slugRes = await (await request.get("/api/admin/work-units/by-slug/new-leads")).json();
    const deptRow = await (await request.get(`/api/admin/departments/${slugRes.department_id}`)).json();
    const wuList = await (await request.get(`/api/admin/work-units?department_id=${slugRes.department_id}`)).json();
    const workUnits = wuList.items ?? wuList.work_units ?? wuList ?? [];
    const canonical = await canonicalTrace(request, slugRes, deptRow, workUnits);

    const runs = [];
    for (let i = 1; i <= 3; i++) runs.push(await runBrowserPass(page, i));

    const report = { capturedAt: new Date().toISOString(), baseUrl, path: WU_PATH, slugResolution: slugRes, canonical, runs, medians: { switchToAllMs: median(runs.map((r) => r.switchToAllMs)), switchBackMs: median(runs.map((r) => r.switchBackMs)) } };
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ outPath, medians: report.medians, canonicalByView: report.canonical.canonicalByView, runs: runs.map((r) => ({ run: r.run, newLeadsCountInitial: r.newLeadsCountInitial, allLeadsCountInitial: r.allLeadsCountInitial, switchToAllMs: r.switchToAllMs })) }, null, 2));
    await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
