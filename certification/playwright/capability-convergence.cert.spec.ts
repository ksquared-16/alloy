import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * POST-ERADICATION CAPABILITY CONVERGENCE — the four capabilities that lost their mount.
 *
 * Drawer eradication deleted the legacy overview body. Four capabilities had no other mount, and
 * two of them were LIVE DEFECTS rather than dormant code: `review_enrollment_packet` is
 * server-gated to appear only when a completed packet awaits review and then did nothing, and
 * `completeStageWorkWithOutcome` refuses a step whose template requires all participants resolved —
 * telling the operator to choose a path per child, with no surface offering one.
 *
 * ── WHAT THESE SCENARIOS HAVE TO SURVIVE ──
 *
 * The seeded cert tenant does NOT necessarily configure `participant_decisions` on its Enrollment
 * plan. A scenario that silently passes because the capability is unconfigured is worse than one
 * that fails: it reports convergence that was never exercised. So each capability scenario first
 * establishes whether the tenant configures it, and SKIPS with an explicit reason when it does
 * not — never a green tick for an untested path.
 *
 * The absence of a modal is asserted everywhere and proves nothing on its own — a blank page
 * satisfies it. Every scenario also requires the panel to have composed.
 */

const SHOTS = path.join(__dirname, "..", "evidence", "capability-convergence");
const OPERATOR = { email: "qa.operator@northwind.invalid", password: "alloy-local-cert" };
const LOGIN_WAIT = Number(process.env.CERT_AUTH_WAIT_MS || 300_000);
const SETTLE = 180_000;

/** The overlay the previous sprint deleted. Nothing here may bring it back. */
const MODAL = '[role="dialog"][aria-modal="true"], .adminv2-drawer-modal-panel, .adminv2-drawer-sidebar-panel';
const QUEUE_ROW = '[data-runtime-label="WU.QUEUE_ROW"]';
const CHILD = "Joe Smith";

test.use({ storageState: undefined });
test.beforeAll(() => fs.mkdirSync(SHOTS, { recursive: true }));

async function signIn(page: Page) {
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(OPERATOR.email);
    const pw = page.locator('input[type="password"]').first();
    await pw.fill(OPERATOR.password);
    await pw.press("Enter");
    await page.waitForURL("**/workspace**", { timeout: LOGIN_WAIT });
    await page.waitForLoadState("domcontentloaded");
}

type Landing = { pathname: string; subjectId: string };

/** Where the platform says this subject is worked — read from Search, never assumed. */
async function landingForChild(page: Page): Promise<Landing> {
    const payload = await page.evaluate(async (q) => {
        const res = await fetch(`/api/admin/global-search?q=${encodeURIComponent(q)}`, {
            credentials: "include",
        });
        return (await res.json()) as {
            results?: Array<{
                destinations?: Array<{
                    primary?: boolean;
                    host_entity_id?: string | null;
                    host_work_unit_key?: string | null;
                }>;
            }>;
        };
    }, CHILD);
    const primary = payload.results?.[0]?.destinations?.find((d) => d.primary);
    expect(primary, `search for "${CHILD}" returned no primary destination`).toBeTruthy();
    const workUnitKey = (primary!.host_work_unit_key ?? "").trim();
    const subjectId = (primary!.host_entity_id ?? "").trim();
    expect(workUnitKey, "no host work unit — nothing can host the panel").not.toBe("");
    expect(subjectId, "no host record").not.toBe("");
    return { pathname: `/workspace/work-unit/${workUnitKey.replace(/_/g, "-")}`, subjectId };
}

async function openPanel(page: Page, landing: Landing) {
    await page.goto(`${landing.pathname}?subject_id=${encodeURIComponent(landing.subjectId)}`);
    await page.locator("[data-focus-panel-grid-cell]").first().waitFor({ state: "visible", timeout: SETTLE });
}

async function panelState(page: Page, label: string) {
    const state = await page.evaluate((modal) => {
        const cells = Array.from(document.querySelectorAll("[data-focus-panel-grid-cell]"));
        return {
            url: location.pathname + location.search,
            cells: cells.map((el) => el.getAttribute("data-focus-panel-grid-cell")),
            elevated: cells
                .filter((el) => el.getAttribute("data-fp-elevated") === "true")
                .map((el) => el.getAttribute("data-focus-panel-grid-cell")),
            modalCount: document.querySelectorAll(modal).length,
            decisionPanel: document.querySelectorAll('[data-decision-current-work="true"]').length,
            decisionRows: document.querySelectorAll("[data-decision-child-row]").length,
            tourCard: document.querySelectorAll("[data-tour-card]").length,
            tourActions: Array.from(document.querySelectorAll("[data-tour-action]")).map((el) =>
                el.getAttribute("data-tour-action"),
            ),
        };
    }, MODAL);
    console.log(`[CERT ${label}] ${JSON.stringify(state)}`);
    return state;
}

