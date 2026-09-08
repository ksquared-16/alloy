/**
 * THE FINANCIALS WORKSPACE, THROUGH THE RUNNING APPLICATION.
 *
 * The operator path Thread 4 exists to prove: the left navigation, the canonical shell, an Overview
 * that answers what needs attention, a section whose queue is real work, a selection that opens
 * Thread 2's own account detail, and an existing registered action that posts — after which the row
 * leaves the cohort because committed truth says it is no longer draft, not because the page removed
 * it optimistically.
 *
 * It also proves the negative that matters most: the workspace composes the SHARED primitives. A
 * Financials shell, KPI card or navigation grammar would look like one workspace family for exactly
 * as long as nobody changed the real one.
 */
import { expect, test, type Page } from "@playwright/test";

/*
 * The shell and its left rail live under `/adminV2/*`. `/adminV2` itself redirects, and
 * `/organization` is outside that tree — so this uses the Work View every other Financials browser
 * certification already mounts, which is the same shell and is known to render the rail.
 */
const HOME = "/workspace/work-unit/new-leads";
const PERIOD = process.env.CERT_WS_PERIOD || new Date().toISOString().slice(0, 7);
const CUSTOMER = process.env.CERT_WS_CUSTOMER || "";
const MEMBER = process.env.CERT_WS_MEMBER || "";
const GROSS_LABEL = "$1,210.00";

async function openFinancialsWorkspace(page: Page) {
    await page.goto(HOME);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(35_000);

    // FROM THE ESTABLISHED LEFT NAVIGATION — not a route, and never the /adminV2/finance placeholder.
    const navItem = page.locator('[data-adminv2-sidebar-modal-nav="financials"]');
    await expect(navItem, "Financials must appear in the left navigation").toBeVisible({ timeout: 60_000 });
    await navItem.click();

    const shell = page.locator('[data-testid="financials-workspace-shell"]');
    await expect(shell, "it must open the canonical workspace shell").toBeVisible({ timeout: 60_000 });
    return shell;
}

/** Generate a draft charge through Thread 7's own command, so the cohort is real work. */
async function seedDraftCharge(page: Page) {
    const res = await page.request.post("/api/admin/actions/execute", {
        data: {
            action_key: "billing.generate_tuition",
            entity_type: "opportunity_customer_member",
            entity_id: process.env.CERT_WS_ASSIGNMENT ?? "",
            mode: "execute",
            confirmation: { confirmed: true },
            payload: { period_key: PERIOD },
        },
    });
    expect(res.status(), await res.text()).toBe(200);
}

