/**
 * THE CANONICAL OPERATOR PATH, MOUNTED — workspace → Work View → Opportunity → Focus Panel →
 * Financials card.
 *
 * This is the proof every previous Financials thread had to do without. The card mounts on an
 * opportunity Focus Panel, and the certification tenant could not produce one: the representative
 * seed aborted on a retired permission catalog, and once that was fixed the Work View still refused
 * to render because a stage that had deliberately declared `execution_mode: "outcome_led"` was read
 * as offering "no reachable primary action" — and one inoperable stage refuses the WHOLE view,
 * taking every queue row and every selectable subject with it.
 *
 * Nothing here is a fixture page or a direct card route. Every step is the product's own navigation:
 *
 *   M1  the workspace loads for the authenticated operator
 *   M2  the representative Work View renders instead of a configuration refusal
 *   M3  queue rows materialize
 *   M4  a representative Opportunity is selectable, and selecting it is honoured
 *   M5  the Focus Panel mounts for that subject
 *   M6  the real Financials card mounts in the DOM
 */
import { expect, test } from "@playwright/test";

const WORK_VIEW = "/workspace/work-unit/new-leads";

test.describe("workspace → work view → focus panel → financials card", () => {
    test("the canonical path mounts the real Financials card", async ({ page }) => {
        // ── M1 · THE WORKSPACE ───────────────────────────────────────────────────────────────────
        await page.goto(WORK_VIEW);
        await page.waitForLoadState("domcontentloaded");
        // Cold Turbopack compile plus the provisioning answer; generous, and asserted on afterwards.
        await page.waitForTimeout(45_000);

        const bodyText = async () => (await page.locator("body").innerText().catch(() => "")) || "";

        // ── M2 · THE WORK VIEW RENDERS, RATHER THAN REFUSING ─────────────────────────────────────
        const text = await bodyText();
        expect(text, "the Work View must not refuse its own configuration").not.toContain(
            "can’t be shown until its configuration is fixed",
        );
        expect(text).not.toContain("offers no reachable primary action");

        // ── M3 · QUEUE ROWS MATERIALIZE ──────────────────────────────────────────────────────────
        // The product's own queue row: a WU.QUEUE_ROW control carrying the opportunity it opens.
        const rows = page.locator('[data-entity-type="opportunity"][data-entity-id]');
        await expect(rows.first(), "the queue must materialize at least one row").toBeVisible({
            timeout: 60_000,
        });
        expect(await rows.count()).toBeGreaterThan(0);
        const subjectId = await rows.first().getAttribute("data-entity-id");
        expect(subjectId, "the row must name the opportunity it opens").toBeTruthy();

        // ── M4 · SELECT A REPRESENTATIVE OPPORTUNITY ─────────────────────────────────────────────
        await rows.first().click();
        await page.waitForTimeout(25_000);
        // Selection is honoured by the ROUTE, not merely by the absence of a refusal.
        await expect(page).toHaveURL(new RegExp(`subject_id=${subjectId}`));
        const afterSelect = await bodyText();
        expect(afterSelect, "selecting a queued subject must be honoured").not.toContain(
            "isn’t in this Work View",
        );

        // ── M5 · THE FOCUS PANEL MOUNTS ──────────────────────────────────────────────────────────
        expect(afterSelect, "the record pane must hold a record").not.toContain(
            "The record you open appears here",
        );
        // Positively: the panel's own cards are present for this subject.
        expect(afterSelect).toContain("CHILDREN");
        expect(afterSelect).toContain("ATTENDANCE");

        // ── M6 · THE REAL FINANCIALS CARD MOUNTS ─────────────────────────────────────────────────
        // Asserted on what the card renders — its heading and the projection it composes — so the
        // proof survives a density that publishes no data attribute.
        expect(afterSelect, "the Financials card must mount in the Focus Panel").toContain("FINANCIALS");
        expect(afterSelect, "the card must render its authoritative projection").toContain(
            "Current balance",
        );
        expect(afterSelect).toContain("Responsibility");
        // And its already-certified commands are reachable from the mounted card.
        expect(afterSelect).toContain("Add charge");
        expect(afterSelect).toContain("Details");
    });
});
