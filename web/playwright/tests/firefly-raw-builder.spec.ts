/**
 * Firefly raw Business Process — the authoritative published stage list.
 * Read-only. Pulls the department's lifecycle-builder config verbatim.
 */
import * as fs from "fs";
import * as path from "path";
import { test, expect } from "@playwright/test";

const OUT = path.join(__dirname, "../../../docs/sprints/active/assets/firefly-config");
const DEPT = "3933ac47-077a-4de8-aaac-8aed48d80413";

test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

test("raw builder — the published stages, verbatim", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/adminV2/workspace", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});

    const res = await page.request.get(`/api/admin/departments/${DEPT}/lifecycle-builder`);
    const status = res.status();
    const body = await res.json().catch(() => null);

    fs.writeFileSync(
        path.join(OUT, "raw-builder.json"),
        JSON.stringify({ http_status: status, body }, null, 2),
    );

    expect(status).toBe(200);
});
