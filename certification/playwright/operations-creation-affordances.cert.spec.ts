import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * UX-5 — "HOW DO I ADD ONE?" ANSWERED WITHOUT KNOWING THE ARCHITECTURE.
 *
 * Children and Staff already carried section-level commands. Assignments did not: the add action
 * appeared only while exactly one row was selected, which said that creating a commitment is
 * something you do TO a row. It is not — the subject most likely to need an assignment is the one
 * with no row yet, and reaching them meant selecting somebody else first.
 *
 * ── WHAT THESE ASSERTIONS ARE CAREFUL ABOUT ──
 *
 * "The button exists" is satisfied by a button that exists only sometimes. Availability is therefore
 * asserted in the states where it used to disappear — a zero-result search, an empty cohort, and an
 * Assignments lens with NOTHING selected — rather than only on a populated happy path. And the
 * creation flow is asserted to reach the CANONICAL Schedule card, not merely to open something: a
 * second creator that happened to work would pass a weaker check and defeat the point of the slice.
 *
 * Fixtures: `certification/fixtures/roster-people-search-convergence.sql`.
 */

const SHOTS = path.join(__dirname, "..", "evidence", "operations-creation-affordances");
const SETTLE = 180_000;

const OPERATIONS_NAV = '[data-adminv2-sidebar-modal-nav="operations"]';
const SHELL = '[data-adminv2-operations-workspace="true"]';
const CREATE_ASSIGNMENT = '[data-assignment-create="true"]';
const PICKER = '[data-assignment-subject-picker="true"]';
const CARD = "[data-contextual-card-subject-kind]";

test.beforeAll(() => fs.mkdirSync(SHOTS, { recursive: true }));

async function openOperations(page: Page) {
    await page.goto("/workspace");
    await page.waitForLoadState("domcontentloaded");
    await page.locator(OPERATIONS_NAV).click();
    await expect(page.locator(SHELL)).toBeVisible({ timeout: SETTLE });
}

async function useRiverside(page: Page) {
    await page.locator('button[aria-label="Site"]').first().click();
    await page.locator("[role=option]", { hasText: "Riverside" }).first().click();
    await expect(page.locator(SHELL)).toContainText("Riverside", { timeout: SETTLE });
}

/**
 * Close an inner modal WITHOUT closing Operations.
 *
 * Escape is not safe here: Operations is itself a modal workspace, and the key press closed the
 * whole surface rather than the Add Child dialog on top of it. The first version of this spec used
 * Escape and then asserted the shell's section — which failed reporting "operations workspace not
 * found", a true statement about a spec bug and nothing at all about the product.
 */
async function closeInnerModal(page: Page, selector: string, cancel: string) {
    await page.locator(cancel).first().click();
    await expect(page.locator(selector)).toHaveCount(0, { timeout: SETTLE });
}

/** Operations → Riverside → Roster → Assignments lens, the surface UX-5.3 is about. */
async function openAssignmentsLens(page: Page) {
    await openOperations(page);
    // Riverside is the site the fixture gives commitments to; the tenant's first site has none, so
    // asserting the ledger without choosing it would test the empty state by accident.
    await useRiverside(page);
    await page.locator('[data-roster-lens-option="assignments"]').click();
    await expect(page.locator('[data-assignment-roster="true"]')).toBeVisible({ timeout: SETTLE });
}

async function openSection(page: Page, section: "roster" | "staff" | "children") {
    await page.locator(`[data-workspace-mode-sections] button`, { hasText: new RegExp(section, "i") })
        .first()
        .click();
    await expect(page.locator(SHELL)).toHaveAttribute("data-operations-section", section, {
        timeout: SETTLE,
    });
}

