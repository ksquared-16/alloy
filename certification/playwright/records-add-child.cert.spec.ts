import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * RECORDS PHASE 2 — ADD CHILD IS IDENTITY-SAFE.
 *
 * Records V1 shipped Children WITHOUT Add Child, because the existing child-create path resolved
 * ambiguous identity silently: an org-wide first/last-name `ilike`, first row wins, no operator
 * involved. Two Emma Chens became one child. This spec is the proof that the affordance can now
 * exist.
 *
 * ── THE LOAD-BEARING CASE IS THE AMBIGUOUS ONE ──
 *
 * A cert that only proves "Add Child adds a child" proves nothing about the defect — the old
 * silent path would pass it. The assertion that discriminates is `Emma Chen, no date of birth`
 * against two indistinguishable people: BOTH surface, the operator must choose, and NOTHING is
 * written before they do. Restore the `ilike` fallback and this file must fail.
 *
 * ── AND THAT ADD CHILD IS NOT CREATE LEAD ──
 *
 * Establishing a Child record creates no Opportunity, no `process_instances` row and no
 * `opportunity_customer_members` bridge. The UI proof is the new child's own state chip reading
 * "On record" — a child the platform holds with no process at all. Org-wide row deltas are
 * bracketed with psql around the run; @see certification/fixtures/records-workspace-v1.sql.
 *
 * Fixtures: `certification/fixtures/records-workspace-v1.sql` (idempotent; the cert tenant is
 * SHARED and another session's reset can remove them mid-run).
 */

const SHOTS = path.join(__dirname, "..", "evidence", "records-workspace");
const SETTLE = 180_000;

const HOUSEHOLD = "Addchild Cert Household";
const HOUSEHOLD_ID = "dddd0000-0000-4000-8000-00000000d001";

/** The two indistinguishable people. Give either a DOB or a contact detail and the proof dies. */
const EMMA_ONE_ID = "dddd0000-0000-4000-8000-00000000dd01";
const EMMA_TWO_ID = "dddd0000-0000-4000-8000-00000000dd02";
/** Exactly one person carries this name, so it is a REUSABLE single candidate. */
const REUSE_PERSON_ID = "dddd0000-0000-4000-8000-00000000dd03";
const REUSE_NAME = { first: "Juniper", last: "Reusewell" };

/**
 * A name nothing in the tenant shares, so "no candidates" is a real answer rather than an
 * artefact of a search that happened to miss. Suffixed per run so a re-run against a tenant that
 * was NOT reset still tests the create path instead of the reuse path.
 */
const NEW_SIBLING = { first: "Fennimore", last: `Newsibling-${Date.now().toString(36)}` };

const RECORDS_SHELL = "[data-adminv2-records-workspace]";
const CHILDREN_LIST = "[data-children-list]";
const DURABLE_PANEL = '[data-durable-record="ready"]';
const MODAL = "[data-add-child-modal]";

test.beforeAll(() => fs.mkdirSync(SHOTS, { recursive: true }));

async function openChildren(page: Page) {
    await page.goto("/workspace?workspace=records&section=children");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator(RECORDS_SHELL)).toBeVisible({ timeout: SETTLE });
    await expect(page.locator("[data-records-cohort-bar]")).toBeVisible({ timeout: SETTLE });
}

/** Steps 1–2: choose the household explicitly, then enter the child's details. */
async function openModalOnHousehold(page: Page, child: { first: string; last: string; dob?: string }) {
    await page.locator("[data-child-add-open]").click();
    await expect(page.locator(MODAL)).toBeVisible({ timeout: SETTLE });

    await page.locator("[data-add-child-household-search]").fill(HOUSEHOLD);
    await expect(page.locator(`[data-add-child-household="${HOUSEHOLD_ID}"]`)).toBeVisible({
        timeout: SETTLE,
    });
    await page.locator(`[data-add-child-household="${HOUSEHOLD_ID}"]`).click();
    await page.locator("[data-add-child-household-continue]").click();

    await page.locator('[data-add-child-field="first_name"]').fill(child.first);
    await page.locator('[data-add-child-field="last_name"]').fill(child.last);
    if (child.dob) await page.locator('[data-add-child-field="date_of_birth"]').fill(child.dob);
    await page.locator("[data-add-child-search]").click();
    await expect(page.locator(MODAL)).toHaveAttribute("data-add-child-step", "identity", {
        timeout: SETTLE,
    });
}

/**
 * Children of the Add Child household whose NAME matches `q`, read from the server the same way
 * the surface reads it.
 *
 * The search is over the child's own display name — it is not a household lookup, and asking it
 * for the household's name returns nothing. Each delta below therefore names the child it is
 * asserting about, which is also what makes the assertion specific rather than a population count
 * that another session's fixtures could move.
 */
