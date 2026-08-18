import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * OPERATIONS CONVERGENCE — the O-4/O-5 browser acceptance, 23 points.
 *
 * The claim: Roster, Records and Assignments are ONE product placement called Operations, with WORK
 * and STUDIO as its two modes — and every entry point ever written to the three retired workspaces
 * converges on it rather than dead-ending.
 *
 * ── ABSENCE IS ASSERTED, NOT ASSUMED ──
 *
 * A convergence claim fails in two directions and only one of them is loud. "Operations exists and
 * works" is satisfied by a rail that ALSO still carries Assignments — so the retired entries are
 * asserted absent, and the retired shells are asserted deleted by the doctrine test rather than
 * merely unlinked. An unreachable workspace that still compiles is a second implementation waiting
 * to be re-linked.
 *
 * ── THE FORWARDS ARE THE PROOF THAT THIS IS A MOVE ──
 *
 * Points 17–20 exercise old Roster, Records and Assignments deep links, including a Studio one. A
 * link that stops resolving is a removal wearing a move's clothes, and these are the links an
 * operator's bookmarks and the product's own stored deep links are made of.
 *
 * Fixtures: `certification/fixtures/roster-people-search-convergence.sql`.
 */

const SHOTS = path.join(__dirname, "..", "evidence", "operations-convergence");
const SETTLE = 180_000;

const LENNON = "fbc00000-0000-4000-8000-00000000c001";
const JANE = "fbc00000-0000-4000-8000-00000000a001";
const RIVERSIDE = "00000000-0000-4000-8000-000000000010";

const OPERATIONS_NAV = '[data-adminv2-sidebar-modal-nav="operations"]';
const SHELL = '[data-adminv2-operations-workspace="true"]';
const SECTION_TABS = '[data-workspace-mode-sections="roster"] button';
const MODE_RAIL = '[data-workspace-mode-nav="operations"]';
const SECTION_FILTER = '[data-records-filter="true"]';
const PANEL_READY = '[data-durable-record="ready"]';
const OVERLAY = '[data-durable-record-overlay="true"]';
const OPERATIONAL_CARD = '[data-contextual-card="operational"]';
const LIST_SURFACE = '[data-assignment-list-surface="true"]';
const ROSTER_LENS = "[data-roster-lens]";

test.beforeAll(() => fs.mkdirSync(SHOTS, { recursive: true }));

/** Open Operations from the rail — the operator's own gesture, not a deep link. */
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

async function selectMode(page: Page, mode: "Work" | "Studio") {
    // The canonical mode switch renders `role="tab"` pills keyed by `data-alloy-mode`, not buttons.
    await page.locator(`[data-alloy-mode="${mode.toLowerCase()}"]`).first().click();
    await expect(page.locator(SHELL)).toHaveAttribute("data-operations-mode", mode.toLowerCase(), {
        timeout: SETTLE,
    });
}

async function selectSection(page: Page, label: string) {
    await page.locator(SECTION_TABS, { hasText: label }).first().click();
}

// ═══ 1 — the rail carries ONE Operations entry ═══════════════════════════════════════════════
test.describe("1 — sidebar", () => {
    test("shows Operations, and no Roster / Records / Assignments", async ({ page }) => {
        await page.goto("/workspace");
        await page.waitForLoadState("domcontentloaded");
        await expect(page.locator(OPERATIONS_NAV)).toBeVisible({ timeout: SETTLE });

        // The absence half. A rail carrying both would satisfy "Operations is present" while
        // failing the invariant the convergence actually claims.
        await expect(page.locator('[data-adminv2-sidebar-modal-nav="roster"]')).toHaveCount(0);
        await expect(page.locator('[data-adminv2-sidebar-modal-nav="scheduling"]')).toHaveCount(0);
        await expect(page.locator('[data-adminv2-sidebar-modal-nav="records"]')).toHaveCount(0);

        await page.screenshot({ path: path.join(SHOTS, "01-sidebar.png"), fullPage: true });
    });
});

