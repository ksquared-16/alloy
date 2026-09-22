/**
 * §7 — the accepted terms, read back through the operator surface on a FRESH load.
 *
 * The card's own post-commit refetch showed nothing: `loadFinancialConfig` holds a 30-second
 * shared-promise cache keyed by opportunity, and the refetch JOINED the pre-accept promise.
 * `invalidateFinancialConfig` exists for exactly this and the card does not call it. A fresh
 * navigation has an empty cache, so this separates "the term was not written" from "the card was
 * looking at a cached answer".
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-fx";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(300_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("read the accepted terms back", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(20_000);

    const dom = await page.evaluate(() => ({
        insight: (document.querySelector('[data-universal-card-key="assignment_tuition"] .alloy-os-ucard__insight') as HTMLElement | null)?.innerText ?? null,
        assignments: Array.from(document.querySelectorAll("[data-tuition-assignment]")).map((e) => ({
            ocm: e.getAttribute("data-tuition-assignment"),
            member: e.getAttribute("data-tuition-member"),
            state: e.getAttribute("data-tuition-state"),
            accepted: e.getAttribute("data-tuition-accepted"),
            stale: e.getAttribute("data-tuition-stale"),
            resolution: e.getAttribute("data-tuition-resolution"),
            child: (e.querySelector(".alloy-os-tuition__child") as HTMLElement | null)?.innerText ?? null,
            term: e.querySelector("[data-tuition-accepted-term]")?.getAttribute("data-tuition-accepted-term") ?? null,
            acceptedState: e.querySelector("[data-tuition-accepted-term]")?.getAttribute("data-tuition-accepted-state") ?? null,
            acceptedAmount: (e.querySelector("[data-tuition-accepted-amount]") as HTMLElement | null)?.innerText ?? null,
            acceptedLine: (e.querySelector(".alloy-os-tuition__accepted-line") as HTMLElement | null)?.innerText ?? null,
        })),
        text: (document.querySelector('[data-universal-card-key="assignment_tuition"]') as HTMLElement | null)?.innerText?.slice(0, 1600) ?? null,
    }));
    await page.screenshot({ path: `${OUT}/readback.png`, fullPage: true });
    writeFileSync(`${OUT}/readback.json`, JSON.stringify(dom, null, 2));
    log(`insight: ${dom.insight}`);
    log(JSON.stringify(dom.assignments, null, 1));
    log(`--- card ---\n${dom.text}`);
});
