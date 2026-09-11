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
import { test, expect, type APIRequestContext, type Page, type BrowserContext, type Browser } from "@playwright/test";
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

/**
 * The person whose MEMBERSHIP is changed, to prove the user placement carries their own events.
 *
 * `cert.ops` from `fixtures/access-personas.mjs`, deliberately not the Financials target: replacing
 * the target's role mid-file would move the ground under the propagation proofs either side of it.
 */
const SUBJECT_USER_ID = "c0000000-0000-4000-8000-00000000d003";
const SUBJECT_ORIGINAL_ROLE = "ops";
const SUBJECT_REPLACEMENT_ROLE = "mcert_front_desk";

const FIN_NAV = '[data-adminv2-sidebar-modal-nav="financials"]';

/** A dotted capability key. Correct in technical detail, wrong as the product's sentence. */
const RAW_KEY = /\b[a-z_]+\.[a-z_.]+\b/;

/**
 * An operator's identity is an email address, and an email address is dot-shaped.
 *
 * The first run of this spec convicted the correct sentence — "qa.operator@northwind.invalid changed
 * Portal only — Financials from No access to View" — of being a key wall, because `qa.operator` looks
 * like `fin.read` to a shape test. The names are the canonical identities the members route already
 * renders; what must not appear is a CAPABILITY key, so the actor is set aside before the shape is
 * tested rather than the test being loosened.
 */
function withoutIdentities(text: string): string {
    return text.replace(/\S+@\S+/g, "«actor»");
}

/**
 * Navigate to an Access chapter and wait until exactly ONE copy of it is mounted.
 *
 * ── THE RACE THIS CLOSES ──
 *
 * A cold production server briefly serves two copies of a chapter — the server-rendered one and the
 * hydrating client one — so `access-security-page`, `access-roles-page` and friends each resolve to
 * two elements for a few hundred milliseconds after the navigation. Playwright's strict mode
 * correctly refuses to guess which one an assertion meant, and the run fails on a locator that was
 * about to be fine. On a warm server the window is too short to see; after a server restart it
 * reproduced on almost every run, which is the shape of a race rather than of a defect.
 *
 * The honest fix is a readiness condition, not forty scoped locators and not a sleep: `toHaveCount(1)`
 * retries until the duplicate has resolved, and every locator downstream is then unambiguous.
 */
async function gotoSurface(page: Page, url: string, pageTestId: string) {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await expect(
        page.getByTestId(pageTestId),
        "the chapter must settle to a single mounted copy before it is asserted on"
    ).toHaveCount(1);
}