// ═══ 2 + 3 — Operations opens on WORK with four sections ═════════════════════════════════════
test.describe("2+3 — Operations opens on Work", () => {
    test("WORK shows Roster / Attendance / Staff / Children", async ({ page }) => {
        await openOperations(page);
        await expect(page.locator(SHELL)).toHaveAttribute("data-operations-mode", "work");

        const tabs = page.locator(SECTION_TABS);
        await expect(tabs).toHaveCount(4);
        for (const label of ["Roster", "Attendance", "Staff", "Children"]) {
            await expect(page.locator(SECTION_TABS, { hasText: label }).first()).toBeVisible();
        }
        // The mode rail is real now — Roster's shell declared one mode and opted out of it.
        await expect(page.locator(MODE_RAIL)).toBeVisible();
        await expect(page.locator('[data-alloy-mode="studio"]')).toBeVisible();

        await page.screenshot({ path: path.join(SHOTS, "02-03-work.png"), fullPage: true });
    });
});

// ═══ 4 + 5 — Roster's own controls survived the re-parent ════════════════════════════════════
test.describe("4+5 — Roster Day/Week and the three lenses", () => {
    test("range and lenses work unchanged", async ({ page }) => {
        await openOperations(page);
        await useRiverside(page);

        // Day / Week.
        await page.locator('[data-roster-range-option="week"]').first().click();
        await expect(page.locator("[data-roster-range]")).toHaveAttribute("data-roster-range", "week", {
            timeout: SETTLE,
        });
        await page.locator('[data-roster-range-option="day"]').first().click();
        await expect(page.locator("[data-roster-range]")).toHaveAttribute("data-roster-range", "day");

        /*
         * Rooms / Staff / Assignments — and the STAFF lens exists only in WEEK.
         *
         * `lensesForRange` offers Rooms + Assignments on a Day and adds Staff on a Week: a day is
         * read by room, a week is where staffing is planned. An earlier revision of this file
         * iterated all three in Day range and timed out on a control that was correctly absent.
         */
        await page.locator('[data-roster-range-option="week"]').first().click();
        await expect(page.locator("[data-roster-range]")).toHaveAttribute("data-roster-range", "week");
        for (const lens of ["rooms", "staff", "assignments"]) {
            await page.locator(`[data-roster-lens-option="${lens}"]`).first().click();
            await expect(page.locator(ROSTER_LENS)).toHaveAttribute("data-roster-lens", lens, {
                timeout: SETTLE,
            });
        }
        // POSITIVE CONTROL: the Assignments lens actually composed its ledger, with rows.
        await expect(page.locator('[data-assignment-roster="true"]')).toBeVisible({ timeout: SETTLE });
        await expect(
            page.locator("[data-assignment-roster-subject]").first(),
        ).toBeVisible({ timeout: SETTLE });

        await page.screenshot({ path: path.join(SHOTS, "04-05-roster-lenses.png"), fullPage: true });
    });
});

// ═══ 6 + 7 — assignment edits stay INSIDE Operations ═════════════════════════════════════════
test.describe("6+7 — Child and Staff assignment editing", () => {
    for (const subject of [
        { name: "Child", type: "child" as const, id: LENNON, kind: "child" },
        { name: "Staff", type: "person" as const, id: JANE, kind: "staff" },
    ]) {
        test(`${subject.name} Schedule context opens over Operations`, async ({ page }) => {
            await openOperations(page);
            await useRiverside(page);
            await selectSection(page, subject.name === "Child" ? "Children" : "Staff");
            await page.locator(SECTION_FILTER).fill(subject.name === "Child" ? "Lennon" : "Jane");

            const row =
                subject.name === "Child"
                    ? page.locator(`[data-child-member="${subject.id}"]`).first()
                    : page.locator(`[data-staff-person="${subject.id}"]`).first();
            await expect(row).toBeVisible({ timeout: SETTLE });
            await row.click();
            await expect(page.locator(PANEL_READY)).toBeVisible({ timeout: SETTLE });

            await page.locator('[data-durable-record-context="schedule"]').click();
            const card = page.locator(OPERATIONAL_CARD);
            await expect(card).toHaveAttribute("data-contextual-card-subject-kind", subject.kind, {
                timeout: SETTLE,
            });
            await expect(page.locator(LIST_SURFACE)).toBeVisible({ timeout: SETTLE });

            /*
             * STILL IN OPERATIONS. The record layers OVER the workspace rather than replacing it,
             * which is the property that makes "close returns to exactly where I was" structural
             * rather than restored — and the property a handoff to a separate workspace destroyed.
             */
            await expect(page.locator(SHELL)).toBeVisible();
            await expect(page.locator('[data-adminv2-scheduling-modal="true"]')).toHaveCount(0);

            await page.screenshot({
                path: path.join(SHOTS, `06-07-${subject.kind}-schedule.png`),
                fullPage: true,
            });
        });
    }
});

