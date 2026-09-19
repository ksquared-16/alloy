/**
 * No more assumptions about which opportunity or which org. The PATCH returns the stored row; the
 * pricing read is then issued for THAT row's own `opportunity_id`, taken from the response.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-fx";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012" });
test.setTimeout(240_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const OCM_A = "79f8011d-a236-4054-bee7-af10f1dbc632";

test("the stored row, then the read for its own opportunity", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    const out = await page.evaluate(async (ocm) => {
        const r = await fetch(`/api/admin/opportunity-customer-members/${ocm}`, {
            method: "PATCH", credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ notes: "11A recurring certification assignment" }),
        });
        const row = (await r.json().catch(() => null)) as Record<string, unknown> | null;
        const opp = typeof row?.opportunity_id === "string" ? row.opportunity_id : null;
        const cfg = opp
            ? await fetch(`/api/admin/financial-config/opportunity/${opp}?t=${Date.now()}`, { credentials: "include", cache: "no-store" })
            : null;
        const cfgBody = cfg ? ((await cfg.json().catch(() => null)) as { assignments?: unknown[] } | null) : null;
        return {
            patchStatus: r.status,
            row,
            cfgStatus: cfg?.status ?? null,
            cfgAssignments: cfgBody?.assignments?.length ?? null,
            cfgBody: cfg && cfg.status >= 400 ? cfgBody : null,
        };
    }, OCM_A);
    writeFileSync(`${OUT}/row.json`, JSON.stringify(out, null, 2));
    log(JSON.stringify(out, null, 1).slice(0, 2500));
});
