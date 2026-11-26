/** §14 — is there a discount authority that legitimately reaches a recurring obligation? */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-cx";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012" });
test.setTimeout(300_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("commercial discount policies", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    const out = await page.evaluate(async () => {
        const r = await fetch("/api/admin/commercial/policies", { credentials: "include", cache: "no-store" });
        const b = (await r.json().catch(() => null)) as Record<string, unknown> | null;
        const rows = (Array.isArray(b) ? b : (b?.policies ?? b?.data ?? [])) as Array<Record<string, unknown>>;
        return {
            status: r.status, keys: b && !Array.isArray(b) ? Object.keys(b) : null, count: rows.length,
            rows: rows.map((p) => ({
                id: p.id, kind: p.policy_kind ?? p.kind, label: p.label ?? p.name,
                basis: p.basis, value: p.basis_value ?? p.value, active: p.is_active,
                from: p.effective_start, to: p.effective_end, scope: p.scope ?? p.applies_to,
                metadata: p.metadata,
            })),
        };
    });
    writeFileSync(`${OUT}/discount-policies.json`, JSON.stringify(out, null, 2));
    log(`status=${out.status} keys=${JSON.stringify(out.keys)} count=${out.count}`);
    log(JSON.stringify(out.rows, null, 1).slice(0, 3000));
});
