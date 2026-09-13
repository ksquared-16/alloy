/**
 * THE FINANCIALS CARD DOES NOT ANSWER BEFORE IT HAS LOOKED.
 *
 * ── THE DEFECT UNDER CERTIFICATION ──
 *
 * Reproduced on a Waitlist record: the Enrollment and Children cards showed valid subject context,
 * and Financials rendered "No financial record."
 *
 * That sentence was produced by the card's own state machine, not by the ledger. It had exactly one
 * way of having no subject, and it spoke terminally whenever it held no id and was not mid-fetch —
 * which is precisely its state during the window while the panel's truth is still composing. There
 * is nothing to fetch yet, so `loading` is false, so the card delivered a verdict about an account
 * it had not yet looked for. Every other card on that panel reserves through that window.
 *
 * And the sentence was wrong even where the card was right: a canonical customer with zero activity
 * is a valid financial subject that renders $0.00 with Add charge, so "no financial record" states
 * something about the FAMILY that the card has no business claiming.
 *
 * ── WHAT IS PROVEN HERE, AND WHAT IS NOT ──
 *
 * The reported record lives in a tenant this lane cannot reach, and the certification tenant holds
 * no `placement_candidates` rows to build a waitlist subject from. So this certifies the repair
 * itself — the state machine and the copy, on a real mounted panel over a real account — and does
 * not claim to have re-driven the original Lennox reproduction.
 */
import { test, expect, type Page } from "@playwright/test";

const WORK_VIEW = "/workspace/work-unit/new-leads";
const CERT_OPPORTUNITY = "00000000-0000-4000-8000-40000000099b";
const BOS_PRESENTATION_STATE_KEY = "alloy.bos.presentation.state";

async function parkAssistantRail(page: Page) {
    await page.addInitScript(
        ([key, state]) => {
            try {
                sessionStorage.setItem(key, state);
            } catch {
                /* private-mode storage; the rail simply stays where it parks */
            }
        },
        [BOS_PRESENTATION_STATE_KEY, "closed"],
    );
}

/**
 * EVERY EMPTY STATE THE CARD PASSES THROUGH, in order.
 *
 * Sampled continuously rather than read once at the end, because the defect is TRANSIENT: a card
 * that flashes a terminal verdict for two seconds and then resolves has still told the operator
 * their family has no financial record. A single settled assertion cannot see that.
 */
async function recordEmptyStates(page: Page, forMs: number): Promise<string[]> {
    const seen: string[] = [];
    const until = Date.now() + forMs;
    while (Date.now() < until) {
        const markers = await page
            .locator("[data-financials-empty]")
            .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-financials-empty") ?? ""))
            .catch(() => [] as string[]);
        for (const m of markers) if (m && seen[seen.length - 1] !== m) seen.push(m);
        await page.waitForTimeout(250);
    }
    return seen;
}

test("the Financials card never reports an absent record while its subject is still resolving", async ({ page }) => {
    test.skip(process.env.CERT_EXPECT_UNAUTHORIZED === "1", "the unauthorized run drives its own case");
    test.setTimeout(900_000);
    await parkAssistantRail(page);

    /* Cold entry onto a pinned subject — the platform's own way of establishing attention, and the
       path that reconstructs a panel from nothing rather than from a warm client cache. */
    await page.goto(`${WORK_VIEW}?subject_id=${CERT_OPPORTUNITY}`);
    await page.waitForLoadState("domcontentloaded");

    const states = await recordEmptyStates(page, 45_000);
    // eslint-disable-next-line no-console
    console.log("[subject-state] empty states observed, in order: " + JSON.stringify(states));

    /*
     * THE FLASH IS THE DEFECT. `no-subject` is the terminal state and it may never be reached on a
     * panel whose subject does resolve — not even for one sample.
     */
    expect(
        states,
        "the card reported an unresolvable account while the panel was still composing",
    ).not.toContain("no-subject");

    const body = await page.locator("body").innerText().catch(() => "");
    expect(body, "the retired sentence must not come back").not.toContain("No financial record");

    await expect(
        page.locator('[data-financials-card="true"]').first(),
        "the card must mount on a subject whose household is known",
    ).toBeVisible({ timeout: 90_000 });

    /* AND IT RESOLVED AN ACCOUNT. The card addresses its read by customer id; a card that never
       asked is a card that never had a subject. */
    const asked = await page.evaluate(() =>
        performance
            .getEntriesByType("resource")
            .map((e) => (e as PerformanceResourceTiming).name)
            .filter((n) => n.includes("/api/admin/financials/card")),
    );
    // eslint-disable-next-line no-console
    console.log("[subject-state] account reads: " + JSON.stringify(asked.slice(0, 3)));
    expect(asked.length, "the card resolved no account to ask about").toBeGreaterThan(0);
    expect(asked.join(" "), "the account is addressed by canonical customer id").toMatch(/customer_id=/);

    await page.screenshot({ path: "evidence/screens/subject-state-resolved.png", fullPage: false });
});

/*
 * ZERO ACTIVITY IS A FINANCIAL STATE, NOT AN ABSENT ONE. This is the half of the contract the old
 * copy denied: a canonical customer who has never been billed still has an account, and the card
 * must present it as money rather than as a missing record.
 */
test("an account with no activity presents as money, not as an absent record", async ({ page }) => {
    test.skip(process.env.CERT_EXPECT_UNAUTHORIZED === "1", "the unauthorized run drives its own case");
    test.setTimeout(900_000);
    await parkAssistantRail(page);

    await page.goto(`${WORK_VIEW}?subject_id=${CERT_OPPORTUNITY}`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator('[data-financials-card="true"]').first()).toBeVisible({ timeout: 90_000 });
    await page.waitForTimeout(8_000);

    const card = await page.locator('[data-financials-card="true"]').first().innerText();
    // eslint-disable-next-line no-console
    console.log("[subject-state] full card text:\n" + card);

    expect(card, "an account reads as money").toMatch(/\$/);
    expect(card, "the family's history is not reported as missing").not.toContain("No financial record");
});
