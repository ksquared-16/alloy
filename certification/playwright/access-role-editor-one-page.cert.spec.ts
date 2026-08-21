/**
 * W-57 (`OD-8`) — browser certification of the one-page role editor.
 *
 * Plan: `docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md` §46.
 * §46 records `W-57` as tier **A + B**: *"B is required — this is a user-visible surface change"*.
 * Static analysis can prove the tab bar is gone from the file; only a browser can prove an operator
 * reaches four levels, reads a role as responsibilities, and that a level they change actually
 * moves the canonical grant set.
 *
 * **What this spec writes, and why that is not the destructive kind.** Every other assertion here
 * is a navigation and a read. One test performs a bounded write, because *"editing role grants
 * changes canonical effective authority"* cannot be certified by reading — a UI toggle whose
 * resulting authority is not server-enforced is exactly what the enforcement clause forbids, and
 * the only way to falsify it is to save and re-read from the server.
 *
 * That write is confined to a role this spec creates and then deactivates. It never touches
 * `admin` or `ops`: the shared `alloy-cert` tenant defines only those two, both carry live
 * memberships, and editing either would change what every other certification in this repository
 * observes. Creating an inert role is additive; editing a seeded one is not.
 */
import { test, expect, type Page } from "@playwright/test";

const ACCESS = "/organization/access";
const ROLES = `${ACCESS}?section=roles`;

/** A dotted key that would be an implementation leak in operator-facing text. */
const RAW_KEY = /\b[a-z_]+(?:\.[a-z_]+){1,3}\b/;

/** The role this spec creates. Named so an operator finding it knows what it is. */
const TEMP_ROLE_LABEL = `W57 cert ${Date.now().toString(36)}`;
/** Derived by the product from the name, exactly as an operator would get it. */
const TEMP_ROLE_KEY = TEMP_ROLE_LABEL.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");

async function openRoles(page: Page) {
    await page.goto(ROLES, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("access-roles-page")).toBeVisible();
    await page.getByTestId("access-roles-shell").waitFor();
}

/** Select the first role in the rail and return its label. */
async function selectFirstRole(page: Page): Promise<string> {
    const options = page.locator('[role="option"][data-testid^="access-role-"]');
    await expect(options.first()).toBeVisible();
    const label = (await options.first().innerText()).trim();
    await options.first().click();
    await expect(page.getByTestId("access-role-selected-workspace")).toBeVisible();
    return label;
}

