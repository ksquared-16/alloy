/**
 * THE SHARED WORKSPACE CHROME, IN EVERY WORKSPACE THAT WEARS IT.
 *
 * The repair this proves was made in shared primitives, so proving it in one workspace would
 * prove nothing about the others — and the failure it fixes (a control band that grew a second
 * row, or a site filter collapsed to a bare chevron) is exactly the kind that appears in one
 * module and goes unnoticed in the rest.
 *
 * Four properties, in each workspace:
 *
 *   1. Expand is gone. Not hidden — absent, along with the second layout it used to switch to.
 *   2. Close is present, readable, and never squeezed out of reach.
 *   3. The header band is ONE LINE: the action rail's controls all share a row.
 *   4. Where a site filter exists, its trigger is wide enough to read and does not wrap.
 *
 * The band-height assertions are geometric on purpose. "Does not wrap" is not a class name an
 * operator can see; it is whether two controls sit on the same line, and that is measurable.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

const HOME = "/workspace/work-unit/new-leads";

/** Every workspace hosted in the shared BOS modal shell, by its left-navigation marker. */
const WORKSPACES = [
    { key: "processing", label: "Processing", modal: "adminv2-processing-modal" },
    { key: "inbox", label: "Communications", modal: "adminv2-inbox-modal" },
    { key: "operations", label: "Operations", modal: "adminv2-operations-modal" },
    { key: "tasks", label: "Work Items", modal: "adminv2-tasks-modal" },
    { key: "financials", label: "Financials", modal: "adminv2-financials-modal" },
] as const;

async function landOnShell(page: Page) {
    await page.goto(HOME);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(35_000);
}

async function openWorkspace(page: Page, key: string, modal: string): Promise<Locator> {
    const navItem = page.locator(`[data-adminv2-sidebar-modal-nav="${key}"]`);
    await expect(navItem, `${key} must appear in the left navigation`).toBeVisible({ timeout: 60_000 });
    await navItem.click();
    const panel = page.locator(`[data-adminv2-bos-modal="${modal}"]`);
    await expect(panel, `${key} must open its workspace panel`).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(4_000);
    return panel;
}

async function closeWorkspace(page: Page, panel: Locator) {
    const close = panel.locator('[data-operational-modal-header-actions="true"] button').last();
    await close.click();
    await page.waitForTimeout(2_500);
}

test.describe("shared workspace chrome", () => {
    test.describe.configure({ mode: "serial" });

    for (const workspace of WORKSPACES) {
        test(`${workspace.label}: no Expand, a reachable Close, and a single-line header band`, async ({ page }) => {
            test.setTimeout(900_000);
            await landOnShell(page);
            const panel = await openWorkspace(page, workspace.key, workspace.modal);

            // ── 1 · EXPAND IS GONE, AND SO IS THE SECOND LAYOUT IT SWITCHED TO ─────────────
            expect(
                await panel.locator("[data-workspace-expand-control]").count(),
                "the Expand control must not exist",
            ).toBe(0);
            expect(
                await page.locator("[data-workspace-expanded]").count(),
                "no element may still carry an expanded state",
            ).toBe(0);
            await expect(panel.getByRole("button", { name: /Expand Workspace/i })).toHaveCount(0);

            const rail = panel.locator('[data-operational-modal-header-actions="true"]');
            await expect(rail, "the shared header action rail").toBeVisible({ timeout: 30_000 });

            // ── 2 · CLOSE IS PRESENT AND BIG ENOUGH TO HIT ────────────────────────────────
            const close = rail.locator("button").last();
            await expect(close).toBeVisible();
            const closeBox = (await close.boundingBox())!;
            expect(closeBox, "Close must have a box").toBeTruthy();
            expect(closeBox.width, "Close must not be compressed to nothing").toBeGreaterThan(40);
            expect(closeBox.height).toBeGreaterThan(14);

            // ── 3 · THE BAND IS ONE LINE ──────────────────────────────────────────────────
            /*
             * Every control in the rail shares a row. Measuring tops rather than reading classes
             * is the point: wrapping is a fact about where things ARE, and a rail that had wrapped
             * would put its second control a full control-height below the first.
             */
            const controls = await rail.locator("button, label, select, input").all();
            expect(controls.length, "the rail has controls to measure").toBeGreaterThan(0);
            const tops: number[] = [];
            for (const control of controls) {
                const box = await control.boundingBox();
                if (box && box.height > 0) tops.push(box.y);
            }
            const spread = Math.max(...tops) - Math.min(...tops);
            expect(spread, "every header control sits on one line").toBeLessThan(closeBox.height);

            // The rail also stays inside the header, rather than pushing a second control row.
            const header = panel.locator('[data-operational-modal-header="true"]');
            const headerBox = (await header.boundingBox())!;
            expect(headerBox.height, "the header band is a single compact row").toBeLessThan(72);

            await closeWorkspace(page, panel);
        });
    }

    /*
     * 4 · THE SITE FILTER READS AS A SITE FILTER.
     *
     * `.alloy-select` is `width: 100%; min-width: 0`, which collapses inside the shrink-to-fit
     * header rail: the trigger went to nothing and the value ellipsised away, so the control read
     * as a bare chevron. Financials is the workspace that carries one in its header, so it is
     * where the shared rule is measured.
     */
    test("Financials: the site filter holds one readable line in the header", async ({ page }) => {
        test.setTimeout(900_000);
        await landOnShell(page);
        const panel = await openWorkspace(page, "financials", "adminv2-financials-modal");

        const trigger = panel.locator('[data-operational-modal-header-actions="true"] .alloy-select__trigger').first();
        const present = await trigger.count();
        test.skip(present === 0, "this tenant's operator holds one site, so no picker is offered");

        const box = (await trigger.boundingBox())!;
        expect(box.width, "the trigger must be wide enough for an ordinary site label").toBeGreaterThan(120);
        // One line: a wrapped label would be about twice the height of a single-line control.
        expect(box.height).toBeLessThan(40);

        const value = panel.locator('[data-operational-modal-header-actions="true"] .alloy-select__value').first();
        const text = (await value.innerText()).trim();
        expect(text.length, "the selected scope is legible, not ellipsised to nothing").toBeGreaterThan(2);

        await closeWorkspace(page, panel);
    });

    /*
     * RESPONSIVE COHERENCE. At a narrow viewport the TITLE gives way, not the controls — a
     * truncated title still reads, while a wrapped control silently changes the shell's height.
     */
    test("Financials: narrowing the viewport truncates the title, never the controls", async ({ page }) => {
        test.setTimeout(900_000);
        await landOnShell(page);
        const panel = await openWorkspace(page, "financials", "adminv2-financials-modal");

        const header = panel.locator('[data-operational-modal-header="true"]');
        const wideHeight = (await header.boundingBox())!.height;

        await page.setViewportSize({ width: 900, height: 900 });
        await page.waitForTimeout(3_000);

        const narrowBox = (await header.boundingBox())!;
        expect(narrowBox.height, "the band does not grow a second row when space runs out").toBeLessThanOrEqual(
            wideHeight + 2,
        );
        const close = panel.locator('[data-operational-modal-header-actions="true"] button').last();
        await expect(close, "Close survives the squeeze").toBeVisible();
        expect((await close.boundingBox())!.width).toBeGreaterThan(40);

        await page.setViewportSize({ width: 1440, height: 900 });
        await closeWorkspace(page, panel);
    });
});
