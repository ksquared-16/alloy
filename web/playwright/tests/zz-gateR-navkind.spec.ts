import { test } from "@playwright/test";

/**
 * IS THE RESET MINE OR THE PRODUCT'S?
 *
 * The session recorded 20 full-document navigations to /workspace, attributed to Work View pill and
 * queue-row clicks. Before calling that a product defect I have to rule out my own driver: the
 * session returns to /workspace by clicking an anchor, and a plain <a> in Next.js is a FULL page
 * load while a <Link> is client-side. If that anchor hard-navigates, the resets could be mine with
 * the flag landing on the following action.
 *
 * So: click the same anchor the session clicks, and see whether the document token survives.
 */
test("gate R nav kind", async ({ page }) => {
    test.setTimeout(600_000);
    await page.addInitScript(`(() => { window.__tok = Math.random().toString(36).slice(2); })()`);
    await page.goto("/adminV2/workspace", { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForTimeout(10_000);

    // Go into a work unit the way the session does.
    const opened = await page.evaluate(`(() => { const a=[...document.querySelectorAll('a[href*="/workspace/work-unit/"]')][0]; if(a){a.click();return a.getAttribute('href');} return null; })()`);
    await page.waitForTimeout(10_000);
    const inUnit = await page.evaluate(`(() => ({ tok: window.__tok, url: location.pathname }))()`) as { tok: string; url: string };

    // The exact anchor the session's goWorkspace() clicks, and what kind of element it is.
    const anchor = await page.evaluate(`(() => {
        const a=[...document.querySelectorAll('a[href$="/workspace"],a[href*="/workspace?"]')].find((x)=>!/work-unit/.test(x.getAttribute('href')||''));
        if (!a) return null;
        return { href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel'),
                 dataset: Object.keys(a.dataset || {}).slice(0,6), cls: (a.className||'').toString().slice(0,50) };
    })()`) as Record<string, unknown> | null;

    let afterAnchor: Record<string, unknown> | null = null;
    if (anchor) {
        await page.evaluate(`(() => { const a=[...document.querySelectorAll('a[href$="/workspace"],a[href*="/workspace?"]')].find((x)=>!/work-unit/.test(x.getAttribute('href')||'')); if(a) a.click(); })()`);
        await page.waitForTimeout(7000);
        try {
            afterAnchor = await page.evaluate(`(() => ({ tok: window.__tok, url: location.pathname + location.search, rows: document.querySelectorAll('.alloy-os-queue-row-card').length }))()`) as Record<string, unknown>;
        } catch (e) { afterAnchor = { unreadable: String(e).slice(0, 50) }; }
    }

    console.log(`[NAVKIND] ${JSON.stringify({
        opened, inUnitUrl: inUnit.url,
        workspaceAnchor: anchor,
        afterAnchorClick: afterAnchor,
        ANCHOR_CAUSED_FULL_NAV: afterAnchor ? afterAnchor.tok !== inUnit.tok : null,
    })}`);
});