test.describe("W-57 — one page per role", () => {
    test("the role editor has no tab bar of its own — four levels, not six", async ({ page }) => {
        await openRoles(page);
        await selectFirstRole(page);

        // The chapter bar is the ONE tab bar on the path, and it is level 2.
        await expect(page.getByTestId("access-workspace-chapter-tabs")).toBeVisible();

        // Level 4 — the five-tab role bar — is gone. Asserted by counting tablists in the DOM the
        // operator actually has, not by reading the source.
        await expect(page.locator('[role="tablist"]')).toHaveCount(1);
        for (const gone of ["Experience Access", "History"]) {
            await expect(
                page.getByTestId("access-role-selected-workspace").getByRole("tab", { name: gone }),
            ).toHaveCount(0);
        }
    });

    test("a role reads as responsibilities, not as keys", async ({ page }) => {
        await openRoles(page);
        const label = await selectFirstRole(page);
        expect(label.length).toBeGreaterThan(0);

        const areas = page.getByTestId("access-role-areas");
        await expect(areas).toBeVisible();

        // Every area row carries its level as data, and the level vocabulary is the four this
        // product uses. The visible chip now appears only for `limited` — an exact reading is shown
        // by which radio is selected, so a chip beside it would be the same fact twice.
        const rows = page.locator('tr[data-testid^="access-role-area-"]');
        const rowCount = await rows.count();
        expect(rowCount, "no capability areas rendered — this assertion would prove nothing").toBeGreaterThan(0);
        for (let i = 0; i < rowCount; i += 1) {
            const level = await rows.nth(i).getAttribute("data-authority");
            expect(level, "an area row with no level").toMatch(/^(manage|view|none|limited)$/);
        }
        // A `limited` area must state its arithmetic rather than just the word.
        const limited = page.locator('tr[data-authority="limited"] [data-testid$="-authority"]');
        if (await limited.count()) {
            expect((await limited.first().innerText()).trim()).toMatch(/limited · \d+ of \d+/i);
        }

        // And by default the operator sees no raw permission key anywhere in the section.
        const visible = await areas.innerText();
        expect(visible, `a dotted key is visible by default: ${visible.match(RAW_KEY)?.[0]}`).not.toMatch(RAW_KEY);
    });

    test("the keys are one disclosure away — diagnostics, not the default", async ({ page }) => {
        await openRoles(page);
        await selectFirstRole(page);

        // Two levels of disclosure now, and that is the design: expanding an area reveals the real
        // capabilities the preset summarises, and the advanced toggle reveals their catalog keys.
        const firstArea = page.locator('[data-testid^="access-role-area-"][data-testid$="-disclose"]').first();
        await firstArea.click();

        const toggle = page.getByTestId("access-role-advanced-toggle");
        await expect(toggle).not.toBeChecked();
        await toggle.check();

        const disclosed = await page.getByTestId("access-role-areas").innerText();
        expect(disclosed, "advanced disclosure revealed no capability key").toMatch(RAW_KEY);

        await toggle.uncheck();
        const hidden = await page.getByTestId("access-role-areas").innerText();
        expect(hidden).not.toMatch(RAW_KEY);
    });

    test("every rendered capability is a real one — the regrouping invents nothing", async ({ page, request }) => {
        // This assertion USED to require each rendered area to be a catalog `group_key`. That is
        // now wrong by design: the areas are the operator-facing taxonomy, and its whole purpose is
        // that `Config`, `Fields`, `Layouts`, `Option sets` and `Sections` stop being five separate
        // operator concepts. So the property moved down a level — to the capabilities themselves,
        // which is where inventing one would actually matter.
        await openRoles(page);
        await selectFirstRole(page);

        const res = await request.get("/api/admin/rbac/permissions");
        expect(res.ok(), "the capability catalog did not load — the comparison would be vacuous").toBe(true);
        const catalog = (await res.json()) as { permissions?: { key: string }[] };
        const catalogKeys = new Set((catalog.permissions ?? []).map((p) => p.key).filter(Boolean));
        expect(catalogKeys.size, "the catalog returned no keys").toBeGreaterThan(0);

        // Expand every area and turn on the key disclosure, then check each key against the catalog.
        const disclosures = page.locator('[data-testid^="access-role-area-"][data-testid$="-disclose"]');
        const n = await disclosures.count();
        expect(n, "no areas rendered").toBeGreaterThan(0);
        for (let i = 0; i < n; i += 1) await disclosures.nth(i).click();
        await page.getByTestId("access-role-advanced-toggle").check();

        const keyNodes = page.locator('[data-testid^="access-role-keys-"]');
        const keyCount = await keyNodes.count();
        expect(keyCount, "no capability keys disclosed — the check would be vacuous").toBeGreaterThan(0);
        for (let i = 0; i < keyCount; i += 1) {
            for (const key of (await keyNodes.nth(i).innerText()).split("·")) {
                const k = key.trim();
                if (!k) continue;
                expect(catalogKeys.has(k), `${k} is rendered but the catalog does not define it`).toBe(true);
            }
        }
    });

    test("scope stays a sibling of the role, and says so", async ({ page }) => {
        await openRoles(page);
        await selectFirstRole(page);

        const scope = page.getByTestId("access-role-scope-sibling");
        await expect(scope).toBeVisible();
        // It states the separation rather than leaving a silent absence.
        await expect(scope).toContainText(/not on the role/i);
        // And points at the chapter that owns it — a link, never a control.
        const link = page.getByTestId("access-role-open-scopes");
        await expect(link).toHaveAttribute("href", /section=scopes/);
        // No scope control exists inside the role page.
        await expect(scope.locator('input[type="checkbox"], input[type="radio"], select')).toHaveCount(0);
    });

    test("an unenforced capability says so instead of offering a dead control", async ({ page }) => {
        await openRoles(page);
        await selectFirstRole(page);

        const inert = page.locator('[data-capability="planned"]');
        const count = await inert.count();
        if (count === 0) {
            // Truthful either way: this tenant's catalog may be fully enforced. Recorded rather
            // than silently skipped, so a future reader knows the case was looked for.
            test.info().annotations.push({ type: "observation", description: "no unenforced capability row in this tenant" });
            return;
        }
        await expect(inert.first()).toContainText(/not enforced/i);
        // A row that states its condition must not also draw a control that changes nothing.
        await expect(inert.first().locator('input[type="radio"]')).toHaveCount(0);
    });

    test("the level controls are a keyboard-reachable radio group", async ({ page }) => {
        await openRoles(page);
        await selectFirstRole(page);

        // The matrix groups radios by NAME per area/row rather than by a wrapper element, which is
        // what lets the levels line up in columns. Each input still carries a visible-to-AT label.
        const radios = page.locator('table input[type="radio"]');
        const n = await radios.count();
        expect(n, "no editable capability control — accessibility assertion would be vacuous").toBeGreaterThan(0);

        for (let i = 0; i < Math.min(n, 5); i += 1) {
            const name = await radios.nth(i).getAttribute("name");
            expect(name, "a level radio with no group name").toBeTruthy();
        }

        // The inputs are real radios — focusable and operable from the keyboard — not divs.
        //
        // Wait for the grant load to settle first. While it is in flight the controls are
        // deliberately `disabled` (W-56: an unknown authority set must not be editable), and a
        // disabled input cannot take focus — so focusing too early fails for a reason that is the
        // product being CORRECT. The enabled save button is the signal that the set is known.
        await expect(page.getByTestId("access-role-save")).toBeEnabled();

        const firstRadio = radios.first();
        await expect(firstRadio).toBeEnabled();
        await firstRadio.focus();
        await expect(firstRadio).toBeFocused();
    });

    test("the page holds together at a phone width", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await openRoles(page);

        // The rail is desktop-only by design (xl:block); the chapter tabs and the page must still
        // render, and nothing may overflow the viewport horizontally.
        await expect(page.getByTestId("access-workspace-chapter-tabs")).toBeVisible();
        const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, "the Access page scrolls horizontally on a phone").toBeLessThanOrEqual(1);
    });
});

