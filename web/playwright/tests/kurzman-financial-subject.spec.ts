/**
 * THE DEFECT, RE-DRIVEN WHERE IT WAS REPORTED — Kurzman Family, Waitlist, Firefly.
 *
 * Two earlier attempts to close this proved something about a different record and produced false
 * confidence. So this names the failing family and refuses to pass on any other.
 *
 * The network request is the load-bearing proof, not the screenshot: a card can render a balance
 * from cache, and only the request shows THIS subject resolving THIS account now.
 */
import { test, expect, type Page } from "@playwright/test";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const BASE = "http://127.0.0.1:3012";

const FAMILY = "Kurzman";
const OPPORTUNITY = "d097e1a8-c3c0-4c51-a113-2275b009b9a9";
const CUSTOMER = "0658832a-48d6-4b80-beae-0b12d573fdf2";
const WAITLIST_ROUTE = "/workspace/work-unit/lifecycle-wu-waitlist";

test.use({ storageState: STORAGE, baseURL: BASE });

type Read = { url: string; customerId: string | null; status: number | null };

/** Every account the card asked about, with the answer it got, taken from the wire. */
function watch(page: Page): Read[] {
    const reads: Read[] = [];
    page.on("request", (r) => {
        const url = r.url();
        if (!url.includes("/api/admin/financials/card")) return;
        reads.push({ url, customerId: new URL(url).searchParams.get("customer_id"), status: null });
    });
    page.on("response", (res) => {
        const url = res.url();
        if (!url.includes("/api/admin/financials/card")) return;
        const row = [...reads].reverse().find((x) => x.url === url && x.status === null);
        if (row) row.status = res.status();
    });
    return reads;
}

async function openKurzman(page: Page) {
    await page.goto(`${WAITLIST_ROUTE}?subject_id=${OPPORTUNITY}`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(30_000);
}

test("Kurzman resolves its canonical household and the card asks for it", async ({ page }) => {
    test.setTimeout(600_000);
    const reads = watch(page);
    await openKurzman(page);

    const body = await page.locator("body").innerText();
    // eslint-disable-next-line no-console
    console.log("[kurzman] URL: " + page.url());
    expect(body, `this certification is about ${FAMILY} and no other family`).toContain(FAMILY);

    // ── THE NETWORK PROOF ──────────────────────────────────────────────────────────────────
    await expect.poll(() => reads.length, { timeout: 180_000 }).toBeGreaterThan(0);
    // eslint-disable-next-line no-console
    console.log("[kurzman] account reads: " + JSON.stringify(reads));
    expect(reads.map((r) => r.customerId), "the card must ask about the canonical household").toContain(
        CUSTOMER,
    );
    const mine = reads.filter((r) => r.customerId === CUSTOMER);
    await expect.poll(() => mine.every((r) => r.status !== null), { timeout: 60_000 }).toBe(true);
    expect(mine.some((r) => r.status === 200), "at least one 200 for this household").toBe(true);

    // ── THE PANEL ──────────────────────────────────────────────────────────────────────────
    const card = page.locator('[data-financials-card="true"]').first();
    await expect(card, "the Financials card must mount").toBeVisible({ timeout: 120_000 });
    const text = await card.innerText();
    // eslint-disable-next-line no-console
    console.log("[kurzman] FULL FINANCIALS CARD TEXT:\n" + text);

    expect(text, "the repaired path must not report an unavailable account").not.toContain(
        "Financial account unavailable",
    );
    expect(text, "nor the sentence it replaced").not.toContain("No financial record");
    expect(text, "an account reads as money").toMatch(/\$/);

    await page.screenshot({ path: "playwright-report/kurzman-financials.png", fullPage: false });
});

/*
 * TWO CHILDREN, ONE HOUSEHOLD. Every Kurzman candidate carries the same customer_id and a different
 * customer_member_id, so the financial subject must not depend on which child is active.
 */
test("switching child does not change the household financial subject", async ({ page }) => {
    test.setTimeout(600_000);
    const reads = watch(page);
    await openKurzman(page);
    await expect.poll(() => reads.length, { timeout: 180_000 }).toBeGreaterThan(0);

    const rows = page.locator("[data-entity-id]").filter({ hasText: FAMILY });
    if ((await rows.count()) >= 2) {
        await rows.nth(1).click();
        await page.waitForTimeout(15_000);
    }
    const distinct = [...new Set(reads.map((r) => r.customerId).filter(Boolean))];
    // eslint-disable-next-line no-console
    console.log("[kurzman] distinct customers across children: " + JSON.stringify(distinct));
    expect(distinct, "two children of one family are one financial subject").toEqual([CUSTOMER]);
});

/* A settled unavailable state after a cold reload is the defect; a transient pending state is fine. */
test("a cold reload reconstructs the subject", async ({ page }) => {
    test.setTimeout(600_000);
    const reads = watch(page);
    await openKurzman(page);
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(30_000);

    const card = page.locator('[data-financials-card="true"]').first();
    await expect(card).toBeVisible({ timeout: 120_000 });
    const text = await card.innerText();
    // eslint-disable-next-line no-console
    console.log("[kurzman] card text after cold reload:\n" + text);
    expect(text).not.toContain("Financial account unavailable");
    expect(reads.map((r) => r.customerId)).toContain(CUSTOMER);
});
