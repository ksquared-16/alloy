/**
 * Organization Calculations — Path B capacity proving slice QA
 *
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3014 \
 *   PLAYWRIGHT_STORAGE_STATE=$HOME/.local/state/alloy-dev/auth/slot4/storage-state.json \
 *   npx playwright test playwright/tests/organization-calculations-proving-qa.spec.ts --workers=1
 */
import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3014";
const STORAGE = process.env.PLAYWRIGHT_STORAGE_STATE?.trim();
const EVIDENCE = path.resolve(
    __dirname,
    "../../../docs/sprints/07_2026/operational-calculations-product-realization/qa-evidence/org-calcs",
);

if (STORAGE) test.use({ storageState: STORAGE });

test.describe.configure({ mode: "serial" });

test("Organization Calculations proving slice E2E", async ({ page }) => {
    fs.mkdirSync(EVIDENCE, { recursive: true });
    test.setTimeout(180_000);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/organization/calculations`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("organization-calculations-product")).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: path.join(EVIDENCE, "01-authoring-home.png"), fullPage: true });

    // Create draft with min(physical, licensed)
    await page.getByTestId("organization-calculations-template-min_physical_licensed").check();
    await page.getByTestId("organization-calculations-name").fill("Effective physical–licensed seats");
    await page.getByTestId("organization-calculations-create").click();
    await expect(page.getByTestId("organization-calculations-list")).toContainText("Effective physical", {
        timeout: 30_000,
    });
    await page.screenshot({ path: path.join(EVIDENCE, "02-draft-saved.png"), fullPage: true });

    // Evaluate against first room
    const roomSelect = page.getByTestId("organization-calculations-room-id");
    await expect(roomSelect).toBeVisible();
    const options = roomSelect.locator("option");
    const optionCount = await options.count();
    expect(optionCount).toBeGreaterThan(0);
    const room1 = await options.nth(0).getAttribute("value");
    const room2 = optionCount > 1 ? await options.nth(1).getAttribute("value") : room1;
    await roomSelect.selectOption(room1!);
    await page.getByTestId("organization-calculations-effective-at").fill("2026-06-01");
    await page.getByTestId("organization-calculations-evaluate").click();
    await expect(page.getByTestId("organization-calculations-eval-result")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("organization-calculations-explanation")).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCE, "03-evaluate-room1.png"), fullPage: true });

    // Second room
    if (room2 && room2 !== room1) {
        await roomSelect.selectOption(room2);
        await page.getByTestId("organization-calculations-evaluate").click();
        await expect(page.getByTestId("organization-calculations-eval-result")).toBeVisible({ timeout: 60_000 });
        await page.screenshot({ path: path.join(EVIDENCE, "04-evaluate-room2.png"), fullPage: true });
    }

    // Publish v1
    await page.getByTestId("organization-calculations-publish").click();
    await expect(page.getByTestId("organization-calculations-versions")).toContainText("immutable", {
        timeout: 30_000,
    });
    await page.screenshot({ path: path.join(EVIDENCE, "05-published-v1.png"), fullPage: true });

    // Bind v1 to runtime
    await page.getByTestId("organization-calculations-bind-v1").click();
    await expect(page.getByTestId("organization-calculations-version-1")).toContainText("runtime-bound", {
        timeout: 30_000,
    });
    await page.screenshot({ path: path.join(EVIDENCE, "06-bound-v1.png"), fullPage: true });

    // Fork draft + publish v2
    await page.getByTestId("organization-calculations-fork-draft").click();
    await expect(page.getByTestId("organization-calculations-versions")).toContainText("draft", { timeout: 30_000 });
    await page.getByTestId("organization-calculations-publish").click();
    await expect(page.getByTestId("organization-calculations-version-2")).toContainText("immutable", {
        timeout: 30_000,
    });
    // v1 should still be runtime-bound until rebound
    await expect(page.getByTestId("organization-calculations-version-1")).toContainText("runtime-bound");
    await page.screenshot({ path: path.join(EVIDENCE, "07-v2-published-v1-still-bound.png"), fullPage: true });

    // Cross-org / inaccessible room
    await roomSelect.selectOption(room1!);
    // Force evaluate with bogus id via API from page context
    const reject = await page.evaluate(async () => {
        const list = await fetch("/api/admin/organization-calculations").then((r) => r.json());
        const id = list.calculations?.[0]?.id;
        const res = await fetch(`/api/admin/organization-calculations/${id}/evaluate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                roomId: "00000000-0000-0000-0000-000000000099",
                effectiveAt: "2026-06-01",
                version: "published",
            }),
        });
        const json = await res.json();
        return { status: res.status, error: json.error as string };
    });
    expect(reject.status).toBeGreaterThanOrEqual(400);
    expect(reject.error.toLowerCase()).toMatch(/room|organiz|inaccessible|cross/);

    // Room consumer surface
    await page.goto(`${BASE}/organization/locations`, { waitUntil: "domcontentloaded" });
    // Best-effort: open first room if UI allows; otherwise hit runtime API
    const runtime = await page.evaluate(async (rid) => {
        const res = await fetch(
            `/api/admin/organization-calculations/runtime?roomId=${encodeURIComponent(rid)}&effectiveAt=2026-06-01`,
        );
        return { status: res.status, body: await res.json() };
    }, room1!);
    expect(runtime.status).toBe(200);
    expect(Array.isArray(runtime.body.results)).toBe(true);
    expect(runtime.body.results.length).toBeGreaterThan(0);
    expect(runtime.body.results[0].version.version_number).toBe(1);

    await page.screenshot({ path: path.join(EVIDENCE, "08-locations-context.png"), fullPage: true });

    // Narrow layout
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/organization/calculations`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("organization-calculations-product")).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: path.join(EVIDENCE, "09-narrow-layout.png"), fullPage: true });

    // Archive
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/organization/calculations`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("organization-calculations-list").locator("button").first().click();
    await page.getByTestId("organization-calculations-archive").click();
    await expect(page.getByTestId("organization-calculations-list")).toContainText("archived", { timeout: 30_000 });
    await page.screenshot({ path: path.join(EVIDENCE, "10-archived.png"), fullPage: true });

    const afterArchive = await page.evaluate(async (rid) => {
        const res = await fetch(
            `/api/admin/organization-calculations/runtime?roomId=${encodeURIComponent(rid)}&effectiveAt=2026-06-01`,
        );
        return res.json();
    }, room1!);
    expect(afterArchive.results?.length ?? 0).toBe(0);
});
