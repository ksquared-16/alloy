import { test } from "@playwright/test";

/**
 * OX J5 — WHAT DOES "THE CARD CLEARED" ACTUALLY MEAN?
 *
 * T6 is measured as the moment `[data-focus-panel-cell-preparing]` disappears for children and
 * household. But the reserved cell computes
 *
 *   settled = readiness === "not_applicable" || (model.phase === "settled" && !explicitlyReserved)
 *
 * and `data-focus-panel-cell-preparing={settled ? undefined : typeKey}`. So the attribute also
 * disappears when the panel model merely reaches phase "settled" and the card is declared
 * resolved-empty — WITHOUT the children/household truth ever arriving. Those are different events
 * with the same signature, and a repair aimed at the wrong one would be aimed at nothing.
 *
 * This separates them using COUNTS and BOOLEANS only — no names, no contacts, no business values.
 * If the cards clear by settling empty, the not-applicable cell count rises at the same instant the
 * preparing count falls, and the identity-truth booleans stay false.
 */
const RUNS = Number(process.env.OX_SEM_RUNS ?? "10");

test("j5 clear semantics", async ({ page }) => {
    test.setTimeout(1_800_000);

    for (let run = 0; run < RUNS; run += 1) {
        /*
         * RELOAD BETWEEN SAMPLES. A warm subject has its full drawer already in hand and never shows
         * a reserved phase at all, so pooling warm visits with cold ones does not average the event
         * being measured -- it mixes in a different one. This programme already produced a P50 of
         * minus 174 seconds by pooling cache hits with real switches.
         */
        await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 180_000 });
        await page.waitForTimeout(14_000);

        const out = await page.evaluate(`(async (idx) => {
            const rows = [...document.querySelectorAll('.alloy-os-queue-row-card')];
            if (rows.length < 2) return { skipped: 'no_rows' };
            const target = rows[1 + (idx % Math.max(1, rows.length - 1))];
            const subj = () => document.querySelector('[data-focus-panel-body-subject]')?.getAttribute('data-focus-panel-body-subject') || null;
            const was = subj();
            const snap = () => {
                const prep = [...document.querySelectorAll('[data-focus-panel-cell-preparing]')]
                    .map((e) => e.getAttribute('data-focus-panel-cell-preparing'));
                const d = window.__ALLOY_FOCUS_SETTLEMENT_DIAG__ || {};
                return {
                    prep,
                    nNA: document.querySelectorAll('[data-focus-panel-cell-not-applicable]').length,
                    nRes: document.querySelectorAll('[data-focus-panel-cell-reserved]').length,
                    ch: d.inquiryChildrenIdentityPresent ?? null,
                    ct: d.primaryContactIdentityPresent ?? null,
                };
            };
            /*
             * THE SERVED BUILD, PER SAMPLE.
             *
             * A deploy that lands mid-run silently mixes two populations: a 22-sample baseline taken
             * across one produced a clean bimodal split (11 clears at 1.4-1.8s, 11 at 2.3-3.2s) that
             * could not be attributed to either build afterwards, and had to be discarded. Stamping
             * the SHA on every sample makes that recoverable instead of wasted.
             */
            let sha = null;
            try {
                const r = await fetch("/api/build-info", { cache: "no-store" });
                sha = (await r.json())?.gitSha?.slice(0, 8) ?? null;
            } catch { /* a sample without a SHA is reported as such, never guessed */ }

            const t0 = performance.now();
            target.click();
            /*
             * THE RESERVED PHASE MUST BE OBSERVED BEFORE A CLEAR COUNTS.
             *
             * The safe frame flips the subject attribute within ~5ms, so "subject changed and no
             * cell is preparing" is ALSO true in the window before the new subject's cells mount.
             * Counting that as a clear reports ~100ms for an event that has not begun. A sample that
             * never shows children/household reserved is reported as such, not folded into the P50.
             */
            let sawReserved = false, reservedAt = null, clearedAt = null, atClear = null, lastWaiting = null;
            for (let i = 0; i < 260; i += 1) {
                await new Promise((r) => setTimeout(r, 40));
                const s = snap();
                const t = Math.round(performance.now() - t0);
                const waiting = s.prep.includes('children') || s.prep.includes('household');
                if (waiting) {
                    if (!sawReserved) { sawReserved = true; reservedAt = t; }
                    lastWaiting = s;
                }
                if (sawReserved && !waiting && clearedAt == null) { clearedAt = t; atClear = s; }
                if (clearedAt != null && t > clearedAt + 800) break;
                if (!sawReserved && t > 6000) break;
            }
            const end = snap();
            /*
             * REGION B MARKS for this switch, plus the positive control. A missing mark is reported
             * as missing; it is never substituted with zero. Three probes in this programme have run
             * green while observing nothing, so the observed counters are what a reader checks first.
             */
            const td = window.__ALLOY_TRUTH_PATCH_DIAG__ || null;
            const subj_now = subj();
            const marks = td && subj_now ? (td.subjects || {})[subj_now] || null : null;
            return {
                sha,
                /*
                 * The click origin on the SAME clock the diagnostic marks use. Without it the marks
                 * (absolute performance.now) and the clear (click-relative) cannot be placed on one
                 * timeline, and the legs between them cannot be computed at all.
                 */
                t0_abs: Math.round(t0),
                observed: td ? td.observed : null,
                marks,
                subjectAtEnd: subj_now,
                switched: subj() !== was,
                sawReserved,
                reservedAt,
                clearedAt,
                beforeClear: lastWaiting ? { nNA: lastWaiting.nNA, nRes: lastWaiting.nRes, ch: lastWaiting.ch, ct: lastWaiting.ct } : null,
                atClear: atClear ? { nNA: atClear.nNA, nRes: atClear.nRes, ch: atClear.ch, ct: atClear.ct } : null,
                end: { nNA: end.nNA, nRes: end.nRes, ch: end.ch, ct: end.ct },
            };
        })(${run})`);
        console.log(`[sem] ${JSON.stringify({ run, out })}`);
    }
    console.log(`[sem] done runs=${RUNS}`);
});
