/**
 * §11 — the fixture's ACTIVE commercial answer for BOTH children on the deployed build.
 *
 * The forecast is read per child from that child's own Assignment section, so one child's figure
 * can never be reported against the other — the confusion that produced a false API/UI
 * disagreement earlier in this thread.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11b-deployed-qa";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.setTimeout(700_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("each child's own accepted tuition and expected reduction", async ({ page }) => {
    const out: Record<string, unknown> = {};
    for (const child of ["Certa", "Certb"]) {
        await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(13_000);
        expect(page.url()).not.toContain("/login");

        /* What the Children card actually offers, read before clicking anything. */
        const offered = await page.evaluate(() => {
            const card = document.querySelector("[data-universal-card-key='children']") as HTMLElement | null;
            return Array.from(card?.querySelectorAll("button,[role='button'],a") ?? []).map((e) => ({
                tag: e.tagName,
                name: (e as HTMLElement).innerText?.replace(/\s+/g, " ").trim().slice(0, 70),
            })).filter((o) => o.name);
        });
        if (child === "Certa") log(`CHILDREN CARD OFFERS: ${JSON.stringify(offered, null, 1)}`);

        /*
         * The child's own panel opens from the ROW ACTION beside the name ("custom \u2192",
         * "full_time \u2192"), not from the name itself. Pick the row action that FOLLOWS this
         * child's name button, so the two children can never be confused for one another.
         */
        const card = page.locator("[data-universal-card-key='children']");
        const rowActionIndex = await card.evaluate((el, who) => {
            const btns = Array.from(el.querySelectorAll("button"));
            const nameAt = btns.findIndex((b) => new RegExp(`${who}\\s+Certhouse`, "i").test(b.innerText || ""));
            if (nameAt < 0) return -1;
            for (let i = nameAt + 1; i < btns.length; i++) {
                const t = (btns[i].innerText || "").trim();
                if (/Certhouse/i.test(t)) break;
                if (/\u2192\s*$/.test(t) && !/view children/i.test(t)) return i;
            }
            return -1;
        }, child);
        const btn = card.locator("button").nth(rowActionIndex < 0 ? 0 : rowActionIndex);
        const present = rowActionIndex >= 0;
        if (present) {
            log(`${child} row action: ${(await btn.innerText()).replace(/\s+/g, " ").trim()}`);
            await btn.click({ timeout: 20_000 }).catch(() => {});
            await page.waitForTimeout(14_000);
        }

        out[child] = {
            childControlPresent: present,
            ...(await page.evaluate((who) => {
                const s = document.querySelector("[data-universal-card-key='scheduling']") as HTMLElement | null;
                const t = s?.innerText?.replace(/\s+/g, " ") ?? "";
                /* Derive the subject from the section being measured — never assume which child. */
                const subject = (/ASSIGNMENTS\s+\w*\s*(Cert[ab])\s+Certhouse/i.exec(t) || [null, null])[1];
                return {
                    subjectInSection: subject,
                    subjectMatchesIntent: subject?.toLowerCase() === who.toLowerCase(),
                    accepted: (/\$[\d,]+\.\d{2}\s*\/?\s*(weekly|monthly|biweekly)/i.exec(t) || [null])[0],
                    overridden: (/Overridden \$[\d,]+\.\d{2}\s*\/\s*\w+/i.exec(t) || [null])[0],
                    expectedReduction: (/\$[\d,]+\.\d{2}\s*expected to apply/i.exec(t) || [null])[0],
                    addException: /add exception/i.test(t),
                    activeCertResidue: /A-K|§12|H\/I|duplicate pair|promotion proof/i.test(t),
                    endedHistoryPresent: /ended \d{4}-\d{2}-\d{2}/i.test(t),
                    text: t.slice(0, 900),
                };
            }, child)),
        };
        log(`${child}: ${JSON.stringify(out[child])}`);
        await page.screenshot({ path: `${OUT}/c-${child.toLowerCase()}.png`, fullPage: true });
    }
    writeFileSync(`${OUT}/deployed-both-children.json`, JSON.stringify(out, null, 2));
});
