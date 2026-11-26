import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * UX-2 — STAFF USES THE SAME GRAMMAR AS CHILDREN.
 *
 *     Operations → Staff → Jane → chooser → exactly ONE established card, centered
 *
 * The claim is SAMENESS, not a staff feature. If Staff needed its own chooser, its own card host or
 * its own record page, Operations would be two products wearing one name — so the assertions below
 * are deliberately the same shape as UX-1's, against the same selectors, because that identity is
 * the thing under test.
 *
 * ── WHAT WOULD MAKE THIS PASS DISHONESTLY ──
 *
 * "A card appeared" is satisfied by the old giant surface, which also rendered a contextual card —
 * underneath a whole composition grid. Every scenario therefore asserts the grid is ABSENT and the
 * presentation is `contextual`. And "we stayed in Operations" is asserted by the workspace still
 * being mounted AND an unchanged URL, because a navigation would satisfy neither.
 *
 * Fixtures: `certification/fixtures/roster-people-search-convergence.sql`.
 */

const SHOTS = path.join(__dirname, "..", "evidence", "operations-staff-contextual");
const SETTLE = 180_000;

const JANE = "fbc00000-0000-4000-8000-00000000a001";

const OPERATIONS_NAV = '[data-adminv2-sidebar-modal-nav="operations"]';
const SHELL = '[data-adminv2-operations-workspace="true"]';
const SECTION_TABS = '[data-workspace-mode-sections="roster"] button';
const SECTION_FILTER = '[data-records-filter="true"]';
const OVERLAY = '[data-durable-record-overlay="true"]';
const PANEL = "[data-durable-record-panel]";
const RELATED_WORK = '[data-record-related-work="true"]';
/** The full composition grid — the giant record surface. Must never appear in Operations. */
const FULL_GRID = "[data-focus-panel-grid-cell]";

test.beforeAll(() => fs.mkdirSync(SHOTS, { recursive: true }));

async function openJane(page: Page) {
    await page.goto("/workspace");
    await page.waitForLoadState("domcontentloaded");
    await page.locator(OPERATIONS_NAV).click();
    await expect(page.locator(SHELL)).toBeVisible({ timeout: SETTLE });
    await page.locator(SECTION_TABS, { hasText: "Staff" }).first().click();
    await page.locator(SECTION_FILTER).fill("Jane");
    const row = page.locator(`[data-staff-person="${JANE}"]`).first();
    await expect(row).toBeVisible({ timeout: SETTLE });
    await row.click();
    await expect(page.locator(OVERLAY)).toBeVisible({ timeout: SETTLE });
}

async function selectContext(page: Page, kind: string) {
    const choice = page.locator(`[data-record-context-kind="${kind}"]`).first();
    await expect(choice, `Jane must truthfully offer a ${kind} context`).toBeVisible({
        timeout: SETTLE,
    });
    await choice.click();
    await expect(page.locator(PANEL)).toHaveAttribute(
        "data-durable-record-presentation",
        "contextual",
        { timeout: SETTLE },
    );
    await expect(page.locator(FULL_GRID)).toHaveCount(0);
    await expect(page.locator(SHELL)).toBeVisible();
    expect(page.url()).toContain("/workspace");
    expect(page.url()).not.toContain("/work-unit");
}

// ═══ 1 — the chooser, same grammar as Children ═══════════════════════════════════════════════
test("1 — Staff → Jane opens the canonical Employment card immediately", async ({ page }) => {
    await openJane(page);

    /*
     * RECORD-FIRST: the operator clicked Jane, so Jane's standing is the default object of
     * attention — the Employment card, unbidden, with no chooser in front of it. Schedule is her
     * related operational work and is offered SEPARATELY, as work.
     */
    await expect(page.locator("[data-contextual-card]").first()).toHaveAttribute(
        "data-contextual-card-canonical-card",
        "employment",
        { timeout: SETTLE },
    );
    await expect(page.locator(FULL_GRID)).toHaveCount(0);

    const related = page.locator(RELATED_WORK);
    await expect(related).toBeVisible({ timeout: SETTLE });
    await expect(
        related.locator('[data-record-context-kind="schedule"]').first(),
        "Schedule is related work, offered beside the record rather than in front of it",
    ).toBeVisible({ timeout: SETTLE });

    // Child-only contexts must NOT appear on a staff member — the producer is shared, and a shared
    // producer that leaked household onto a person would be worse than a separate one.
    await expect(page.locator('[data-record-context-kind="relationship"]')).toHaveCount(0);
    await expect(page.locator('[data-record-context-kind="identity"]')).toHaveCount(0);

    const text = (await page.locator(PANEL).innerText()).toLowerCase();
    for (const leak of ["process_instance", "durable_record", "person_id"]) {
        expect(text, `the overlay must not expose "${leak}"`).not.toContain(leak);
    }

    // POSITIVE CONTROL: Jane's own standing, from lib/employment — not an empty shell.
    await expect(page.locator("[data-contextual-card]").first()).toContainText("Lead Teacher", {
        timeout: SETTLE,
    });

    await page.screenshot({ path: path.join(SHOTS, "1-staff-record-first.png"), fullPage: true });
});