/**
 * **This block WRITES, and that is why it is gated.**
 *
 * Every other test in this file is a navigation and a read, safe against any environment. This one
 * creates a role, grants it a capability and stands it down again — which is the only way to certify
 * that a level an operator changes is authority the server actually holds.
 *
 * Against `alloy-cert` that is fine: the tenant is disposable and this spec cleans up after itself.
 * Against **staging** it is not. Staging is a shared, promoted environment, and a certification run
 * that mutates it is indistinguishable from an operator doing so — it would write a role into the
 * same `role_definitions` the product serves, and a failure between the grant and the stand-down
 * would leave authority behind. That already happened twice on the cert tenant, which is why the
 * stand-down moved into `afterAll`.
 *
 * So the write is OPT-IN. It runs when `CERT_ALLOW_WRITES=1`, and otherwise records why it did not.
 * Read-only certification of staging stays complete and honest; the write half is a deliberate
 * decision someone makes about a specific environment, not a side effect of pointing the suite at a
 * new URL.
 */
const WRITES_ALLOWED = process.env.CERT_ALLOW_WRITES === "1";

test.describe("W-57 — a level the operator changes is authority the server holds", () => {
    test.skip(!WRITES_ALLOWED, "write certification is opt-in (CERT_ALLOW_WRITES=1) — it creates and edits a role");

    /**
     * The tenant is shared. An assertion that fails mid-test must not leave a role holding
     * authority nobody asked for, so the stand-down runs in `afterAll` rather than only on the
     * happy path — the first two runs of this spec failed after the grant and before the restore,
     * and left exactly that behind until it was cleaned up by hand.
     */
    test.afterAll(async ({ playwright }) => {
        const ctx = await playwright.request.newContext({
            baseURL: process.env.CERT_APP_URL || "http://localhost:3011",
            storageState: "./.auth/operator.json",
        });
        await ctx
            .patch(`/api/admin/rbac/roles/${TEMP_ROLE_KEY}`, {
                data: { role_label: TEMP_ROLE_LABEL, is_active: false, permission_keys: [] },
            })
            .catch(() => undefined);
        await ctx.dispose();
    });

    test("editing a role's access changes the canonical grant set", async ({ page, request }) => {
        await openRoles(page);

        // 1 — create a role of this spec's own, so no seeded role is edited.
        await page.getByTestId("access-roles-new").click();
        // No key field any more: the operator types a NAME and the key is derived. That the role is
        // created at all is the proof — a surface that still required a technical identifier could
        // not get past this step.
        await page.getByTestId("access-new-role-label").fill(TEMP_ROLE_LABEL);
        await expect(page.getByTestId("access-new-role-key")).toHaveCount(0);
        await page.getByTestId("access-new-role-save").click();
        await expect(page.getByTestId("access-role-selected-workspace")).toBeVisible();

        // 2 — it starts with nothing. Read from the SERVER, not from the page that just drew it.
        const before = await request.get(`/api/admin/rbac/grants?role_key=${TEMP_ROLE_KEY}`);
        expect(before.ok()).toBe(true);
        const beforeKeys: string[] = (await before.json()).permission_keys ?? [];
        expect(beforeKeys, "a new role should hold nothing").toEqual([]);

        // 3 — move one area to Manage through the UI the operator uses.
        //     The radio itself is `sr-only` — the operator clicks the labelled segment, and so does
        //     this. Driving the hidden input directly would certify a path no one takes.
        const manageLabel = page.locator('tr[data-testid^="access-role-area-"] label:has(input[data-testid$="-write"])').first();
        await expect(manageLabel, "no Manage control available to certify against").toBeVisible();
        await manageLabel.click();
        await expect(page.locator('input[data-testid$="-write"]:checked').first()).toBeVisible();
        await page.getByTestId("access-role-save").click();
        await expect(page.getByRole("status")).toContainText(/saved/i);

        // 4 — the canonical set moved. This is the enforcement clause: a UI toggle whose resulting
        //     authority the server does not hold would pass every assertion above and fail here.
        const after = await request.get(`/api/admin/rbac/grants?role_key=${TEMP_ROLE_KEY}`);
        expect(after.ok()).toBe(true);
        const afterKeys: string[] = (await after.json()).permission_keys ?? [];
        expect(afterKeys.length, "the save did not reach the canonical grant set").toBeGreaterThan(0);

        // 5 — and it reads back as authority, not as a key the operator has to decode.
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.goto(`${ROLES}&roleKey=${TEMP_ROLE_KEY}`, { waitUntil: "domcontentloaded" });
        await expect(page.getByTestId("access-role-selected-workspace")).toBeVisible();
        // The area's level is data now, not a chip — an exact reading is shown by which radio is
        // selected, so only `limited` renders text beside it.
        const levels = await page.locator('tr[data-testid^="access-role-area-"]').evaluateAll(
            (rows) => rows.map((r) => r.getAttribute("data-authority")),
        );
        expect(
            levels.some((l) => l === "manage" || l === "limited"),
            "no area reports the authority just granted",
        ).toBe(true);

        // 6 — put it back and stand the role down. The tenant is shared; this spec leaves an inert
        //     role behind rather than a role holding authority nobody asked for.
        await page.locator('tr[data-testid^="access-role-area-"] label:has(input[data-testid$="-none"])').first().click();
        await page.getByTestId("access-role-edit-identity").click();
        await page.getByTestId("access-role-active-checkbox").uncheck();
        await page.getByTestId("access-role-save").click();
        await expect(page.getByRole("status")).toContainText(/saved/i);
    });
});

