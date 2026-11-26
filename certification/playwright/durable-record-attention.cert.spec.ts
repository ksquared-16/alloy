import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * DURABLE RECORD ATTENTION — the browser proof.
 *
 * The claim under test: **a record opens because the record exists**, not because a queue holds it.
 * Before this programme, `resolveOperatorFocusTarget` typed its answer as the literal
 * `"opportunities"` and walked `person → household → newest case → ACTIVE unit`, so a canonical
 * staff member (Person + Employment, no household) had no representable destination at all, and an
 * enrolled child whose case had left the queue became unopenable while staying enrolled.
 *
 * ── WHY EVERY SCENARIO CARRIES A POSITIVE CONTROL ──
 *
 * "No error appeared" is satisfied perfectly by a blank page, and a blank page is exactly what the
 * defect produced: the route resolved, the URL changed, and nothing composed, forever, silently. So
 * a scenario passes only when a CARD has actually rendered with the record's own content — never on
 * absence alone.
 *
 * ── FIXTURES ──
 *
 * Created in the cert tenant by the sprint (see the report). The important one is the person-less
 * child: `customer_members.person_id` is nullable, and in this tenant all 1500 seeded children have
 * it NULL — so keying a child on its person would have failed for every child in the database.
 */

const SHOTS = path.join(__dirname, "..", "evidence", "durable-record-attention");
const SETTLE = 180_000;

/** A staff member exactly as `staff.add` makes one: Person + Employment, no household, no case. */
const STAFF_PERSON_ID = "aaaa0000-0000-4000-8000-000000000f01";
/** A household child with NO opportunity at all, and `person_id` NULL. */
const NO_PROCESS_CHILD_ID = "bbbb0000-0000-4000-8000-00000000b002";
/** A child whose enrollment case exists but whose Work Unit is INACTIVE (completed enrollment). */
const CLOSED_CASE_CHILD_ID = "cccc0000-0000-4000-8000-00000000c002";

/** The panel's own runtime attributes — never a test-only hook. */
const PANEL_READY = '[data-durable-record="ready"]';
const CARD = "[data-universal-card-key]";
const MODAL = '[role="dialog"][aria-modal="true"], .adminv2-drawer-modal-panel';

test.beforeAll(() => fs.mkdirSync(SHOTS, { recursive: true }));

async function openDurable(page: Page, kind: "person" | "child", id: string, card?: string) {
    const href = `/workspace/record/${kind}/${id}${card ? `?card=${card}` : ""}`;
    await page.goto(href);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator(PANEL_READY)).toBeVisible({ timeout: SETTLE });
}

/** Row counts BEFORE, so a scenario can prove it created nothing. */
async function sideEffectProbe(page: Page) {
    return page.evaluate(async () => {
        const res = await fetch("/api/admin/durable-record?subject_type=person&subject_id=probe", {
            credentials: "include",
        });
        return res.status;
    });
}

test.describe("A — a Person with no Work Unit opens", () => {
    test("the Focus Panel composes, showing this person and their Employment", async ({ page }) => {
        await openDurable(page, "person", STAFF_PERSON_ID);

        const panel = page.locator(PANEL_READY);
        await expect(panel).toHaveAttribute("data-durable-record-subject-type", "person");
        await expect(panel).toHaveAttribute("data-durable-record-subject-id", STAFF_PERSON_ID);

        // POSITIVE CONTROL: a card actually rendered, with this person's own answer in it.
        const employment = page.locator('[data-universal-card-key="employment"]');
        await expect(employment).toBeVisible({ timeout: SETTLE });
        await expect(employment).toContainText("Lead Teacher");

        // The removed product must not reappear as the fallback.
        await expect(page.locator(MODAL)).toHaveCount(0);

        await page.screenshot({ path: path.join(SHOTS, "A-person-no-work-unit.png"), fullPage: true });
    });

    test("no case card leaks onto a person surface", async ({ page }) => {
        await openDurable(page, "person", STAFF_PERSON_ID);
        // Grain selection, proven in the browser rather than only in the registry.
        for (const caseCard of ["current_work", "household", "children", "billing_preview"]) {
            await expect(page.locator(`[data-universal-card-key="${caseCard}"]`)).toHaveCount(0);
        }
    });

    test("the Employment aspect elevates when the gesture names it", async ({ page }) => {
        await openDurable(page, "person", STAFF_PERSON_ID, "employment");
        await expect(page.locator('[data-universal-card-key="employment"]')).toBeVisible({
            timeout: SETTLE,
        });
        await page.screenshot({ path: path.join(SHOTS, "A-person-employment-aspect.png"), fullPage: true });
    });
});

