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
const CHILD_IN_PROCESS = "Ivy Nair";     // active participation
const CHILD_ENROLLED = "Leo Nair";       // completed participation

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
        for (const name of [CHILD_NO_PROCESS, CHILD_CLOSED, CHILD_IN_PROCESS, CHILD_ENROLLED]) {
            expect(text, `All Children must contain ${name}`).toContain(name);
        }
        await page.screenshot({ path: path.join(SHOTS, "06-children-all.png"), fullPage: true });
    });

    test("Enrolled and In Process are participation subsets, not the whole list", async ({ page }) => {
        await openRecords(page, "children");

        await selectCohort(page, "enrolled");
        const enrolled = await rowTexts(page, CHILDREN_LIST);
        expect(enrolled).toContain(CHILD_ENROLLED);
        expect(enrolled).not.toContain(CHILD_NO_PROCESS);
        expect(enrolled).not.toContain(CHILD_IN_PROCESS);

        await selectCohort(page, "in_process");
        const inProcess = await rowTexts(page, CHILDREN_LIST);
        expect(inProcess).toContain(CHILD_IN_PROCESS);
        expect(inProcess).not.toContain(CHILD_ENROLLED);
        expect(inProcess).not.toContain(CHILD_NO_PROCESS);

        await page.screenshot({ path: path.join(SHOTS, "07-children-in-process.png"), fullPage: true });
    });

    test("a person-less Child row opens the durable record", async ({ page }) => {
        await openRecords(page, "children");
        await selectCohort(page, "all");
        await page.locator(`[data-child-member="${CHILD_NO_PROCESS_MEMBER_ID}"]`).click();

        const panel = page.locator(DURABLE_PANEL);
        await expect(panel).toBeVisible({ timeout: SETTLE });
        await expect(panel).toHaveAttribute("data-durable-record-subject-type", "child");
        // Keyed by the MEMBER — the id a person-keyed surface could never have produced.
        await expect(panel).toHaveAttribute("data-durable-record-subject-id", CHILD_NO_PROCESS_MEMBER_ID);
        await expect(page.locator('[data-universal-card-key="child_identity"]')).toContainText(CHILD_NO_PROCESS);

        await page.screenshot({ path: path.join(SHOTS, "08-child-record-open.png"), fullPage: true });
    });

    test("Add Child is NOT offered — it is held back until identity resolution is safe", async ({ page }) => {
        await openRecords(page, "children");
        await expect(page.getByRole("button", { name: /add child/i })).toHaveCount(0);
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
