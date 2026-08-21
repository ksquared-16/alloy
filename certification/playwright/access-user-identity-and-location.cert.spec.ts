/**
 * Operator UX Convergence §4 / §10 — browser certification of the user-centric Access surface.
 *
 * Three claims, and none of them can be settled by reading the source:
 *
 * 1. **A person is named as a person.** The rail used to render `display_name || email`, so an
 *    account with no name showed its address as the heading and again underneath. Whether the
 *    replacement actually renders one line instead of two is a rendering question.
 * 2. **Access Scopes is not a destination.** The chapter is gone from the tab bar and from the
 *    landing tiles, and `?section=scopes` lands on Users rather than on an empty shell or a 404.
 * 3. **Where somebody works is on their page.** Overview states the location scope, and a
 *    department restriction is NAMED there rather than omitted — the failure mode that matters is
 *    a screen implying broader authority than the person has.
 *
 * **STRICTLY READ-ONLY.** The certification stack is the shared `alloy-cert` tenant and other
 * sessions hold leases on it. Nothing here submits a form, invites anybody, saves a scope or edits
 * a role. The invite dialog is OPENED and read, then dismissed — its fields and its refusal to
 * submit an incomplete location answer are both observable without sending an invitation.
 */
import { test, expect, type Page } from "@playwright/test";

const ACCESS = "/organization/access";
const USERS = `${ACCESS}?section=users`;

async function openUsers(page: Page) {
    await page.goto(USERS, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("access-workspace-surface")).toBeVisible();
    await expect(page.getByTestId("access-chapter-users")).toBeVisible();
}

/**
 * Open the invite dialog.
 *
 * The rail is waited for first — a click that lands before the client has hydrated does nothing,
 * and the failure then looks like a missing dialog rather than a mistimed click.
 */
async function openInviteDialog(page: Page) {
    await openUsers(page);
    await expect(page.locator('button[data-testid^="access-user-"]').first()).toBeVisible();
    await page.getByTestId("access-users-invite").click();
    await expect(page.locator('[role="dialog"][aria-label="Invite user"]')).toBeVisible();
}

/** Select the first member in the rail and return its rendered heading. */
async function selectFirstMember(page: Page): Promise<string> {
    const rows = page.locator('button[data-testid^="access-user-"]').filter({ hasNot: page.locator("[hidden]") });
    const first = rows.first();
    await expect(first).toBeVisible();
    const heading = (await first.locator(".locations-collection-row__name").innerText()).trim();
    await first.click();
    await expect(page.getByTestId("access-user-overview")).toBeVisible();
    return heading;
}

test.describe("§10 — Access has three chapters, and Access Scopes is not one of them", () => {
    test("the chapter tabs offer Users, Roles and Security only", async ({ page }) => {
        await openUsers(page);
        const tabs = page.locator('[data-testid^="access-chapter-tab-"]');
        const labels = (await tabs.allInnerTexts()).map((t) => t.trim()).filter(Boolean);
        expect(labels.length, "no chapter tabs rendered — the assertion below would pass over nothing").toBeGreaterThan(
            0,
        );
        expect(labels.join(" | ")).not.toMatch(/Access Scopes/i);
    });

    test("`?section=scopes` lands on Users rather than an empty shell", async ({ page }) => {
        // The retired key resolves through a named alias. A 404, a blank shell, or a silent fall
        // through to some future default would each be a broken bookmark for an operator.
        await page.goto(`${ACCESS}?section=scopes`, { waitUntil: "domcontentloaded" });
        await expect(page.getByTestId("access-chapter-users")).toBeVisible();
        await expect(page.getByTestId("access-scopes-page")).toHaveCount(0);
    });
});

test.describe("§4 — a person is named as a person", () => {
    test("every rail row shows one identity line, never the same address twice", async ({ page }) => {
        await openUsers(page);
        const rows = page.locator('button[data-testid^="access-user-"]');
        // The rail is fetched. Counting before it arrives measures the empty state and would make
        // the loop below iterate over nothing.
        await expect(rows.first()).toBeVisible();
        const count = await rows.count();
        expect(count, "the cert tenant listed no members — nothing below would be proved").toBeGreaterThan(0);

        for (let i = 0; i < count; i += 1) {
            const row = rows.nth(i);
            const name = (await row.locator(".locations-collection-row__name").innerText()).trim();
            const sub = (await row.locator(".locations-collection-row__place").innerText().catch(() => "")).trim();
            expect(name.length, `row ${i} rendered no heading`).toBeGreaterThan(0);
            // The defect this replaced: heading and subtitle both being the email address.
            expect(sub, `row ${i} repeats its heading underneath itself`).not.toBe(name);
            // An account with no name says so instead of wearing its address as one.
            if (name.includes("@")) expect(sub).toMatch(/No name on file/i);
        }
    });

    test("Overview states the name, or states that there is none", async ({ page }) => {
        await openUsers(page);
        const heading = await selectFirstMember(page);
        const nameCell = page.getByTestId("access-user-overview-name");
        await expect(nameCell).toBeVisible();
        const rendered = (await nameCell.innerText()).trim();
        if (heading.includes("@")) {
            // Nameless: the Overview must not quietly print the address in the Name field.
            expect(rendered).toMatch(/No name on file/i);
        } else {
            expect(rendered).toContain(heading);
        }
    });

    test("search finds a member by the name the operator can see", async ({ page }) => {
        await openUsers(page);
        const heading = await selectFirstMember(page);
        const term = heading.split(/\s+/)[0]!.slice(0, 6);
        await page.getByTestId("access-users-search").fill(term);
        const rows = page.locator('button[data-testid^="access-user-"]');
        await expect(rows.first()).toBeVisible();
        const shown = (await rows.allInnerTexts()).join(" ").toLowerCase();
        expect(shown).toContain(term.toLowerCase());
    });
});