test.describe("financials workspace, in the mounted application", () => {
    test.describe.configure({ mode: "serial" });

    test("navigation to shell to queue to Thread 2 detail to a posted charge", async ({ page }) => {
        test.skip(process.env.CERT_EXPECT_UNAUTHORIZED === "1", "the unauthorized run drives its own case");
        test.setTimeout(900_000);

        await page.goto(HOME);
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(30_000);
        await seedDraftCharge(page);

        const shell = await openFinancialsWorkspace(page);

        // ── THE SHELL IS THE SHARED ONE ─────────────────────────────────────────────────────
        await expect(shell).toHaveAttribute("data-adminv2-financials-workspace", "true");
        await expect(page.locator("#financials-workspace-title")).toBeVisible();
        await expect(page.locator('[data-testid="financials-workspace-shell"] [role="tablist"]').first()).toBeVisible();
        // Thread 4A: the rail is on, because there are now two modes to switch between.
        await expect(shell).toHaveAttribute("data-financials-mode", "work");

        // ── OVERVIEW IS A LANDING PAGE, AND THE FIGURES ARE MONEY ──────────────────────────
        await expect(shell).toHaveAttribute("data-financials-section", "overview");
        const activity = page.locator('[data-testid="financials-overview-activity-kpis"]');
        await expect(activity, "Overview uses the canonical activity band").toBeVisible({ timeout: 30_000 });
        // The tiles are the shared KPI primitive, not a Financials card.
        await expect(activity.locator("[data-work-unit-header-kpi]").first()).toBeVisible({ timeout: 30_000 });
        /*
         * EVERY HEADLINE TILE IS A REGISTERED FINANCIALS METRIC, resolved by the metric engine.
         * `data-calculation-key` is the shared primitive's own provenance attribute, so asserting
         * it proves the number came through the registry rather than from a count in a component.
         */
        for (const key of [
            "financials.outstanding_amount",
            "financials.currently_collectible_amount",
            "financials.gross_charges_posted_amount",
            "financials.payments_received_amount",
        ]) {
            await expect(
                activity.locator(`[data-calculation-key="${key}"]`),
                `${key} is on the landing page`,
            ).toHaveCount(1, { timeout: 30_000 });
        }
        // At least one figure is money, not an inventory count.
        await expect(activity.getByText(/\$/).first(), "Overview shows money").toBeVisible({ timeout: 30_000 });

        // The exception band is the operator's work, and each entry opens the section that owns it.
        const exceptions = page.locator('[data-financials-overview-exceptions="true"]');
        await expect(exceptions).toBeVisible({ timeout: 30_000 });
        await expect(
            exceptions.locator('[data-financials-overview-exception="financials.unapplied_payments_amount"]'),
        ).toBeVisible();

        const overviewText = await page.locator('[data-financials-overview-scope="true"]').innerText();
        expect(overviewText, "the Overview states the scope its figures obey").toMatch(/All sites|site/i);

        // ── THE WORK SECTIONS EACH MOUNT THEIR OWN SURFACE ─────────────────────────────────
        for (const [tab, section, testId] of [
            ["Accounts", "accounts", "financials-accounts-section"],
            ["Payments", "payments", "financials-payments-section"],
            ["Subsidy", "subsidy", "financials-subsidy-section"],
            ["Activity", "activity", "financials-activity-section"],
        ] as const) {
            await page.getByRole("tab", { name: tab }).click();
            await page.waitForTimeout(6_000);
            await expect(shell, `${tab} is a real section`).toHaveAttribute("data-financials-section", section);
            await expect(page.locator(`[data-testid="${testId}"]`)).toBeVisible({ timeout: 40_000 });
        }

        // Activity is history and says so — no balance is summed onto that surface.
        await expect(page.locator('[data-financials-activity-footer="true"]')).toContainText(
            /not summed from this list/i,
        );

        // ── THE OPERATIONAL SECTION ────────────────────────────────────────────────────────
        await page.getByRole("tab", { name: "Charges" }).click();
        await page.waitForTimeout(6_000);
        await expect(shell).toHaveAttribute("data-financials-section", "charges");
        await expect(
            page.locator('[data-testid="financials-kpi-band"]'),
            "section metrics use the shared operational-health band",
        ).toBeVisible({ timeout: 30_000 });

        // ── THE QUEUE IS REAL WORK, LOCATED ────────────────────────────────────────────────
        const row = page.locator("[data-financials-queue-row]").first();
        await expect(row, "the queue lists draft work").toBeVisible({ timeout: 40_000 });
        const chargeId = await row.getAttribute("data-financials-queue-row");
        const rowSite = await row.getAttribute("data-financials-queue-row-site");
        expect(rowSite, "every row states where it belongs").toBeTruthy();
        expect(await row.innerText()).toContain(GROSS_LABEL);

        // ── SELECTION OPENS THREAD 2, LABELLED ACCOUNT-WIDE ────────────────────────────────
        await row.click();
        await page.waitForTimeout(20_000);
        await expect(page.locator(`[data-financials-detail="${chargeId}"]`)).toBeVisible({ timeout: 30_000 });
        await expect(
            page.locator('[data-financials-detail-scope="account_wide"]'),
            "the detail says it is account-wide, because the queue's site filter does not apply to it",
        ).toBeVisible();
        /*
         * SCOPED TO THE WORKSPACE'S DETAIL ZONE. The Focus Panel behind the modal mounts its own
         * Financials card, so an unscoped match found three and could not say which one it meant —
         * and a proof that cannot name the card it is looking at proves nothing about this one.
         */
        await expect(
            page.locator(`[data-financials-detail="${chargeId}"] [data-financials-card="true"]`).first(),
            "Thread 2's own card, unforked, inside the workspace",
        ).toBeVisible({ timeout: 40_000 });

        // ── POST THROUGH THE REGISTERED ACTION ─────────────────────────────────────────────
        await page.locator(`[data-financials-post-charge="${chargeId}"]`).click();
        await page.waitForTimeout(25_000);
        await expect(
            page.locator(`[data-financials-queue-row="${chargeId}"]`),
            "committed truth removes it from the draft cohort",
        ).toHaveCount(0, { timeout: 40_000 });

        // ── AND A COLD RELOAD REBUILDS ALL OF IT FROM THE DATABASE ─────────────────────────
        await page.reload();
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(30_000);
        await openFinancialsWorkspace(page);
        await page.getByRole("tab", { name: "Charges" }).click();
        await page.waitForTimeout(8_000);
        await expect(
            page.locator(`[data-financials-queue-row="${chargeId}"]`),
            "the posted charge does not come back",
        ).toHaveCount(0, { timeout: 40_000 });
    });

    /*
     * NO COMPETING PRIMITIVE EXISTS. Asserted in the DOM rather than only in review, because the way
     * a second shell arrives is one component at a time.
     */
    test("composes the shared primitives and introduces none of its own", async ({ page }) => {
        test.skip(process.env.CERT_EXPECT_UNAUTHORIZED === "1", "the unauthorized run drives its own case");
        test.setTimeout(600_000);
        await openFinancialsWorkspace(page);

        expect(await page.locator("[data-financials-kpi-card]").count(), "no Financials KPI primitive").toBe(0);
        expect(await page.locator("[data-financials-shell]").count(), "no Financials shell primitive").toBe(0);
        expect(await page.locator("[data-financials-metric-tile]").count(), "no Financials metric tile").toBe(0);
        // The workspace is hosted in the shared modal, like every other one.
        await expect(page.locator('[data-adminv2-financials-modal="true"]')).toBeVisible();
    });

    /*
     * STUDIO LAUNCHES CANONICAL CONFIGURATION AND HOLDS NO SECOND COPY OF IT.
     *
     * The proof is the href: every tile points at `/organization/financials`, the page that
     * actually persists the setting. A Studio that had begun to author configuration would have
     * grown a control that saves, and the footer would be a lie.
     */
    test("Studio is a launch surface over the canonical configuration, not a second one", async ({ page }) => {
        test.skip(process.env.CERT_EXPECT_UNAUTHORIZED === "1", "the unauthorized run drives its own case");
        test.setTimeout(600_000);
        const shell = await openFinancialsWorkspace(page);

        await page.getByRole("tab", { name: "Studio" }).click();
        await page.waitForTimeout(6_000);
        await expect(shell).toHaveAttribute("data-financials-mode", "studio");
        await expect(shell).toHaveAttribute("data-financials-section", "setup");

        const tiles = page.locator("[data-financials-studio-tile]");
        await expect(tiles.first()).toBeVisible({ timeout: 30_000 });
        expect(await tiles.count(), "every configuration chapter is offered").toBeGreaterThanOrEqual(6);
        for (const href of await tiles.evaluateAll((nodes) => nodes.map((n) => n.getAttribute("href")))) {
            expect(href, "a Studio tile navigates to the canonical configuration page").toMatch(
                /^\/organization\/financials/,
            );
        }
        await expect(page.locator('[data-financials-studio-footer="true"]')).toContainText(
            /does not hold a second copy/i,
        );

        // Returning to Work lands on Work's own section, not a Studio key.
        await page.getByRole("tab", { name: "Work" }).click();
        await page.waitForTimeout(4_000);
        await expect(shell).toHaveAttribute("data-financials-section", "overview");
    });

    /*
     * BULK CHARGING IS ONE SERVER-OWNED RUN. The preview reports what WOULD happen, states its
     * own scope, and nothing is written until it is confirmed.
     */
    test("bulk charging previews a period before it writes anything", async ({ page }) => {
        test.skip(process.env.CERT_EXPECT_UNAUTHORIZED === "1", "the unauthorized run drives its own case");
        test.setTimeout(900_000);
        await openFinancialsWorkspace(page);
        await page.getByRole("tab", { name: "Charges" }).click();
        await page.waitForTimeout(6_000);

        await page.locator('[data-financials-bulk-open="true"]').click();
        const panel = page.locator('[data-financials-bulk-panel="true"]');
        await expect(panel).toBeVisible({ timeout: 20_000 });

        // The scope is stated BEFORE the run, not discovered from its result.
        await expect(panel.locator('[data-financials-bulk-scope="org_wide"]')).toContainText(
            /Organization-wide for this period/i,
        );

        await panel.locator('[data-financials-bulk-period="true"]').fill(PERIOD);
        await panel.locator('[data-financials-bulk-preview="true"]').click();
        await expect(
            panel.locator('[data-financials-bulk-preview-result="true"]'),
            "the preview reports a tally an operator can confirm against",
        ).toBeVisible({ timeout: 60_000 });
        await expect(panel.locator('[data-financials-bulk-preview-result="true"]')).toContainText(/to bill/i);
    });

    /*
     * L · READING FINANCIAL WORK WITHOUT THE GRANT.
     *
     * `fin.read` is the permission THIS THREAD's server surface owns and enforces — the work-queue
     * projection refuses without it. The refusal is proven against the API rather than the page,
     * because a queue that merely renders empty would be indistinguishable from a quiet day.
     *
     * Deliberately NOT asserted here: that revoking `fin.write` stops `charge.post`. It does not.
     * Thread 1's posting action declares no permission and is gated by the admin/ops route gate
     * alone. That is a real finding about another thread's contract, reported rather than patched
     * from inside a workspace that has no business changing it.
     */
    test("without the grant, the server refuses to hand over financial work", async ({ page }) => {
        test.skip(process.env.CERT_EXPECT_UNAUTHORIZED !== "1", "driven by the harness");
        test.setTimeout(600_000);
        await page.goto(HOME);
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(30_000);

        const res = await page.request.get("/api/admin/financials/work-queue");
        const text = await res.text();
        expect(res.status(), text).toBe(403);
        expect(text, "the refusal names the permission").toMatch(/fin\.read/i);
    });
});
