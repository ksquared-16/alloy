/**
 * CERTHOUSE — THE FINANCIAL SUBJECT CONTRACT, ON A SUBJECT THAT LOOKED LIKE A COUNTEREXAMPLE.
 *
 * Slice 6's mounted run reported that the Certhouse household mounted no Financials card at all,
 * which would contradict the certified contract: a canonical customer is financially addressable
 * regardless of lifecycle stage and regardless of having no prior financial activity.
 *
 * It does not contradict it. Certhouse is at stage `enrolled`, and the record was being opened from
 * the "All" work view, where that stage has no configured work templates. That view then refuses to
 * render the operator surface AT ALL — no Focus Panel, no cards of any kind — and says so in its own
 * words. Financials was not singled out; nothing mounted. Opened from the lane that actually owns
 * enrolled children, the card mounts, addresses the canonical customer and answers 200.
 *
 * Both halves are locked below, because the dangerous future regression is not "the card is missing"
 * — it is the view starting to render SOME cards while still withholding Financials, which is the
 * split-brain this contract was extracted to prevent.
 */
import { expect, test, type Page } from "@playwright/test";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const ENROLLED_LANE = "/workspace/work-unit/enrolled-children";
const ALL_LANE = "/workspace/work-unit/new-work-view-6?work_view_id=new_work_view_6";

/** Certhouse, child grain, in the lane that owns enrolled children. */
const CERTHOUSE_SUBJECT = "b5b62172-8b27-44ff-a852-b11b8888a6cd";
/** The same household as a case in the "All" view, at stage `enrolled`. */
const CERTHOUSE_CASE = "e56e72d5-c7bc-41ff-8d34-f5d34fd4160a";
const CERTHOUSE_CUSTOMER = "29944d3e-8267-45b7-8dcb-7405060e2573";

/**
 * The certified control from the original Financial Subject work. Opened from the "All" view, where
 * this opportunity id is the row: in the Waitlist lane the rows are candidates and carry different
 * ids entirely, so the same id there selects nothing.
 */
const KURZMAN_LANE = ALL_LANE;
const KURZMAN_SUBJECT = "d097e1a8-c3c0-4c51-a113-2275b009b9a9";
const KURZMAN_CUSTOMER = "0658832a-48d6-4b80-beae-0b12d573fdf2";

const TERMINAL = ["No financial record", "Financial account unavailable"];

test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012" });

type Read = { customerId: string | null; status: number | null };

/** Every Financials account read the page makes, with the answer it got. */
function watchAccountReads(page: Page): Read[] {
    const reads: Read[] = [];
    page.on("response", (res) => {
        const u = res.url();
        if (!u.includes("/api/admin/financials/card")) return;
        reads.push({ customerId: new URL(u).searchParams.get("customer_id"), status: res.status() });
    });
    return reads;
}