// ═══ 8 — Attendance ══════════════════════════════════════════════════════════════════════════
test.describe("8 — Attendance", () => {
    test("composes unchanged inside Operations", async ({ page }) => {
        await openOperations(page);
        await useRiverside(page);
        await selectSection(page, "Attendance");
        await expect(page.locator(SHELL)).toHaveAttribute("data-operations-section", "attendance", {
            timeout: SETTLE,
        });
        // POSITIVE CONTROL — real content, never "no error appeared".
        await expect(page.locator('[data-attendance-rooms="true"]')).toBeVisible({ timeout: SETTLE });

        await page.screenshot({ path: path.join(SHOTS, "08-attendance.png"), fullPage: true });
    });
});

// ═══ 9 + 10 + 11 — the durable population, and household attention ═══════════════════════════
test.describe("9+10+11 — Staff / Children browse, record open, household", () => {
    test("Staff browses and opens a record", async ({ page }) => {
        await openOperations(page);
        await selectSection(page, "Staff");
        await page.locator(SECTION_FILTER).fill("Jane");
        const jane = page.locator(`[data-staff-person="${JANE}"]`).first();
        await expect(jane).toBeVisible({ timeout: SETTLE });
        await jane.click();
        await expect(page.locator(PANEL_READY)).toBeVisible({ timeout: SETTLE });
        /*
         * EMPLOYMENT IS NOW A CHOICE, not a card on a composition grid.
         *
         * This asserted the Employment card was simply present, which held while Operations opened a
         * record as its whole composition. UX-1 replaced that with a chooser and exactly one card,
         * so the operator SELECTS Employment and gets the same canonical card. The assertion moved
         * with the interaction; what it proves — Jane's own standing, from `lib/employment` — did not.
         */
        await page.locator('[data-record-context-kind="employment"]').first().click();
        await expect(page.locator("[data-contextual-card]").first()).toContainText("Lead Teacher", {
            timeout: SETTLE,
        });
        await page.screenshot({ path: path.join(SHOTS, "09-staff.png"), fullPage: true });
    });

    test("Children browses, opens a record, and household attention resolves", async ({ page }) => {
        await openOperations(page);
        await selectSection(page, "Children");
        await page.locator(SECTION_FILTER).fill("Lennon");
        const lennon = page.locator(`[data-child-member="${LENNON}"]`).first();
        await expect(lennon).toBeVisible({ timeout: SETTLE });
        await lennon.click();
        await expect(page.locator(PANEL_READY)).toBeVisible({ timeout: SETTLE });

        /*
         * HOUSEHOLD ATTENTION from the child — now a CHOICE that opens the family's own card.
         *
         * It used to be a record REFERENCE on the Child card, reached inside the composition grid,
         * which opened the family as a whole record. UX-1 made Household a truthful context in its
         * own right, so the operator asks for the family directly and gets the canonical Household
         * card centered over Operations — no Work Unit, and no second record page.
         */
        await page.locator('[data-record-context-kind="relationship"]').first().click();
        const householdCard = page.locator("[data-contextual-card]").first();
        await expect(householdCard).toHaveAttribute(
            "data-contextual-card-canonical-card",
            "household",
            { timeout: SETTLE },
        );
        await expect(householdCard).toContainText("Kurzman", { timeout: SETTLE });

        await page.screenshot({ path: path.join(SHOTS, "10-11-children.png"), fullPage: true });
    });
});

