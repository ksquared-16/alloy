/**
 * WHICH LENS ACTUALLY MOUNTS THE KURZMAN SUBJECT?
 *
 * The mounted certification failed before Financials was reached. The Waitlist lens answered:
 *
 *   "the requested subject is not present in this work unit's evaluated page —
 *    refusing to substitute a different subject"
 *
 * That is the standing lifecycle_wu_lead vs lifecycle_wu_waitlist question, and the brief forbids
 * assuming which one composes the panel. So this asks BOTH and reports what each one does. It is a
 * probe, not a pass/fail gate: it must record the answer even when the answer is a refusal, so it
 * asserts nothing about which lens wins.
 */
import { test, expect, type Page } from "@playwright/test";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const BASE = "http://127.0.0.1:3012";
const OPPORTUNITY = "d097e1a8-c3c0-4c51-a113-2275b009b9a9";
const CUSTOMER = "0658832a-48d6-4b80-beae-0b12d573fdf2";
const REFUSAL = "not present in this work unit";

test.use({ storageState: STORAGE, baseURL: BASE });

const LENSES = ["lifecycle-wu-lead", "lifecycle-wu-waitlist"];

async function probe(page: Page, lens: string) {
    const cardReads: string[] = [];
    page.on("request", (r) => {
        const url = r.url();
        if (url.includes("/api/admin/financials/card")) {
            cardReads.push(new URL(url).searchParams.get("customer_id") ?? "<none>");
        }
    });

    await page.goto(`/workspace/work-unit/${lens}?subject_id=${OPPORTUNITY}`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(20_000);

    const body = await page.locator("body").innerText();
    const card = page.locator('[data-financials-card="true"]').first();
    const mounted = (await card.count()) > 0;

    /* eslint-disable no-console */
    console.log(`\n===== LENS ${lens} =====`);
    console.log("url              : " + page.url());
    console.log("refused subject  : " + body.includes(REFUSAL));
    console.log("names Kurzman    : " + body.includes("Kurzman"));
    console.log("financials card  : " + mounted);
    console.log("card requests    : " + JSON.stringify(cardReads));
    console.log("canonical customer asked: " + cardReads.includes(CUSTOMER));
    if (mounted) console.log("CARD TEXT:\n" + (await card.innerText()));
    console.log("BODY (first 1500):\n" + body.slice(0, 1500));
    /* eslint-enable no-console */

    return { lens, mounted, refused: body.includes(REFUSAL), cardReads };
}

for (const lens of LENSES) {
    test(`which lens mounts Kurzman — ${lens}`, async ({ page }) => {
        test.setTimeout(180_000);
        const result = await probe(page, lens);
        // A probe records; it does not gate. The only thing that would invalidate it is not loading.
        expect(result.lens, "the probe must have visited the lens it reports on").toBe(lens);
    });
}
