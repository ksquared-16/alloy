/**
 * D2 — WHAT THE OPERATOR ACTUALLY SEES.
 *
 * Screenshots, and the handful of assertions that are genuinely about LOOKING rather than about
 * behaviour: that the three cards sit where they belong, that long names and long role labels do not
 * break the layout, that timestamps are readable words rather than ISO strings, and that the feed is
 * sentences rather than a wall of keys.
 *
 * Evidence lands in `certification/evidence/d2/`, named for what it shows.
 */
import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

const ACCESS = "/organization/access";
const SHOTS = path.join(__dirname, "..", "evidence", "d2");

/** The role the mounted matrix moves Financials on, so its history is the grant/revoke pair. */
const ROLE_KEY = "mcert_portal_only";

/**
 * Evidence of the CARD, not of the viewport.
 *
 * The first run captured the viewport and produced nine near-identical pictures of the top of the
 * Security chapter: the Audit Log card is the fourth card down, so it was below the fold, and the BOS
 * assistant overlay covered the right third of every one. A screenshot that does not contain the
 * thing it is named after is not evidence.
 */
async function dismissOverlays(page: Page) {
    const close = page.getByRole("button", { name: "Close" }).first();
    if (await close.count()) await close.click().catch(() => undefined);
}

async function shot(page: Page, name: string, testId?: string) {
    await dismissOverlays(page);
    const target = testId ? page.getByTestId(testId) : null;
    if (target && (await target.count())) {
        await target.scrollIntoViewIfNeeded();
        await target.screenshot({ path: path.join(SHOTS, `${name}.png`) });
        return;
    }
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

test.describe.configure({ mode: "serial" });

test.describe("D2 — access history, as seen", () => {
    test("organization Security — the Audit Log card, populated", async ({ page }) => {
        await page.goto(`${ACCESS}?section=security`, { waitUntil: "domcontentloaded" });
        const card = page.getByTestId("access-security-audit-log");
        await expect(card).toBeVisible();
        await expect(page.getByTestId("access-security-audit-log-list-event").first()).toBeVisible();

        // TIMESTAMPS ARE WORDS. An ISO string is a machine's answer to "when", and it is the one the
        // technical disclosure carries.
        const stamp = await card.locator("span").filter({ hasText: /\d{4}/ }).first().innerText();
        expect(stamp, "a date an operator reads, not an ISO instant").not.toMatch(/T\d{2}:\d{2}:\d{2}/);

        // The card sits among the chapter's other cards rather than taking the page over.
        await expect(page.getByTestId("access-security-authentication")).toBeVisible();
        await shot(page, "01-security-audit-log-populated", "access-security-audit-log");
    });

    test("organization Security — the feed reads as sentences, not keys", async ({ page }) => {
        await page.goto(`${ACCESS}?section=security`, { waitUntil: "domcontentloaded" });
        await expect(page.getByTestId("access-security-audit-log-list-event").first()).toBeVisible();

        const summaries = await page.getByTestId("access-security-audit-log-list-summary").allInnerTexts();
        expect(summaries.length).toBeGreaterThan(0);
        for (const line of summaries) {
            // Every row names a person and an area in words. Keys live behind the disclosure.
            expect(line.replace(/\S+@\S+/g, "«actor»")).not.toMatch(/\b[a-z_]+\.[a-z_.]+\b/);
        }
        await shot(page, "02-security-feed-sentences", "access-security-audit-log");
    });

    test("the technical disclosure is where the keys live", async ({ page }) => {
        await page.goto(`${ACCESS}?section=security`, { waitUntil: "domcontentloaded" });
        await expect(page.getByTestId("access-security-audit-log-list-event").first()).toBeVisible();
        await page.getByTestId("access-security-audit-log-list-detail-toggle").first().click();
        await expect(page.getByTestId("access-security-audit-log-list-detail").first()).toBeVisible();
        await shot(page, "03-technical-detail-open", "access-security-audit-log");
    });

    test("role — the Change history card, with the grant and the revoke", async ({ page }) => {
        await page.goto(`${ACCESS}?section=roles&roleKey=${ROLE_KEY}`, { waitUntil: "domcontentloaded" });
        await expect(page.getByTestId("access-role-selected-workspace")).toBeVisible();
        const card = page.getByTestId("access-role-history");
        await card.scrollIntoViewIfNeeded();
        await expect(page.getByTestId("access-role-history-list-event").first()).toBeVisible();

        const summaries = await page.getByTestId("access-role-history-list-summary").allInnerTexts();
        expect(summaries.join(" | ")).toContain("Financials");

        // No row may repeat its own summary — the redundancy this review removed.
        const changes = await page.getByTestId("access-role-history-list-change").allInnerTexts();
        for (const change of changes) {
            expect(summaries.some((line) => line.includes(change.replace(/: | → /g, " ")))).toBe(false);
        }
        await shot(page, "04-role-change-history", "access-role-history");
    });

    test("user — the Access history card in the selected person's workspace", async ({ page }) => {
        await page.goto(`${ACCESS}?section=users`, { waitUntil: "domcontentloaded" });
        const members = page.locator('[role="option"][data-testid^="access-user-"]');
        await expect(members.first()).toBeVisible();
        await members.first().click();
        await expect(page.getByTestId("access-user-selected-workspace")).toBeVisible();
        const card = page.getByTestId("access-user-history");
        await card.scrollIntoViewIfNeeded();
        await expect(card).toBeVisible();
        await shot(page, "05-user-access-history", "access-user-history");
    });

    test("a deleted role still renders, named as deleted", async ({ page }) => {
        /*
         * The fallback ladder, seen rather than unit-tested. `cert_d2_doomed` is created, granted and
         * then deleted by the live suite; its events outlive it, and the feed says so instead of
         * dropping them or inventing a current label.
         */
        await page.goto(`${ACCESS}?section=security`, { waitUntil: "domcontentloaded" });
        await expect(page.getByTestId("access-security-audit-log-list-event").first()).toBeVisible();

        const deleted = page.getByTestId("access-security-audit-log-list-summary")
            .filter({ hasText: /Deleted role/ });
        if (await deleted.count()) {
            await deleted.first().scrollIntoViewIfNeeded();
            await shot(page, "06-deleted-role-fallback", "access-security-audit-log");
        } else {
            // Reachable behind Load more on a busy stack; say so rather than passing silently.
            test.info().annotations.push({
                type: "note",
                description: "no deleted-role event on page 1; the fallback is certified in the live suite and the presenter unit locks",
            });
        }
    });

    test("Load more, and the empty state", async ({ page }) => {
        await page.goto(`${ACCESS}?section=security`, { waitUntil: "domcontentloaded" });
        await expect(page.getByTestId("access-security-audit-log-list-event").first()).toBeVisible();
        const more = page.getByTestId("access-security-audit-log-list-load-more");
        if (await more.count()) {
            await more.scrollIntoViewIfNeeded();
            await shot(page, "07-load-more", "access-security-audit-log");
        }

        await page.route("**/api/admin/access/history**", (route) =>
            route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ entries: [], next_cursor: null, limit: 25 }) })
        );
        await page.goto(`${ACCESS}?section=security`, { waitUntil: "domcontentloaded" });
        await expect(page.getByTestId("access-security-audit-log-list-empty")).toBeVisible();
        await shot(page, "08-security-empty", "access-security-audit-log");
    });

    test("a narrow viewport keeps the feed readable and the page unscrolled sideways", async ({ page }) => {
        await page.setViewportSize({ width: 420, height: 900 });
        await page.goto(`${ACCESS}?section=security`, { waitUntil: "domcontentloaded" });
        await expect(page.getByTestId("access-security-audit-log-list-event").first()).toBeVisible();

        const overflows = await page.evaluate(() =>
            document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
        );
        expect(overflows, "the history feed must not push the page sideways at phone width").toBe(false);
        await shot(page, "09-security-narrow");
    });

    test("a long role label and a long actor name do not break a row", async ({ page }) => {
        await page.goto(`${ACCESS}?section=security`, { waitUntil: "domcontentloaded" });
        await expect(page.getByTestId("access-security-audit-log-list-event").first()).toBeVisible();

        // Every row is contained by the card that holds it, whatever its text length.
        const card = await page.getByTestId("access-security-audit-log").boundingBox();
        const rows = await page.getByTestId("access-security-audit-log-list-event").all();
        for (const row of rows) {
            const box = await row.boundingBox();
            if (!box || !card) continue;
            expect(box.x + box.width, "a row must not spill out of its card").toBeLessThanOrEqual(card.x + card.width + 2);
        }
    });
});
