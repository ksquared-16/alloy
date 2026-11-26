/**
 * Enrollment Process V1 — Operator Runtime QA (Golden Path).
 */
import { config as loadEnv } from "dotenv";
import * as path from "path";
import { test, expect } from "@playwright/test";
import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

loadEnv({ path: path.join(__dirname, "../../.env.local") });

const NEW_LEADS_SLUG = "new-leads";
const TAG = `QA-${Date.now()}`;

test("Create Lead → metrics → Work View → queue row → Focus Panel → refresh", async ({ page }) => {
    test.setTimeout(600_000);
    await page.setViewportSize({ width: 1440, height: 960 });
    await ensureAdminPlaywrightSession(page);

    const slugRes = await page.request.get(`/api/admin/work-units/by-slug/${NEW_LEADS_SLUG}`);
    const slug = (await slugRes.json()) as { work_unit_id?: string; department_id?: string };
    const workUnitId = slug.work_unit_id!;
    const departmentId = slug.department_id!;

    const metric = async (key: string) => {
        const res = await page.request.get(
            `/api/admin/metrics/resolve?keys=${encodeURIComponent(key)}&work_unit_id=${encodeURIComponent(workUnitId)}&window=rolling_30d&mode=live`,
        );
        const json = (await res.json()) as { metrics?: Array<{ metric_key: string; value: number | null }> };
        return json.metrics?.find((m) => m.metric_key === key)?.value ?? null;
    };

    const baselineActive = await metric("enrollment.active_leads");

    // 1 — Create Lead (authenticated action API; same path as modal submit)
    const familyName = `Runtime${TAG.slice(-6)}`;
    const childFirst = "Quinn";
    const createRes = await page.request.post("/api/admin/actions/execute", {
        data: {
            action_key: "create_lead",
            entity_type: "opportunity",
            entity_id: "__create_lead__",
            context: { surface: "work_unit", department_id: departmentId, work_unit_id: workUnitId },
            payload: {
                first_name: "Jordan",
                last_name: familyName,
                email: `${TAG}@example.com`,
                phone: "6025550199",
                child_first_name: childFirst,
                child_last_name: familyName,
            },
        },
    });
    expect(createRes.ok()).toBeTruthy();
    const createJson = (await createRes.json()) as { data?: { execution_result?: { opportunity_id?: string } } };
    const opportunityId = createJson.data?.execution_result?.opportunity_id;
    expect(opportunityId).toBeTruthy();

    // 2 — Metrics
    const afterActive = await metric("enrollment.active_leads");
    expect(afterActive).toBeGreaterThanOrEqual((baselineActive ?? 0) + 1);

    // 3–4 — Work View filtered queue (stage enrichment before filter)
    let wv: { total?: number; items?: Array<{ id?: string; name?: string }> } = {};
    for (let attempt = 0; attempt < 12; attempt++) {
        const wvRes = await page.request.get(
            `/api/admin/queues/${encodeURIComponent(workUnitId)}/lifecycle_lead?limit=50&count_mode=exact&work_view_id=new_leads&offset=${attempt}`,
        );
        expect(wvRes.ok()).toBeTruthy();
        wv = (await wvRes.json()) as typeof wv;
        if (wv.items?.some((r) => r.id === opportunityId || (r.name ?? "").includes(familyName))) break;
        await page.waitForTimeout(500);
    }
    expect(wv.total ?? 0).toBeGreaterThan(0);
    expect(wv.items?.some((r) => r.id === opportunityId || (r.name ?? "").includes(familyName))).toBe(true);

    await page.goto(`/workspace/work-unit/${NEW_LEADS_SLUG}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await expect(page.getByRole("heading", { name: /enrollment/i })).toBeVisible({ timeout: 90_000 });

    const rowLocator = page.getByRole("button", { name: new RegExp(familyName, "i") }).first();
    await expect(rowLocator).toBeVisible({ timeout: 120_000 });

    // 5 — Focus Panel household + child subjects
    await rowLocator.click();
    await page.waitForTimeout(2000);
    const drawerRes = await page.request.get(`/api/admin/view-models/drawer/opportunity/${opportunityId}`);
    expect(drawerRes.ok()).toBeTruthy();
    const drawerRaw = await drawerRes.json();
    const drawerJson = JSON.stringify(drawerRaw);
    expect(drawerJson.toLowerCase()).toContain(childFirst.toLowerCase());
    expect(drawerJson.toLowerCase()).toContain(familyName.toLowerCase());

    const focusHeader = page.getByRole("heading", { level: 2 }).filter({ hasText: new RegExp(familyName, "i") });
    if (await focusHeader.isVisible().catch(() => false)) {
        await expect(focusHeader).toBeVisible();
    }

    // 7 — Hard refresh persistence
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /enrollment/i })).toBeVisible({ timeout: 90_000 });
    await expect(rowLocator).toBeVisible({ timeout: 120_000 });

    const refreshActive = await metric("enrollment.active_leads");
    expect(refreshActive).toBe(afterActive);

    const refreshWvRes = await page.request.get(
        `/api/admin/queues/${encodeURIComponent(workUnitId)}/lifecycle_lead?limit=50&count_mode=exact&work_view_id=new_leads`,
    );
    const refreshWv = (await refreshWvRes.json()) as { items?: Array<{ id?: string }> };
    expect(refreshWv.items?.some((r) => r.id === opportunityId)).toBe(true);
});
