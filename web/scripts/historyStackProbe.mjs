/**
 * AUTHORITATIVE BROWSER HISTORY — read from CDP `Page.getNavigationHistory`, never inferred.
 *
 * Two cheaper readings were tried first and are both unreliable here:
 *   - `history.length` says an entry count but not WHICH entry moved, and it does not change when
 *     an entry is overwritten in place — the exact defect this project exists to catch;
 *   - patching `history.pushState` loses the race with the App Router, which installs its own
 *     wrapper over whatever it finds at startup, so calls can be invisible to yours.
 *
 * `Page.getNavigationHistory` returns the real entry list and the current index, which is what makes
 * "the entry was REPLACED, not pushed" a fact rather than an inference.
 *
 * Prints entries only; nothing is written to disk and every URL is redacted.
 */
import { BASE, redact, withOperatorPage } from "./pe3HarnessEnv.mjs";

const SLUG = process.env.PE3_SLUG ?? "waitlist";

await withOperatorPage(async (page, context) => {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Page.enable");

    const dump = async (label) => {
        const h = await cdp.send("Page.getNavigationHistory");
        console.log(`\n--- ${label}   (currentIndex=${h.currentIndex}, entries=${h.entries.length})`);
        h.entries.forEach((e, i) =>
            console.log(`   ${i === h.currentIndex ? ">" : " "} [${i}] ${redact(e.url).slice(0, 78)}`),
        );
        return h;
    };
    const workspaceReady = () =>
        page.waitForFunction(`document.querySelectorAll('a[href^="/workspace/work-unit/"]').length > 0`, { timeout: 90_000 });
    const workUnitReady = () =>
        page.waitForFunction(`document.querySelectorAll('[data-entity-id]').length > 0`, { timeout: 90_000 });

    await page.goto(`${BASE}/login`, { waitUntil: "commit", timeout: 120_000 });
    await page.waitForTimeout(1200);
    await dump("on /login (the entry a signed-in operator arrives from)");

    await page.goto(`${BASE}/workspace`, { waitUntil: "commit", timeout: 120_000 });
    await workspaceReady();
    await page.waitForTimeout(3500);
    const before = await dump("Workspace settled");

    await page.locator(`a[href^="/workspace/work-unit/${SLUG}"]`).first().click({ timeout: 20_000, noWaitAfter: true });
    await workUnitReady();
    await page.waitForTimeout(5000);
    const after = await dump("after opening a Work Unit");

    const grew = after.entries.length > before.entries.length;
    console.log(
        `\n>>> the Workspace -> Work Unit exchange ${grew ? "PUSHED a history entry" : "REPLACED the current entry in place — Back cannot return to /workspace"}`,
    );

    const rows = await page.evaluate(
        `Array.from(document.querySelectorAll('[data-entity-id]')).slice(0, 4).map((e) => e.getAttribute('data-entity-id'))`,
    );
    for (const id of rows) {
        await page.locator(`[data-entity-id="${id}"]`).first().click({ timeout: 8000, noWaitAfter: true }).catch(() => {});
        await page.waitForTimeout(400);
    }
    await page.waitForTimeout(3500);
    const afterRows = await dump(`after ${rows.length} queue-row refinements`);
    console.log(
        `\n>>> queue-row refinement ${afterRows.entries.length > after.entries.length ? `ADDED ${afterRows.entries.length - after.entries.length} entries` : "added no entries"}`,
    );
});
