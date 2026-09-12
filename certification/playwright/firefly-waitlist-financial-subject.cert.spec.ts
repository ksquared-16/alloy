/**
 * THE DEFECT, RE-DRIVEN WHERE IT WAS REPORTED — Kurzman Family, on the Waitlist, in Firefly.
 *
 * Every earlier attempt to close this proved something about a different record, and twice that
 * produced false confidence. So this names the failing family and refuses to pass on any other:
 * a certification that quietly certifies a substitute is worse than no certification, because it
 * ends the investigation.
 *
 * ── WHAT IT MUST SHOW ──
 *
 * The account was never missing. `placement_candidates.customer_id` is populated 37/37 in this
 * tenant, the case carries the same customer, and the queue simply never selected the column — so
 * the household reached composed truth only nested under `opportunities`, where the flat-key
 * resolver cannot see it. The card then settled terminal beside sibling cards that had resolved the
 * same family from the same row.
 *
 * The network request is the load-bearing proof, not the screenshot. A card can render a balance
 * from a stale cache; only the request proves THIS subject resolved THIS account now.
 */
import { test, expect, type Page } from "@playwright/test";

/** The exact record. Substituting another family is the failure mode, not a fallback. */
const ORG_HINT = "Firefly";
const FAMILY = "Kurzman";
const OPPORTUNITY = "d097e1a8-c3c0-4c51-a113-2275b009b9a9";
const CUSTOMER = "0658832a-48d6-4b80-beae-0b12d573fdf2";
/* Routes are hyphenated; platform keys are underscored (`lifecycle_wu_waitlist`). */
const WAITLIST_ROUTE = "/workspace/work-unit/lifecycle-wu-waitlist";

type AccountRead = { url: string; customerId: string | null; status: number | null };

/**
 * Every account the mounted card actually asked about, in order, with the answer it got.
 *
 * Recorded from the wire rather than inferred from the DOM: "the card shows money" and "the card
 * resolved this household" are different claims, and only one of them is what the defect was about.
 */
function watchAccountReads(page: Page): AccountRead[] {
    const reads: AccountRead[] = [];
    page.on("request", (req) => {
        const url = req.url();
        if (!url.includes("/api/admin/financials/card")) return;
        reads.push({ url, customerId: new URL(url).searchParams.get("customer_id"), status: null });
    });
    page.on("response", (res) => {
        const url = res.url();
        if (!url.includes("/api/admin/financials/card")) return;
        const row = [...reads].reverse().find((r) => r.url === url && r.status === null);
        if (row) row.status = res.status();
    });
    return reads;
}

async function openKurzman(page: Page): Promise<void> {
    await page.goto(`${WAITLIST_ROUTE}?subject_id=${OPPORTUNITY}`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(30_000);
}

test.describe("the Firefly Waitlist financial subject", () => {
    test("Kurzman Family resolves its canonical household, and the card asks for it", async ({ page }) => {
        test.setTimeout(900_000);
        const reads = watchAccountReads(page);
        await openKurzman(page);

        // THE RECORD, NAMED. If this is not Kurzman, nothing below is evidence about the defect.
        const body = await page.locator("body").innerText();
        expect(body, `this certification is about ${FAMILY} in ${ORG_HINT} and no other family`).toContain(
            FAMILY,
        );

        // ── PHASE 4 · THE NETWORK PROOF ────────────────────────────────────────────────────────
        await expect
            .poll(() => reads.length, { timeout: 120_000 })
            .toBeGreaterThan(0);
        // eslint-disable-next-line no-console
        console.log("[firefly] account reads: " + JSON.stringify(reads));
        expect(
            reads.map((r) => r.customerId),
            "the card must ask about the canonical household the census proved this case carries",
        ).toContain(CUSTOMER);
        const forCustomer = reads.filter((r) => r.customerId === CUSTOMER);
        await expect.poll(() => forCustomer.every((r) => r.status !== null), { timeout: 60_000 }).toBe(true);
        expect(forCustomer.map((r) => r.status), "the account read must succeed").not.toContain(500);
        expect(forCustomer.some((r) => r.status === 200), "at least one 200 for this household").toBe(true);

        // ── PHASE 5 · THE PANEL ITSELF ────────────────────────────────────────────────────────
        const card = page.locator('[data-financials-card="true"]').first();
        await expect(card, "the Financials card must mount on this subject").toBeVisible({ timeout: 90_000 });
        const cardText = await card.innerText();
        // eslint-disable-next-line no-console
        console.log("[firefly] full Financials card text:\n" + cardText);

        /* THE TWO SENTENCES THE DEFECT PRODUCED. Neither may survive on a family with an account. */
        expect(cardText, "the repaired path must not report an unavailable account").not.toContain(
            "Financial account unavailable",
        );
        expect(cardText, "nor the sentence it replaced").not.toContain("No financial record");
        /* Whatever the family's activity, an account reads as money. */
        expect(cardText, "an account reads as money").toMatch(/\$/);

        await page.screenshot({ path: "evidence/screens/firefly-kurzman-financials.png", fullPage: false });
    });

    /*
     * ── PHASE 7 · TWO CHILDREN, ONE HOUSEHOLD ──────────────────────────────────────────────────
     *
     * Every Kurzman candidate carries the SAME `customer_id` and a different `customer_member_id`.
     * The financial subject must therefore be identical whichever child is active — and must never
     * be a first-child fallback, which would put one sibling's scope on the family's money.
     */
    test("switching child does not change the household financial subject", async ({ page }) => {
        test.setTimeout(900_000);
        const reads = watchAccountReads(page);
        await openKurzman(page);
        await expect.poll(() => reads.length, { timeout: 120_000 }).toBeGreaterThan(0);

        const rows = page.locator("[data-entity-id]").filter({ hasText: FAMILY });
        const count = await rows.count();
        if (count >= 2) {
            await rows.nth(1).click();
            await page.waitForTimeout(15_000);
        }
        // eslint-disable-next-line no-console
        console.log("[firefly] reads across children: " + JSON.stringify(reads.map((r) => r.customerId)));
        const distinct = new Set(reads.map((r) => r.customerId).filter(Boolean));
        expect(
            [...distinct],
            "two children of one family are one financial subject",
        ).toEqual([CUSTOMER]);
    });

    /*
     * ── PHASE 9 · COLD RELOAD ──────────────────────────────────────────────────────────────────
     *
     * A transient pending state is fine. A SETTLED unavailable state is the defect, so the panel is
     * read after it has settled rather than at first paint.
     */
    test("a cold reload reconstructs the subject from persistence", async ({ page }) => {
        test.setTimeout(900_000);
        const reads = watchAccountReads(page);
        await openKurzman(page);
        await page.reload();
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(30_000);

        const card = page.locator('[data-financials-card="true"]').first();
        await expect(card).toBeVisible({ timeout: 90_000 });
        const text = await card.innerText();
        // eslint-disable-next-line no-console
        console.log("[firefly] card text after cold reload:\n" + text);
        expect(text).not.toContain("Financial account unavailable");
        expect(reads.map((r) => r.customerId)).toContain(CUSTOMER);
    });
});