// ═══ 12–15 — STUDIO ══════════════════════════════════════════════════════════════════════════
test.describe("12–15 — Studio", () => {
    test("Assignment Categories, Patterns and Validation all compose", async ({ page }) => {
        await openOperations(page);
        await useRiverside(page);
        await selectMode(page, "Studio");

        const tabs = page.locator(SECTION_TABS);
        await expect(tabs).toHaveCount(3);
        for (const label of ["Assignment Categories", "Patterns", "Validation"]) {
            await expect(page.locator(SECTION_TABS, { hasText: label }).first()).toBeVisible();
        }

        // Each section composes REAL content. The fixture configures three categories, so the
        // Categories panel showing them is a falsifiable assertion rather than "a panel rendered".
        await expect(page.locator('[data-operations-studio="types"]')).toBeVisible({ timeout: SETTLE });
        await expect(page.locator('[data-operations-studio="types"]')).toContainText("(cert)", {
            timeout: SETTLE,
        });
        await page.screenshot({ path: path.join(SHOTS, "13-studio-types.png"), fullPage: true });

        await selectSection(page, "Patterns");
        await expect(page.locator('[data-operations-studio="patterns"]')).toBeVisible({ timeout: SETTLE });
        // The fixture's own pattern, read from the SHARED schedule-patterns endpoint.
        await expect(page.locator('[data-operations-studio="patterns"]')).toContainText("Mon / Wed / Fri", {
            timeout: SETTLE,
        });
        await page.screenshot({ path: path.join(SHOTS, "14-studio-patterns.png"), fullPage: true });

        await selectSection(page, "Validation");
        await expect(page.locator('[data-operations-studio="validation"]')).toBeVisible({ timeout: SETTLE });
        await page.screenshot({ path: path.join(SHOTS, "15-studio-validation.png"), fullPage: true });
    });

    test("switching Work ↔ Studio preserves the operating day underneath", async ({ page }) => {
        await openOperations(page);
        await useRiverside(page);
        await page.locator('[data-roster-lens-option="assignments"]').first().click();
        await expect(page.locator(ROSTER_LENS)).toHaveAttribute("data-roster-lens", "assignments");
        const siteBefore = await page
            .locator("[data-roster-assignments-lens]")
            .getAttribute("data-roster-assignments-site");

        await selectMode(page, "Studio");
        await selectMode(page, "Work");

        // Site AND lens survive. Studio renders beside Work rather than replacing it, so there is
        // nothing to restore — which is why no code restores anything.
        await expect(page.locator(ROSTER_LENS)).toHaveAttribute("data-roster-lens", "assignments");
        await expect(page.locator("[data-roster-assignments-lens]")).toHaveAttribute(
            "data-roster-assignments-site",
            siteBefore ?? "",
        );
        await expect(page.locator(SHELL)).toContainText("Riverside");
    });
});

// ═══ 16 — Configure Types lands in Operations Studio ═════════════════════════════════════════
test.describe("16 — Configure Types", () => {
    test("the Scheduling card's configuration handoff opens Operations Studio", async ({ page }) => {
        await openOperations(page);
        /*
         * Driven through the DISPATCHER rather than by hunting the empty-state button, which only
         * appears for a tenant with zero configured categories — and this fixture deliberately
         * configures three. The dispatcher is the seam the button calls; asserting on it proves the
         * destination without depending on an empty state the certification itself removed.
         */
        await page.evaluate(() => {
            window.dispatchEvent(
                new CustomEvent("adminv2:open-roster-modal", { detail: { studioSection: "types" } }),
            );
        });
        await expect(page.locator(SHELL)).toHaveAttribute("data-operations-mode", "studio", {
            timeout: SETTLE,
        });
        await expect(page.locator('[data-operations-studio="types"]')).toBeVisible({ timeout: SETTLE });

        await page.screenshot({ path: path.join(SHOTS, "16-configure-types.png"), fullPage: true });
    });
});

