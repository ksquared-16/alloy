import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * UX-1 — OPERATIONS REALIZES A RECORD AS A CHOICE, NOT AS A PAGE.
 *
 * The claim:
 *
 *     subject → context chooser → exactly ONE established card, centered over Operations
 *
 * and never `subject → giant record surface → hunt for the card`.
 *
 * ── THE ABSENCE ASSERTIONS ARE THE POINT ──
 *
 * "A card appeared" is satisfied by the old surface too — it rendered the contextual card as well,
 * just underneath a whole composition grid. So every scenario asserts the grid is ABSENT and the
 * presentation is `contextual`. Without that, this suite would pass against the surface it exists to
 * replace.
 *
 * Likewise "we stayed in Operations" is asserted by the workspace still being mounted AND the URL
 * being unchanged — a Work Unit navigation would satisfy neither, and a Work Unit navigation is the
 * specific regression Household had.
 *
 * Fixtures: `certification/fixtures/roster-people-search-convergence.sql`.
 */

const SHOTS = path.join(__dirname, "..", "evidence", "operations-contextual-record");
const SETTLE = 180_000;

const LENNON = "fbc00000-0000-4000-8000-00000000c001";

const OPERATIONS_NAV = '[data-adminv2-sidebar-modal-nav="operations"]';
const SHELL = '[data-adminv2-operations-workspace="true"]';
const SECTION_TABS = '[data-workspace-mode-sections="roster"] button';
const SECTION_FILTER = '[data-records-filter="true"]';
const OVERLAY = '[data-durable-record-overlay="true"]';
const PANEL = "[data-durable-record-panel]";
const CHOOSER = '[data-record-context-chooser="true"]';
/** The full composition grid — the giant record surface. Must never appear in Operations. */
const FULL_GRID = "[data-focus-panel-grid-cell]";

test.beforeAll(() => fs.mkdirSync(SHOTS, { recursive: true }));

async function openLennon(page: Page) {
    await page.goto("/workspace");
    await page.waitForLoadState("domcontentloaded");
    await page.locator(OPERATIONS_NAV).click();
    await expect(page.locator(SHELL)).toBeVisible({ timeout: SETTLE });
    await page.locator(SECTION_TABS, { hasText: "Children" }).first().click();
    await page.locator(SECTION_FILTER).fill("Lennon");
    const row = page.locator(`[data-child-member="${LENNON}"]`).first();
    await expect(row).toBeVisible({ timeout: SETTLE });
    await row.click();
    await expect(page.locator(OVERLAY)).toBeVisible({ timeout: SETTLE });
}

/** Select one choice and assert exactly one card, centered, with no full composition anywhere. */
async function choose(page: Page, kind: string) {
    const choice = page.locator(`[data-record-context-kind="${kind}"]`).first();
    await expect(choice, `Lennon must truthfully offer a ${kind} context`).toBeVisible({
        timeout: SETTLE,
    });
    await choice.click();
    await expect(page.locator(PANEL)).toHaveAttribute(
        "data-durable-record-presentation",
        "contextual",
        { timeout: SETTLE },
    );
    // The giant surface never appears — the assertion that separates this from the old experience.
    await expect(page.locator(FULL_GRID)).toHaveCount(0);
    // Operations is still mounted underneath, and we did not navigate.
    await expect(page.locator(SHELL)).toBeVisible();
    expect(page.url()).toContain("/workspace");
    expect(page.url()).not.toContain("/work-unit");
}

// ═══ 1 — the chooser, not a record page ══════════════════════════════════════════════════════
test("1 — Children → Lennon shows a context chooser, not a giant record surface", async ({ page }) => {
    await openLennon(page);

    const chooser = page.locator(CHOOSER);
    await expect(chooser).toBeVisible({ timeout: SETTLE });
    await expect(page.locator(FULL_GRID)).toHaveCount(0);

    /*
     * The options are DERIVED, so this asserts the four Lennon actually holds rather than a count:
     * a fixed number would break the moment a tenant's configuration legitimately differs, and the
     * claim is truthfulness, not arity.
     */
    for (const kind of ["identity", "process", "relationship", "schedule"]) {
        await expect(
            page.locator(`[data-record-context-kind="${kind}"]`).first(),
            `Lennon holds a ${kind} context and it must be offered`,
        ).toBeVisible({ timeout: SETTLE });
    }

    // Business language only — no machinery leaks into the question.
    const text = (await chooser.innerText()).toLowerCase();
    for (const leak of ["process_instance", "opportunity", "work unit", "durable_record", "customer_member"]) {
        expect(text, `the chooser must not expose "${leak}"`).not.toContain(leak);
    }

    await page.screenshot({ path: path.join(SHOTS, "1-chooser.png"), fullPage: true });
});

