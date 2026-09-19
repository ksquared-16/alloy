/** §2 — does the published doc's METADATA layout (the render source of truth) name billing_preview? */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-fs";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012" });
test.setTimeout(240_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("published doc metadata layout", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    const data = await page.evaluate(async () => {
        const r = await fetch("/api/admin/entity-layouts/focus-panel-summary?workViewId=new_work_view_7&stageKey=enrolled", { credentials: "include" });
        const b = await r.json().catch(() => null) as { published?: { version?: number; doc?: { metadata?: Record<string, unknown>; sections?: Array<Record<string, unknown>> } } } | null;
        const doc = b?.published?.doc;
        return {
            version: b?.published?.version ?? null,
            metadataKeys: Object.keys(doc?.metadata ?? {}),
            metadata: doc?.metadata ?? null,
            sectionCards: (doc?.sections ?? []).map((s) => (s as { metadata?: { focusPanelCard?: { key?: string } } }).metadata?.focusPanelCard?.key),
        };
    });
    log(`version=${data.version}`);
    log(`doc.metadata keys: ${JSON.stringify(data.metadataKeys)}`);
    const meta = JSON.stringify(data.metadata ?? {});
    log(`metadata mentions billing_preview: ${meta.includes("billing_preview")}`);
    log(`metadata (first 1500): ${meta.slice(0, 1500)}`);
    log(`section cards: ${JSON.stringify(data.sectionCards)}`);
    writeFileSync(`${OUT}/fs-meta.json`, JSON.stringify(data, null, 2));
});
