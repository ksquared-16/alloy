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
const TEMP_ROLE_KEY = `w57_cert_${Date.now().toString(36)}`;
const TEMP_ROLE_LABEL = "W-57 certification role";

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

        // Every area carries an operator verb, and the verbs are the four this product uses.
        const chips = page.locator('[data-testid^="access-role-area-"][data-testid$="-authority"]');
        const chipCount = await chips.count();
        expect(chipCount, "no capability areas rendered — this assertion would prove nothing").toBeGreaterThan(0);
        for (let i = 0; i < chipCount; i += 1) {
            // `innerText` returns the RENDERED text, and the chip is CSS-uppercased — so this
            // compares case-insensitively. The vocabulary is what is under test, not its casing.
            const text = (await chips.nth(i).innerText()).trim();
            expect(text).toMatch(/^(manage|view|no access|limited · \d+ of \d+)$/i);
        }

        // And by default the operator sees no raw permission key anywhere in the section.
        const visible = await areas.innerText();
        expect(visible, `a dotted key is visible by default: ${visible.match(RAW_KEY)?.[0]}`).not.toMatch(RAW_KEY);
    });

    test("the keys are one disclosure away — diagnostics, not the default", async ({ page }) => {
        await openRoles(page);
        await selectFirstRole(page);

        const toggle = page.getByTestId("access-role-advanced-toggle");
        await expect(toggle).not.toBeChecked();
        await toggle.check();

        const disclosed = await page.getByTestId("access-role-areas").innerText();
        expect(disclosed, "advanced disclosure revealed no capability key").toMatch(RAW_KEY);

        await toggle.uncheck();
        const hidden = await page.getByTestId("access-role-areas").innerText();
        expect(hidden).not.toMatch(RAW_KEY);
    });

    test("the areas are exactly the platform's capability groups — no invented domain", async ({ page, request }) => {
        await openRoles(page);
        await selectFirstRole(page);

        const res = await request.get("/api/admin/rbac/permissions");
        expect(res.ok(), "the capability catalog did not load — the comparison would be vacuous").toBe(true);
        const catalog = (await res.json()) as { permissions?: { key: string; group_key: string }[] };
        const catalogGroups = new Set((catalog.permissions ?? []).map((p) => p.group_key).filter(Boolean));
        expect(catalogGroups.size, "the catalog returned no groups").toBeGreaterThan(0);

        const rendered = await page.locator('[data-testid^="access-role-area-"]:not([data-testid$="-authority"])').all();
        expect(rendered.length).toBeGreaterThan(0);
        for (const area of rendered) {
            const testId = (await area.getAttribute("data-testid")) ?? "";
            const groupKey = testId.replace("access-role-area-", "");
            expect(catalogGroups.has(groupKey), `${groupKey} is rendered but is not a catalog group`).toBe(true);
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

        const groups = page.locator('[role="radiogroup"]');
        const n = await groups.count();
        expect(n, "no editable capability control — accessibility assertion would be vacuous").toBeGreaterThan(0);

        // Each group names what it is for, so a screen reader hears the capability, not "radio".
        for (let i = 0; i < Math.min(n, 5); i += 1) {
            const label = await groups.nth(i).getAttribute("aria-label");
            expect(label, "a radiogroup with no accessible name").toBeTruthy();
            expect(label).toMatch(/access level/i);
        }

        // The inputs are real radios — focusable and operable from the keyboard — not divs.
        //
        // Wait for the grant load to settle first. While it is in flight the controls are
        // deliberately `disabled` (W-56: an unknown authority set must not be editable), and a
        // disabled input cannot take focus — so focusing too early fails for a reason that is the
        // product being CORRECT. The enabled save button is the signal that the set is known.
        await expect(page.getByTestId("access-role-save")).toBeEnabled();

        const firstRadio = groups.first().locator('input[type="radio"]').first();
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

test.describe("W-57 — a level the operator changes is authority the server holds", () => {
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
        await page.getByTestId("access-new-role-label").fill(TEMP_ROLE_LABEL);
        await page.getByTestId("access-new-role-key").fill(TEMP_ROLE_KEY);
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
        const manageLabel = page.locator('label:has([data-testid$="-write"])').first();
        await expect(manageLabel, "no Manage control available to certify against").toBeVisible();
        await manageLabel.click();
        await expect(page.locator('[data-testid$="-write"]:checked')).toHaveCount(1);
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
        const chips = page.locator('[data-testid^="access-role-area-"][data-testid$="-authority"]');
        const texts = await chips.allInnerTexts();
        // Case-insensitive: the chip is CSS-uppercased, so `innerText` is "MANAGE".
        expect(texts.some((t) => /manage|limited/i.test(t)), "no area reports the authority just granted").toBe(true);

        // 6 — put it back and stand the role down. The tenant is shared; this spec leaves an inert
        //     role behind rather than a role holding authority nobody asked for.
        await page.locator('label:has([data-testid$="-none"])').first().click();
        await page.getByTestId("access-role-edit-identity").click();
        await page.getByTestId("access-role-active-checkbox").uncheck();
        await page.getByTestId("access-role-save").click();
        await expect(page.getByRole("status")).toContainText(/saved/i);
    });
});