// ═══ 2–5 — each choice opens its established card, centered ══════════════════════════════════
const CHOICES = [
    /*
     * The Child context renders the CANONICAL `children` card — the tenant's configured Children
     * Surface card, the same one a Focus Panel or a Search destination renders. It used to be
     * `child_identity`, a four-field hardcoded card that existed only on this host; asserting that
     * key would now pin the exact divergence the human review rejected.
     */
    { n: 2, kind: "identity", card: "children", shot: "2-child" },
    { n: 3, kind: "process", card: null, shot: "3-enrollment-waitlist" },
    { n: 4, kind: "relationship", card: "household", shot: "4-household" },
    { n: 5, kind: "schedule", card: "scheduling", shot: "5-schedule" },
];

for (const c of CHOICES) {
    test(`${c.n} — ${c.kind} opens its established card centered over Operations`, async ({ page }) => {
        await openLennon(page);
        await choose(page, c.kind);

        const card = page.locator("[data-contextual-card]");
        await expect(card.first()).toBeVisible({ timeout: SETTLE });

        if (c.card) {
            // The CANONICAL card, named — not a lookalike composed for this host.
            await expect(card.first()).toHaveAttribute(
                "data-contextual-card-canonical-card",
                c.card,
                { timeout: SETTLE },
            );
        } else {
            /*
             * The configured Child card for Enrollment · Waitlist. Asserted by the DOCUMENT it
             * resolved from rather than by its contents: the fixture publishes a composition whose
             * labels exist nowhere in code, so `from-published` true is the falsifiable claim that
             * Operations resolved tenant configuration rather than the platform default.
             */
            await expect(card.first()).toHaveAttribute("data-contextual-card", "child", {
                timeout: SETTLE,
            });
            await expect(card.first()).toHaveAttribute("data-contextual-card-from-published", "true");
        }

        await page.screenshot({ path: path.join(SHOTS, `${c.shot}.png`), fullPage: true });
    });
}

// ═══ 6 — close returns to exactly the same Children state ════════════════════════════════════
test("6 — close returns to the same Children list, search and cohort", async ({ page }) => {
    await page.goto("/workspace");
    await page.waitForLoadState("domcontentloaded");
    await page.locator(OPERATIONS_NAV).click();
    await expect(page.locator(SHELL)).toBeVisible({ timeout: SETTLE });
    await page.locator(SECTION_TABS, { hasText: "Children" }).first().click();
    await page.locator(SECTION_FILTER).fill("Lennon");

    const row = page.locator(`[data-child-member="${LENNON}"]`).first();
    await expect(row).toBeVisible({ timeout: SETTLE });
    const filterBefore = await page.locator(SECTION_FILTER).inputValue();
    const urlBefore = page.url();

    await row.click();
    await expect(page.locator(OVERLAY)).toBeVisible({ timeout: SETTLE });
    await choose(page, "relationship");

    await page.keyboard.press("Escape");
    await expect(page.locator(OVERLAY)).toHaveCount(0, { timeout: SETTLE });

    /*
     * The Children list is STILL THERE — same section, same typed filter, same row, same URL.
     *
     * Structural rather than restored: the record layered over a workspace that was never
     * unmounted, so there is no state to put back and no code putting it back.
     */
    await expect(page.locator(SHELL)).toHaveAttribute("data-operations-section", "children");
    expect(await page.locator(SECTION_FILTER).inputValue()).toBe(filterBefore);
    await expect(page.locator(`[data-child-member="${LENNON}"]`).first()).toBeVisible();
    expect(page.url()).toBe(urlBefore);

    await page.screenshot({ path: path.join(SHOTS, "6-closed-back-to-children.png"), fullPage: true });
});
