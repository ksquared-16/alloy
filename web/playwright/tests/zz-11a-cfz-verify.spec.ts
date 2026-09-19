/** §1 — the tuition card is now reachable where an operator works, and quiet where it should be. */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-cfz";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(240_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("billing_preview mounts on the enrolled child", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(15_000);
    const shape = await page.evaluate(() => {
        const txt = (document.body.innerText || "");
        return {
            cards: [...new Set(Array.from(document.querySelectorAll("[data-universal-card-key]")).map((e) => e.getAttribute("data-universal-card-key")))],
            tuitionCard: document.querySelectorAll("[data-assignment-tuition]").length,
            assignmentCount: document.querySelector("[data-tuition-count]")?.getAttribute("data-tuition-count") ?? null,
            assignments: Array.from(document.querySelectorAll("[data-tuition-assignment]")).map((e) => ({
                ocm: e.getAttribute("data-tuition-assignment"),
                member: e.getAttribute("data-tuition-member"),
                state: e.getAttribute("data-tuition-state"),
                accepted: e.getAttribute("data-tuition-accepted"),
                text: (e as HTMLElement).innerText.replace(/\n+/g, " / ").slice(0, 300),
            })),
            options: Array.from(document.querySelectorAll("[data-tuition-option-cadence]")).map((e) => ({
                cadence: e.getAttribute("data-tuition-option-cadence"),
                text: (e as HTMLElement).innerText.replace(/\n+/g, " / ").slice(0, 120),
            })),
            empty: /No assignment on this record to price/.test(txt),
            acceptControls: document.querySelectorAll("[data-tuition-accept-assignment]").length,
        };
    });
    log(`CARDS: ${JSON.stringify(shape.cards)}`);
    log(`tuition card nodes=${shape.tuitionCard} assignments=${shape.assignmentCount} empty=${shape.empty} acceptControls=${shape.acceptControls}`);
    log(`ASSIGNMENTS: ${JSON.stringify(shape.assignments, null, 1).slice(0, 1200)}`);
    log(`OPTIONS: ${JSON.stringify(shape.options, null, 1).slice(0, 900)}`);
    writeFileSync(`${OUT}/verify.json`, JSON.stringify(shape, null, 2));
    await page.screenshot({ path: `${OUT}/verify.png`, fullPage: false });
});