/**
 * Enter the Current Work focused surface the way the product does.
 *
 * Clicking the grid cell does NOT open it: `requestFocus("current_work")` routes to
 * `openCurrentWorkWorkspace`, which the card raises from its own affordances or from the
 * `adminv2:opportunity-focus-current-work` event — the one My Tasks dispatches when an operator
 * opens a task's work. Dispatching that event is a real product path, not a test hook.
 */
async function openCurrentWorkSurface(page: Page, landing: Landing) {
    const currentWork = page.locator('[data-focus-panel-grid-cell="current_work"]');
    await expect(currentWork, "Current Work is not on the default composition").toHaveCount(1, {
        timeout: SETTLE,
    });
    await page.evaluate((id) => {
        window.dispatchEvent(
            new CustomEvent("adminv2:opportunity-focus-current-work", {
                detail: { opportunity_id: id, task_id: null },
            }),
        );
    }, landing.subjectId);
    await page
        .locator('[data-work-focused-surface="true"]')
        .waitFor({ state: "visible", timeout: SETTLE });
}

const shot = (page: Page, name: string) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });

/**
 * Does this tenant configure per-child decisions on the subject's current work template?
 *
 * Read from the RENDERED panel, because the panel is self-suppressing: it asks the configured
 * surface and renders nothing when the template declares none. Its presence therefore means
 * "configured AND mounted", which is exactly the claim under test — and its absence is a legitimate
 * unconfigured tenant, not a failure.
 */
async function participantDecisionsConfigured(page: Page): Promise<boolean> {
    // The panel FETCHES its configured surface, so it renders nothing for a moment even when the
    // tenant configures decisions. Reading the DOM the instant the work opens is a race that
    // reports every configured tenant as unconfigured — and the scenario would then skip, claiming
    // convergence it never exercised. Wait, bounded, and treat the timeout as genuinely unconfigured.
    try {
        await page
            .locator('[data-decision-current-work="true"]')
            .waitFor({ state: "visible", timeout: 30_000 });
        return true;
    } catch {
        return false;
    }
}

