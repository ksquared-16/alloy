import { test } from "@playwright/test";
/** What the Accounts pane actually publishes. Two source-derived guesses measured nothing; this asks the DOM. */
test("gate D recon", async ({ page }) => {
    test.setTimeout(400_000);
    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForTimeout(13_000);
    const out = await page.evaluate(`(async () => {
        const open = document.querySelector('[data-adminv2-sidebar-modal-nav="financials"]');
        if (!open) return { skipped: 'no_nav' };
        open.click(); await new Promise((r) => setTimeout(r, 7000));
        const tab = [...document.querySelectorAll('button,a')].find((e) => /^accounts$/i.test((e.textContent || '').trim()));
        if (tab) { tab.click(); await new Promise((r) => setTimeout(r, 7000)); }
        const rows = [...document.querySelectorAll('[data-financials-account-row]')];
        const before = { rows: rows.length };
        if (rows.length > 1) { rows[1].click(); await new Promise((r) => setTimeout(r, 8000)); }
        // Every data-financials-* attribute present anywhere, with its value, so the next probe keys on reality.
        const attrs = {};
        for (const el of document.querySelectorAll('*')) {
            for (const a of el.attributes) {
                if (a.name.indexOf('data-financials') === 0) {
                    const k = a.name + '=' + (a.value || '').slice(0, 24);
                    attrs[k] = (attrs[k] || 0) + 1;
                }
            }
        }
        const nums = (document.body.textContent || '').match(/[0-9][0-9,]*\\.[0-9]{2}/g) || [];
        return { before, attrCount: Object.keys(attrs).length, attrs, figuresOnPage: nums.length };
    })()`);
    console.log(`[RECON] ${JSON.stringify(out)}`);
});
