/**
 * BACK / FORWARD AND RAPID ROW SWITCHING — the operator-visible outcomes the history correction
 * must hold, checked in a real browser against a production build.
 *
 * Each case asserts what the operator would see or do, not an internal call: what the authoritative
 * history stack holds, where Back lands, whether the surface that lands is actually RENDERED, and
 * whether working a queue quietly manufactures entries. A check that only proved "the URL changed"
 * would have passed against the defect.
 *
 * Exit code is the verdict: 0 when every case holds, 1 otherwise. Nothing is written to disk.
 *
 * Positive control: revert `historyProjectionMode` to always return "replace" and the four
 * history-creating cases (open, Back, Forward, second Work Unit) must fail. A guard that cannot
 * fail is not guarding anything.
 */
import { BASE, redact, withOperatorPage } from "./pe3HarnessEnv.mjs";

const SLUG = process.env.PE3_SLUG ?? "waitlist";
const SLUG2 = process.env.PE3_SLUG2 ?? "all";

const results = [];
const check = (name, pass, detail) => {
    results.push({ name, pass });
    console.log(`${pass ? "PASS" : "FAIL"}  ${name}\n        ${detail}`);
};

await withOperatorPage(async (page, context) => {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Page.enable");
    let documentLoads = [];
    cdp.on("Page.frameNavigated", (e) => {
        if (!e.frame.parentId) documentLoads.push(redact(e.frame.url));
    });
    const stack = async () => {
        const h = await cdp.send("Page.getNavigationHistory");
        return { index: h.currentIndex, urls: h.entries.map((e) => redact(e.url)) };
    };
    const workspaceReady = () =>
        page.waitForFunction(`document.querySelectorAll('a[href^="/workspace/work-unit/"]').length > 0`, { timeout: 90_000 });
    const workUnitReady = () =>
        page.waitForFunction(`document.querySelectorAll('[data-entity-id]').length > 0`, { timeout: 90_000 });
    const openWorkspace = async () => {
        await page.goto(`${BASE}/workspace`, { waitUntil: "commit", timeout: 120_000 });
        await workspaceReady();
        await page.waitForTimeout(3500);
    };

    // ── DIRECT URL ENTRY — the document navigation makes ONE entry; the projection that follows
    //    reconciles the address with the committed surface and must not add a second. Measured
    //    against the stack as it stands, never against an absolute length: this page has already
    //    visited `/login` to prove the build is fresh, and an assertion that assumed an empty tab
    //    would fail for a reason that has nothing to do with the behaviour under test.
    const beforeDirect = await stack();
    await page.goto(`${BASE}/workspace/work-unit/${SLUG}`, { waitUntil: "commit", timeout: 120_000 });
    await workUnitReady();
    await page.waitForTimeout(6000);
    let s = await stack();
    check(
        "direct URL entry adds no entry beyond its own document navigation",
        s.urls.length === beforeDirect.urls.length + 1 && s.index === s.urls.length - 1,
        `${beforeDirect.urls.length} -> ${s.urls.length} (index ${s.index}): ${JSON.stringify(s.urls)}`,
    );

    // ── RAPID ROW SWITCHING — a subject refinement is not somewhere to come back from.
    const rowIds = await page.evaluate(
        `Array.from(document.querySelectorAll('[data-entity-id]')).map((e) => e.getAttribute('data-entity-id'))`,
    );
    const beforeRows = (await stack()).urls.length;
    for (const id of rowIds.slice(1, 6)) {
        await page.locator(`[data-entity-id="${id}"]`).first().click({ timeout: 8000, noWaitAfter: true }).catch(() => {});
        await page.waitForTimeout(120);
    }
    await page.waitForTimeout(4000);
    s = await stack();
    check(
        "rapid row switching adds no history entries",
        s.urls.length === beforeRows,
        `${beforeRows} -> ${s.urls.length} after 5 switches with no settle between`,
    );

    // ── WORK VIEW (lens) REFINEMENT — a pill switch stays on the same surface.
    const beforeLens = (await stack()).urls.length;
    const pills = page.locator('[role="tab"], [data-work-view-id]');
    const pillCount = Math.min(await pills.count(), 3);
    for (let i = 0; i < pillCount; i += 1) {
        await pills.nth(i).click({ timeout: 8000, noWaitAfter: true }).catch(() => {});
        await page.waitForTimeout(2200);
    }
    await page.waitForTimeout(3000);
    s = await stack();
    check(
        "Work View refinement adds no history entries",
        pillCount > 0 && s.urls.length === beforeLens,
        pillCount ? `${beforeLens} -> ${s.urls.length} after ${pillCount} pill switches` : "INCONCLUSIVE — no pill control found",
    );

    // ── THE EXCHANGE — /workspace to a Work Unit is exactly one new entry.
    await openWorkspace();
    const beforeOpen = await stack();
    await page.locator(`a[href^="/workspace/work-unit/${SLUG}"]`).first().click({ timeout: 20_000, noWaitAfter: true });
    await workUnitReady();
    await page.waitForTimeout(5000);
    const afterOpen = await stack();
    check(
        "opening a Work Unit creates exactly one new history entry",
        afterOpen.urls.length === beforeOpen.urls.length + 1 && afterOpen.urls.at(-1).includes("/work-unit/"),
        `${beforeOpen.urls.length} -> ${afterOpen.urls.length}: ${JSON.stringify(afterOpen.urls)}`,
    );

    // ── BACK — to a RENDERED Workspace, in the same document.
    documentLoads = [];
    await page.goBack({ waitUntil: "commit", timeout: 60_000 }).catch((e) => console.log("   goBack:", String(e).slice(0, 70)));
    await page.waitForTimeout(6000);
    const backPath = await page.evaluate("location.pathname").catch(() => "(unreadable)");
    const backRendered = await page.evaluate(`document.querySelectorAll('a[href^="/workspace/work-unit/"]').length`).catch(() => 0);
    check("Back from a Work Unit returns to /workspace", backPath === "/workspace", `landed on ${redact(backPath)}`);
    check("Back is a client traversal, not a document reload", documentLoads.length === 0, `document loads: ${JSON.stringify(documentLoads)}`);
    check("the Workspace it returns to is rendered", backRendered > 0, `${backRendered} Work View destinations offered`);

    // ── ROUTER STATE AFTER BACK — the shell must still navigate, not just display.
    const routerLiveAfterBack = await page
        .locator(`a[href^="/workspace/work-unit/${SLUG}"]`)
        .first()
        .isEnabled({ timeout: 8000 })
        .catch(() => false);
    check("the App Router shell is still live after Back", routerLiveAfterBack === true, "a Work View destination is interactive");

    // ── FORWARD — the Work Unit resumes, with its queue.
    documentLoads = [];
    await page.goForward({ waitUntil: "commit", timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(6000);
    const forwardPath = await page.evaluate("location.pathname").catch(() => "?");
    const forwardRows = await page.evaluate(`document.querySelectorAll('[data-entity-id]').length`).catch(() => 0);
    check("Forward restores the Work Unit", forwardPath.includes(`/work-unit/${SLUG}`), `landed on ${redact(forwardPath)}`);
    check("the restored Work Unit is rendered", forwardRows > 0, `${forwardRows} queue rows`);

    // ── A SECOND WORK UNIT — a different surface, so a distinct entry.
    await openWorkspace();
    const beforeSecond = await stack();
    await page.locator(`a[href^="/workspace/work-unit/${SLUG2}"]`).first().click({ timeout: 20_000, noWaitAfter: true }).catch(() => {});
    await page.waitForTimeout(6000);
    const afterSecond = await stack();
    check(
        "a second Work Unit remains a distinct entry",
        afterSecond.urls.length > beforeSecond.urls.length,
        `${beforeSecond.urls.length} -> ${afterSecond.urls.length}: ${JSON.stringify(afterSecond.urls.slice(-3))}`,
    );

    // ── UNAVAILABLE / ERROR ENTRY — no redirect loop, no entry storm.
    documentLoads = [];
    await page.goto(`${BASE}/workspace/work-unit/pe3-nonexistent-work-unit`, { waitUntil: "commit", timeout: 120_000 });
    await page.waitForTimeout(10_000);
    const unavailablePath = await page.evaluate("location.pathname").catch(() => "?");
    check(
        "an unavailable Work Unit does not reload or redirect in a loop",
        documentLoads.length === 1 && unavailablePath.includes("pe3-nonexistent-work-unit"),
        `document loads ${documentLoads.length}, still on ${redact(unavailablePath)}`,
    );
});

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) console.log(`failing: ${failed.map((r) => r.name).join(" | ")}`);
process.exit(failed.length ? 1 : 0);