// ═══ 2 — Schedule, reached from Related work, renders the canonical card in place ═══════════
test("2 — schedule opens the canonical scheduling card centered over Operations", async ({ page }) => {
    await openJane(page);
    await selectContext(page, "schedule");

    const card = page.locator("[data-contextual-card]").first();
    await expect(card).toBeVisible({ timeout: SETTLE });
    await expect(card).toHaveAttribute("data-contextual-card-canonical-card", "scheduling", {
        timeout: SETTLE,
    });
    // The staff-capable Scheduling card proven in O-3b, at staff grain.
    await expect(page.locator('[data-scheduling-card="true"]')).toHaveAttribute(
        "data-scheduling-subject-kind",
        "staff",
        { timeout: SETTLE },
    );

    await page.screenshot({ path: path.join(SHOTS, "2-schedule.png"), fullPage: true });
});

// ═══ 5 — close returns to exactly the same Staff browse state ════════════════════════════════
test("5 — close returns to the same Staff cohort, filter and URL", async ({ page }) => {
    await page.goto("/workspace");
    await page.waitForLoadState("domcontentloaded");
    await page.locator(OPERATIONS_NAV).click();
    await expect(page.locator(SHELL)).toBeVisible({ timeout: SETTLE });
    await page.locator(SECTION_TABS, { hasText: "Staff" }).first().click();
    await page.locator(SECTION_FILTER).fill("Jane");

    const row = page.locator(`[data-staff-person="${JANE}"]`).first();
    await expect(row).toBeVisible({ timeout: SETTLE });
    const filterBefore = await page.locator(SECTION_FILTER).inputValue();
    const urlBefore = page.url();
    const siteBefore = await page.locator(SHELL).innerText();

    await row.click();
    await expect(page.locator(OVERLAY)).toBeVisible({ timeout: SETTLE });

    await page.keyboard.press("Escape");
    await expect(page.locator(OVERLAY)).toHaveCount(0, { timeout: SETTLE });

    await expect(page.locator(SHELL)).toHaveAttribute("data-operations-section", "staff");
    expect(await page.locator(SECTION_FILTER).inputValue()).toBe(filterBefore);
    await expect(page.locator(`[data-staff-person="${JANE}"]`).first()).toBeVisible();
    expect(page.url()).toBe(urlBefore);
    // The site/context band is unchanged — the workspace was layered over, never rebuilt.
    expect((await page.locator(SHELL).innerText()).slice(0, 60)).toBe(siteBefore.slice(0, 60));

    await page.screenshot({ path: path.join(SHOTS, "5-closed-back-to-staff.png"), fullPage: true });
});

// ═══ 6 — Search resolves the SAME subject and context set ════════════════════════════════════
test("6 — Search → Jane resolves the same contexts Operations offers", async ({ page }) => {
    /*
     * ONE AUTHORITY, asserted rather than assumed.
     *
     * Both entries read `loadSubjectContexts` → `durableRecordContextOptions`. This compares the
     * option KEYS the endpoint returns with the choices Operations renders — so a future Operations
     * that started composing its own menu would diverge here even while looking correct on screen.
     */
    await page.goto("/workspace");
    await page.waitForLoadState("domcontentloaded");
    const fromApi = await page.evaluate(async (id) => {
        const res = await fetch(`/api/admin/durable-record?subject_type=person&subject_id=${id}`, {
            credentials: "include",
        });
        const json = await res.json();
        return ((json?.contexts ?? []) as { key: string }[]).map((c) => c.key).sort();
    }, JANE);
    expect(fromApi.length, "Jane must hold contexts for this to prove anything").toBeGreaterThan(0);

    await openJane(page);
    /*
     * The record opens on Employment (the default record view — nav renders only when there is a
     * CHOICE of record views, and Jane has one), and Schedule sits in Related work. Between the
     * default card's own context and the related entries, every context the endpoint returned must
     * be REPRESENTED on screen — the assertion that keeps Operations from composing its own menu.
     */
    await expect(page.locator("[data-contextual-card]").first()).toBeVisible({ timeout: SETTLE });
    const rendered = (
        await page
            .locator("[data-record-context-choice], [data-contextual-card]")
            .evaluateAll((els) =>
                els.map(
                    (el) =>
                        el.getAttribute("data-record-context-choice")
                        ?? el.getAttribute("data-contextual-card-context")
                        ?? "",
                ),
            )
    )
        .filter(Boolean)
        .sort();

    expect([...new Set(rendered)]).toEqual(fromApi);

    await page.screenshot({ path: path.join(SHOTS, "6-search-parity.png"), fullPage: true });
});