test.describe("§4 — where they work is on their page", () => {
    test("Overview answers the location question without opening another tab", async ({ page }) => {
        await openUsers(page);
        await selectFirstMember(page);
        const summary = page.getByTestId("access-user-overview-location-summary");
        await expect(summary).toBeVisible();
        expect((await summary.innerText()).trim().length).toBeGreaterThan(0);
    });

    test("a department restriction is named on Overview wherever the rail marks one", async ({ page }) => {
        // The property under test is an implication: rail says restricted → Overview says so too.
        // Where the cert tenant has no restricted member the implication is vacuous, and the test
        // records that rather than reporting a pass it did not earn.
        await openUsers(page);
        const marked = page.locator('[data-testid$="-department-restricted"]');
        const n = await marked.count();
        test.skip(n === 0, "no member in this tenant has a department restriction — nothing to imply");
        const row = marked.first().locator("xpath=ancestor::button[1]");
        await row.click();
        await expect(page.getByTestId("access-user-overview")).toBeVisible();
        await expect(page.getByTestId("access-user-overview-department-restriction")).toBeVisible();
        await expect(page.getByTestId("access-user-overview-department-restriction")).toContainText(
            /Additional restriction applies/i,
        );
    });

    test("Role and Access are one tab, and History is gone", async ({ page }) => {
        await openUsers(page);
        await selectFirstMember(page);
        const tabs = page.locator('[data-testid^="access-user-tab-"]');
        const labels = (await tabs.allInnerTexts()).map((t) => t.trim());
        expect(labels.length).toBeGreaterThan(0);
        expect(labels.join(" | ")).not.toMatch(/History/i);

        await page.getByTestId("access-user-tab-access").click();
        // Both halves of "what may they do, and where" on one surface.
        await expect(page.getByTestId("access-user-role-select")).toBeVisible();

        /*
         * The location control is one state away for a membership with no access profile, and
         * deliberately so: `W-47` refuses to pre-select a scope nobody configured, because
         * `LocationMultiSelect` has two modes and rendering it would show a radio already chosen,
         * one click from being written. So the surface offers the choice to start rather than the
         * choice already made — and this proves the control is REACHABLE, which is what §4 claims.
         *
         * Clicking it changes client state only. No request is made until Save, which this spec
         * never presses.
         */
        const begin = page.getByTestId("access-user-access-configure");
        if (await begin.isVisible().catch(() => false)) await begin.click();
        await expect(page.getByTestId("access-user-access-locations")).toBeVisible();
    });

    test("the departments editor opens itself when a restriction exists, and is collapsed when none does", async ({
        page,
    }) => {
        await openUsers(page);
        await selectFirstMember(page);
        await page.getByTestId("access-user-tab-access").click();

        // Reach the editor the same way an operator does. `beginScopeConfiguration` starts from the
        // CLOSED direction — restricted with nothing selected — so this also puts the departments
        // disclosure into the restricted state the assertion is about, without writing anything.
        const begin = page.getByTestId("access-user-access-configure");
        if (await begin.isVisible().catch(() => false)) await begin.click();

        const advanced = page.getByTestId("access-user-access-departments-advanced");
        await expect(advanced).toBeVisible();
        const restricted = /Additional restriction applies/i.test(await advanced.innerText());
        // Demoted, never hidden: a real restriction must not sit behind a closed triangle.
        expect(await advanced.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(restricted);
    });
});

test.describe("§4 — Invite asks for the name and for where they will work", () => {
    test("the dialog collects first and last name and a location answer", async ({ page }) => {
        await openInviteDialog(page);

        await expect(page.getByTestId("access-invite-first-name")).toBeVisible();
        await expect(page.getByTestId("access-invite-last-name")).toBeVisible();
        await expect(page.getByTestId("access-invite-location-access")).toBeVisible();
        // The note is generated from the same values the request is built from.
        await expect(page.getByTestId("access-invite-location-note")).toContainText(/[Dd]epartments/);

        // Read-only: the dialog is dismissed rather than submitted. Nothing is invited.
        await page.getByRole("button", { name: "Cancel" }).click();
    });

    test("`Selected locations` with nothing selected cannot be submitted", async ({ page }) => {
        await openInviteDialog(page);
        await page.getByTestId("access-invite-first-name").fill("Cert");
        await page.getByTestId("access-invite-last-name").fill("Reader");
        await page.getByTestId("access-invite-email").fill(`cert-readonly-${Date.now()}@example.invalid`);

        const roleSelect = page.getByTestId("access-invite-role");
        // The role list is fetched; reading `option` before it lands finds only the placeholder,
        // and selecting nothing would leave the button disabled for the WRONG reason.
        await expect
            .poll(async () => roleSelect.locator("option").count(), {
                message: "no roles offered — the disabled assertion below would be unfalsifiable",
            })
            .toBeGreaterThan(1);
        await roleSelect.selectOption({ index: 1 });

        const submit = page.getByRole("button", { name: /Send Invitation/i });
        // With "All locations" (the default) every other field is complete, so the button is live.
        await expect(submit).toBeEnabled();

        // Switching to "Selected locations" without choosing any must withdraw the submit — the
        // route would reject the payload, and sending it would mean "no locations at all".
        await page.getByTestId("access-invite-locations-select-mode-selected").check();
        await expect(submit).toBeDisabled();

        await page.getByRole("button", { name: "Cancel" }).click();
    });
});