async function openRole(page: Page, roleKey: string) {
    await gotoSurface(page, `${ROLES}&roleKey=${roleKey}`, "access-roles-page");
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

/**
 * Replace the selected person's role set through the mounted editor, and wait for the server.
 *
 * The W-17 acknowledgement only appears when the save would DISCARD another role, so it is ticked
 * when present rather than assumed — the certification must not depend on how many roles the persona
 * happens to hold today.
 */
async function replaceUserRole(page: Page, roleKey: string) {
    /*
     * TAB-AGNOSTIC ON PURPOSE. "Change role & access" lives in the OVERVIEW tab, so a helper that
     * always clicks it works the first time and then hangs for four minutes the second, because by
     * then the workspace is already on the access tab and that control no longer exists. The editor
     * is the destination; how we get there depends on where we already are.
     */
    const select = page.getByTestId("access-user-role-select");
    if (!(await select.count())) {
        // "Edit User" sits in the workspace header, above the tabs, so it is reachable from any of them.
        await page.getByTestId("access-user-edit").click();
    }
    await expect(select, "the mounted role editor must offer a replacement").toBeVisible();
    await select.selectOption(roleKey);

    const confirm = page.getByTestId("access-user-role-replace-confirm");
    if (await confirm.count()) await confirm.check();

    const [response] = await Promise.all([
        page.waitForResponse((r) => /\/api\/admin\/users\/.+\/role/.test(r.url()) && r.request().method() !== "GET"),
        page.getByTestId("access-user-role-save").click(),
    ]);
    expect(response.status(), await response.text()).toBeLessThan(400);
}

/**
 * THE SUBJECT'S BASELINE, ESTABLISHED RATHER THAN ASSUMED.
 *
 * ── THE DEFECT THIS EXISTS FOR ──
 *
 * The user-history scenario replaces `cert.ops`'s role and puts it back at the end. A run that
 * ABORTS between those two points leaves the persona holding the replacement role — and the next
 * run's replacement is then a no-op. The editor correctly disables a no-op save, so nothing is sent,
 * and the scenario fails four minutes later on a response that was never going to arrive. The
 * failure names the wrong thing: it reads as "the product did not save" when the truth is "the
 * previous run did not finish". That is exactly how this was first seen, and a certification that
 * depends on how the last run happened to end is not a certification.
 *
 * So setup does not assume, and does not blindly write either:
 *   1. READ the canonical state through the members read model the surface itself uses.
 *   2. RESTORE through the canonical PATCH — the same route the editor calls — only if it is owed.
 *   3. VERIFY by reading again, and FAIL SETUP if the baseline is not what it must be.
 *
 * No raw table writes: the RPC behind that route is the audited producer, and reaching around it to
 * tidy fixture state would be a second, unaudited way to change access — the exact hole D2 closed.
 */
async function readSubjectRoles(request: APIRequestContext): Promise<string[]> {
    const res = await request.get("/api/admin/settings/users-roles/members");
    expect(res.status(), "setup must be able to read the members model").toBeLessThan(400);
    const json = (await res.json()) as { members?: { user_id: string; role_keys?: string[] }[] };
    const member = (json.members ?? []).find((m) => m.user_id === SUBJECT_USER_ID);
    expect(member, `setup requires the persona ${SUBJECT_USER_ID}; run the access-personas fixture`).toBeTruthy();
    return [...(member?.role_keys ?? [])].sort();
}

async function restoreSubjectBaseline(request: APIRequestContext) {
    const before = await readSubjectRoles(request);

    if (before.join(",") !== SUBJECT_ORIGINAL_ROLE) {
        const res = await request.patch(`/api/admin/users/${SUBJECT_USER_ID}/role`, {
            data: { role: SUBJECT_ORIGINAL_ROLE, expected_role_keys: before },
        });
        expect(
            res.status(),
            `setup could not restore ${SUBJECT_USER_ID} to "${SUBJECT_ORIGINAL_ROLE}" from [${before.join(", ")}]: ${await res.text()}`
        ).toBeLessThan(400);
    }

    const after = await readSubjectRoles(request);
    expect(
        after,
        "setup must establish the exact baseline before the scenario runs — a run that cannot is a failed setup, not a product failure"
    ).toEqual([SUBJECT_ORIGINAL_ROLE]);
}

/**
 * Close the floating operator assistant the way an operator closes it.
 *
 * ── WHAT WAS INTERCEPTING THE CLICK, AND WHY IT IS NOT A WORKAROUND ──
 *
 * The BOS rail mounts in `floating` mode with operator-controlled geometry, `pointer-events: auto`
 * and `z-index: 95`. At this viewport it occupies x 856–1256, y 80–696 — and "Change role & access"
 * sits at x 877–1036, y 391–421, entirely underneath it. `document.elementFromPoint` at the button's
 * centre returns the rail's conversation region, not the button. So the interception is REAL: an
 * operator with the assistant floating there cannot click that control either, and Playwright
 * retrying for four minutes was reporting the truth rather than being fussy.
 *
 * The first attempt at this clicked a page-wide "Close" and then overrode `pointer-events` when that
 * appeared not to work. Both were wrong. The page-wide locator matched a different Close control in
 * the shell, and the override would have hidden a genuine pointer conflict behind a green test —
 * which is precisely how a certification starts lying. Scoped to the rail, its own Close button
 * removes it from the DOM entirely and the click then lands on the button.
 *
 * So this is the canonical operator interaction, and the readiness condition is the rail's ABSENCE
 * rather than a sleep.
 */
async function closeOperatorAssistant(page: Page) {
    const rail = page.locator("[data-adminv2-bos-rail-overlay]");
    if (!(await rail.count())) return;
    await rail.getByRole("button", { name: "Close" }).first().click();
    await expect(rail, "the assistant must actually be gone before the surface beneath it is used").toHaveCount(0);
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

    /*
     * A CERTIFICATION HAS TO BE RE-RUNNABLE, so the controlled role is put back to its starting
     * package here rather than only at the end. A run that aborts mid-matrix — which is exactly what
     * happened the first time this file ran — otherwise leaves the role holding Financials, and the
     * NEXT run's opening non-vacuity check fails for a reason that has nothing to do with the product.
     */
    test.beforeAll(async ({ browser }) => {
        const context = await browser.newContext({ storageState: OPERATOR_STATE });
        const res = await context.request.patch(`/api/admin/rbac/roles/${ROLE_KEY}`, {
            data: { permission_keys: ["portal.access"] },
        });
        expect(res.status(), await res.text()).toBeLessThan(400);

        // AND THE SUBJECT'S MEMBERSHIP — read, restore, then VERIFY. See `restoreSubjectBaseline`.
        await restoreSubjectBaseline(context.request);

        await context.close();
    });

    test.afterAll(async () => {
        await target?.context.close();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 0 — the certification can survive its own abort.
    // ─────────────────────────────────────────────────────────────────────────
    test("setup restores the subject's baseline after a run that aborted mid-scenario", async ({ browser }) => {
        /*
         * The regression for the failure that cost this matrix two runs: an aborted run left
         * `cert.ops` on the replacement role, and the next run's save was a silently-disabled no-op.
         * This reproduces that leftover state deliberately — through the canonical route, so the
         * abort is simulated honestly — and then requires setup to put it back.
         *
         * If this ever fails, the suite has gone back to depending on how the previous run ended.
         */
        const context = await browser.newContext({ storageState: OPERATOR_STATE });

        // Leave the mess an aborted run leaves.
        const dirtied = await context.request.patch(`/api/admin/users/${SUBJECT_USER_ID}/role`, {
            data: { role: SUBJECT_REPLACEMENT_ROLE },
        });
        expect(dirtied.status(), await dirtied.text()).toBeLessThan(400);
        expect(await readSubjectRoles(context.request)).toEqual([SUBJECT_REPLACEMENT_ROLE]);

        // Setup must clean it up, and say so.
        await restoreSubjectBaseline(context.request);
        expect(await readSubjectRoles(context.request)).toEqual([SUBJECT_ORIGINAL_ROLE]);

        // And it must be idempotent: a second run over an ALREADY-clean baseline is also fine.
        await restoreSubjectBaseline(context.request);
        expect(await readSubjectRoles(context.request)).toEqual([SUBJECT_ORIGINAL_ROLE]);

        await context.close();
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
        expect(withoutIdentities(text), "history must not be a key wall").not.toMatch(RAW_KEY);
        // And the specific leak this guards against, named rather than inferred from a shape.
        expect(text).not.toContain("fin.read");

        /*
         * THE SENTENCE CARRIES IT. A single-change event states the whole change in its summary, so
         * the per-row list would repeat it word for word — the list appears when there is more than
         * one change and the summary can only say "and N more".
         */
        expect(text).toMatch(/Financials from No access to View/);
        await expect(page.getByTestId("access-role-history-list-change").first()).toHaveCount(0);

        // Keys ARE available, one disclosure away, for whoever needs them.
        await page.getByTestId("access-role-history-list-detail-toggle").first().click();
        await expect(page.getByTestId("access-role-history-list-detail").first()).toContainText("fin.read");
    });

    test("the organization Security audit log carries the same event", async ({ page }) => {
        await gotoSurface(page, SECURITY, "access-security-page");
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
        /*
         * The NEWEST ROW, not the row COUNT. This card pages at five, so a sixth event cannot make
         * the list longer — the first version of this assertion counted rows and failed against a
         * product that was behaving perfectly. What proves the revoke is its own event is that the
         * top of the feed changed, and that the feed still offers the grant below it.
         */
        const before = (await page.getByTestId("access-role-history-list-summary").first().innerText()).trim();

        const status = await setFinancials(page, "none");
        expect(status).toBeLessThan(400);

        expect(await offersFinancials(target!.page), "the target must lose Financials on their very next request").toBe(false);

        await openRole(page, ROLE_KEY);
        const rows = entries(page, "access-role-history-list");
        await expect(rows.first()).toBeVisible();
        const after = (await page.getByTestId("access-role-history-list-summary").first().innerText()).trim();
        expect(after, "the revoke is its own event, not an edit of the grant").not.toBe(before);

        // The grant did not disappear when the revoke landed — history accumulates, it does not
        // replace. It is on this page or behind Load more; either way the feed still holds it.
        const summaries = await page.getByTestId("access-role-history-list-summary").allInnerTexts();
        const hasGrantHere = summaries.some((t) => t.includes("No access to View"));
        expect(
            hasGrantHere || (await page.getByTestId("access-role-history-list-load-more").count()) > 0,
            "the grant must still be reachable in history after the revoke"
        ).toBe(true);

        // Newest first: the revoke is on top, and it says the opposite of the grant.
        const newest = page.getByTestId("access-role-history-list-summary").first();
        await expect(newest).toContainText("Financials from View to No access");
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

        await gotoSurface(page, SECURITY, "access-security-page");
        await expect(entries(page, "access-security-audit-log-list").first()).toBeVisible();

        await fresh.close();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 3 — the user placement carries only that person's events.
    // ─────────────────────────────────────────────────────────────────────────
    test("a person's history card shows their own access changes and not their role's", async ({ page }) => {
        /*
         * THE NEGATIVE HALF USED TO BE THE WHOLE TEST, AND IT PASSED ON AN EMPTY CARD.
         *
         * This selected whichever member sorted first and then asserted only that no
         * `access.role.grants_changed` row appeared. A person nobody had ever changed satisfies that
         * perfectly — the card rendered "No access changes have been recorded for this person yet."
         * and the assertion looped zero times. The evidence run is what exposed it: the screenshot
         * named `05-user-access-history` was a picture of the empty state.
         *
         * So the mutation is made HERE, on a named persona, through the mounted editor, and the
         * positive half is asserted before the negative one. `cert.ops` is used rather than the
         * Financials target because a role replacement on the target would disturb the propagation
         * proofs either side of this test.
         */
        await gotoSurface(page, USERS, "access-users-page");
        await expect(page.getByTestId("access-users-page")).toBeVisible();

        await closeOperatorAssistant(page);
        await page.getByTestId(`access-user-${SUBJECT_USER_ID}`).click();
        await expect(page.getByTestId("access-user-selected-workspace")).toBeVisible();

        // A role replacement THROUGH THE EXISTING editor — the user-affecting mutation Phase 3 asks
        // for, and the one that produces `access.user.roles_changed` rather than a role's own event.
        await replaceUserRole(page, SUBJECT_REPLACEMENT_ROLE);

        const card = page.getByTestId("access-user-history");
        await expect(card, "history is a CARD in the selected-user workspace").toBeVisible();
        await card.scrollIntoViewIfNeeded();

        const rows = entries(page, "access-user-history-list");
        await expect(rows.first(), "the change just made must be in this person's history").toBeVisible();

        const kinds = await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-command-key") ?? ""));

        // THE POSITIVE HALF: their own change is here, and the card is not empty.
        expect(kinds, "this person's own membership change belongs in their history").toContain(
            "access.user.roles_changed"
        );

        // THE NEGATIVE HALF: it holds nothing about a ROLE's capability package — that belongs to the
        // role's own history, and showing it here would imply this person was individually changed.
        for (const kind of kinds) {
            expect(kind, "a role's capability change is not a change to this person").not.toBe("access.role.grants_changed");
        }

        /*
         * The history the certification just wrote is permanent; the membership it describes is not.
         *
         * Put back through the CANONICAL ROUTE rather than by driving the editor a second time. The
         * scenario's claim is about the mounted mutation above and the card that reports it, and one
         * mounted mutation proves that. A second consecutive save on the same screen races the
         * `router.refresh()` the first one triggers: the re-render clears the W-17 acknowledgement,
         * the handler's guard then returns without sending anything, and the cleanup hangs on a
         * response that was never going to come. That race is not user-visible — the operator sees
         * the box untick and the button disable — so it is housekeeping, not a defect to certify
         * here, and the restore uses the same audited producer either way.
         */
        await restoreSubjectBaseline(page.request);
    });

    test("history is a card, never a tab — the chapter bar is still the only tab bar", async ({ page }) => {
        await gotoSurface(page, USERS, "access-users-page");
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

        await gotoSurface(page, SECURITY, "access-security-page");
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

        await gotoSurface(page, SECURITY, "access-security-page");
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

        await gotoSurface(page, SECURITY, "access-security-page");
        const empty = page.getByTestId("access-security-audit-log-list-empty");
        await expect(empty).toBeVisible();
        await expect(empty).not.toContainText(/planned/i);
        await expect(page.getByTestId("access-security-audit-log-list-error")).toHaveCount(0);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 17 (mounted half) — Load more appends without repeating.
    // ─────────────────────────────────────────────────────────────────────────
    test("Load more appends the next page without repeating a row", async ({ page }) => {
        await gotoSurface(page, SECURITY, "access-security-page");
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

        // The portal capability the fixture gave it is still there — the matrix moved Financials and
        // nothing else.
        const res = await page.request.get(`/api/admin/rbac/grants?role_key=${ROLE_KEY}`);
        expect(JSON.stringify(await res.json())).toContain("portal.access");
    });
});
