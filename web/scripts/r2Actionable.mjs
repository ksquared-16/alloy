/**
 * R2 — can the operator ACT on a true-cold Work Unit before T4?
 *
 * The 11.7 s true-cold figure implied the surface was unusable for that long. T3 (first truthful
 * card) and T4 (no Focus Panel cell still holding) are different marks, and the question that
 * decides whether the gap matters is not how it LOOKS but whether a legitimate operator action is
 * accepted and answered while cells are still holding.
 *
 * So this issues a real one — a Work View switch — at the earliest moment the surface offers it,
 * and reports whether it was accepted and how fast it answered. A failed synthetic click is NOT
 * evidence the operator is blocked (see §6 of the certification): the action here is chosen because
 * it binds to a deterministic `data-work-view-id`, not to a settlement anchor or a hover menu.
 *
 * Environment (same contract as the pe3 harnesses):
 *   PE3_SLOT     slot number, default 5        PE3_PORT   default 3010 + slot
 *   PE3_BASE     default http://127.0.0.1:PORT PE3_SLUG   work unit slug, default "all"
 *   PE3_STORAGE  default ~/.local/state/alloy-dev/auth/slot<SLOT>/storage-state.json
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

    const state = () =>
        page.evaluate(() => ({
            pills: document.querySelectorAll("[data-work-view-id]").length,
            rows: document.querySelectorAll("[data-entity-id]").length,
            truthful: [...document.querySelectorAll("[data-card-role]")].filter(
                (c) => (c.textContent || "").trim().length > 20,
            ).length,
            holding: document.querySelectorAll("[data-focus-panel-cell-reserved='true']").length,
        }));

    const t0 = Date.now();
    await page.goto(`${BASE}/workspace/work-unit/${SLUG}`, { waitUntil: "domcontentloaded", timeout: 120000 });

    let offeredAt = null;
    let atOffer = null;
    for (let i = 0; i < 800; i++) {
        const s = await state();
        if (s.pills > 0 && s.truthful > 0) {
            offeredAt = Date.now() - t0;
            atOffer = s;
            break;
        }
        await page.waitForTimeout(20);
    }
    if (offeredAt === null) {
        console.log("NEVER OFFERED an action within the window — report this rather than a timing number.");
    } else {
        console.log(`OFFERED at ${offeredAt}ms  ${JSON.stringify(atOffer)}`);

        const pills = await page.evaluate(() =>
            [...document.querySelectorAll("[data-work-view-id]")].map((e) => e.getAttribute("data-work-view-id")),
        );
        const target = pills.find(Boolean);
        const issuedAt = Date.now();
        let accepted = false;
        try {
            await page.locator(`[data-work-view-id="${target}"]`).first().click({ timeout: 6000 });
            accepted = true;
        } catch (e) {
            console.log("  action NOT accepted:", String(e).slice(0, 80));
        }
        let answeredIn = null;
        for (let i = 0; i < 600; i++) {
            const s = await state();
            if (s.truthful > 0 && Date.now() - issuedAt > 60) {
                answeredIn = Date.now() - issuedAt;
                break;
            }
            await page.waitForTimeout(20);
        }
        console.log(
            `ACTION (Work View switch -> ${target}) issued at t=${issuedAt - t0}ms while ` +
                `${atOffer.holding} cells were still holding: accepted=${accepted}, answered in ${answeredIn}ms`,
        );
    }
} finally {
    // A harness that leaks a headless browser on failure poisons every later run on the host.
    await browser.close();
}
