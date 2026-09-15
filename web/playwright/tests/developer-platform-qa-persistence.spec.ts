import { expect, test } from "@playwright/test";

/**
 * The QA walkthrough's own hard-failure rule, tested.
 *
 * Rule 15 of the walkthrough is "human QA results or notes disappear or reset
 * during normal use". That rule applies to the walkthrough itself: a QA tool
 * that loses an operator's afternoon is worse than no tool, because the loss is
 * discovered only after the work is gone. So the persistence claim on the page
 * is a claim under test rather than an assertion in a comment.
 */
const PAGE = "/dev/qa/developer-platform";

test("results, notes and acceptance survive a reload", async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.getByRole("heading", { name: /human QA walkthrough/i })).toBeVisible();

    // Section A is open by default; record a result and a note on its first step.
    const firstCard = page.locator("article").first();
    await firstCard.getByRole("button", { name: "Pass", exact: true }).click();
    const note = firstCard.getByRole("textbox").first();
    await note.fill("Nav reads Integrations under Organization.");

    await page.getByPlaceholder("Your name, for the exported record").fill("QA operator");

    await page.reload();

    const afterReload = page.locator("article").first();
    await expect(afterReload.getByRole("textbox").first()).toHaveValue(
        "Nav reads Integrations under Organization.",
    );
    await expect(page.getByPlaceholder("Your name, for the exported record")).toHaveValue("QA operator");
    // The tally is the operator's sense of progress; it must come back too.
    await expect(page.getByText(/^Pass 1$/)).toBeVisible();
    await expect(page.getByText(/1 of 82 steps answered/)).toBeVisible();
});

test("a failed hard gate is surfaced, and a defect record appears", async ({ page }) => {
    await page.goto(PAGE);

    // DP-QA-06 is a hard gate in section A's neighbour; open section B and fail it.
    await page.getByRole("button", { name: /Section B/ }).click();
    const card = page.locator("article", { hasText: "DP-QA-06" });
    await card.getByRole("button", { name: "Fail", exact: true }).click();
    await card.getByRole("combobox").selectOption("P1");
    await card.getByRole("textbox").first().fill("Capability list implies an attendance endpoint.");

    await expect(page.getByText(/Hard gate failed:.*DP-QA-06/)).toBeVisible();

    // The defect must reach the structured output the handoff is built from.
    const summary = page.locator("#summary");
    await expect(summary.getByText("DP-QA-06")).toBeVisible();
    await expect(summary.getByText(/FAIL · P1/)).toBeVisible();
    await expect(summary.getByText(/P1 defects:    1/)).toBeVisible();
});
