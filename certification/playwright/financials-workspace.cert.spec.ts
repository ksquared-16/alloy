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
        // One mode is furniture: the rail is deliberately off, and no Studio exists.
        await expect(page.locator('[data-testid="financials-workspace-shell"] [role="tablist"]').first()).toBeVisible();

        // ── OVERVIEW ANSWERS WHAT NEEDS ATTENTION ──────────────────────────────────────────
        await expect(shell).toHaveAttribute("data-financials-section", "overview");
        const activity = page.locator('[data-testid="financials-overview-activity-kpis"]');
        await expect(activity, "Overview uses the canonical activity band").toBeVisible({ timeout: 30_000 });
        // The tiles are the shared KPI primitive, not a Financials card.
        await expect(activity.locator("[data-work-unit-header-kpi]").first()).toBeVisible({ timeout: 30_000 });
        const overviewText = await page.locator('[data-financials-overview-scope="true"]').innerText();
        expect(overviewText, "the Overview states the scope its counts obey").toMatch(/All sites|site/i);

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
