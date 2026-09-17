/**
 * ROLE CREATION SAVE ROUND-TRIP — browser to database to reload.
 *
 * The gate two earlier runs did not close. A unit proof over `applyGridRowSelection` says what the
 * editor would COMPUTE; it cannot say that the browser sent it, the server stored it, and the editor
 * read it back as the same thing. That whole leg is what an administrator actually experiences, and
 * it is where a silent sibling grant would live.
 *
 * Two cases, and they are the two halves of the Director's concern:
 *
 *   PARTIAL   Enrollment records granted, decisions NOT — the role an organization actually wants,
 *             and the one a preset would have over-granted. The area must read back `Limited · 1 of 4`.
 *   FULL      Enrollment → Full access — the renamed preset must persist exactly the four Enrollment
 *             capabilities and read back as Full access, not Limited. A rename that did not match
 *             persisted truth would be worse than the word it replaced.
 *
 * ── SYNCHRONISATION, WHICH IS WHY THIS FAILED BEFORE ──
 *
 * The roles list fetches on page load and renders `access-roles-loading` first, so a click issued
 * against the landing state lands on nothing and the workspace never opens. The fixture roles are
 * therefore created BEFORE navigating — a role inserted afterwards is not in the fetched list — and
 * every step waits on product-visible state rather than a sleep. No `goto('/login')`: the certify
 * project already carries the seeded administrator session, and navigating to the login page while
 * authenticated is what hung the first attempt.
 */
import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";