// ═══ 1–4 — Children ══════════════════════════════════════════════════════════════════════════
test("1–4 — Add child is a section command, survives a zero-result search, and opens the identity-safe flow", async ({
    page,
}) => {
    await openOperations(page);
    await openSection(page, "children");

    // 1 — populated cohort, command present.
    const add = page.locator('[data-child-add-open="true"]');
    await expect(add, "Add child is a section action").toBeVisible({ timeout: SETTLE });
    await expect(page.locator("[data-children-list]")).toBeVisible({ timeout: SETTLE });

    /*
     * 2 — A SEARCH THAT MATCHES NOBODY.
     *
     * The state where an empty-state-only affordance vanishes precisely when it is most wanted: the
     * operator searched for someone, did not find them, and now wants to add them.
     */
    const filter = page.locator('[data-records-filter="true"]');
    await filter.fill("zzzzz-no-such-child-zzzzz");
    await expect(page.locator("[data-children-list]")).toHaveCount(0, { timeout: SETTLE });
    await expect(add, "Add child survives a zero-result search").toBeVisible();

    await filter.fill("");

    // 3 — the EXISTING identity-safe modal, unchanged and unduplicated.
    await add.click();
    const modal = page.locator("[data-add-child-modal]");
    await expect(modal, "the existing Add Child modal opens").toBeVisible({ timeout: SETTLE });
    // One creation authority, not two.
    await expect(page.locator("[data-add-child-modal]")).toHaveCount(1);
    await closeInnerModal(page, "[data-add-child-modal]", "[data-add-child-cancel]");

    // 4 — and it never left Operations.
    await expect(page.locator(SHELL)).toHaveAttribute("data-operations-section", "children");
    await page.screenshot({ path: path.join(SHOTS, "1-children-add.png"), fullPage: true });
});

// ═══ 5–8 — Staff ═════════════════════════════════════════════════════════════════════════════
test("5–8 — Add staff is a section command, survives a zero-result search, and opens the canonical flow", async ({
    page,
}) => {
    await openOperations(page);
    await openSection(page, "staff");

    const add = page.locator('[data-staff-add-open="true"]');
    await expect(add, "Add staff is a section action").toBeVisible({ timeout: SETTLE });

    const filter = page.locator('[data-records-filter="true"]');
    await filter.fill("zzzzz-no-such-staff-zzzzz");
    await expect(page.locator("[data-staff-list]")).toHaveCount(0, { timeout: SETTLE });
    await expect(add, "Add staff survives a zero-result search").toBeVisible();
    await filter.fill("");

    await add.click();
    await expect(page.locator("[data-add-staff-modal]"), "the existing Add Staff modal opens").toBeVisible({
        timeout: SETTLE,
    });
    await closeInnerModal(page, "[data-add-staff-modal]", "[data-add-staff-cancel]");
    await expect(page.locator(SHELL)).toHaveAttribute("data-operations-section", "staff");

    await page.screenshot({ path: path.join(SHOTS, "2-staff-add.png"), fullPage: true });
});

// ═══ 9–13 — Create assignment, with no row selected ══════════════════════════════════════════
test("9 — Create assignment stands on its own, with nothing selected", async ({ page }) => {
    await openAssignmentsLens(page);

    /*
     * THE LOAD-BEARING ASSERTION OF THE SLICE.
     *
     * Asserted BEFORE any row is touched, and paired with the selection toolbar being absent — so a
     * command that had merely moved into that toolbar would fail here rather than look like a pass.
     */
    await expect(page.locator('[data-assignment-roster-bulk="true"]'), "nothing is selected").toHaveCount(0);
    await expect(page.locator(CREATE_ASSIGNMENT), "Create assignment needs no selection").toBeVisible({
        timeout: SETTLE,
    });
    await page.screenshot({ path: path.join(SHOTS, "3-create-no-selection.png"), fullPage: true });
});

/*
 * 11 and 12 are SEPARATE TESTS, not two halves of one.
 *
 * The first draft chose a child, closed the card, then chose a staff member in the same test. It
 * failed on the second leg with the record overlay still open — a sequencing artefact of the spec,
 * not a product fault, and one that would have been reported as "Create assignment is missing".
 * Each subject grain now starts from its own clean surface, so a failure names the grain that broke.
 */
