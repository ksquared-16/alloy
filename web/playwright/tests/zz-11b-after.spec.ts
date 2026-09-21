/** AFTER: the tuition options are the assignment's, and Details is a row below the commands. */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-setup";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("after", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(17_000);

    // ── The compact card: Details back on its own row, footer still gone. ──
    const card = await page.evaluate(() => {
        const el = document.querySelector("[data-universal-card-key='financials']") as HTMLElement | null;
        if (!el) return null;
        const d = el.querySelector("[data-financials-nav='details']");
        const p = el.querySelector("[data-financials-command='payment']");
        const dr = d?.getBoundingClientRect(); const pr = p?.getBoundingClientRect();
        return {
            height: Math.round(el.getBoundingClientRect().height),
            saysScheduled: /scheduled this period/i.test(el.innerText || ""),
            pastDue: (el.querySelector("[data-financials-pastdue]") as HTMLElement | null)?.innerText ?? null,
            detailsBelowPayment: dr && pr ? dr.top > pr.bottom - 2 : null,
            detailsOwnRow: dr && pr ? Math.abs(dr.top - pr.top) > 10 : null,
        };
    });
    log(`CARD: ${JSON.stringify(card)}`);

    // ── The assignment tuition control. ──
    await page.getByRole("button", { name: /^custom/ }).first().click();
    await page.waitForTimeout(14_000);
    const tuition = await page.evaluate(() => {
        const s = document.querySelector("select[data-assignment-tuition-embed='true']") as HTMLSelectElement | null;
        const lbl = s ? document.querySelector(`label[for="${s.id}"]`) : null;
        return {
            present: Boolean(s),
            label: (lbl as HTMLElement | null)?.innerText ?? null,
            pricedChild: s?.getAttribute("data-assignment-tuition-plan") ?? null,
            options: s ? Array.from(s.querySelectorAll("option")).map((o) => (o as HTMLOptionElement).textContent?.trim()) : [],
            help: (s?.parentElement?.lastElementChild as HTMLElement | null)?.innerText ?? null,
        };
    });
    log(`TUITION: ${JSON.stringify(tuition, null, 1)}`);
    const foreign = (tuition.options ?? []).filter((t) => /Certb/.test(t ?? ""));
    log(`\nOPTIONS NAMING ANOTHER CHILD: ${JSON.stringify(foreign)}`);
    await page.screenshot({ path: `${OUT}/assignment-tuition-after.png`, fullPage: true });
    writeFileSync(`${OUT}/after.json`, JSON.stringify({ card, tuition, foreign }, null, 2));
});
