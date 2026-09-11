/**
 * D2 — ACCESS CHANGE AUDIT, THROUGH THE OPERATOR'S OWN SCREENS.
 *
 * The live suite proves the transaction: that the event is written inside the mutation, that a failed
 * widening leaves nothing behind, that history cannot be rewritten. None of that answers the question
 * this file exists for — *when an administrator changes what someone may do, does the product say so,
 * in words, where they are already looking, and does the change take effect immediately?*
 *
 * ── WHY A SECOND SIGNED-IN PRINCIPAL ──
 *
 * "The grant committed" and "the person has it" are different claims, and the gap between them is a
 * 120-second cache. So the grant is made by the operator in one context and observed by the TARGET in
 * another, on their very next authoritative request. There is no `waitForTimeout` anywhere between a
 * save and the check that follows it: a proof that passes only after a sleep is a proof that the TTL
 * expired, not that the invalidation worked.
 *
 * ── WHAT IS WRITTEN, AND WHAT IS PUT BACK ──
 *
 * Everything happens to `mcert_portal_only`, a custom role this repository's own persona fixture
 * creates, and the role is returned to its starting package in the same file. No seeded role, no
 * seeded member, nothing another certification observes. The `mutation_events` rows it produces are
 * NOT cleaned up and cannot be — they are truthful records of access changes that really happened,
 * and weakening the append-only trigger to tidy a test is the one thing D2 must never do.
 *
 * Personas come from `fixtures/access-personas.mjs`; run
 * `node ../certification/playwright/fixtures/access-personas.mjs setup` from `web/` first.
 */
import { test, expect, type Page, type BrowserContext, type Browser } from "@playwright/test";
import path from "node:path";

/** The session `auth.setup.ts` captured — resolved from this file, not from the invoking cwd. */
const OPERATOR_STATE = path.join(__dirname, "..", ".auth", "operator.json");

const ACCESS = "/organization/access";
const ROLES = `${ACCESS}?section=roles`;
const USERS = `${ACCESS}?section=users`;
const SECURITY = `${ACCESS}?section=security`;

const PASSWORD = "alloy-local-cert";

/** The role under test: holds `portal.access` and nothing else, so Financials is a clean No access. */
const ROLE_KEY = "mcert_portal_only";
/** The principal who holds it, and who must gain and lose Financials without signing in again. */
const TARGET_EMAIL = "cert.portalonly@northwind.invalid";

const FIN_NAV = '[data-adminv2-sidebar-modal-nav="financials"]';

/** A dotted capability key. Correct in technical detail, wrong as the product's sentence. */
const RAW_KEY = /\b[a-z_]+\.[a-z_.]+\b/;

