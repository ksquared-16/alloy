/** What actually owns the scrim, and what the ledger row actions really are. */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-s3";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(500_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("dom recon", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    await page.getByRole("button", { name: /^Details$/ }).first().click();
    await page.waitForTimeout(8000);

    const rowActions = await page.evaluate(() => {
        // A DATA row: the first match is the header, which owns no actions.
        const row = (Array.from(document.querySelectorAll("[class*='billingdetail__row']")) as HTMLElement[])
            .find((r) => !r.className.includes("--head")) ?? null;
        const btns = row ? Array.from(row.querySelectorAll("button,[role='button']")) : [];
        return {
            rowClass: (row?.className?.toString() || "").slice(0, 60),
            buttons: btns.map((b) => {
                const h = b as HTMLElement;
                return { title: h.getAttribute("title"), aria: h.getAttribute("aria-label"), testid: h.getAttribute("data-testid"),
                         cmd: h.getAttribute("data-financials-command"), text: h.innerText.trim().slice(0, 20),
                         cls: (h.className?.toString() || "").slice(0, 40) };
            }),
        };
    });
    log(`ROW ACTION BUTTONS: ${JSON.stringify(rowActions, null, 1)}`);

    await page.getByRole("button", { name: /^Add$/ }).first().click();
    await page.waitForTimeout(4000);
    const scrim = await page.evaluate(() => {
        const s = document.querySelector(".alloy-os-fp-depth-scrim") as HTMLElement | null;
        const r = s?.getBoundingClientRect();
        const card = document.querySelector("[data-financials-overlay] .alloy-os-ucard, [data-financials-overlay]") as HTMLElement | null;
        const cr = card?.getBoundingClientRect();
        // A point on the scrim that is provably NOT over the command card.
        let pt: { x: number; y: number; owner: string } | null = null;
        if (r && cr) {
            /*
             * The scrim is taller than the card, so the reliable exposed strip is BELOW it. Earlier
             * candidates aimed left, right and above and all three landed outside the scrim — which
             * is how a wrong gesture gets reported as a product defect.
             */
            const cands = [ { x: Math.round(cr.left + cr.width / 2), y: Math.round(cr.bottom + (r.bottom - cr.bottom) / 2) },
                            { x: Math.round(cr.left + 40), y: Math.round(cr.bottom + 60) },
                            { x: Math.round(r.left + 20), y: Math.round(r.top + r.height / 2) } ];
            for (const c of cands) {
                const el = document.elementFromPoint(c.x, c.y);
                if (el && (el.classList.contains("alloy-os-fp-depth-scrim") || el.closest(".alloy-os-fp-depth-scrim"))) {
                    pt = { ...c, owner: (el as HTMLElement).className.toString().slice(0, 50) }; break;
                }
            }
        }
        return { scrimPresent: !!s, scrimBox: r ? `${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.x)},${Math.round(r.y)}` : null,
                 cardBox: cr ? `${Math.round(cr.width)}x${Math.round(cr.height)}@${Math.round(cr.x)},${Math.round(cr.y)}` : null, scrimPoint: pt };
    });
    log(`SCRIM: ${JSON.stringify(scrim)}`);
    writeFileSync(`${OUT}/dom.json`, JSON.stringify({ rowActions, scrim }, null, 2));
});
