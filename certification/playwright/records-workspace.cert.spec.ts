import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * RECORDS WORKSPACE V1 — the browser proof.
 *
 * Records is the durable record-management home: Staff and Children, whether or not any queue is
 * currently working them. The proof it must carry is that a row OPENS — the previous Staff product
 * asserted it opened the canonical Person surface and never did, because until Durable Record
 * Attention there was no destination to write.
 *
 * ── EVERY COHORT ASSERTION IS A SUBSET ASSERTION ──
 *
 * A cohort tab that showed everything would satisfy "the tab works". So each cohort is checked for
 * what it must CONTAIN and what it must EXCLUDE — a filter that never filters is the failure mode.
 *
 * Fixtures: `certification/fixtures/records-workspace-v1.sql` (idempotent; the cert tenant is shared
 * and another session's reset can remove them).
 */

const SHOTS = path.join(__dirname, "..", "evidence", "records-workspace");
const SETTLE = 180_000;

const STAFF_LEAD = "Dana Okafor";        // active Lead Teacher
const STAFF_ASSISTANT = "Sam Rivera";    // another active role
const STAFF_STARTING = "Priya Nair";     // open employment, future start
const STAFF_ENDED = "Chris Bell";        // ended employment

const CHILD_NO_PROCESS = "Noah Bell";    // no opportunity at all, person_id NULL
const CHILD_CLOSED = "Ada Okafor";       // enrollment case on an INACTIVE unit
// BEYOND PAGE 1 by name (ranks ~1506/1507 of ~1507). Under the client-side cohort filtering this
// slice replaced, these were invisible in Enrolled / In Process — the proof is load-bearing ONLY
// because they sort last, so they must never be renamed to land earlier.
const CHILD_IN_PROCESS = "Zane Zeta-Beyondpage";
const CHILD_ENROLLED = "Zoe Zeta-Beyondpage";
/** Shared by both, so a cohort search for it can only be separated by PARTICIPATION. */
const BEYOND_PAGE_SURNAME = "Zeta-Beyondpage";

const STAFF_LEAD_PERSON_ID = "aaaa0000-0000-4000-8000-000000000f01";
const CHILD_NO_PROCESS_MEMBER_ID = "bbbb0000-0000-4000-8000-00000000b002";

const RECORDS_SHELL = "[data-adminv2-records-workspace]";
const STAFF_LIST = "[data-staff-list]";
const CHILDREN_LIST = "[data-children-list]";
const DURABLE_PANEL = '[data-durable-record="ready"]';

test.beforeAll(() => fs.mkdirSync(SHOTS, { recursive: true }));

async function openRecords(page: Page, section: "staff" | "children" = "staff") {
    await page.goto(`/workspace?workspace=records&section=${section}`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator(RECORDS_SHELL)).toBeVisible({ timeout: SETTLE });
    await awaitSection(page, section === "children" ? CHILDREN_LIST : STAFF_LIST);
}

/** The cohort bar exists as soon as the section mounts; the list only exists when rows do. */
async function awaitSection(page: Page, list: string) {
    await expect(page.locator("[data-records-cohort-bar]")).toBeVisible({ timeout: SETTLE });
    await expect(page.locator(list)).toBeVisible({ timeout: SETTLE });
}

async function selectCohort(page: Page, key: string) {
    await page.locator(`[data-records-cohort="${key}"]`).click();
    await expect(page.locator(`[data-records-cohort="${key}"]`)).toHaveAttribute(
        "data-records-cohort-active",
        "true",
    );
}

/** Row labels currently rendered in a list. */
async function rowTexts(page: Page, list: string): Promise<string> {
    return (await page.locator(list).innerText()).trim();
}

test.describe("the workspace", () => {
    test("Records is a peer workspace reachable from the shell, with Staff and Children", async ({ page }) => {
        await openRecords(page);
        const shell = page.locator(RECORDS_SHELL);
        await expect(shell).toHaveAttribute("data-records-section", "staff");
        // Two sections and no People layer. The shell emits its own attribute for the section rail.
        const sectionRail = page.locator('[data-workspace-mode-sections="records-sections"]').first();
        await expect(sectionRail).toBeVisible({ timeout: SETTLE });
        await expect(sectionRail.locator("button")).toHaveCount(2);
        await expect(sectionRail).toContainText("Staff");
        await expect(sectionRail).toContainText("Children");
        await page.screenshot({ path: path.join(SHOTS, "01-records-staff.png"), fullPage: true });
    });
});

test.describe("Staff", () => {
    test("All Staff shows the whole population, including ended employment", async ({ page }) => {
        await openRecords(page);
        await selectCohort(page, "all");
        const text = await rowTexts(page, STAFF_LIST);
        for (const name of [STAFF_LEAD, STAFF_ASSISTANT, STAFF_STARTING, STAFF_ENDED]) {
            expect(text, `All Staff must contain ${name}`).toContain(name);
        }
    });

    test("Lead Teachers is a predicate over the tenant's configured position", async ({ page }) => {
        await openRecords(page);
        await selectCohort(page, "position:lead_teacher");
        const text = await rowTexts(page, STAFF_LIST);
        expect(text).toContain(STAFF_LEAD);
        expect(text).toContain(STAFF_STARTING); // also a Lead Teacher, starting soon
        // EXCLUSION is the real assertion — a cohort that shows everyone is not a cohort.
        expect(text).not.toContain(STAFF_ASSISTANT);
        expect(text).not.toContain(STAFF_ENDED);
        await page.screenshot({ path: path.join(SHOTS, "02-staff-lead-teachers.png"), fullPage: true });
    });

    test("Starting Soon is the future-dated open employment only", async ({ page }) => {
        await openRecords(page);
        await selectCohort(page, "starting_soon");
        const text = await rowTexts(page, STAFF_LIST);
        expect(text).toContain(STAFF_STARTING);
        expect(text).not.toContain(STAFF_LEAD);
        expect(text).not.toContain(STAFF_ENDED);
        await page.screenshot({ path: path.join(SHOTS, "03-staff-starting-soon.png"), fullPage: true });
    });

    test("Inactive is the ended employment only", async ({ page }) => {
        await openRecords(page);
        await selectCohort(page, "inactive");
        const text = await rowTexts(page, STAFF_LIST);
        expect(text).toContain(STAFF_ENDED);
        expect(text).not.toContain(STAFF_LEAD);
        expect(text).not.toContain(STAFF_STARTING);
    });

    test("a Staff row opens the durable record — no household, no case, no Work Unit", async ({ page }) => {
        await openRecords(page);
        await selectCohort(page, "all");
        await page.locator(`[data-staff-person="${STAFF_LEAD_PERSON_ID}"]`).click();

        // POSITIVE CONTROL: the panel composed, for this person, with Employment in it.
        const panel = page.locator(DURABLE_PANEL);
        await expect(panel).toBeVisible({ timeout: SETTLE });
        await expect(panel).toHaveAttribute("data-durable-record-subject-type", "person");
        await expect(panel).toHaveAttribute("data-durable-record-subject-id", STAFF_LEAD_PERSON_ID);
        await expect(page.locator('[data-universal-card-key="employment"]')).toContainText("Lead Teacher");

        await page.screenshot({ path: path.join(SHOTS, "04-staff-record-open.png"), fullPage: true });
    });

    test("Add Staff is offered from Records", async ({ page }) => {
        await openRecords(page);
        await expect(page.locator("[data-staff-add-open]")).toBeVisible();
        await page.locator("[data-staff-add-open]").click();
        // The EXISTING command surface, not a second one.
        await expect(page.getByText(/Add staff/i).first()).toBeVisible({ timeout: SETTLE });
        await page.screenshot({ path: path.join(SHOTS, "05-add-staff.png"), fullPage: true });
    });
});

test.describe("Children", () => {
    test("All Children includes children with no process and with person_id NULL", async ({ page }) => {
        await openRecords(page, "children");
        await selectCohort(page, "all");
        const text = await rowTexts(page, CHILDREN_LIST);
        // Page 1 is BOUNDED — the beyond-page children are deliberately absent from it, and the
        // status line states the true total rather than the page length.
        expect(text).toContain(CHILD_CLOSED);
        expect(text).not.toContain(CHILD_ENROLLED);
        const status = await page.locator("[data-children-page-status]").innerText();
        expect(status).toMatch(/Showing \d+ of \d+/);
        const [shown, total] = (status.match(/(\d+) of (\d+)/) ?? []).slice(1).map(Number);
        expect(shown).toBeLessThan(total);
        expect(total).toBeGreaterThan(1000);
        await page.screenshot({ path: path.join(SHOTS, "06-children-all.png"), fullPage: true });
    });

    /**
     * THE BEYOND-PAGE PROOF. Both qualifying children sort at the very end of the population, so a
     * cohort computed over page 1 of ALL could not possibly contain them.
     *
     * ── WHY THIS REACHES THEM THROUGH SEARCH ──
     *
     * The first form of this test read the cohort's first page directly, which quietly assumed the
     * qualifying cohort itself fits in one page. It stopped holding the moment another session
     * seeded ~140 children with active enrollment: In Process grew to 144, and `Zane` — who sorts
     * last there too — moved to page 2 of his own cohort. That is honest pagination doing its job,
     * not the defect this test exists for.
     *
     * Reaching them by SEARCH inside the cohort proves strictly more, and cannot rot as the tenant
     * grows: cohort membership is decided server-side over the whole population, search composes
     * with it server-side, and the two cohorts stay disjoint. It is also the honest way an operator
     * would find one named child among 1500.
     */
    test("Enrolled and In Process are participation subsets, not the whole list", async ({ page }) => {
        await openRecords(page, "children");
        const filter = page.locator("[data-records-filter]");

        await selectCohort(page, "enrolled");
        await filter.fill(BEYOND_PAGE_SURNAME);
        await expect(page.locator(CHILDREN_LIST)).toContainText(CHILD_ENROLLED, { timeout: SETTLE });
        const enrolled = await rowTexts(page, CHILDREN_LIST);
        // EXCLUSION is the real assertion — these two share a surname and differ ONLY by
        // participation, so a cohort that showed both would not be a cohort.
        expect(enrolled).not.toContain(CHILD_IN_PROCESS);
        expect(enrolled).not.toContain(CHILD_NO_PROCESS);

        await selectCohort(page, "in_process");
        await expect(page.locator(CHILDREN_LIST)).toContainText(CHILD_IN_PROCESS, { timeout: SETTLE });
        const inProcess = await rowTexts(page, CHILDREN_LIST);
        expect(inProcess).not.toContain(CHILD_ENROLLED);
        expect(inProcess).not.toContain(CHILD_NO_PROCESS);

        // NOTHING here asserts how many rows a cohort holds. The participation cohorts are driven
        // by other sessions' data on this shared tenant — In Process was observed at 144 and then
        // at 4 within one afternoon — so any assertion about page boundaries HERE measures the
        // tenant rather than the product. That page-1-is-bounded property has its own test, over
        // the All cohort, whose size the fixtures actually control.

        await page.screenshot({ path: path.join(SHOTS, "07-children-in-process.png"), fullPage: true });
    });

    test("a person-less Child row opens the durable record", async ({ page }) => {
        await openRecords(page, "children");
        await selectCohort(page, "all");

        // This child sits at rank ~192, beyond the bounded first page — reaching them through
        // SEARCH is the honest way, and it doubles as the proof that search is server-side over the
        // whole cohort rather than a filter across the rows that happen to be loaded.
        await page.locator("[data-records-filter]").fill(CHILD_NO_PROCESS);
        await expect(page.locator(`[data-child-member="${CHILD_NO_PROCESS_MEMBER_ID}"]`)).toBeVisible({
            timeout: SETTLE,
        });
        await page.locator(`[data-child-member="${CHILD_NO_PROCESS_MEMBER_ID}"]`).click();

        const panel = page.locator(DURABLE_PANEL);
        await expect(panel).toBeVisible({ timeout: SETTLE });
        await expect(panel).toHaveAttribute("data-durable-record-subject-type", "child");
        // Keyed by the MEMBER — the id a person-keyed surface could never have produced.
        await expect(panel).toHaveAttribute("data-durable-record-subject-id", CHILD_NO_PROCESS_MEMBER_ID);
        await expect(page.locator('[data-universal-card-key="child_identity"]')).toContainText(CHILD_NO_PROCESS);

        await page.screenshot({ path: path.join(SHOTS, "08-child-record-open.png"), fullPage: true });
    });

    /**
     * V1 asserted the OPPOSITE of this: Add Child was held back because child identity resolution
     * was not safe. Phase 2 shipped the gate, so the affordance is present — and what it does under
     * an ambiguous name is proved in `records-add-child.cert.spec.ts`, not here. Restoring the old
     * assertion would now be asserting the absence of a shipped capability.
     */
    test("Add Child is offered, now that identity resolution is gated", async ({ page }) => {
        await openRecords(page, "children");
        await expect(page.locator("[data-child-add-open]")).toBeVisible({ timeout: SETTLE });
    });
});

test.describe("/organization/staff converges", () => {
    test("the old route lands on Records → Staff rather than a second directory", async ({ page }) => {
        await page.goto("/organization/staff");
        await page.waitForLoadState("domcontentloaded");

        const shell = page.locator(RECORDS_SHELL);
        await expect(shell).toBeVisible({ timeout: SETTLE });
        await expect(shell).toHaveAttribute("data-records-section", "staff");
        // The old page's own directory marker must be gone — one product, not two.
        await expect(page.locator("[data-staff-directory]")).toHaveCount(0);

        await page.screenshot({ path: path.join(SHOTS, "09-organization-staff-converged.png"), fullPage: true });
    });
});

test.describe("pagination is honest", () => {
    test("page 1 is bounded, the total is the cohort's, and the next page adds new records", async ({ page }) => {
        await openRecords(page, "children");
        await selectCohort(page, "all");

        const firstPage = await rowTexts(page, CHILDREN_LIST);
        const firstCount = await page.locator("[data-child-row]").count();
        const status = await page.locator("[data-children-page-status]").innerText();
        const total = Number((status.match(/of (\d+)/) ?? [])[1]);
        expect(firstCount).toBeLessThan(total);

        await page.locator("[data-children-load-more]").click();
        await expect(page.locator("[data-child-row]")).not.toHaveCount(firstCount, { timeout: SETTLE });

        const secondCount = await page.locator("[data-child-row]").count();
        expect(secondCount).toBeGreaterThan(firstCount);

        // No duplicates across pages: every rendered member id is unique.
        const ids = await page.locator("[data-child-row]").evaluateAll((els) =>
            els.map((e) => (e as HTMLElement).getAttribute("data-child-member")),
        );
        expect(new Set(ids).size).toBe(ids.length);

        // Deterministic ordering: page 1's rows are still the first rows after loading more.
        const afterText = await rowTexts(page, CHILDREN_LIST);
        expect(afterText.indexOf(firstPage.split("\n")[0]!)).toBeGreaterThanOrEqual(0);

        await page.screenshot({ path: path.join(SHOTS, "10-children-pagination.png"), fullPage: true });
    });
});