const webDir = path.join(__dirname, "..", "..", "web");
const require_ = createRequire(path.join(webDir, "package.json"));
const { createClient } = require_("@supabase/supabase-js");
const env = readFileSync(path.join(webDir, ".env.certification.local"), "utf8");
const rd = (k: string) => env.split("\n").find((l: string) => l.startsWith(`${k}=`))?.slice(k.length + 1).trim() ?? "";
const sb = createClient(rd("SUPABASE_URL") || rd("NEXT_PUBLIC_SUPABASE_URL"), rd("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const ORG = "00000000-0000-4000-8000-000000000001";
const STAMP = Date.now().toString(36);
const PARTIAL_ROLE = `zzrt_partial_${STAMP}`;
const FULL_ROLE = `zzrt_full_${STAMP}`;

async function grantsFor(roleKey: string): Promise<string[]> {
    const { data } = await sb
        .from("role_permission_grants")
        .select("permission_key, allowed")
        .eq("org_id", ORG)
        .eq("role_key", roleKey);
    return ((data ?? []) as { permission_key: string; allowed: boolean }[])
        .filter((g) => g.allowed)
        .map((g) => g.permission_key)
        .sort();
}

/** The sequence that works: page, loading gone, click, workspace. No sleeps. */
async function openRole(page: Page, roleKey: string) {
    await page.goto("/organization/access?section=roles");
    await page.waitForSelector('[data-testid="access-roles-page"]', { timeout: 90_000 });
    await page.waitForSelector('[data-testid="access-roles-loading"]', { state: "detached", timeout: 90_000 });
    await page.locator(`[data-testid="access-role-${roleKey}"]`).click({ timeout: 30_000 });
    await page.waitForSelector('[data-testid="access-role-selected-workspace"]', { timeout: 60_000 });
    await page.waitForSelector('[data-testid="access-role-area-enrollment-disclose"]', { timeout: 60_000 });
}

async function save(page: Page) {
    await page.locator('button:has-text("Save")').first().click({ timeout: 20_000 });
    // Product-visible completion: the Save control leaves its busy state.
    await expect(page.locator('button:has-text("Saving")')).toHaveCount(0, { timeout: 30_000 });
}

test.beforeAll(async () => {
    for (const [key, label] of [[PARTIAL_ROLE, "RT partial"], [FULL_ROLE, "RT full access"]] as const) {
        await sb.from("role_definitions").insert({
            org_id: ORG, role_key: key, role_label: `${label} ${STAMP}`,
            description: "disposable round-trip fixture", is_system: false, is_active: true,
        });
    }
});

test.afterAll(async () => {
    for (const key of [PARTIAL_ROLE, FULL_ROLE]) {
        await sb.from("role_permission_grants").delete().eq("org_id", ORG).eq("role_key", key);
        await sb.from("role_definitions").delete().eq("org_id", ORG).eq("role_key", key);
    }
});

test("a partial Enrollment selection saves exactly, and reloads as Limited 1 of 4", async ({ page }) => {
    test.setTimeout(300_000);
    expect(await grantsFor(PARTIAL_ROLE), "the fixture starts empty").toEqual([]);

    await openRole(page, PARTIAL_ROLE);
    await page.locator('[data-testid="access-role-area-enrollment-disclose"]').click();
    await page.locator('[data-testid="access-role-permission-enrollment.record-write"]').click({ timeout: 20_000 });
    await save(page);

    const persisted = await grantsFor(PARTIAL_ROLE);
    expect(persisted, "the browser said records; the database must say records").toEqual(["enrollment.record.manage"]);
    for (const sibling of ["enrollment.decide", "enrollment.pricing.override", "enrollment.requirement_exception.manage"]) {
        expect(persisted, `${sibling} rode along invisibly`).not.toContain(sibling);
    }

    // Reload from the server and prove the editor reconstructs what is stored.
    await openRole(page, PARTIAL_ROLE);
    await page.locator('[data-testid="access-role-area-enrollment-disclose"]').click();
    const chip = await page.locator('[data-testid="access-role-area-enrollment-authority"]').textContent();
    expect(chip?.replace(/\s+/g, " ").trim(), "a disagreeing area reports its arithmetic").toContain("Limited");
    expect(chip).toContain("1 of 4");

    const reconstructed = await page.evaluate(() => {
        const on = (id: string, lvl: string) =>
            (document.querySelector(`[data-testid="access-role-permission-${id}-${lvl}"]`) as HTMLInputElement | null)?.checked ?? null;
        return { recordWrite: on("enrollment.record", "write"), decideWrite: on("enrollment.decide", "write") };
    });
    expect(reconstructed.recordWrite).toBe(true);
    expect(reconstructed.decideWrite).toBe(false);
    expect(await grantsFor(PARTIAL_ROLE), "a reload must not rewrite grants").toEqual(persisted);
});

test("Enrollment Full access saves all four, and reloads as Full access", async ({ page }) => {
    test.setTimeout(300_000);
    expect(await grantsFor(FULL_ROLE)).toEqual([]);

    await openRole(page, FULL_ROLE);
    // The renamed preset. Its control is the area's `write` radio; the word changed, the set did not.
    await page.locator('[data-testid="access-role-area-enrollment-write"]').click({ timeout: 20_000 });
    await save(page);

    expect(await grantsFor(FULL_ROLE), "Full access means every Enrollment capability").toEqual([
        "enrollment.decide",
        "enrollment.pricing.override",
        "enrollment.record.manage",
        "enrollment.requirement_exception.manage",
    ]);

    await openRole(page, FULL_ROLE);
    // Wait for the loaded grant set to reach the control, the same way the partial case does:
    // the area radio renders before the permissions fetch resolves, so reading it immediately
    // measures the empty initial state rather than what was stored.
    await page.locator('[data-testid="access-role-area-enrollment-disclose"]').click();
    await expect(
        page.locator('[data-testid="access-role-permission-enrollment.decide-write"]'),
    ).toBeChecked({ timeout: 30_000 });
    const state = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="access-role-area-enrollment-write"]') as HTMLInputElement | null;
        return {
            fullAccessChecked: el?.checked ?? null,
            limitedChip: document.querySelector('[data-testid="access-role-area-enrollment-authority"]') != null,
        };
    });
    expect(state.fullAccessChecked, "an area holding every capability reads back as Full access").toBe(true);
    expect(state.limitedChip, "nothing disagrees, so there is no Limited chip").toBe(false);
});