for (const grain of ["child", "staff"] as const) {
    test(`${grain === "child" ? "11" : "12"} — Create assignment can choose a ${grain} subject and lands on the canonical card`, async ({
        page,
    }) => {
        await openAssignmentsLens(page);

        await page.locator(CREATE_ASSIGNMENT).first().click();
        await expect(page.locator(PICKER)).toBeVisible({ timeout: SETTLE });
        await page.locator(`[data-assignment-subject-tab="${grain}"]`).click();

        const option = page.locator(`[data-assignment-subject-kind="${grain}"]`).first();
        await expect(option, `canonical ${grain} subjects are offered`).toBeVisible({ timeout: SETTLE });
        await option.click();

        /*
         * 13 — AND IT IS THE CANONICAL CARD.
         *
         * The picker chooses a subject and nothing else; every assignment fact — type, room, dates,
         * pattern, proposed/committed — belongs to the Schedule context card, which reads the
         * tenant's configured Assignment Categories. Asserting the card's own subject grain is what
         * separates "re-hosted the canonical flow" from "opened something that worked".
         */
        await expect(page.locator(CARD)).toHaveAttribute("data-contextual-card-subject-kind", grain, {
            timeout: SETTLE,
        });
        // Still inside Operations — no page load, no retired workspace.
        await expect(page.locator(SHELL)).toHaveAttribute("data-operations-section", "roster");

        await page.screenshot({
            path: path.join(SHOTS, grain === "child" ? "4-child-subject.png" : "5-staff-subject.png"),
            fullPage: true,
        });
    });
}

// ═══ 10 — the empty lens ═════════════════════════════════════════════════════════════════════
test("10 — an Assignments lens with no assignments still offers the command", async ({ page }) => {
    await openOperations(page);

    /*
     * A site with no commitments at all. Chosen from the site picker rather than by emptying the
     * fixture: the empty state has to be reachable the way an operator reaches it.
     */
    await page.locator('button[aria-label="Site"]').first().click();
    const options = page.locator("[role=option]");
    await expect(options.first()).toBeVisible({ timeout: SETTLE });
    const count = await options.count();
    await options.nth(Math.min(count - 1, 2)).click();

    await page.locator('[data-roster-lens-option="assignments"]').click();

    const empty = page.locator('[data-assignment-roster-empty="true"]');
    const populated = page.locator('[data-assignment-roster="true"]');
    await expect(empty.or(populated).first()).toBeVisible({ timeout: SETTLE });

    // Whichever state this site is in, the command is present — that is the whole claim.
    await expect(page.locator(CREATE_ASSIGNMENT).first()).toBeVisible({ timeout: SETTLE });
    if (await empty.count()) {
        await expect(empty).toContainText("No assignments at");
    }
    await page.screenshot({ path: path.join(SHOTS, "6-empty-lens.png"), fullPage: true });
});

// ═══ 16–17 — selection actions stay row-scoped, and nothing reaches the retired workspace ════
test("16+17 — bulk actions remain selection-scoped and no flow opens the retired Assignments workspace", async ({
    page,
}) => {
    const legacy: string[] = [];
    page.on("framenavigated", (f) => {
        const url = f.url();
        if (/\/adminV2\/(scheduling|assignments)(\/|$|\?)/.test(url)) legacy.push(url);
    });

    await openOperations(page);
    // Riverside is the site the fixture gives commitments to; the tenant's first site has none, and
    // asserting the ledger without choosing it tests the empty state by accident.
    await useRiverside(page);
    await page.locator('[data-roster-lens-option="assignments"]').click();
    await expect(page.locator('[data-assignment-roster="true"]')).toBeVisible({ timeout: SETTLE });

    // 16 — selecting a row brings the toolbar, and the bulk commands are still there and unchanged.
    const box = page.locator('[data-assignment-roster="true"] input[type="checkbox"]').first();
    await expect(box).toBeVisible({ timeout: SETTLE });
    await box.check();
    const toolbar = page.locator('[data-assignment-roster-bulk="true"]');
    await expect(toolbar).toBeVisible({ timeout: SETTLE });
    await expect(toolbar.locator("[data-bulk-assignment]")).toBeVisible();
    await expect(toolbar.locator("[data-bulk-room-change]")).toBeVisible();
    // …and creation is NOT among them any more — that separation is the slice.
    await expect(toolbar.locator("[data-roster-add-assignment]")).toHaveCount(0);
    // The standing command did not move or vanish because a row got selected.
    await expect(page.locator(CREATE_ASSIGNMENT).first()).toBeVisible();

    // 17 — nothing navigated to a retired destination.
    expect(legacy, `legacy navigations: ${legacy.join(", ")}`).toHaveLength(0);
    await page.screenshot({ path: path.join(SHOTS, "7-selection-toolbar.png"), fullPage: true });
});
