/**
 * R12 — the precedence explanation across navigation.
 *
 * A stale explanation is the failure mode that matters here: it must survive a warm revisit, vanish
 * entirely on a Work View switch, and come back correctly. Checked against the running surface, not
 * only at the engine, because staleness is a projection problem rather than a computation one.
 *
 * Env (PE3): PE3_SLOT / PE3_PORT / PE3_BASE / PE3_STORAGE. Local hosts only.
 */
import { chromium } from "playwright";
import { BASE, STORAGE, assertLocalBase, assertCandidateBuild, writeEvidence, withResource } from "./r11Env.mjs";

const WORK_UNIT = process.env.R12_WORK_UNIT ?? "waitlist";
const OTHER_WORK_UNIT = process.env.R12_OTHER_WORK_UNIT ?? "tours";
const CLUSTER = "[data-queue-row-waitlist-rank-cluster]";

assertLocalBase();
assertCandidateBuild();

const steps = await withResource(
    () => chromium.launch({ headless: true }),
    (b) => b.close(),
    async (browser) => {
        const ctx = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 1200 } });
        const page = await ctx.newPage();
        const captured = [];
        const readTop = async (label) => {
            await page.waitForFunction((sel) => document.querySelectorAll(sel).length > 0, CLUSTER, { timeout: 90000 });
            await page.waitForTimeout(5000);
            const top = await page.evaluate((sel) => {
                const out = [];
                document.querySelectorAll(sel).forEach((el) => {
                    let host = el;
                    while (host && !host.querySelector?.("[data-queue-row-subject]")) host = host.parentElement;
                    const rect = (host ?? el).getBoundingClientRect();
                    const precedence = el.querySelector("[data-queue-row-waitlist-precedence]");
                    out.push({
                        top: Math.round(rect.top + window.scrollY),
                        rank: (el.querySelector("[data-queue-row-waitlist-rank]") ?? el).textContent?.trim() ?? null,
                        reason: precedence?.getAttribute("data-precedence-reason") ?? null,
                    });
                });
                return out.sort((a, b) => a.top - b.top).slice(0, 3).map((r) => ({ rank: r.rank, reason: r.reason }));
            }, CLUSTER);
            captured.push({ step: label, top });
            console.log(`  ${label}: ` + top.map((r) => `${r.rank}${r.reason ? ` [${r.reason}]` : ""}`).join(" | "));
        };

        await page.goto(`${BASE}/workspace/work-unit/${WORK_UNIT}`, { waitUntil: "domcontentloaded", timeout: 120000 });
        await readTop("first load");
        await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 90000 });
        await page.waitForTimeout(4000);
        await page.goto(`${BASE}/workspace/work-unit/${WORK_UNIT}`, { waitUntil: "domcontentloaded", timeout: 90000 });
        await readTop("warm revisit");
        await page.goto(`${BASE}/workspace/work-unit/${OTHER_WORK_UNIT}`, { waitUntil: "domcontentloaded", timeout: 90000 });
        await page.waitForTimeout(4000);
        const stale = await page.evaluate(() => document.querySelectorAll("[data-queue-row-waitlist-precedence]").length);
        captured.push({ step: `switch to ${OTHER_WORK_UNIT}`, stale_precedence_elements: stale });
        console.log(`  switch to ${OTHER_WORK_UNIT}: precedence elements present = ${stale}`);
        await page.goto(`${BASE}/workspace/work-unit/${WORK_UNIT}`, { waitUntil: "domcontentloaded", timeout: 90000 });
        await readTop("back to waitlist");
        return captured;
    },
);
writeEvidence("warm-navigation.json", { base: BASE, work_unit: WORK_UNIT, other_work_unit: OTHER_WORK_UNIT, steps });
