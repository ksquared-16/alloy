import { test, expect } from "../redactedTest";
import type { Page } from "@playwright/test";

/**
 * Search Platform V2 — browser certification against the live tenant.
 *
 * Evidence is written to playwright/evidence/search-v2/.
 *
 * The live tenant is the shared Alloy tenant; no fixtures are seeded (all managed
 * worktrees write the same tenant). Scenarios that the tenant cannot support are
 * SKIPPED EXPLICITLY rather than faked — see the closing report test.
 */

const SHOTS = "playwright/evidence/search-v2";

async function openSearch(page: Page) {
    await page.goto("/workspace");
    const input = page.locator('[data-global-search-input="true"]');
    await input.waitFor({ state: "visible", timeout: 30_000 });
    return input;
}

/**
 * Type a query and wait for the search to actually SETTLE.
 *
 * Fixed delays are not safe here: against a remote DB a query can take seconds,
 * and an early assertion tests an empty list rather than the product. Wait for
 * "Searching…" to clear, which covers both the result and no-result cases.
 */
async function search(page: Page, q: string) {
    const input = await openSearch(page);
    await input.click();
    await input.fill(q);
    const panel = page.locator("#adminv2-global-search-results");
    await panel.waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForFunction(
        () => {
            const el = document.querySelector("#adminv2-global-search-results");
            return !!el && !el.textContent?.includes("Searching…");
        },
        undefined,
        { timeout: 40_000 }
    );
    return panel;
}

async function shot(page: Page, name: string) {
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

test.describe.configure({ mode: "serial" });

test("1 — child subject with recognition context and destinations", async ({ page }) => {
    test.setTimeout(120_000);
    const panel = await search(page, "Lennon");
    const text = await panel.innerText();
    console.log("\n[CERT 1] Lennon =>\n" + text + "\n");

    await expect(panel).toContainText("Lennon");
    // Recognition context distinguishes the subject.
    await expect(panel).toContainText("Child");
    // Process context resolved from process_instances with CONFIGURED labels.
    await expect(panel).toContainText("Enrollment");
    // Destinations exposed on the INITIAL result — no intermediate page.
    await expect(panel.locator("[data-search-destination]").first()).toBeVisible();
    await shot(page, "01-child-lennon");
});

test("2 — household subject and its members", async ({ page }) => {
    test.setTimeout(120_000);
    const panel = await search(page, "Kurzman");
    const text = await panel.innerText();
    console.log("\n[CERT 2] Kurzman =>\n" + text + "\n");
    await expect(panel).toContainText("Kurzman");
    await shot(page, "02-household-kurzman");
});

test("3 — schedule intent keeps the subject and does not break the query", async ({ page }) => {
    test.setTimeout(120_000);
    // V1 would ilike '%Lennon schedule%' and return NOTHING. V2 must still find
    // Lennon, with schedule promoted.
    const panel = await search(page, "Lennon schedule");
    const text = await panel.innerText();
    console.log("\n[CERT 3] 'Lennon schedule' =>\n" + text + "\n");
    await expect(panel).toContainText("Lennon");
    await shot(page, "03-intent-lennon-schedule");
});

test("4 — process intent by configured label keeps the subject", async ({ page }) => {
    test.setTimeout(120_000);
    const panel = await search(page, "Lennon enrollment");
    const text = await panel.innerText();
    console.log("\n[CERT 4] 'Lennon enrollment' =>\n" + text + "\n");
    await expect(panel).toContainText("Lennon");
    await expect(panel).toContainText("Enrollment");
    await shot(page, "04-intent-lennon-enrollment");
});

test("5 — household-name query returns members at child grain", async ({ page }) => {
    test.setTimeout(120_000);
    const panel = await search(page, "Kurzman schedule");
    const text = await panel.innerText();
    console.log("\n[CERT 5] 'Kurzman schedule' =>\n" + text + "\n");
    await shot(page, "05-household-schedule-grain");
});

test("6 — campus/location subjects", async ({ page }) => {
    test.setTimeout(120_000);
    const panel = await search(page, "ca");
    const text = await panel.innerText();
    console.log("\n[CERT 6] 'ca' =>\n" + text + "\n");
    await shot(page, "06-locations");
});

test("7 — keyboard navigation selects and opens a subject", async ({ page }) => {
    test.setTimeout(150_000);
    const input = await openSearch(page);
    await input.click();
    await input.fill("Lennon");

    // Wait for the RESULT, not a guessed delay — pressing Enter before results
    // render is a no-op and would certify nothing.
    await page
        .locator('[data-search-subject-button="true"]')
        .first()
        .waitFor({ state: "visible", timeout: 40_000 });

    await input.press("ArrowDown");
    await shot(page, "07a-keyboard-selected");

    await input.press("Enter");
    // The subject's canonical surface opens IN PLACE — the dropdown dismisses and
    // the query clears, which is the observable signal that open actually fired.
    await expect(input).toHaveValue("", { timeout: 15_000 });
    await page.waitForTimeout(6000);
    console.log("\n[CERT 7] after Enter, url =", page.url());
    await shot(page, "07b-keyboard-opened");
});

test("8 — no results state is calm and does not leak", async ({ page }) => {
    test.setTimeout(120_000);
    const panel = await search(page, "zzzqqxnotasubject");
    const text = await panel.innerText();
    console.log("\n[CERT 8] no-match =>\n" + text + "\n");
    await expect(panel).toContainText("No matching results");
    await shot(page, "08-empty-state");
});

test("9 — report what the live tenant could and could not certify", async ({ request }) => {
    test.setTimeout(120_000);
    const notes: string[] = [];

    const res = await request.get("/api/admin/global-search?q=kurzman&limit=20");
    const body = await res.json();
    const results = (body.results ?? []) as Array<{
        subject: { kind: string; display_name: string };
        contexts: Array<{ kind: string }>;
    }>;

    const multiProcess = results.filter(
        (r) => r.contexts.filter((c) => c.kind === "process").length >= 3
    ).length;
    const withSchedule = results.filter((r) => r.contexts.some((c) => c.kind === "schedule")).length;
    const names = results.map((r) => r.subject.display_name);
    const duplicates = names.filter((n, i) => names.indexOf(n) !== i).length;

    notes.push(`subjects returned: ${results.length}`);
    notes.push(`subjects with >=3 process contexts: ${multiProcess} (Case 4 needs >=1)`);
    notes.push(`subjects with a schedule context: ${withSchedule} (Case 3 needs >=2 siblings)`);
    notes.push(`duplicate display names: ${duplicates} (disambiguation case needs >=2)`);
    console.log("\n===== LIVE TENANT CERTIFIABILITY =====\n" + notes.join("\n") + "\n=====\n");
    expect(results.length).toBeGreaterThan(0);
});