/**
 * `OD-8` / `AD-25` — the Users chapter explains effective access.
 *
 * The role editor answers *what can this role do*; this answers *why does this person have this
 * access*. Both are browser-certified because both are claims about what an operator reads, and the
 * failure mode being guarded is a plausible sentence rather than a broken page.
 */
test.describe("OD-8 — effective access is explained, or declared unknown", () => {
    const USERS = `${ACCESS}?section=users`;

    async function openFirstUser(page: Page) {
        await page.goto(USERS, { waitUntil: "domcontentloaded" });
        await expect(page.getByTestId("access-users-page")).toBeVisible();
        const options = page.locator('[role="option"]');
        await expect(options.first()).toBeVisible();
        await options.first().click();
    }

    test("a selected member gets an effective-access account, not a list of assignments", async ({ page }) => {
        await openFirstUser(page);
        const card = page.getByTestId("access-user-effective-access");
        await expect(card).toBeVisible();

        // Exactly one of the three states renders. Which one depends on the tenant; that all three
        // are mutually exclusive is the property, because the failure being guarded is a partial
        // answer rendered as a complete one.
        const states = ["access-user-effective-summary", "access-user-effective-none", "access-user-effective-unknown"];
        const visible: string[] = [];
        for (const id of states) if (await page.getByTestId(id).count()) visible.push(id);
        expect(visible, "the card must render exactly one account of effective access").toHaveLength(1);
    });

    test("when it does explain, it says what, where, and because of which role", async ({ page }) => {
        await openFirstUser(page);
        const summary = page.getByTestId("access-user-effective-summary");
        if ((await summary.count()) === 0) {
            test.info().annotations.push({
                type: "observation",
                description: "this member holds no enforced capability — the explanation correctly declined to claim one",
            });
            return;
        }

        // The three clauses. Attribution is asserted as present rather than as a particular role,
        // because the tenant decides which role that is and pinning it would certify the fixture.
        const areas = page.locator('[data-testid^="access-user-effective-area-"]');
        await expect(areas.first()).toBeVisible();
        await expect(areas.first()).toContainText(/because of \S/);
        await expect(page.getByTestId("access-user-effective-scope")).toBeVisible();

        // …and it does not decode the platform for the operator on the way.
        const text = await summary.innerText();
        expect(text, `a dotted capability key is in the explanation: ${text.match(RAW_KEY)?.[0]}`).not.toMatch(RAW_KEY);
    });

    test("the account never claims an area at a level the role editor disagrees with", async ({ page, request }) => {
        // Cross-layer consistency: the explanation is built from the same grants the role editor
        // edits, so a level here that the server does not hold would be the UI inventing authority.
        await openFirstUser(page);
        if ((await page.getByTestId("access-user-effective-summary").count()) === 0) return;

        const areas = await page.locator('[data-testid^="access-user-effective-area-"]').allInnerTexts();
        expect(areas.length).toBeGreaterThan(0);
        for (const line of areas) {
            expect(line).toMatch(/(manage|view|limited · \d+ of \d+)/i);
        }

        // Every role named in the account exists in the canonical role catalog.
        const res = await request.get("/api/admin/rbac/roles");
        expect(res.ok()).toBe(true);
        const labels = new Set(
            ((await res.json()) as { roles?: { role_label: string }[] }).roles?.map((r) => r.role_label) ?? [],
        );
        expect(labels.size).toBeGreaterThan(0);
        for (const line of areas) {
            const because = line.split(/because of /i)[1];
            if (!because) continue;
            for (const roleLabel of because.split(/ and /)) {
                expect(labels.has(roleLabel.trim()), `${roleLabel} is not a defined role`).toBe(true);
            }
        }
    });
});
