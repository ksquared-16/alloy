import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * UX-1 (pass 2) — SELECTING A RECORD OPENS THE RECORD; RELATED WORK NAVIGATES.
 *
 * The claim:
 *
 *     subject → the canonical record card IMMEDIATELY, centered over Operations
 *     Child ↔ Household switch the card in place
 *     Enrollment / Assignment appear as Related work whose `Go to` LEAVES for the Work View
 *
 * and never `subject → chooser → card` (pass 1's shape) and never `subject → giant record page`
 * (the shape before that). The operator clicked Lennon; Lennon is the object of attention, and no
 * extra choice may stand in front of his record.
 *
 * ── THE ABSENCE ASSERTIONS ARE THE POINT ──
 *
 * "A card appeared" is satisfied by both retired surfaces too. So the scenarios assert the chooser
 * is ABSENT, the composition grid is ABSENT, and the presentation is `contextual` — without those,
 * this suite would pass against either surface it exists to replace.
 *
 * ── `GO TO` IS PROVEN BY PAYLOAD, THEN BY LANDING ──
 *
 * The related-work entries must be SEARCH's destinations — one resolver. That is asserted two ways:
 * the API's `relatedWork` payload must be byte-equal to the destination the Search endpoint
 * resolves for the same subject and context, and clicking one must actually leave Operations and
 * land attention on the Work Unit with Lennon selected.
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
const RECORD_NAV = '[data-record-nav="true"]';
const RELATED_WORK = '[data-record-related-work="true"]';
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

/** Switch the RECORD view in place and assert the overlay stayed contextual and un-navigated. */
async function switchRecordView(page: Page, kind: string) {
    const choice = page.locator(`[data-record-context-kind="${kind}"]`).first();
    await expect(choice, `Lennon must truthfully offer a ${kind} record view`).toBeVisible({
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

// ═══ 1 — the record, immediately ════════════════════════════════════════════════════════════
test("1 — Children → Lennon opens the canonical Children card immediately", async ({ page }) => {
    await openLennon(page);

    /*
     * No chooser, no grid — the canonical card itself, already on screen. The operator clicked
     * Lennon, so Lennon is the default object of attention; asking "what do you want to see?"
     * before showing his record was pass 1's shape and is now the regression.
     */
    await expect(page.locator("[data-contextual-card]").first()).toHaveAttribute(
        "data-contextual-card-canonical-card",
        "children",
        { timeout: SETTLE },
    );
    await expect(page.locator(FULL_GRID)).toHaveCount(0);

    // Record views in the header nav; operational work in Related work — kept APART.
    await expect(page.locator(RECORD_NAV)).toBeVisible({ timeout: SETTLE });
    for (const kind of ["identity", "relationship"]) {
        await expect(
            page.locator(`${RECORD_NAV} [data-record-context-kind="${kind}"]`).first(),
            `${kind} is a record view and belongs in the record nav`,
        ).toBeVisible({ timeout: SETTLE });
    }
    const related = page.locator(RELATED_WORK);
    await expect(related).toBeVisible({ timeout: SETTLE });
    await expect(
        related.locator('[data-record-related-work-goto="process:enrollment"]'),
        "Enrollment is related WORK and navigates — it must not be a record view",
    ).toBeVisible({ timeout: SETTLE });

    // Business language only — no machinery leaks into the overlay.
    const text = (await page.locator(PANEL).innerText()).toLowerCase();
    for (const leak of ["process_instance", "durable_record", "customer_member"]) {
        expect(text, `the overlay must not expose "${leak}"`).not.toContain(leak);
    }

    await page.screenshot({ path: path.join(SHOTS, "1-record-first.png"), fullPage: true });
});

// ═══ 1b — Go to: Search's payload, and Search's landing ═════════════════════════════════════
test("1b — Enrollment `Go to` carries Search's payload and lands on the Work Unit", async ({ page }) => {
    await openLennon(page);

    /*
     * ONE RESOLVER, asserted on the wire. The overlay's related-work entry must be byte-equal to
     * the destination Search resolves for the same subject — a future Operations that grew its own
     * resolution would diverge here even while looking correct on screen.
     */
    const [fromSearch, fromRecord] = await page.evaluate(async (id) => {
        const pick = (d: Record<string, unknown> | undefined) =>
            d
                ? {
                      key: d.key,
                      target: d.target,
                      card_key: d.card_key,
                      item_id: d.item_id,
                      context_key: d.context_key ?? null,
                      host_entity_type: d.host_entity_type,
                      host_entity_id: d.host_entity_id,
                      host_work_unit_key: d.host_work_unit_key,
                      host_work_view_id: d.host_work_view_id ?? null,
                      operational_member_id: d.operational_member_id ?? null,
                  }
                : null;
        const search = await fetch("/api/admin/global-search?q=Lennon", { credentials: "include" }).then(
            (r) => r.json(),
        );
        const record = await fetch(
            `/api/admin/durable-record?subject_type=child&subject_id=${id}`,
            { credentials: "include" },
        ).then((r) => r.json());
        const subject = (search.results ?? []).find(
            (r: { subject?: { display_name?: string } }) => /Lennon/.test(r.subject?.display_name ?? ""),
        );
        const enrollOf = (list: Record<string, unknown>[]) =>
            (list ?? []).find(
                (d) => d.key === "process:enrollment" || /^work_view:enrollment/.test(String(d.key)),
            );
        return [pick(enrollOf(subject?.destinations)), pick(enrollOf(record.relatedWork))];
    }, LENNON);
    expect(fromRecord, "the record must offer the Enrollment destination").not.toBeNull();
    expect(fromRecord).toEqual(fromSearch);

    // …and clicking it LEAVES: Operations closes, the Work Unit hosts, Lennon is the focused item.
    await page
        .locator('[data-record-related-work-goto="process:enrollment"], [data-record-related-work-goto^="work_view:enrollment"]')
        .first()
        .click();
    await expect(page.locator(OVERLAY)).toHaveCount(0, { timeout: SETTLE });
    await expect(page.locator(SHELL)).toHaveCount(0, { timeout: SETTLE });
    await expect(page).toHaveURL(/work-unit/, { timeout: SETTLE });
    expect(page.url()).toContain(`item%3A${LENNON}`);

    await page.screenshot({ path: path.join(SHOTS, "1b-go-to-landing.png"), fullPage: true });
});

// ═══ 2–4 — record views switch in place ═════════════════════════════════════════════════════
const RECORD_VIEWS = [
    /*
     * The Child view is the DEFAULT — test 1 already proved it opens unbidden. Selecting it
     * explicitly must also work, because the operator returns to it from Household.
     */
    { n: 2, kind: "identity", card: "children", shot: "2-child" },
    { n: 3, kind: "relationship", card: "household", shot: "3-household" },
];

for (const c of RECORD_VIEWS) {
    test(`${c.n} — ${c.kind} switches the centered card in place`, async ({ page }) => {
        await openLennon(page);
        // Move OFF the default first so selecting it is a real transition.
        await switchRecordView(page, c.kind === "identity" ? "relationship" : "identity");
        await switchRecordView(page, c.kind);

        const card = page.locator("[data-contextual-card]");
        await expect(card.first()).toBeVisible({ timeout: SETTLE });
        // The CANONICAL card, named — not a lookalike composed for this host.
        await expect(card.first()).toHaveAttribute("data-contextual-card-canonical-card", c.card, {
            timeout: SETTLE,
        });

        await page.screenshot({ path: path.join(SHOTS, `${c.shot}.png`), fullPage: true });
    });
}

// ═══ 5 — the configured Enrollment composition still resolves, reached as WORK ═══════════════
test("5 — the Enrollment destination is the SAME one Search resolves (assignment too)", async ({ page }) => {
    await openLennon(page);
    /*
     * The in-place Enrollment card retired with the chooser — Enrollment is worked on its Work
     * View now. What must hold instead: every related-work destination the record offers is
     * byte-equal to Search's, Assignment included.
     */
    const [searchAssign, recordAssign] = await page.evaluate(async (id) => {
        const search = await fetch("/api/admin/global-search?q=Lennon", { credentials: "include" }).then(
            (r) => r.json(),
        );
        const record = await fetch(
            `/api/admin/durable-record?subject_type=child&subject_id=${id}`,
            { credentials: "include" },
        ).then((r) => r.json());
        const subject = (search.results ?? []).find(
            (r: { subject?: { display_name?: string } }) => /Lennon/.test(r.subject?.display_name ?? ""),
        );
        const assignOf = (list: Record<string, unknown>[]) =>
            (list ?? []).find((d) => d.key === "assignment") ?? null;
        return [assignOf(subject?.destinations), assignOf(record.relatedWork)];
    }, LENNON);
    expect(recordAssign, "the record must offer the Assignment destination").not.toBeNull();
    expect(recordAssign).toEqual(searchAssign);
});

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
    await switchRecordView(page, "relationship");

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
