import { expect, test } from "@playwright/test";

import { ALL_STEPS, SECTIONS } from "../../app/dev/qa/developer-platform/steps";

/**
 * The QA instrument, under test.
 *
 * Rule 15 of the walkthrough's own hard-failure list is that QA results must not
 * disappear during normal use. That rule applies to this tool: a QA instrument
 * that loses an operator's afternoon is worse than no instrument, because the
 * loss is discovered only after the work is gone. The claims the page makes
 * about itself — progress survives, evidence cannot answer for you, no secret is
 * rendered — are therefore claims under test rather than assertions in a comment.
 */
const PAGE = "/dev/qa/developer-platform";

async function start(page: import("@playwright/test").Page) {
    await page.goto(PAGE);
    const startButton = page.getByRole("button", { name: "Start QA" });
    // The environment prepares itself; the button enables when it is ready.
    await expect(startButton).toBeEnabled({ timeout: 60_000 });
    await startButton.click();
}

/**
 * Open a section idempotently.
 *
 * The headers toggle, and section A is open by default — clicking it blindly
 * closes the very steps a test is about to look for. Ask the control what state
 * it is in rather than assuming.
 */
async function openSection(page: import("@playwright/test").Page, id: string) {
    const head = page.getByRole("button", { name: new RegExp(`Section ${id}\\b`) });
    if ((await head.getAttribute("aria-expanded")) !== "true") await head.click();
}

test("the environment prepares itself, with no fixture command asked of the operator", async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.getByText(/Certification fixture ready/)).toBeVisible({ timeout: 60_000 });
    // The landing screen must not open with a wall of shell commands.
    await expect(page.getByText(/^curl /)).toHaveCount(0);
    await expect(page.getByText("82 acceptance checks")).toBeVisible();
});

test("all 82 steps are present with their acceptance wording intact", async ({ page }) => {
    await start(page);
    // The sections are an accordion — one open at a time — so each section's
    // steps are checked while that section is the open one.
    for (const section of SECTIONS) {
        await openSection(page, section.id);
        for (const step of section.steps) {
            const card = page.locator("article", { hasText: step.id });
            await expect(card.getByRole("heading", { name: new RegExp(`^${step.id}`) })).toBeVisible();
            // The acceptance wording itself, not merely the identifier.
            await expect(card.getByText(step.expected[0], { exact: false })).toBeVisible();
        }
    }
    expect(ALL_STEPS.length).toBe(82);
    // A hard gate that lost its marking is a weakened gate.
    expect(ALL_STEPS.filter((s) => s.hardGate).length).toBe(29);
});

test("results, notes and operator identity survive a reload", async ({ page }) => {
    await start(page);
    const firstCard = page.locator("article").first();
    await firstCard.getByRole("button", { name: "Pass", exact: true }).click();
    await firstCard.getByRole("textbox").first().fill("Nav reads Integrations under Organization.");

    await page.reload();

    // Still started — a reload must not return the operator to the front door.
    await expect(page.getByRole("button", { name: "Start QA" })).toHaveCount(0);
    const afterReload = page.locator("article").first();
    await expect(afterReload.getByRole("textbox").first()).toHaveValue(
        "Nav reads Integrations under Organization.",
    );
    await expect(page.getByText(/1 of 82 steps answered/)).toBeVisible();
});

test("live verification runs over the real HTTP boundary and reports evidence", async ({ page }) => {
    await start(page);

    const apiCalls: string[] = [];
    page.on("request", (r) => {
        const u = new URL(r.url());
        if (u.pathname.startsWith("/api/")) apiCalls.push(u.pathname);
    });

    await page.getByRole("button", { name: /Run live verification/ }).click();
    await expect(page.getByText(/Token exchange/).first()).toBeVisible({ timeout: 120_000 });

    // The page itself calls its QA backend; the backend drives /api/v1 server-side.
    expect(apiCalls).toContain("/api/dev/qa/developer-platform");

    const evidence = page.locator("text=/returned 200 with an opaque bearer token/");
    await expect(evidence.first()).toBeVisible();
});

test("machine evidence never sets a human result", async ({ page }) => {
    await start(page);
    await page.getByRole("button", { name: /Run live verification/ }).click();
    await expect(page.getByText(/Token exchange/).first()).toBeVisible({ timeout: 120_000 });

    // Section H holds the steps the evidence informs. Every one must still be
    // unanswered: the machine may inform the operator, never answer for them.
    await openSection(page, "H");
    const card = page.locator("article", { hasText: "DP-QA-26" });
    await expect(card.getByText("Machine evidence", { exact: true })).toBeVisible();
    await expect(card.getByText("Your judgment", { exact: true })).toBeVisible();
    await expect(page.getByText(/0 of 82 steps answered/)).toBeVisible();
});

test("no credential secret is rendered or persisted by the instrument", async ({ page }) => {
    await start(page);
    await page.getByRole("button", { name: /Run live verification/ }).click();
    await expect(page.getByText(/Token exchange/).first()).toBeVisible({ timeout: 120_000 });

    const body = (await page.locator("body").innerText()).toLowerCase();
    expect(body).not.toContain("alloy_cs_");
    expect(body).not.toContain("client_secret");

    const stored = await page.evaluate(() => window.localStorage.getItem("alloy.qa.developer-platform.v1") ?? "");
    expect(stored).not.toContain("alloy_cs_");
    expect(stored).not.toContain("alloy_at_");
});

test("a failed hard gate surfaces, and the defect export carries the record", async ({ page }) => {
    await start(page);
    await openSection(page, "B");
    const card = page.locator("article", { hasText: "DP-QA-06" });
    await card.getByRole("button", { name: "Fail", exact: true }).click();
    await card.getByRole("combobox").selectOption("P1");
    await card.getByRole("textbox").first().fill("Capability list implies an attendance endpoint.");

    await expect(page.getByText(/Hard gate failed:.*DP-QA-06/)).toBeVisible();

    const summary = page.locator("#summary");
    await expect(summary.getByText("DP-QA-06")).toBeVisible();
    await expect(summary.getByText(/FAIL · P1/)).toBeVisible();
    await expect(summary.getByText(/P1 defects:    1/)).toBeVisible();
    await expect(summary.getByText(/Hard gates failed: 1/)).toBeVisible();
});

test("direct surface links point at the surfaces the step is about", async ({ page }) => {
    await start(page);
    await openSection(page, "A");

    // DP-QA-01 tests discoverability, so it deliberately offers no shortcut.
    const first = page.locator("article", { hasText: "DP-QA-01" });
    await expect(first.getByRole("link")).toHaveCount(0);

    const landing = page.locator("article", { hasText: "DP-QA-02" });
    await expect(landing.getByRole("link", { name: /Open Organization → Integrations/ }))
        .toHaveAttribute("href", "/organization/integrations");

    await openSection(page, "L");
    const packet = page.locator("article", { hasText: "DP-QA-61" });
    const link = packet.getByRole("link", { name: /Classroom Coach readiness packet/ });
    await expect(link).toHaveAttribute("href", /doc\?name=readiness/);

    // The link has to actually serve the artifact, not 404.
    const res = await page.request.get("/api/dev/qa/developer-platform/doc?name=readiness");
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain("Integration Readiness");
});
