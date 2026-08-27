/**
 * R12 — the operator-visible result: order, rank, pin, and the precedence explanation.
 *
 * Asserts the explanation is targeted, not blanket: exactly the qualifying pinned row carries it.
 * Env (PE3): PE3_SLOT / PE3_PORT / PE3_BASE / PE3_STORAGE / R11_OUT_DIR. Local hosts only.
 */
import { chromium } from "playwright";
import { BASE, STORAGE, assertLocalBase, assertCandidateBuild, redactSubject, writeEvidence, withResource } from "./r11Env.mjs";

const WORK_UNIT = process.env.R12_WORK_UNIT ?? "waitlist";
const CLUSTER = "[data-queue-row-waitlist-rank-cluster]";

assertLocalBase();
assertCandidateBuild();

const rows = await withResource(
    () => chromium.launch({ headless: true }),
    (b) => b.close(),
    async (browser) => {
        const ctx = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 1200 } });
        const page = await ctx.newPage();
        await page.goto(`${BASE}/workspace/work-unit/${WORK_UNIT}`, { waitUntil: "domcontentloaded", timeout: 120000 });
        await page.waitForFunction((sel) => document.querySelectorAll(sel).length > 0, CLUSTER, { timeout: 90000 });
        await page.waitForTimeout(6000);
        return page.evaluate((sel) => {
            const out = [];
            document.querySelectorAll(sel).forEach((el) => {
                let host = el;
                while (host && !host.querySelector?.("[data-queue-row-subject]")) host = host.parentElement;
                const rect = (host ?? el).getBoundingClientRect();
                const precedence = el.querySelector("[data-queue-row-waitlist-precedence]");
                out.push({
                    top: Math.round(rect.top + window.scrollY),
                    name: (host?.querySelector("[data-queue-row-subject]")?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 28),
                    rank: (el.querySelector("[data-queue-row-waitlist-rank]") ?? el).textContent?.trim() ?? null,
                    hasAdjust: !!el.querySelector("[data-queue-row-waitlist-adjust]"),
                    explanation: precedence?.textContent?.trim() ?? null,
                    reason: precedence?.getAttribute("data-precedence-reason") ?? null,
                });
            });
            return out.sort((a, b) => a.top - b.top);
        }, CLUSTER);
    },
);

console.log("visual#  name                  rank      pin  reason                 explanation");
rows.forEach((r, i) =>
    console.log(
        `  ${String(i + 1).padStart(3)}   ${String(r.name).padEnd(21)} ${String(r.rank).padEnd(9)} ` +
        `${r.hasAdjust ? " Y " : " - "} ${String(r.reason ?? "-").padEnd(22)} ${r.explanation ?? ""}`,
    ),
);
const explained = rows.filter((r) => r.explanation);
console.log(`\nrows with an explanation: ${explained.length} of ${rows.length}`);
// Durable evidence carries pseudonyms; the child's name never leaves the console.
writeEvidence("explanation.json", {
    base: BASE,
    work_unit: WORK_UNIT,
    explained_count: explained.length,
    rows: rows.map((r, i) => ({
        visual_index: i + 1,
        subject: redactSubject(r.name),
        rank: r.rank,
        reason: r.reason,
        explanation: r.explanation,
    })),
});