async function householdChildrenNamed(page: Page, q: string): Promise<string[]> {
    const res = await page.request.get(
        `/api/admin/records/children?cohort=all&q=${encodeURIComponent(q)}`
    );
    const json = (await res.json()) as {
        children?: { displayName: string; householdId: string | null }[];
    };
    return (json.children ?? [])
        .filter((c) => c.householdId === HOUSEHOLD_ID)
        .map((c) => c.displayName);
}

test.describe("Add Child is offered from Records", () => {
    test("Children carries the affordance the identity gate was holding back", async ({ page }) => {
        await openChildren(page);
        await expect(page.locator("[data-child-add-open]")).toBeVisible({ timeout: SETTLE });
        await page.locator("[data-child-add-open]").click();
        await expect(page.locator(MODAL)).toBeVisible({ timeout: SETTLE });
        // Household FIRST — the household is chosen, never inferred from a name.
        await expect(page.locator(MODAL)).toHaveAttribute("data-add-child-step", "household");
        await page.screenshot({ path: path.join(SHOTS, "11-add-child-household.png"), fullPage: true });
    });

    test("the modal asks for record facts only — no enrollment intake", async ({ page }) => {
        await openChildren(page);
        await page.locator("[data-child-add-open]").click();
        await page.locator("[data-add-child-household-search]").fill(HOUSEHOLD);
        await page.locator(`[data-add-child-household="${HOUSEHOLD_ID}"]`).click();
        await page.locator("[data-add-child-household-continue]").click();

        const modal = page.locator(MODAL);
        await expect(modal.locator('[data-add-child-field="first_name"]')).toBeVisible();
        await expect(modal.locator('[data-add-child-field="date_of_birth"]')).toBeVisible();
        // EXCLUSION is the assertion. These belong to Enrollment; collecting them here would make
        // Add Child into Create Lead under a different label.
        const text = await modal.innerText();
        for (const forbidden of ["Requested days", "Start date", "Tuition", "Tour", "Program"]) {
            expect(text, `Add Child must not collect "${forbidden}"`).not.toContain(forbidden);
        }
        await page.screenshot({ path: path.join(SHOTS, "12-add-child-details.png"), fullPage: true });
    });
});

test.describe("the ambiguous Emma Chen", () => {
    test("BOTH candidates surface, the operator must choose, and nothing is written", async ({ page }) => {
        await openChildren(page);
        expect(await householdChildrenNamed(page, "Emma Chen")).toEqual([]);

        await openModalOnHousehold(page, { first: "Emma", last: "Chen" });

        // Both indistinguishable people are named. A surface that picked one — which is exactly
        // what the org-wide `ilike` fallback did — could not satisfy this.
        await expect(page.locator(`[data-add-child-candidate="${EMMA_ONE_ID}"]`)).toBeVisible({
            timeout: SETTLE,
        });
        await expect(page.locator(`[data-add-child-candidate="${EMMA_TWO_ID}"]`)).toBeVisible({
            timeout: SETTLE,
        });

        // The operator has decided nothing, so Preview is not reachable and the household is
        // unchanged. ZERO writes before the decision.
        await expect(page.locator("[data-add-child-preview]")).toBeDisabled();
        expect(await householdChildrenNamed(page, "Emma Chen")).toEqual([]);

        await page.screenshot({ path: path.join(SHOTS, "13-add-child-ambiguous.png"), fullPage: true });
    });

    test("create-new stays blocked until an explicit reason is given", async ({ page }) => {
        await openChildren(page);
        await openModalOnHousehold(page, { first: "Emma", last: "Chen" });

        await page.locator("[data-add-child-create-new]").check();
        // Overriding a real ambiguity is allowed, but never silently.
        await expect(page.locator("[data-add-child-preview]")).toBeDisabled();
        await page.locator("[data-add-child-create-reason]").fill("Different Emma Chen — confirmed by phone");
        await expect(page.locator("[data-add-child-preview]")).toBeEnabled();

        await page.screenshot({ path: path.join(SHOTS, "14-add-child-override.png"), fullPage: true });
    });
});