test.describe("every stranded capability is mounted, and none brings the overlay back", () => {
    test("A · Decision work — per-child paths appear inside Current Work", async ({ page }) => {
        await signIn(page);
        const landing = await landingForChild(page);
        await openPanel(page, landing);

        await openCurrentWorkSurface(page, landing);
        const configured = await participantDecisionsConfigured(page);

        const state = await panelState(page, "A-decision");
        await shot(page, "A-decision");

        // The overlay must never return, configured or not.
        expect(state.modalCount, "the record overlay is mounted").toBe(0);

        test.skip(
            !configured,
            "this tenant's current work template configures no participant_decisions — the panel "
                + "self-suppresses, which is the unconfigured-tenant behaviour asserted in scenario F",
        );

        // Configured: the per-child rows are the control the completion gate demands.
        expect(state.decisionPanel).toBe(1);
        expect(state.decisionRows, "configured decisions but no child rows").toBeGreaterThan(0);
    });

    test("B · Close family stays on the governed process path", async ({ page }) => {
        await signIn(page);
        const landing = await landingForChild(page);
        await openPanel(page, landing);
        await openCurrentWorkSurface(page, landing);
        await participantDecisionsConfigured(page);

        const closeControl = page.locator('[data-decision-close-open="true"]');
        const blocked = page.locator('[data-decision-close-blocked="true"]');
        const present = (await closeControl.count()) + (await blocked.count());
        console.log(`[CERT B-close] open=${await closeControl.count()} blocked=${await blocked.count()}`);
        await shot(page, "B-close-family");

        test.skip(
            present === 0,
            "this tenant configures no governed family close on the current work template",
        );

        // Either an offer or an explicit block — never a disabled control with no reason, which
        // invites hunting for the state that enables it.
        expect(present).toBeGreaterThan(0);
        expect((await page.locator(MODAL).count()) === 0).toBe(true);
    });

    test("C · Packet review — the action's event is heard and acts on the packet", async ({ page }) => {
        await signIn(page);
        const landing = await landingForChild(page);
        await openPanel(page, landing);

        const sessions = await page.evaluate(async (id) => {
            const res = await fetch(`/api/admin/opportunities/${encodeURIComponent(id)}/enrollment-packets`, {
                credentials: "include",
            });
            const json = (await res.json().catch(() => ({}))) as { sessions?: Array<Record<string, unknown>> };
            return json.sessions ?? [];
        }, landing.subjectId);
        const pending = sessions.filter(
            (s) =>
                s.status === "completed"
                && (s.operator_review_status == null
                    || s.operator_review_status === "needs_review"
                    || s.operator_review_status === "needs_correction"),
        );
        console.log(`[CERT C-packet] sessions=${sessions.length} pending=${pending.length}`);

        // ── THE HALF THAT IS ALWAYS PROVABLE ──
        //
        // The representative seed carries no packet DEFINITION, so it cannot carry a completed
        // session either, and the modal cannot be opened onto real data here. What CAN be proven —
        // and is exactly the defect this sprint fixed — is that the action's event is now HEARD:
        // before the mount it had no listener at all, so nothing happened, not even a request.
        const requests: string[] = [];
        page.on("request", (r) => {
            if (r.url().includes("/enrollment-packets")) requests.push(r.url());
        });
        await page.evaluate((id) => {
            window.dispatchEvent(
                new CustomEvent("adminv2:open-enrollment-packet-review", { detail: { opportunity_id: id } }),
            );
        }, landing.subjectId);
        await page.waitForTimeout(3_000);

        console.log(`[CERT C-packet-requests] ${JSON.stringify(requests)}`);
        expect(
            requests.length,
            "the review event was dispatched and nothing listened — the pre-fix defect",
        ).toBeGreaterThan(0);
        expect(requests.some((u) => u.includes(landing.subjectId))).toBe(true);
        await shot(page, "C-packet-review");

        // And the overlay is not what answered.
        expect(await page.locator(".adminv2-drawer-modal-panel, .adminv2-drawer-sidebar-panel").count()).toBe(0);

        test.skip(
            pending.length === 0,
            "no completed packet awaits review on this fixture (the representative seed carries no "
                + "packet definition), so the modal itself cannot be opened onto real data here — the "
                + "listener half is proven above",
        );
    });

    test("D · Tour lifecycle — state in words, actions matched to it", async ({ page }) => {
        await signIn(page);
        const landing = await landingForChild(page);
        await openPanel(page, landing);

        const tour = page.locator('[data-focus-panel-grid-cell="tour_summary"]');
        test.skip((await tour.count()) === 0, "Tour is not on this tenant's default composition");

        const state = await panelState(page, "D-tour");
        await shot(page, "D-tour");
        expect(state.tourCard).toBeGreaterThan(0);
        expect(state.modalCount).toBe(0);

        // No raw status key reaches the operator, and no ISO fragment stands in for a date.
        const text = (await tour.first().innerText()).trim();
        console.log(`[CERT D-tour-text] ${JSON.stringify(text)}`);
        expect(text).not.toMatch(/\b(pending_approval|no_show|tour_scheduled)\b/);
        expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    test("E · deep link lands directly on a converged card", async ({ page }) => {
        await signIn(page);
        const landing = await landingForChild(page);
        // ASPECT targeting for a capability this sprint mounted — a URL establishes attention
        // exactly once, on cold load.
        await page.goto(
            `${landing.pathname}?subject_id=${encodeURIComponent(landing.subjectId)}`
                + `&aspect=${encodeURIComponent("card:current_work")}`,
        );
        await page.locator("[data-focus-panel-grid-cell]").first().waitFor({ state: "visible", timeout: SETTLE });
        const state = await panelState(page, "E-deep-link");
        await shot(page, "E-deep-link");

        expect(state.cells).toContain("current_work");
        expect(state.modalCount).toBe(0);
    });

    test("F · an unconfigured tenant still gets a working panel", async ({ page }) => {
        await signIn(page);
        const landing = await landingForChild(page);
        await openPanel(page, landing);

        // The fixture has never customised Surface Builder. Whatever composes here is the platform
        // default, and every panel this sprint added self-suppresses rather than requiring config.
        const state = await panelState(page, "F-defaults");
        await shot(page, "F-defaults");
        expect(state.cells.length, "the default composition produced no cards").toBeGreaterThan(0);
        expect(state.modalCount).toBe(0);

        // A queue row selection still works end to end on the default composition.
        const row = page.locator(QUEUE_ROW).first();
        await row.waitFor({ state: "visible", timeout: SETTLE });
        await row.click();
        await page.waitForFunction(() => !!new URL(location.href).searchParams.get("subject_id"), undefined, {
            timeout: SETTLE,
        });
        const after = await panelState(page, "F-defaults-after-row");
        expect(after.cells.length).toBeGreaterThan(0);
        expect(after.modalCount).toBe(0);
    });

    test("G · a legacy open_drawer layout cannot open anything", async ({ page }) => {
        await signIn(page);
        const landing = await landingForChild(page);
        await openPanel(page, landing);

        // The value still parses (tenant layouts contain it) but no operator renderer executes it.
        // If any adornment on this surface were still wired to it, clicking would mount the overlay.
        const adornments = page.locator("[data-layout-runtime-adornment-link]");
        const count = await adornments.count();
        console.log(`[CERT G-open-drawer] adornment links on operator surface=${count}`);
        for (let i = 0; i < Math.min(count, 5); i += 1) {
            await adornments.nth(i).click({ trial: false }).catch(() => {
                /* a non-interactive icon is the expected shape */
            });
        }
        const state = await panelState(page, "G-open-drawer");
        await shot(page, "G-open-drawer");
        expect(state.modalCount, "a legacy adornment opened the record overlay").toBe(0);
    });
});
