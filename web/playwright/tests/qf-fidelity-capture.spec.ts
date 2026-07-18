/**
 * Queue-row FIDELITY capture: the AUTHORED published config vs the RUNTIME render, field by field,
 * for the real Enrollment queue-row surface. Proves (or disproves) that the renderer consumes config
 * faithfully — not merely that config reaches it.
 */
import { test } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3013";
const STORAGE = process.env.PLAYWRIGHT_STORAGE_STATE;
const WU = process.env.WU_SLUG_A || "new-leads";
const DIR = process.env.QF_SHOT_DIR || "/tmp/qf-shots";
if (STORAGE) test.use({ storageState: STORAGE });
test.describe.configure({ timeout: 4 * 60 * 1000 });

test("queue-row fidelity capture", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    fs.mkdirSync(DIR, { recursive: true });
    const out: Record<string, unknown> = {};

    // 1) Runtime provisioning answer — the resolved surfaceId + rowSlots (what the mapper produced).
    const pa = await page.request.get(`${BASE}/api/admin/work-units/${WU}/provisioning-answer`);
    const paJson: any = await pa.json().catch(() => null);
    const surfaceId = paJson?.presentation?.provenance?.queueRowSurfaceId ?? null;
    out.surfaceId = surfaceId;
    out.runtimeRowSlots = paJson?.presentation?.queue?.rowSlots ?? null;
    out.runtimeRowVariant = paJson?.presentation?.queue?.rowVariant ?? null;
    out.runtimeFallbackSlots = paJson?.presentation?.queue?.fallbackSlots ?? null;

    // 2) AUTHORED published config — the builder resolver endpoint returns the QueueRecordLayoutConfigV3.
    if (surfaceId) {
        const cfg = await page.request.get(`${BASE}/api/admin/queue-row-layout/${encodeURIComponent(surfaceId)}`);
        out.authoredStatus = cfg.status();
        const cfgJson: any = await cfg.json().catch(() => null);
        out.authored = cfgJson;
        // Flatten the authored columns→blocks→fields into an ordered list with slot/label/order.
        const cfgObj = cfgJson?.config ?? cfgJson?.published?.config ?? cfgJson;
        const columns = cfgObj?.columns ?? [];
        out.authoredFields = columns
            .slice()
            .sort((a: any, b: any) => (a.rowIndex ?? 0) - (b.rowIndex ?? 0))
            .flatMap((col: any) =>
                (col.blocks ?? [])
                    .filter((b: any) => b.type === "field_group" || b.type === "repeated_record_block")
                    .flatMap((b: any) =>
                        (b.fields ?? []).map((f: any) => ({
                            builderSlot: col.builderSlot ?? null,
                            fieldKey: f.fieldKey,
                            label: f.label ?? null,
                            nameDisplay: f.nameDisplay ?? null,
                            inlineWithPrevious: f.inlineWithPrevious ?? false,
                            visibleWhen: f.visibleWhen ?? null,
                        })),
                    ),
            );
    }

    // 3) RUNTIME rendered DOM — the actual queue row cells + their text.
    await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded" });
    const tile = page.locator(`a[href="/workspace/work-unit/${WU}"]`).first();
    await tile.waitFor({ state: "visible", timeout: 30000 });
    await tile.click({ noWaitAfter: true });
    await page.locator('[data-runtime-label="WU.QUEUE_ROW"]').first().waitFor({ state: "visible", timeout: 20000 });
    await page.waitForTimeout(2000);
    out.renderedRows = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('[data-runtime-label="WU.QUEUE_ROW"]'));
        return rows.slice(0, 3).map((r) => ({
            subject: r.querySelector("[data-queue-row-subject]")?.textContent?.trim() ?? null,
            supporting: r.querySelector("[data-queue-row-supporting]")?.textContent?.trim() ?? null,
            count: r.querySelector("[data-queue-row-count]")?.textContent?.trim() ?? null,
            attention: r.getAttribute("data-needs-attention"),
            // status pill + footer text captured from the full row text minus the subject/supporting
            fullText: (r.textContent || "").replace(/\s+/g, " ").trim(),
        }));
    });
    await page.screenshot({ path: path.join(DIR, "runtime-queue.png") });

    fs.writeFileSync(path.join(DIR, "qf-report.json"), JSON.stringify(out, null, 2));
    console.log("@@QF@@ " + JSON.stringify({
        surfaceId,
        authoredFields: out.authoredFields,
        runtimeRowSlots: out.runtimeRowSlots,
        fallbackSlots: out.runtimeFallbackSlots,
        renderedRows: out.renderedRows,
    }, null, 2).slice(0, 6000));
    await ctx.close();
});