async function openRole(page: Page, roleKey: string) {
    await page.goto(`${ROLES}&roleKey=${roleKey}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("access-roles-page")).toBeVisible();
    await expect(page.getByTestId("access-role-selected-workspace")).toBeVisible();
}

/**
 * Set the Financials area to a level and save, returning the save response.
 *
 * The response is awaited rather than a timeout: the next assertion runs when the server has
 * answered, which is the only moment that means anything.
 */
async function setFinancials(page: Page, level: "none" | "read" | "write"): Promise<number> {
    const radio = page.getByTestId(`access-role-area-financials-${level}`);
    await expect(radio, "the Financials area must offer this level").toBeVisible();
    await radio.click();

    const [response] = await Promise.all([
        page.waitForResponse((r) => r.url().includes("/api/admin/rbac/roles/") && r.request().method() !== "GET"),
        page.getByTestId("access-role-save").click(),
    ]);
    return response.status();
}

/** Sign a persona in and report where the shell put them. Admission is observed, never asserted. */
async function signIn(browser: Browser, email: string): Promise<{ page: Page; context: BrowserContext }> {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(email);
    const pw = page.locator('input[type="password"]').first();
    await pw.fill(PASSWORD);
    await pw.press("Enter");
    await page.waitForURL("**/workspace**", { timeout: 180_000 });
    await page.waitForLoadState("domcontentloaded");
    return { page, context };
}

/** Does this principal's shell offer Financials, as of a FRESH authoritative request? */
async function offersFinancials(page: Page): Promise<boolean> {
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    return (await page.locator(FIN_NAV).count()) > 0;
}

/** The rendered history entries in one placement. */
function entries(page: Page, testId: string) {
    return page.getByTestId(`${testId}-event`);
}

test.describe.configure({ mode: "serial" });

test.describe("D2 — access change audit, mounted", () => {
    let target: { page: Page; context: BrowserContext } | null = null;

    test.afterAll(async () => {
        await target?.context.close();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 1 — the grant vertical.
    // ─────────────────────────────────────────────────────────────────────────
    test("the target starts with no Financials, through their own signed-in shell", async ({ browser }) => {
        target = await signIn(browser, TARGET_EMAIL);
        // NON-VACUITY. If this persona already held Financials the grant below would prove nothing.
        expect(await offersFinancials(target.page), "the controlled target must start without Financials").toBe(false);
    });

    test("granting Financials through the existing role editor reaches the target immediately", async ({ page }) => {
        await openRole(page, ROLE_KEY);

        // The editor's own starting statement, in the operator's words.
        const areaRow = page.getByTestId(`access-role-area-financials`);
        await expect(areaRow).toHaveAttribute("data-authority", "none");

        const status = await setFinancials(page, "read");
        expect(status, "the save must succeed through the canonical Access route").toBeLessThan(400);

        /*
         * NO SLEEP HERE, DELIBERATELY. The next line is the target's next authoritative request. If
         * the cache were invalidated before the commit, or not at all, this is where it shows —
         * either as a grant that has not landed or as one that landed before it was durable.
         */
        expect(await offersFinancials(target!.page), "the target must hold Financials on their very next request").toBe(true);
    });

    test("the role's own Change history card carries the grant, in operator language", async ({ page }) => {
        await openRole(page, ROLE_KEY);

        const card = page.getByTestId("access-role-history");
        await expect(card, "role history lives beside the editor that writes it").toBeVisible();

        const rows = entries(page, "access-role-history-list");
        await expect(rows.first()).toBeVisible();

        const summary = page.getByTestId("access-role-history-list-summary").first();
        const text = (await summary.innerText()).trim();
        expect(text).toContain("Financials");
        // The raw capability key is technical detail, never the product's sentence.
        expect(text, "history must not be a key wall").not.toMatch(RAW_KEY);

        const change = page.getByTestId("access-role-history-list-change").first();
        await expect(change).toContainText("Financials");
        await expect(change).toContainText("No access");
        await expect(change).toContainText("View");

        // Keys ARE available, one disclosure away, for whoever needs them.
        await page.getByTestId("access-role-history-list-detail-toggle").first().click();
        await expect(page.getByTestId("access-role-history-list-detail").first()).toContainText("fin.read");
    });

    test("the organization Security audit log carries the same event", async ({ page }) => {
        await page.goto(SECURITY, { waitUntil: "domcontentloaded" });
        await expect(page.getByTestId("access-security-page")).toBeVisible();

        const card = page.getByTestId("access-security-audit-log");
        await expect(card, "the Security chapter already claimed access auditing").toBeVisible();

        // The placeholder is gone: this card carries committed events.
        await expect(card).not.toContainText("planned");
        await expect(card).not.toContainText("History planned");

        const rows = entries(page, "access-security-audit-log-list");
        await expect(rows.first()).toBeVisible();
        await expect(page.getByTestId("access-security-audit-log-list-summary").first()).toContainText("Financials");
    });

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 2 — the revoke vertical.
    // ─────────────────────────────────────────────────────────────────────────
    test("revoking Financials removes it from the target immediately and adds a second event", async ({ page }) => {
        await openRole(page, ROLE_KEY);
        const before = await entries(page, "access-role-history-list").count();

        const status = await setFinancials(page, "none");
        expect(status).toBeLessThan(400);

        expect(await offersFinancials(target!.page), "the target must lose Financials on their very next request").toBe(false);

        await openRole(page, ROLE_KEY);
        const rows = entries(page, "access-role-history-list");
        await expect(rows.first()).toBeVisible();
        expect(await rows.count(), "the revoke is its own event, not an edit of the grant").toBeGreaterThan(before);

        // Newest first: the revoke is on top, and it says the opposite of the grant.
        const newest = page.getByTestId("access-role-history-list-change").first();
        await expect(newest).toContainText("View");
        await expect(newest).toContainText("No access");
    });

    test("grant and revoke are separate correlated actions, not one", async ({ page }) => {
        await openRole(page, ROLE_KEY);
        const toggles = page.getByTestId("access-role-history-list-detail-toggle");
        await toggles.nth(0).click();
        const firstDetail = (await page.getByTestId("access-role-history-list-detail").first().innerText());
        await toggles.nth(0).click();
        await toggles.nth(1).click();
        const secondDetail = (await page.getByTestId("access-role-history-list-detail").first().innerText());

        const correlation = (t: string) => t.split("\n").map((l) => l.trim());
        expect(correlation(firstDetail).join("|")).not.toBe(correlation(secondDetail).join("|"));
    });

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 18 — cold reload. History is reconstructed from the server, not remembered.
    // ─────────────────────────────────────────────────────────────────────────
    test("a cold reload rebuilds history and the current access from the server", async ({ browser }) => {
        const fresh = await browser.newContext({ storageState: OPERATOR_STATE });
        const page = await fresh.newPage();
        await openRole(page, ROLE_KEY);

        await expect(entries(page, "access-role-history-list").first()).toBeVisible();
        expect(await entries(page, "access-role-history-list").count()).toBeGreaterThanOrEqual(2);

        // Current state, not history: the revoke is the standing truth.
        await expect(page.getByTestId("access-role-area-financials")).toHaveAttribute("data-authority", "none");

        await page.goto(SECURITY, { waitUntil: "domcontentloaded" });
        await expect(entries(page, "access-security-audit-log-list").first()).toBeVisible();

        await fresh.close();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 3 — the user placement carries only that person's events.
    // ─────────────────────────────────────────────────────────────────────────
    test("a person's history card shows their own access changes and not their role's", async ({ page }) => {
        await page.goto(USERS, { waitUntil: "domcontentloaded" });
        await expect(page.getByTestId("access-users-page")).toBeVisible();

        const members = page.locator('[role="option"][data-testid^="access-user-"]');
        await expect(members.first()).toBeVisible();
        await members.first().click();
        await expect(page.getByTestId("access-user-selected-workspace")).toBeVisible();

        const card = page.getByTestId("access-user-history");
        await expect(card, "history is a CARD in the selected-user workspace").toBeVisible();

        // Whatever it holds, it holds nothing about a ROLE's capability package — that belongs to the
        // role's own history, and showing it here would imply this person was individually changed.
        const kinds = await entries(page, "access-user-history-list").evaluateAll((els) =>
            els.map((e) => e.getAttribute("data-command-key") ?? "")
        );
        for (const kind of kinds) {
            expect(kind, "a role's capability change is not a change to this person").not.toBe("access.role.grants_changed");
        }
    });

    test("history is a card, never a tab — the chapter bar is still the only tab bar", async ({ page }) => {
        await page.goto(USERS, { waitUntil: "domcontentloaded" });
        const members = page.locator('[role="option"][data-testid^="access-user-"]');
        await expect(members.first()).toBeVisible();
        await members.first().click();
        await expect(page.getByTestId("access-user-selected-workspace")).toBeVisible();

        // W-57 removed a History TAB whose only content was "history planned". The finding was about
        // a navigable destination with nothing in it, not about history.
        await expect(page.locator('[role="tab"]', { hasText: /^History$/ })).toHaveCount(0);
        await expect(page.getByTestId("access-user-history")).toBeVisible();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 19 — four truthful states.
    // ─────────────────────────────────────────────────────────────────────────
    test("loading is the initial state and never claims the history is empty", async ({ page }) => {
        // Hold the response open, so the state before it is observable rather than inferred.
        let release: (() => void) | null = null;
        const held = new Promise<void>((resolve) => { release = resolve; });
        await page.route("**/api/admin/access/history**", async (route) => {
            await held;
            await route.continue();
        });

        await page.goto(SECURITY, { waitUntil: "domcontentloaded" });
        await expect(page.getByTestId("access-security-audit-log-list-loading")).toBeVisible();
        // The lie W-57 removed, in a new place: an answer asserted before the product has one.
        await expect(page.getByTestId("access-security-audit-log-list-empty")).toHaveCount(0);

        release!();
        await expect(page.getByTestId("access-security-audit-log-list-loading")).toHaveCount(0);
        await expect(entries(page, "access-security-audit-log-list").first()).toBeVisible();
    });

    test("an error is visibly an error, and never reassures the operator that nothing happened", async ({ page }) => {
        await page.route("**/api/admin/access/history**", (route) =>
            route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "boom" }) })
        );

        await page.goto(SECURITY, { waitUntil: "domcontentloaded" });
        const error = page.getByTestId("access-security-audit-log-list-error");
        await expect(error).toBeVisible();
        // "Nothing happened" and "we could not find out" are different answers.
        await expect(page.getByTestId("access-security-audit-log-list-empty")).toHaveCount(0);
        await expect(entries(page, "access-security-audit-log-list")).toHaveCount(0);
        await expect(error).not.toContainText(/no access changes/i);
    });

    test("an empty history says so truthfully, and never says it is planned", async ({ page }) => {
        // A person with no recorded access changes of their own.
        await page.route("**/api/admin/access/history**", (route) =>
            route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ entries: [], next_cursor: null, limit: 25 }) })
        );

        await page.goto(SECURITY, { waitUntil: "domcontentloaded" });
        const empty = page.getByTestId("access-security-audit-log-list-empty");
        await expect(empty).toBeVisible();
        await expect(empty).not.toContainText(/planned/i);
        await expect(page.getByTestId("access-security-audit-log-list-error")).toHaveCount(0);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 17 (mounted half) — Load more appends without repeating.
    // ─────────────────────────────────────────────────────────────────────────
    test("Load more appends the next page without repeating a row", async ({ page }) => {
        await page.goto(SECURITY, { waitUntil: "domcontentloaded" });
        await expect(entries(page, "access-security-audit-log-list").first()).toBeVisible();

        const more = page.getByTestId("access-security-audit-log-list-load-more");
        if (await more.count()) {
            const before = await entries(page, "access-security-audit-log-list").allTextContents();
            await more.click();
            await expect
                .poll(async () => (await entries(page, "access-security-audit-log-list").count()))
                .toBeGreaterThan(before.length);
            const after = await entries(page, "access-security-audit-log-list").allTextContents();
            expect(after.slice(0, before.length), "the first page must not be re-fetched or reordered").toEqual(before);
        } else {
            // Non-vacuity: say so rather than passing silently on a stack with one page of history.
            test.info().annotations.push({ type: "note", description: "organization history fits one page; boundary certified in the live suite" });
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // RESTORE. The role goes back to the package the fixture gave it.
    // ─────────────────────────────────────────────────────────────────────────
    test("puts the controlled role back", async ({ page }) => {
        await openRole(page, ROLE_KEY);
        await expect(page.getByTestId("access-role-area-financials")).toHaveAttribute("data-authority", "none");
        expect(await offersFinancials(target!.page)).toBe(false);
    });
});