async function open(page: Page, lane: string, subjectId: string) {
    const join = lane.includes("?") ? "&" : "?";
    await page.goto(`${lane}${join}subject_id=${subjectId}`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(14_000);
}

const financialsCard = (page: Page) => page.locator('[data-financials-card="true"]').first();

test.describe("Certhouse financial subject", () => {
    test("PROOF 1 · the card mounts, and addresses the canonical Certhouse customer", async ({ page }) => {
        test.setTimeout(300_000);
        const reads = watchAccountReads(page);
        await open(page, ENROLLED_LANE, CERTHOUSE_SUBJECT);

        await expect(financialsCard(page), "Financials must mount for this subject")
            .toBeVisible({ timeout: 60_000 });

        expect(reads.length, "the card must actually ask for an account").toBeGreaterThan(0);
        for (const r of reads) {
            expect(r.customerId, "every read is the canonical Certhouse household").toBe(CERTHOUSE_CUSTOMER);
            expect(r.status, "and the account answers").toBe(200);
        }

        const text = (await financialsCard(page).innerText()).replace(/\s+/g, " ");
        for (const terminal of TERMINAL) {
            expect(text, `the card must not settle on "${terminal}"`).not.toContain(terminal);
        }
    });

    /*
     * THE ZERO-ACTIVITY LAW. A household that has never paid anything is not a household without an
     * account. It must read as a real financial position of nothing, with the commands that let an
     * operator start one — not as an absence.
     */
    test("PROOF 2 · no financial activity renders a real zero position, with commands", async ({ page }) => {
        test.setTimeout(300_000);
        await open(page, ENROLLED_LANE, CERTHOUSE_SUBJECT);
        const card = financialsCard(page);
        await expect(card).toBeVisible({ timeout: 60_000 });
        const text = (await card.innerText()).replace(/\s+/g, " ");

        expect(text, "a balance is stated").toMatch(/CURRENT BALANCE/i);
        expect(text, "and it is a figure, not an absence").toMatch(/\$\d/);
        expect(text, "the operator can start financial activity here").toMatch(/Add charge/i);
    });

    /*
     * THE FINDING THIS RUN EXISTS FOR, LOCKED AS AN INVARIANT RATHER THAN AS A COMPLAINT.
     *
     * In the "All" view this record's stage has no work templates, and that view withholds the whole
     * operator surface. That is the view's own doctrine and it is applied to EVERY card. What must
     * never happen is a partial answer: cards rendering while Financials alone is withheld for a
     * subject whose customer is known. This asserts all-or-nothing, so the split-brain would fail here.
     */
    for (const [label, subjectId] of [
        ["Certhouse, whose stage has no work templates", CERTHOUSE_CASE],
        ["the certified control, in the same view", KURZMAN_SUBJECT],
    ] as const) {
    test(`PROOF 3 · ${label}: Financials is never the only card withheld`, async ({ page }) => {
        test.setTimeout(300_000);
        await open(page, ALL_LANE, subjectId);

        const counted = await page.evaluate(() => ({
            cards: document.querySelectorAll("article.alloy-os-ucard").length,
            financials: document.querySelectorAll('[data-financials-card="true"]').length,
        }));

        if (counted.cards === 0) {
            // Nothing mounted: a configuration refusal, not a statement about this family's money.
            expect(counted.financials, "no cards at all means no Financials either").toBe(0);
            const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
            expect(body, "and the view says why, in its own words").toMatch(/configuration|work templates/i);
        } else {
            // The view renders. Then a known customer must get its Financials card like any other.
            expect(counted.financials, "cards mounted, so Financials must not be the one left out")
                .toBeGreaterThan(0);
        }
    });
    }

    test("PROOF 4 · a cold reload reconstructs the subject", async ({ page }) => {
        test.setTimeout(300_000);
        await open(page, ENROLLED_LANE, CERTHOUSE_SUBJECT);
        await expect(financialsCard(page)).toBeVisible({ timeout: 60_000 });

        const reads = watchAccountReads(page);
        await page.reload();
        await page.waitForTimeout(14_000);
        await expect(financialsCard(page), "the card survives a full page load")
            .toBeVisible({ timeout: 60_000 });
        expect(reads.length, "and it re-asks for the account").toBeGreaterThan(0);
        for (const r of reads) expect(r.customerId).toBe(CERTHOUSE_CUSTOMER);
    });

    /*
     * Switching away and back is where a stale subject shows itself: the previous household's money
     * rendered under this one's name would be the worst possible version of this bug.
     */
    test("PROOF 5 · switching to another household and back never leaks the other's money", async ({ page }) => {
        test.setTimeout(420_000);
        const reads = watchAccountReads(page);

        await open(page, ENROLLED_LANE, CERTHOUSE_SUBJECT);
        await expect(financialsCard(page)).toBeVisible({ timeout: 60_000 });

        await open(page, KURZMAN_LANE, KURZMAN_SUBJECT);
        await expect(financialsCard(page)).toBeVisible({ timeout: 60_000 });

        const beforeReturn = reads.length;
        await open(page, ENROLLED_LANE, CERTHOUSE_SUBJECT);
        await expect(financialsCard(page)).toBeVisible({ timeout: 60_000 });

        const afterReturn = reads.slice(beforeReturn).filter((r) => r.customerId);
        expect(afterReturn.length, "coming back must re-ask, not reuse").toBeGreaterThan(0);
        for (const r of afterReturn) {
            expect(r.customerId, "and it must ask for Certhouse, not the household we just left")
                .toBe(CERTHOUSE_CUSTOMER);
        }
        expect(
            reads.some((r) => r.customerId === KURZMAN_CUSTOMER),
            "the control household really was visited in between",
        ).toBe(true);
    });

    /* The certified control must still hold after anything learned here. */
    test("PROOF 6 · Kurzman still mounts, addresses its own household, and can be charged", async ({ page }) => {
        test.setTimeout(300_000);
        const reads = watchAccountReads(page);
        await open(page, KURZMAN_LANE, KURZMAN_SUBJECT);

        await expect(financialsCard(page)).toBeVisible({ timeout: 60_000 });
        expect(reads.length).toBeGreaterThan(0);
        for (const r of reads) {
            expect(r.customerId).toBe(KURZMAN_CUSTOMER);
            expect(r.status).toBe(200);
        }
        const text = (await financialsCard(page).innerText()).replace(/\s+/g, " ");
        for (const terminal of TERMINAL) expect(text).not.toContain(terminal);
        expect(text, "Add charge remains available on the certified control").toMatch(/Add charge/i);
    });

    /**
     * PHASE 16 — WHAT "TAKE PAYMENT" ACTUALLY DEPENDS ON.
     *
     * Certhouse offers Add charge and not Take payment. That is only acceptable if the reason is
     * financial rather than lifecycle: taking money against a household that owes nothing is not a
     * thing to offer. This measures both households instead of asserting a belief — the control owes
     * money and is offered the command, Certhouse owes nothing and is not, and the certified
     * contract's own requirement (Add charge stays available) holds for both.
     */
    test("PROOF 7 · taking payment tracks what is owed, not the lifecycle stage", async ({ page }) => {
        test.setTimeout(420_000);
        const readCard = async (lane: string, subjectId: string) => {
            await open(page, lane, subjectId);
            await expect(financialsCard(page)).toBeVisible({ timeout: 60_000 });
            const text = (await financialsCard(page).innerText()).replace(/\s+/g, " ");
            const owed = /NET OBLIGATION \$([\d,]+\.\d\d)/i.exec(text)?.[1] ?? null;
            return { text, owedCents: owed === null ? null : Math.round(Number(owed.replace(/,/g, "")) * 100) };
        };

        const certhouse = await readCard(ENROLLED_LANE, CERTHOUSE_SUBJECT);
        const control = await readCard(KURZMAN_LANE, KURZMAN_SUBJECT);

        expect(certhouse.owedCents, "Certhouse's obligation is readable").not.toBeNull();
        expect(control.owedCents, "the control's obligation is readable").not.toBeNull();

        // Add charge is the command the certified contract requires, and both have it.
        expect(certhouse.text, "Certhouse can still be charged").toMatch(/Add charge/i);
        expect(control.text, "so can the control").toMatch(/Add charge/i);

        const offersPayment = (t: string) => /Take payment/i.test(t);
        if (certhouse.owedCents === 0) {
            expect(
                offersPayment(certhouse.text),
                "a household that owes nothing is not offered a payment to take",
            ).toBe(false);
        }
        if ((control.owedCents ?? 0) > 0) {
            expect(
                offersPayment(control.text),
                "a household that owes something is offered the command — so the absence above is "
                    + "about the balance, not about being enrolled",
            ).toBe(true);
        }
        // The two together are the claim: the affordance follows the money, not the stage.
        expect(
            certhouse.owedCents === control.owedCents,
            "this proof is only meaningful while the two households differ in what they owe",
        ).toBe(false);
    });
});