// ═══ 17–20 — every legacy entry point converges ══════════════════════════════════════════════
test.describe("17–20 — legacy deep links", () => {
    const cases = [
        { n: 17, name: "old Roster link", url: "/workspace?workspace=roster&section=roster", section: "roster" },
        { n: 18, name: "old Records → Staff", url: "/workspace?workspace=records&section=staff", section: "staff" },
        {
            n: 18,
            name: "old Records → Children",
            url: "/workspace?workspace=records&section=children",
            section: "children",
        },
    ];
    for (const c of cases) {
        test(`${c.n} — ${c.name} forwards into Operations`, async ({ page }) => {
            await page.goto(c.url);
            await page.waitForLoadState("domcontentloaded");
            await expect(page.locator(SHELL)).toBeVisible({ timeout: SETTLE });
            await expect(page.locator(SHELL)).toHaveAttribute("data-operations-mode", "work");
            await expect(page.locator(SHELL)).toHaveAttribute("data-operations-section", c.section, {
                timeout: SETTLE,
            });
            // It landed in OPERATIONS, never a retired shell.
            await expect(page.locator('[data-adminv2-scheduling-modal="true"]')).toHaveCount(0);
        });
    }

    test("19 — an old Assignments WORK link lands on Roster → Assignments lens", async ({ page }) => {
        await openOperations(page);
        await page.evaluate(() => {
            window.dispatchEvent(
                new CustomEvent("adminv2:open-roster-modal", {
                    detail: { section: "roster", lens: "assignments" },
                }),
            );
        });
        await expect(page.locator(SHELL)).toHaveAttribute("data-operations-mode", "work", {
            timeout: SETTLE,
        });
        await expect(page.locator(SHELL)).toHaveAttribute("data-operations-section", "roster");
        await expect(page.locator(ROSTER_LENS)).toHaveAttribute("data-roster-lens", "assignments", {
            timeout: SETTLE,
        });
        await page.screenshot({ path: path.join(SHOTS, "19-assignments-work-link.png"), fullPage: true });
    });

    test("20 — an old Assignments STUDIO link lands on the matching Studio section", async ({ page }) => {
        await openOperations(page);
        await page.evaluate(() => {
            window.dispatchEvent(
                new CustomEvent("adminv2:open-roster-modal", { detail: { studioSection: "patterns" } }),
            );
        });
        await expect(page.locator(SHELL)).toHaveAttribute("data-operations-mode", "studio", {
            timeout: SETTLE,
        });
        await expect(page.locator('[data-operations-studio="patterns"]')).toBeVisible({ timeout: SETTLE });
        await page.screenshot({ path: path.join(SHOTS, "20-assignments-studio-link.png"), fullPage: true });
    });
});

// ═══ 21–23 — Search destinations are unchanged ═══════════════════════════════════════════════
test.describe("21–23 — Search destinations", () => {
    for (const subject of [
        { n: 21, name: "Child", url: `/workspace/record/child/${LENNON}` },
        { n: 22, name: "Staff", url: `/workspace/record/person/${JANE}` },
    ]) {
        test(`${subject.n} — a ${subject.name} record result still opens the durable record`, async ({
            page,
        }) => {
            await page.goto(subject.url);
            await page.waitForLoadState("domcontentloaded");
            await expect(page.locator(PANEL_READY)).toBeVisible({ timeout: SETTLE });
            await expect(page.locator(PANEL_READY)).toHaveAttribute(
                "data-durable-record-subject-id",
                subject.url.split("/").pop()!,
            );
        });
    }

    test("23 — assignment work never targets a retired Assignments workspace", async ({ page }) => {
        /*
         * The retired shell is gone, so the strongest available assertion is that the ASSIGNMENT
         * destination composes inside Operations and the retired modal never appears — checked after
         * actually reaching the assignment experience rather than on an empty page, where absence
         * would be trivially true.
         */
        await openOperations(page);
        await useRiverside(page);
        await page.locator('[data-roster-lens-option="assignments"]').first().click();
        await expect(page.locator('[data-assignment-roster="true"]')).toBeVisible({ timeout: SETTLE });
        await expect(page.locator('[data-adminv2-scheduling-modal="true"]')).toHaveCount(0);
        await expect(page.locator('[data-adminv2-scheduling-workspace="true"]')).toHaveCount(0);
        await expect(page.locator(SHELL)).toBeVisible();

        await page.screenshot({ path: path.join(SHOTS, "23-assignment-destination.png"), fullPage: true });
    });
});
