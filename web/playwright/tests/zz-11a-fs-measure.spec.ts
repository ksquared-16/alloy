/**
 * §1 — MEASURE familySettlement, without inferring it from geometry.
 *
 * `usePublishedFocusPanelSummaryDoc(isSummary && usesPublishedDoc)` only FETCHES the published doc
 * when the flag is true, and `usesPublishedDoc = focusPanelSummaryUsesPublishedDoc(grain, {
 * familySettlement })`. So for a CHILD subject the network answers the question directly:
 *
 *   request made  → usesPublishedDoc true  → familySettlement true  → PUBLISHED doc selected
 *   no request    → usesPublishedDoc false → familySettlement false → CODE default selected
 *
 * The in-product layout tracer is dev-only and this runtime is production, so this is the
 * production-safe equivalent. Nothing is inferred from rendered geometry.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-fs";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(240_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("does the child panel fetch the published Summary doc?", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const layoutCalls: Array<Record<string, unknown>> = [];
    page.on("response", async (res) => {
        const u = res.url();
        if (!u.includes("/api/admin/entity-layouts/focus-panel-summary")) return;
        let version: unknown = null; let id: unknown = null; let cards: unknown = null;
        try {
            const b = await res.json() as { published?: { version?: number; id?: string; doc?: { sections?: Array<Record<string, unknown>> } } } | null;
            version = b?.published?.version ?? null;
            id = b?.published?.id ?? null;
            /* The sections the PANEL actually received — not the ones I read unscoped. */
            cards = (b?.published?.doc?.sections ?? []).map((sec) => {
                const m = (sec as { metadata?: { focusPanelCard?: { key?: string; visibility?: string } } }).metadata?.focusPanelCard;
                return { card: m?.key, visibility: m?.visibility ?? null };
            });
        } catch { /* noop */ }
        layoutCalls.push({ url: u.replace(/^https?:\/\/[^/]+/, ""), status: res.status(), publishedVersion: version, id, cards });
    });

    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(16_000);

    const observed = await page.evaluate(() => ({
        cards: [...new Set(Array.from(document.querySelectorAll("[data-universal-card-key]")).map((e) => e.getAttribute("data-universal-card-key")))],
        /* The dev tracer, in case this build ever carries it. */
        tracer: (window as unknown as { __focusPanelLayoutSource?: unknown }).__focusPanelLayoutSource ?? null,
        subject: document.querySelector("[data-focus-panel-subject], [data-subject-type]")?.getAttribute("data-subject-type") ?? null,
    }));

    log(`\n=== LAYOUT ENDPOINT CALLS: ${layoutCalls.length} ===`);
    for (const c of layoutCalls) log(JSON.stringify(c));
    log(`\nMEASURED usesPublishedDoc = ${layoutCalls.length > 0}`);
    log(`→ familySettlement = ${layoutCalls.length > 0} (child grain: the flag IS familySettlement)`);
    log(`→ selected document source = ${layoutCalls.length > 0 ? "PUBLISHED" : "CODE_DEFAULT"}`);
    log(`\nmounted cards: ${JSON.stringify(observed.cards)}`);
    log(`tracer: ${JSON.stringify(observed.tracer)}`);
    writeFileSync(`${OUT}/fs-measure.json`, JSON.stringify({ layoutCalls, observed }, null, 2));
    await page.screenshot({ path: `${OUT}/fs-measure.png` });
});
