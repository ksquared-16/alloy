import { test } from "@playwright/test";

/**
 * OX J5 — IS THE COMMIT FRAME MISSING THE TRUTH, OR MISSING THE BINDING?
 *
 * The census named ALL FIRST ORDER's owner: `children` and `household` stay reserved a median 3,495ms
 * after the click, in 6 of 6 samples. Both are declared COMMIT_CRITICAL and both gate on the same
 * thing — `context.truth._inquiry_children`, or `person.primary_contact_name` for household — carried
 * by the answer's `subjectIdentityTruth`.
 *
 * Two very different repairs follow. If `subjectIdentityTruth` is absent the commit frame never had
 * the truth and something must produce it. If it is present but lacks those keys, the answer already
 * knows and simply is not declaring them, and the repair is a binding. This reads the committed
 * operational context out of the page so the next step is not a guess.
 */
test("j5 identity truth at commit", async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForTimeout(16_000);

    const out = await page.evaluate(`(async () => {
        const rows=[...document.querySelectorAll('.alloy-os-queue-row-card')];
        if (rows.length < 2) return { error: 'not enough rows' };
        rows[1].click();
        const seen = [];
        for (let i = 0; i < 80; i += 1) {
            await new Promise((r) => setTimeout(r, 100));
            const d = window.__ALLOY_FOCUS_SETTLEMENT_DIAG__ || null;
            const reserved = [...document.querySelectorAll('[data-focus-panel-cell-preparing]')]
                .map((e) => e.getAttribute('data-focus-panel-cell-preparing'));
            if (i === 3 || i === 12 || reserved.length === 0) {
                seen.push({ atMs: i * 100, reserved, diagKeys: d ? Object.keys(d) : null,
                            identityTruthKeys: d && d.subjectIdentityTruth ? Object.keys(d.subjectIdentityTruth) : (d ? 'absent-or-not-exposed' : null) });
            }
            if (reserved.length === 0) break;
        }
        return { seen };
    })()`);
    console.log(`[truth] ${JSON.stringify(out)}`);
});