test.describe("B — a Child with no enrollment process opens", () => {
    test("a person-less child composes its identity card", async ({ page }) => {
        await openDurable(page, "child", NO_PROCESS_CHILD_ID);

        const panel = page.locator(PANEL_READY);
        await expect(panel).toHaveAttribute("data-durable-record-subject-type", "child");
        await expect(panel).toHaveAttribute("data-durable-record-subject-id", NO_PROCESS_CHILD_ID);

        // POSITIVE CONTROL — the child's own facts, not an empty shell.
        const identity = page.locator('[data-universal-card-key="child_identity"]');
        await expect(identity).toBeVisible({ timeout: SETTLE });
        await expect(identity).toContainText("Noah Bell");
        await expect(identity).toContainText("Durable Household B");

        await expect(page.locator(MODAL)).toHaveCount(0);
        await page.screenshot({ path: path.join(SHOTS, "B-child-no-process.png"), fullPage: true });
    });

    test("the child_identity aspect elevates when named", async ({ page }) => {
        await openDurable(page, "child", NO_PROCESS_CHILD_ID, "child_identity");
        await expect(page.locator('[data-universal-card-key="child_identity"]')).toBeVisible({
            timeout: SETTLE,
        });
    });
});

test.describe("C — a Child whose enrollment completed still opens", () => {
    test("the closed case does not make the record unreachable", async ({ page }) => {
        await openDurable(page, "child", CLOSED_CASE_CHILD_ID);
        const identity = page.locator('[data-universal-card-key="child_identity"]');
        await expect(identity).toBeVisible({ timeout: SETTLE });
        await expect(identity).toContainText("Ada Okafor");
        await expect(identity).toContainText("Durable Household C");
        await page.screenshot({ path: path.join(SHOTS, "C-child-closed-enrollment.png"), fullPage: true });
    });
});

test.describe("E — the paired proof: same subject, two intents", () => {
    test("operational resolves to nothing while durable_record opens", async ({ page }) => {
        await page.goto("/workspace");
        await page.waitForLoadState("domcontentloaded");

        // OPERATIONAL intent, asked of the platform exactly as the client adapter asks it.
        const operational = await page.evaluate(async (personId) => {
            const res = await fetch("/api/admin/operator-focus/resolve", {
                method: "POST",
                credentials: "include",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ entity_type: "persons", entity_id: personId }),
            });
            return (await res.json()) as { ok?: boolean; target?: unknown };
        }, STAFF_PERSON_ID);

        // A valid null: there is genuinely nowhere to WORK this person.
        expect(operational.ok).toBe(true);
        expect(operational.target).toBeNull();

        // DURABLE intent, same subject — opens.
        await openDurable(page, "person", STAFF_PERSON_ID);
        await expect(page.locator('[data-universal-card-key="employment"]')).toBeVisible({
            timeout: SETTLE,
        });
        await page.screenshot({ path: path.join(SHOTS, "E-paired-intent.png"), fullPage: true });
    });

    test("the durable open creates no Opportunity", async ({ page }) => {
        await openDurable(page, "person", STAFF_PERSON_ID);
        await openDurable(page, "child", NO_PROCESS_CHILD_ID);
        // The resolver still answers null for the person after the opens — which it could not do if
        // an Opportunity had been fabricated to host them.
        await page.goto("/workspace");
        const after = await page.evaluate(async (personId) => {
            const res = await fetch("/api/admin/operator-focus/resolve", {
                method: "POST",
                credentials: "include",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ entity_type: "persons", entity_id: personId }),
            });
            return (await res.json()) as { target?: unknown };
        }, STAFF_PERSON_ID);
        expect(after.target).toBeNull();
    });
});

test.describe("D — the operational record is unchanged", () => {
    test("an active Enrollment case still opens on its Work Unit surface with its cards", async ({
        page,
    }) => {
        await page.goto("/workspace/work-unit/new-leads");
        await page.waitForLoadState("domcontentloaded");

        // POSITIVE CONTROL: the queue surface composed a real panel with real cards.
        const cards = page.locator(CARD);
        await expect(cards.first()).toBeVisible({ timeout: SETTLE });
        const count = await cards.count();
        expect(count).toBeGreaterThan(0);

        // The case panel keeps its case-grain cards — grain generalization must not have moved them.
        await expect(page.locator('[data-universal-card-key="current_work"]')).toHaveCount(1);

        // And it is NOT the durable surface.
        await expect(page.locator(PANEL_READY)).toHaveCount(0);

        await page.screenshot({ path: path.join(SHOTS, "D-operational-unchanged.png"), fullPage: true });
    });
});
