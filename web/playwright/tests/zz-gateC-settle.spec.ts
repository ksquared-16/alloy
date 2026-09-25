import { test } from "@playwright/test";

/**
 * GATE C, THE TWO QUESTIONS A SHORT WINDOW COULD NOT ANSWER.
 *
 * A first pass left two subjects still classified `loading` when its 6s window closed, and flagged one
 * KNOWN -> UNKNOWN. Neither is a verdict yet:
 *
 *  1. `loading` at 6s is either a slow but truthful settle or a settlement that never arrives. Only a
 *     longer watch separates them, and the operator's screenshot is exactly this state.
 *  2. The flagged regression began with a frame captured BEFORE the new subject's card replaced the
 *     outgoing one, so KNOWN(A) -> loading(B) -> KNOWN(B) reads as a regression to a detector that
 *     does not know frame 0 belongs to the previous subject. This one tags every frame with the
 *     subject it was observed under, so a regression is only counted WITHIN one subject.
 */
const WATCH_MS = Number(process.env.GC2_WATCH_MS ?? "30000");

test("gate C — does loading resolve, and does KNOWN regress within one subject", async ({ page }) => {
    test.setTimeout(1_800_000);
    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForTimeout(14_000);

    const out = await page.evaluate(`(async (watchMs) => {
        const rows = () => [...document.querySelectorAll('.alloy-os-queue-row-card')];
        const bodySubject = () => document.querySelector('[data-focus-panel-body-subject]')?.getAttribute('data-focus-panel-body-subject') || null;
        const card = () => {
            const host = document.querySelector('[data-universal-card-key="financials"]');
            if (!host) return { present: false };
            const empty = host.querySelector('[data-financials-empty]');
            const nums = (host.textContent || '').match(/[0-9][0-9,]*\\.[0-9]{2}/g) || [];
            let h = 0;
            for (const n of nums) for (let i = 0; i < n.length; i += 1) h = ((h << 5) - h + n.charCodeAt(i)) | 0;
            return {
                present: true,
                cardSubject: host.getAttribute('data-card-subject'),
                emptyClass: empty ? empty.getAttribute('data-financials-empty') : null,
                figs: nums.length,
                digest: nums.length ? String(h) : null,
            };
        };

        const watch = async (idx) => {
            const r = rows();
            if (r.length <= idx) return { idx, skipped: 'no_row' };
            r[idx].click();
            const frames = [];
            let prev = null;
            for (let i = 0; i * 250 < watchMs; i += 1) {
                await new Promise((z) => setTimeout(z, 250));
                const s = bodySubject(), c = card();
                const k = JSON.stringify([s, c.emptyClass, c.digest]);
                if (k !== prev) { frames.push({ t: i * 250, subject: s, empty: c.emptyClass, figs: c.figs, digest: c.digest, cardSubject: c.cardSubject }); prev = k; }
            }
            const subj = bodySubject();
            // Only frames observed UNDER THIS SUBJECT can speak about this subject's truth.
            const own = frames.filter((f) => f.subject === subj);
            const knownAt = own.findIndex((f) => f.empty == null && f.figs > 0);
            const regressedWithinSubject = knownAt >= 0 && own.slice(knownAt).some((f) => f.empty === 'loading');
            const final = card();
            return {
                idx, subject: subj,
                framesAll: frames.length, framesOwnSubject: own.length,
                ownSequence: own.map((f) => [f.t, f.empty, f.figs]),
                RESOLVED: final.emptyClass == null && final.figs > 0,
                finalClass: final.emptyClass,
                finalFigs: final.figs,
                cardSubjectMatchesBody: final.cardSubject === subj,
                cardSubjectPresent: final.cardSubject != null,
                REGRESSED_WITHIN_SUBJECT: regressedWithinSubject,
            };
        };

        const results = [];
        for (const i of [1, 2, 0]) results.push(await watch(i));
        return {
            results,
            STILL_LOADING_AFTER_WATCH: results.filter((r) => r.finalClass === 'loading').length,
            REGRESSIONS_WITHIN_SUBJECT: results.filter((r) => r.REGRESSED_WITHIN_SUBJECT).length,
            CARD_SUBJECT_ABSENT: results.filter((r) => r.cardSubjectPresent === false).length,
        };
    })(${WATCH_MS})`);

    console.log(`[GATEC2] ${JSON.stringify(out)}`);
});
