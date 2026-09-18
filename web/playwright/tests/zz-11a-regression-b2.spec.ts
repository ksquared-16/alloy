/** B, isolated at the LEAF. Which element actually owns visible "Record payment" content? */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-regression";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(400_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("who owns Record payment", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(14_000);
    const before = await page.evaluate(() => {
        const hits = Array.from(document.querySelectorAll("*")).filter((el) => {
            const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent ?? "").join(" ");
            return /record payment/i.test(own);
        });
        return hits.map((h) => ({ tag: h.tagName, cls: (h.className?.toString() || "").slice(0, 60), text: (h as HTMLElement).innerText.trim().slice(0, 40) }));
    });
    log(`BEFORE Details — leaf 'Record payment' owners: ${JSON.stringify(before)}`);

    await page.getByRole("button", { name: /^Details$/ }).first().click();
    await page.waitForTimeout(9000);
    await page.screenshot({ path: `${OUT}/b2-details.png` });

    const after = await page.evaluate(() => {
        const visible = (el: Element) => {
            const s = getComputedStyle(el as HTMLElement); const b = (el as HTMLElement).getBoundingClientRect();
            return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0.01 && b.width > 0 && b.height > 0;
        };
        const leaves = Array.from(document.querySelectorAll("*")).filter((el) => {
            const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent ?? "").join(" ");
            return /record payment/i.test(own);
        });
        return {
            leafOwners: leaves.map((h) => {
                const el = h as HTMLElement; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
                let card: HTMLElement | null = el; let key: string | null = null;
                while (card && !key) { key = card.getAttribute?.("data-universal-card-key") ?? null; card = card.parentElement; }
                return { tag: el.tagName, cls: (el.className?.toString() || "").slice(0, 70), text: el.innerText.trim().slice(0, 50),
                         visible: visible(el), z: cs.zIndex, opacity: cs.opacity, box: `${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.x)},${Math.round(r.y)}`,
                         ownerCardKey: key };
            }),
            elevated: Array.from(document.querySelectorAll('[data-fp-elevated="true"]')).length,
            scrims: Array.from(document.querySelectorAll('[class*="scrim"], [data-scrim]')).map((e) => ({ cls: (e.className?.toString()||"").slice(0,50), vis: visible(e) })),
        };
    });
    writeFileSync(`${OUT}/b2.json`, JSON.stringify(after, null, 2));
    /* eslint-disable no-console */
    log(`AFTER Details — leaf owners:`);
    for (const o of after.leafOwners) log(`   ${o.visible ? "VISIBLE" : "hidden "} card=${o.ownerCardKey} z=${o.z} op=${o.opacity} ${o.box} "${o.text}" [${o.cls}]`);
    log(`elevated nodes: ${after.elevated} | scrims: ${JSON.stringify(after.scrims)}`);
    /* eslint-enable no-console */
});