test.describe("a new sibling", () => {
    test("no candidates → explicit create → appears in Records → the durable record opens", async ({
        page,
    }) => {
        await openChildren(page);
        expect(await householdChildrenNamed(page, NEW_SIBLING.last)).toEqual([]);

        await openModalOnHousehold(page, { first: NEW_SIBLING.first, last: NEW_SIBLING.last, dob: "2022-05-05" });
        await expect(page.locator("[data-add-child-no-match]")).toBeVisible({ timeout: SETTLE });

        await page.locator("[data-add-child-preview]").click();
        const summary = page.locator("[data-add-child-preview-summary]");
        await expect(summary).toBeVisible({ timeout: SETTLE });
        // The preview states the separation before the operator commits to it.
        await expect(page.locator("[data-add-child-step-preview]")).toContainText(/no enrollment/i);

        await page.locator("[data-add-child-confirm]").click();
        await expect(page.locator("[data-add-child-done]")).toBeVisible({ timeout: SETTLE });
        expect(await householdChildrenNamed(page, NEW_SIBLING.last)).toEqual([
            `${NEW_SIBLING.first} ${NEW_SIBLING.last}`,
        ]);

        await page.screenshot({ path: path.join(SHOTS, "15-add-child-created.png"), fullPage: true });

        // ── The record OPENS. Records declares durable intent; the adapter owns the destination.
        await page.locator("[data-add-child-open-record]").click();
        const panel = page.locator(DURABLE_PANEL);
        await expect(panel).toBeVisible({ timeout: SETTLE });
        await expect(panel).toHaveAttribute("data-durable-record-subject-type", "child");
        await expect(page.locator('[data-universal-card-key="child_identity"]')).toContainText(
            NEW_SIBLING.first
        );

        await page.screenshot({ path: path.join(SHOTS, "16-add-child-record-open.png"), fullPage: true });
    });

    test("the new child has NO process — Add Child is not Start Enrollment", async ({ page }) => {
        await openChildren(page);
        await page.locator("[data-records-filter]").fill(NEW_SIBLING.last);
        const row = page.locator(`${CHILDREN_LIST} [data-child-row]`).first();
        await expect(row).toBeVisible({ timeout: SETTLE });

        // "On record" is the participation-free state. A fabricated Opportunity or process
        // instance — which is what making Add Child imply Create Lead would produce — would show
        // "In process" or "Enrolled" here instead.
        await expect(row.locator("[data-child-state]")).toHaveAttribute("data-child-state", "none");
        await expect(row).toContainText("On record");

        await page.screenshot({ path: path.join(SHOTS, "17-add-child-no-process.png"), fullPage: true });
    });
});

test.describe("existing identity is reused, never duplicated", () => {
    test("the single candidate is surfaced and reuse creates no second person", async ({ page }) => {
        await openChildren(page);

        await openModalOnHousehold(page, { first: REUSE_NAME.first, last: REUSE_NAME.last });
        const candidate = page.locator(`[data-add-child-candidate="${REUSE_PERSON_ID}"]`);
        await expect(candidate).toBeVisible({ timeout: SETTLE });
        await candidate.click();

        await page.locator("[data-add-child-preview]").click();
        // The preview says which of the two paths runs, so reuse is a decision and not a surprise.
        await expect(page.locator("[data-add-child-preview-summary]")).toContainText(/existing person/i);
        await page.locator("[data-add-child-confirm]").click();
        await expect(page.locator("[data-add-child-done]")).toBeVisible({ timeout: SETTLE });
        await expect(page.locator("[data-add-child-done]")).toContainText(/no second identity/i);

        await page.screenshot({ path: path.join(SHOTS, "18-add-child-reuse.png"), fullPage: true });
    });

    test("re-running the same reuse explains the existing relationship instead of adding another", async ({
        page,
    }) => {
        await openChildren(page);
        // The reuse above created exactly one membership. That is the number that must not move.
        expect(await householdChildrenNamed(page, REUSE_NAME.last)).toHaveLength(1);

        await openModalOnHousehold(page, { first: REUSE_NAME.first, last: REUSE_NAME.last });
        // Now that the person is a member here, the resolver reports the MEMBER — the durable
        // child subject — rather than the person a second time.
        const inHousehold = page.locator("[data-add-child-candidates]");
        await expect(inHousehold).toContainText(/already in this household/i, { timeout: SETTLE });

        await page.locator("[data-add-child-candidates] button").first().click();
        await page.locator("[data-add-child-preview]").click();
        await page.locator("[data-add-child-confirm]").click();
        await expect(page.locator("[data-add-child-done]")).toContainText(/nothing was duplicated/i, {
            timeout: SETTLE,
        });

        // The household did not grow: the relationship the operator asked for already existed.
        expect(await householdChildrenNamed(page, REUSE_NAME.last)).toHaveLength(1);

        await page.screenshot({ path: path.join(SHOTS, "19-add-child-already-member.png"), fullPage: true });
    });
});
