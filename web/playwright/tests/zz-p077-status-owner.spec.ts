import { test } from "@playwright/test";

/**
 * WU-07 — WHICH FACT IS IN THE STATUS CHIP?
 *
 * The seed status chip showed "Lead" at the frame and the owner corrected it to "New Lead".
 * Those are not two spellings of one value; they are candidates from two different fields:
 *
 *   opportunity.status_label  → the RECORD STATUS (status_defs) — what the header chip means
 *   queue_row.stage_label     → the PROCESS STAGE (EPP rollup)  — a different fact
 *
 * `focusPanelSeedFromQueueRow` reads the queue's CONFIGURED `status` slot, so which fact reaches
 * the header depends on how that slot is bound for this work unit. This reads the binding from the
 * surface's own diagnostic rather than inferring it, and reads the queue row's rendered pill beside
 * the header chip so the two surfaces can be compared directly on one screen.
 */
test("p077 status owner", async ({ page }) => {
    const url = process.env.P076_URL || "/adminV2/workspace/work-unit/new-leads";
    test.setTimeout(180_000);

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(12000);

    const out = await page.evaluate(() => {
        const w = window as unknown as { __ALLOY_QUEUE_ROW_SURFACE_DIAG__?: Record<string, unknown> };
        const diag = w.__ALLOY_QUEUE_ROW_SURFACE_DIAG__ ?? null;
        const HEADER = '[data-alloy-os-focus-panel-header="true"]';
        const headerStatus =
            document.querySelector(`${HEADER} [data-focus-panel-chip-kind="status"]`)?.textContent?.trim() ?? null;
        // The queue row the panel is focused on renders its own status pill. If the two surfaces
        // disagree on one screen, that is the operator-visible defect, not just a timing artifact.
        const rows = [...document.querySelectorAll("[data-queue-row-entity-id], [data-queue-row]")].slice(0, 6);
        const rowStatuses = rows.map((r) => ({
            id: r.getAttribute("data-queue-row-entity-id"),
            selected: r.getAttribute("aria-selected") ?? r.getAttribute("data-selected"),
            text: (r.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120),
        }));
        return {
            signedOut: !!document.querySelector('input[type="password"]'),
            headerStatus,
            statusSlotFieldKeys:
                (diag as { queueDefaultFieldKeys?: { status?: string[] } } | null)?.queueDefaultFieldKeys?.status ?? null,
            overlayStatusFieldKeys:
                (diag as { overlay?: { defaultFieldKeys?: { status?: string[] } } } | null)?.overlay?.defaultFieldKeys
                    ?.status ?? null,
            slotsSource: (diag as { slotsSource?: string } | null)?.slotsSource ?? null,
            processKey: (diag as { processKey?: string } | null)?.processKey ?? null,
            rowStatuses,
            // The UNDERLYING fields, read out of the RSC payload the page was built from. The chip
            // shows one of these; naming which one is the whole question.
            rowFields: (() => {
                const txt = [...document.querySelectorAll("script")].map((s) => s.textContent ?? "").join("");
                const grab = (k: string) => {
                    const out: string[] = [];
                    const re = new RegExp('"' + k + '":"((?:[^"\\\\]|\\\\.)*)"', "g");
                    let m: RegExpExecArray | null;
                    while ((m = re.exec(txt)) && out.length < 8) out.push(m[1]);
                    return out;
                };
                return {
                    row_status_label: grab("row_status_label"),
                    row_status_key: grab("row_status_key"),
                    row_stage: grab("row_stage"),
                    effective_stage_rollup_label: grab("_effective_stage_rollup_label"),
                };
            })(),
        };
    });

    console.log(`[so] ${JSON.stringify(out)}`);
});
