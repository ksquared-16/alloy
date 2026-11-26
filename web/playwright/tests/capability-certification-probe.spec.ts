/**
 * Capability Certification — read-only probe.
 *
 * Answers two evidence questions without mutating anything: does the activity row emitted by a
 * transaction carry the transaction's correlation id, and what does the opportunity record
 * actually look like (status_key / stage_key) after the certified executions.
 */
import * as fs from "fs";
import * as path from "path";
import { test } from "@playwright/test";

const OUT = path.join(__dirname, "../../../docs/sprints/active/assets/capability-certification");
const OPP = "b13ecce9-74d4-442d-9891-7c88f587bc23";

test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

test("probe — correlation id in activity, and the opportunity record shape", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/adminV2/workspace", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});

    const activity = await page.request
        .get(`/api/admin/activity?entity_type=opportunities&entity_id=${OPP}&limit=5`)
        .then((r) => r.json())
        .catch(() => null);

    const opportunity = await page.request
        .get(`/api/admin/opportunities/${OPP}`)
        .then(async (r) => ({ status: r.status(), body: r.ok() ? await r.json() : await r.text() }))
        .catch((e) => ({ status: -1, body: String(e) }));

    fs.writeFileSync(
        path.join(OUT, "probe.json"),
        JSON.stringify({ activity, opportunity_route: opportunity }, null, 2),
    );
});
