import { test } from "@playwright/test";

/**
 * WU-07 — POST-COMPLETE AUTHORITATIVE CORRECTION, MEASURED.
 *
 * The Focus Panel header resolves three subjects that have DIFFERENT canonical owners:
 *
 *   STATUS   — owned by the drawer VM (`header.status`), seeded by the queue preview row;
 *   LOCATION — owned by the display record (`_effective_location_rollup_label` → child rollup);
 *   MANAGE   — owned by the resolved action registry (`displayVm.actions.header_menu`).
 *
 * All three currently render through one header that is handed a seed first and an authoritative
 * payload second, so a subject whose seed DISAGREES with its owner is corrected in place after the
 * frame is already complete. That is the defect: the operator reads a settled value, acts on it,
 * and it changes underneath them.
 *
 * A CORRECTION IS NOT A FILL. Empty → value is the frame filling in, which is the whole point of a
 * progressive frame and is allowed. Value → DIFFERENT value after the frame boundary is a
 * correction. This probe distinguishes them, because conflating them is how a progressive frame
 * gets mistaken for an unstable one.
 *
 * Observed from the browser only — no application instrumentation, so it measures the shipped
 * artifact rather than a claim about it.
 */
test("p077 header corrections", async ({ page }) => {
    const url = process.env.P076_URL || "/adminV2/workspace/work-unit/new-leads";
    test.setTimeout(180_000);

    await page.addInitScript(() => {
        const w = window as unknown as { __hc?: Record<string, unknown> };
        const HEADER = '[data-alloy-os-focus-panel-header="true"]';
        // Each subject reads its OWN rendered value. Reading "the header" as one string would make
        // any change anywhere look like a correction of everything.
        const READ: Record<string, () => string> = {
            STATUS: () =>
                document.querySelector(`${HEADER} [data-focus-panel-chip-kind="status"]`)?.textContent?.trim() ?? "",
            LOCATION: () =>
                document.querySelector(`${HEADER} [data-focus-panel-chip-kind="location"]`)?.textContent?.trim() ?? "",
            PROCESS: () =>
                document.querySelector(`${HEADER} [data-focus-panel-chip-kind="process"]`)?.textContent?.trim() ?? "",
            // MANAGE has no single label — its identity is WHICH actions are offered, in order.
            MANAGE: () =>
                [...document.querySelectorAll(`${HEADER} [data-alloy-os-fp-header-actions="true"] button`)]
                    .map((b) => (b.getAttribute("aria-label") || b.textContent || "").trim())
                    .filter(Boolean)
                    .join("|"),
        };

        const marks: Record<string, number> = {};
        // Every distinct rendered value per subject, with the time it first appeared.
        const series: Record<string, Array<{ at: number; v: string }>> = {
            STATUS: [], LOCATION: [], PROCESS: [], MANAGE: [],
        };
        w.__hc = { marks, series };

        const sample = () => {
            const now = Math.round(performance.now());
            if (marks.panelAt == null && document.querySelector(HEADER)) marks.panelAt = now;
            // The authoritative frame: configured geometry present (6 cells), which is the boundary
            // the latency track certified. After THIS, a value change is post-complete.
            if (marks.frameAt == null && document.querySelectorAll(".alloy-os-ucard").length >= 6) {
                marks.frameAt = now;
            }
            for (const k of Object.keys(READ)) {
                const v = READ[k]();
                const s = series[k];
                if (s.length === 0 || s[s.length - 1].v !== v) s.push({ at: now, v });
            }
        };

        new MutationObserver(() => sample()).observe(document, {
            childList: true, subtree: true, characterData: true, attributes: true,
        });
        document.addEventListener("DOMContentLoaded", () => sample());
        sample();
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(12000);

    const out = await page.evaluate(() => {
        const w = window as unknown as {
            __hc?: { marks: Record<string, number>; series: Record<string, Array<{ at: number; v: string }>> };
        };
        const hc = w.__hc!;
        const frameAt = hc.marks.frameAt ?? hc.marks.panelAt ?? null;
        const corrections: Array<{ subject: string; at: number; from: string; to: string; postComplete: boolean }> = [];
        for (const [subject, s] of Object.entries(hc.series)) {
            for (let i = 1; i < s.length; i++) {
                const from = s[i - 1].v;
                const to = s[i].v;
                // empty → value is a FILL (UNKNOWN resolving). value → different value is a CORRECTION.
                if (!from || !to) continue;
                corrections.push({
                    subject, at: s[i].at, from, to,
                    postComplete: frameAt != null && s[i].at > frameAt,
                });
            }
        }
        return {
            signedOut: /login|sign in/i.test(document.title) || !!document.querySelector('input[type="password"]'),
            marks: hc.marks,
            frameAt,
            series: hc.series,
            corrections,
            postCompleteCount: corrections.filter((c) => c.postComplete).length,
        };
    });

    console.log(`[hc] ${JSON.stringify(out)}`);
});
