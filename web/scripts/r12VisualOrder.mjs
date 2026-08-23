/**
 * R12 — TRUE visual order of waitlist rows, by geometry.
 *
 * Document order is not visual order (CSS `order`, grid placement and portals all break that), and a
 * law-36 claim built on the wrong order would be fiction. Rows are sorted by their on-screen top edge
 * and compared against the position label each row shows: if placement order governs the surface,
 * those two agree within every section.
 *
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
            document.querySelectorAll(sel).forEach((el, docIndex) => {
                let host = el;
                while (host && !host.querySelector?.("[data-queue-row-subject]")) host = host.parentElement;
                const subject = host?.querySelector("[data-queue-row-subject]") ?? null;
                const rect = (host ?? el).getBoundingClientRect();
                let node = host;
                let header = null;
                while (node && !header) {
                    let sib = node.previousElementSibling;
                    while (sib && !header) {
                        header = sib.matches?.("[data-queue-group-header]")
                            ? sib
                            : (sib.querySelector?.("[data-queue-group-header]") ?? null);
                        sib = sib.previousElementSibling;
                    }
                    node = node.parentElement;
                }
                out.push({
                    docIndex,
                    top: Math.round(rect.top + window.scrollY),
                    name: (subject?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 32),
                    rank: (el.querySelector("[data-queue-row-waitlist-rank]") ?? el).textContent?.trim() ?? null,
                    section: header?.getAttribute("data-queue-group-value") ?? null,
                });
            });
            return out.sort((a, b) => a.top - b.top);
        }, CLUSTER);
    },
);

console.log("visual# docIdx  top   section              name                  rank");
rows.forEach((r, i) =>
    console.log(
        `  ${String(i + 1).padStart(3)}   ${String(r.docIndex).padStart(4)}  ${String(r.top).padStart(5)}  ` +
        `${String(r.section ?? "-").padEnd(20)} ${String(r.name).padEnd(21)} ${r.rank}`,
    ),
);

const bySection = new Map();
rows.forEach((r) => bySection.set(r.section ?? "-", [...(bySection.get(r.section ?? "-") ?? []), r]));
console.log("\n=== rank vs visual order, per section ===");
let allMatch = true;
const sections = [];
for (const [section, list] of bySection) {
    const ranks = list.map((r) => Number(String(r.rank).split("/")[0]));
    const monotonic = ranks.every((n, i) => i === 0 || n >= ranks[i - 1]);
    if (!monotonic) allMatch = false;
    sections.push({ section, ranks, monotonic });
    console.log(`  ${section}: visual ranks = [${ranks.join(", ")}] -> ${monotonic ? "MATCHES display order" : "DISAGREES with display order"}`);
}
console.log(allMatch ? "\nLAW 36 HOLDS — canonical placement order governs every section." : "\nLAW 36 VIOLATED — rendered order disagrees with the positions it shows.");
// Durable evidence carries pseudonyms — `writeEvidence` redacts uuids, not child names.
writeEvidence("visual-order.json", {
    base: BASE,
    work_unit: WORK_UNIT,
    all_sections_match: allMatch,
    sections,
    rows: rows.map((r, i) => ({
        visual_index: i + 1,
        doc_index: r.docIndex,
        top: r.top,
        section: r.section,
        subject: redactSubject(r.name),
        rank: r.rank,
    })),
});
