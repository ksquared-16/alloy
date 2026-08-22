/**
 * R2 — the moves that follow a true-cold Work Unit entry.
 *
 * A cold T3 number on its own does not say whether the cold path costs the operator anything
 * afterwards. This measures the four follow-on moves against the same cold entry: the first
 * subject action, navigating away, the canonical prepared re-entry, and a second direct entry.
 *
 * The prepared re-entry is the control that matters — if it is still fast after a cold direct
 * entry, the cold path has not degraded the certified journey.
 *
 * Environment (same contract as the pe3 harnesses):
 *   PE3_SLOT     slot number, default 5        PE3_PORT   default 3010 + slot
 *   PE3_BASE     default http://127.0.0.1:PORT PE3_SLUG   work unit slug, default "all"
 *   PE3_STORAGE  default ~/.local/state/alloy-dev/auth/slot<SLOT>/storage-state.json
 *
 * Prints durations and counts only — never subject names, ids or storage contents.
 */
import { chromium } from "playwright";
import { homedir } from "os";
import { join } from "path";

const SLOT = process.env.PE3_SLOT ?? "5";
const PORT = process.env.PE3_PORT ?? String(3010 + Number(SLOT));
const BASE = process.env.PE3_BASE ?? `http://127.0.0.1:${PORT}`;
const SLUG = process.env.PE3_SLUG ?? "all";
const STORAGE =
    process.env.PE3_STORAGE ?? join(homedir(), `.local/state/alloy-dev/auth/slot${SLOT}/storage-state.json`);

const browser = await chromium.launch({ headless: true });
try {
    const context = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 960 } });
    const page = await context.newPage();

    let lastRequestAt = Date.now();
    let requests = 0;
    page.on("request", (r) => {
        if (r.url().includes("/api/")) {
            requests += 1;
            lastRequestAt = Date.now();
        }
    });
    const quiet = async (ms = 1200, cap = 25000) => {
        const started = Date.now();
        while (Date.now() - started < cap) {
            if (Date.now() - lastRequestAt > ms) return;
            await page.waitForTimeout(100);
        }
    };
    /** Presence and counts only — `subjectResolved` is a boolean, never the subject's name. */
    const state = () =>
        page.evaluate(() => ({
            rows: document.querySelectorAll("[data-entity-id]").length,
            truthful: [...document.querySelectorAll("[data-card-role]")].filter(
                (c) => (c.textContent || "").trim().length > 20,
            ).length,
            holding: document.querySelectorAll("[data-focus-panel-cell-reserved='true']").length,
            subjectResolved: !!document.querySelector("[data-inline-focus-panel-header]")?.innerText?.trim(),
        }));
    /*
     * `from` is the moment the operator ISSUED the intent, not the moment polling began.
     * Playwright's `click()` only resolves after its actionability checks pass, so starting the
     * clock afterwards charges nothing for the part of the wait the operator actually experiences —
     * it reported a 317 ms re-entry as "4 ms". Every duration below is measured from the issue.
     */
    const until = async (pred, from, cap = 600) => {
        for (let i = 0; i < cap; i++) {
            if (pred(await state())) return Date.now() - from;
            await page.waitForTimeout(25);
        }
        return null;
    };

    const t0 = Date.now();
    await page.goto(`${BASE}/workspace/work-unit/${SLUG}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    const usableAt = await until((s) => s.rows > 0 && s.truthful > 0, t0);
    const atUsable = await state();
    console.log(`COLD ENTRY usable at ${usableAt}ms  ${JSON.stringify(atUsable)}`);

    // First subject action, taken while cells may still be holding.
    requests = 0;
    const issuedAt = Date.now();
    let accepted = false;
    try {
        await page.locator("[data-entity-id]").first().click({ timeout: 8000 });
        accepted = true;
    } catch (e) {
        console.log("  subject action NOT accepted:", String(e).slice(0, 80));
    }
    /*
     * Only time an action that was ACCEPTED. A rejected click's "duration" is the click timeout, and
     * printing it beside a real latency is how a harness talks someone into a false finding — the
     * row selector legitimately finds nothing to click when the single row is already selected.
     * `r2Actionable.mjs` is the deterministic answer to "can the operator act before T4".
     */
    const answeredIn = accepted ? await until((s) => s.subjectResolved, issuedAt) : null;
    console.log(
        `FIRST SUBJECT ACTION issued at t=${issuedAt - t0}ms (holding=${atUsable.holding}): ` +
            (accepted ? `accepted, answered in ${answeredIn}ms` : "NOT accepted — see r2Actionable.mjs"),
    );
    await quiet();

    // Away.
    requests = 0;
    const awayAt = Date.now();
    await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForFunction(() => document.querySelectorAll('a[href^="/workspace/work-unit/"]').length > 0, {
        timeout: 60000,
    });
    console.log(`AWAY to /workspace usable in ${Date.now() - awayAt}ms  api=${requests}`);
    await quiet(1500, 30000);

    // The canonical prepared re-entry — the control that must stay fast.
    requests = 0;
    const preparedAt = Date.now();
    await page.locator(`a[href^="/workspace/work-unit/${SLUG}"]`).first().click({ timeout: 20000 });
    // preparedAt is before the click, so `until(..., preparedAt)` charges the full gesture.
    const preparedIn = await until((s) => s.truthful > 0, preparedAt);
    console.log(`PREPARED RE-ENTRY usable in ${preparedIn}ms  api=${requests}`);

    // A second direct entry, client cache warm.
    requests = 0;
    const directAt = Date.now();
    await page.goto(`${BASE}/workspace/work-unit/${SLUG}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    const directIn = await until((s) => s.truthful > 0, directAt);
    console.log(`DIRECT RE-ENTRY usable in ${directIn}ms  api=${requests}`);
} finally {
    await browser.close();
}
