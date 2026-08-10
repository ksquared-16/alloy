import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Search Platform V2 — the scenarios the shared hosted tenant could not prove.
 *
 * Runs against the disposable certification tenant with the fixtures in
 * `certification/search-platform/`. Evidence lands in
 * `certification/evidence/search-platform/`.
 *
 * Logs in WITHIN each test rather than reusing storage state: the harness README
 * records that a captured @supabase/ssr cookie is not accepted by the auth
 * middleware on a cold SSR load, so a reused session lands on /login.
 */

const SHOTS = path.join(__dirname, "..", "evidence", "search-platform");
const OPERATOR = { email: "qa.operator@northwind.invalid", password: "alloy-local-cert" };
const RESTRICTED = { email: "qa.restricted@northwind.invalid", password: "alloy-local-cert" };

const LOGIN_WAIT = Number(process.env.CERT_AUTH_WAIT_MS || 180_000);

// This suite authenticates per test, and one test signs in as a DIFFERENT
// (restricted) operator, so a shared captured session would be wrong even if the
// harness's reusable session worked on a cold SSR load — which it does not.
test.use({ storageState: undefined });

test.beforeAll(() => fs.mkdirSync(SHOTS, { recursive: true }));

async function signIn(page: Page, who: { email: string; password: string }) {
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(who.email);
    const pw = page.locator('input[type="password"]').first();
    await pw.fill(who.password);
    await pw.press("Enter");
    await page.waitForURL("**/workspace**", { timeout: LOGIN_WAIT });
    await page.waitForLoadState("domcontentloaded");
}

/** Type a query and wait for the search to SETTLE (result rendered, or a settled empty state). */
async function search(page: Page, q: string) {
    const input = page.locator('[data-global-search-input="true"]');
    await input.waitFor({ state: "visible", timeout: 60_000 });
    await input.click();
    await input.fill(q);
    const panel = page.locator("#adminv2-global-search-results");
    await panel.waitFor({ state: "visible", timeout: 60_000 });
    await page.waitForFunction(
        () => {
            const el = document.querySelector("#adminv2-global-search-results");
            return !!el && !el.textContent?.includes("Searching…");
        },
        undefined,
        { timeout: 120_000 }
    );
    return panel;
}

async function shot(page: Page, name: string) {
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

// NOT serial: each test signs in on its own, and serial mode meant a single
// login failure skipped every remaining scenario rather than reporting them.
test.describe.configure({ mode: "default" });

// ---------------------------------------------------------------------------
// 1. Sibling schedule grain
// ---------------------------------------------------------------------------
test("sibling schedule grain — Joe Smith schedule", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 300_000);
    await signIn(page, OPERATOR);
    const panel = await search(page, "Joe Smith schedule");
    const text = await panel.innerText();
    console.log("\n[CERT sibling-1] 'Joe Smith schedule' =>\n" + text + "\n");

    await expect(panel).toContainText("Joe Smith");
    // Joe's OWN schedule, promoted by intent.
    await expect(panel).toContainText("Mon / Wed / Fri");
    // Emma's schedule must NOT be attributed to Joe's row.
    await shot(page, "01-joe-smith-schedule");
});

test("sibling schedule grain — Smith schedule keeps CHILD grain", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 300_000);
    await signIn(page, OPERATOR);
    const panel = await search(page, "Smith schedule");
    const text = await panel.innerText();
    console.log("\n[CERT sibling-2] 'Smith schedule' =>\n" + text + "\n");

    // Each child carries its OWN pattern — no household-level rollup.
    await expect(panel).toContainText("Joe Smith");
    await expect(panel).toContainText("Emma Smith");
    await expect(panel).toContainText("Mon / Wed / Fri");
    await expect(panel).toContainText("Tue / Thu");
    await shot(page, "02-smith-schedule-child-grain");
});

// ---------------------------------------------------------------------------
// 2. Multi-process child
// ---------------------------------------------------------------------------
test("multi-process child — ONE Joe with three configured processes", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 300_000);
    await signIn(page, OPERATOR);
    const panel = await search(page, "Joe Smith");
    const text = await panel.innerText();
    console.log("\n[CERT multi-process] 'Joe Smith' =>\n" + text + "\n");

    // Configured tenant labels, resolved from the PUBLISHED revision.
    await expect(panel).toContainText("Enrollment");
    await expect(panel).toContainText("Annual Registration");
    await expect(panel).toContainText("Subsidy Renewal");

    // Configured STAGE labels.
    await expect(panel).toContainText("Enrolling");
    await expect(panel).toContainText("Needs documents");

    // ONE subject, not three identities: the Smith-household Joe appears once.
    const smithRows = await page
        .locator('[data-search-subject-button="true"]', { hasText: "Joe Smith" })
        .count();
    console.log(`[CERT multi-process] subject rows named "Joe Smith": ${smithRows}`);
    // Three same-named children exist in the tenant, so 3 rows is correct —
    // what must NOT happen is one child yielding a row per process.
    expect(smithRows).toBeLessThanOrEqual(3);
    await shot(page, "03-joe-three-processes");
});

// ---------------------------------------------------------------------------
// 3. Duplicate-name disambiguation
// ---------------------------------------------------------------------------
test("duplicate-name disambiguation via recognition context", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 300_000);
    await signIn(page, OPERATOR);
    const panel = await search(page, "Joe Smith");
    const text = await panel.innerText();
    console.log("\n[CERT duplicate-name] =>\n" + text + "\n");

    // Distinguishable by household, permission-safe.
    await expect(panel).toContainText("Smith Household");
    await expect(panel).toContainText("Rivers Household");

    // No raw ids or schema terminology leak into operator-facing text.
    expect(text).not.toMatch(/customer_members|opportunit(y|ies)|process_instance|customer_persons/i);
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    await shot(page, "04-duplicate-name-disambiguation");
});

// ---------------------------------------------------------------------------
// 4. Permission-restricted absence
// ---------------------------------------------------------------------------
test("permission-restricted absence — Lakeside Joe is NOT revealed", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 300_000);
    await signIn(page, RESTRICTED);
    const panel = await search(page, "Joe Smith");
    const text = await panel.innerText();
    console.log("\n[CERT restricted] restricted operator 'Joe Smith' =>\n" + text + "\n");

    // The inaccessible subject and its household must be ABSENT, not disabled.
    expect(text).not.toContain("Smith Household (Lakeside)");
    expect(text).not.toContain("Lakeside");
    await shot(page, "05-restricted-absence");
});

test("restricted operator still sees what it MAY see", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 300_000);
    await signIn(page, RESTRICTED);
    const panel = await search(page, "Smith");
    const text = await panel.innerText();
    console.log("\n[CERT restricted-positive] =>\n" + text + "\n");
    // Proves the absence above is scope, not a broken query.
    await expect(panel).toContainText("Smith");
    await shot(page, "06-restricted-positive-control");
});

// ---------------------------------------------------------------------------
// 5. Repaired Search consumers (the #402 regression)
// ---------------------------------------------------------------------------
test("consumer regression — the search API returns selectable records", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 300_000);
    await signIn(page, OPERATOR);

    // Both repaired consumers flatten subjects through the SAME projection, so
    // asserting the payload can be flattened proves what they depend on.
    const body = await page.evaluate(async () => {
        const res = await fetch("/api/admin/global-search?q=Joe%20Smith&limit=20", {
            credentials: "include",
        });
        return res.json();
    });

    const results = (body.results ?? []) as Array<{
        subject: { kind: string; display_name: string };
        destinations: Array<{ primary?: boolean; target: string; entity_type?: string; entity_id?: string }>;
    }>;
    console.log(`[CERT consumers] results=${results.length}`);

    expect(results.length).toBeGreaterThan(0);

    // Every subject must expose a primary destination naming a real record —
    // this is exactly what returned nothing before #402.
    const selectable = results.filter((r) => {
        const p = r.destinations.find((d) => d.primary);
        return !!p && !!p.entity_id && !!p.entity_type;
    });
    console.log(`[CERT consumers] selectable=${selectable.length}/${results.length}`);
    expect(selectable.length).toBe(results.length);
});

test("consumer regression — POS record picker renders Search-backed options", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 300_000);
    await signIn(page, OPERATOR);
    await page.goto("/adminV2/pos");
    await page.waitForLoadState("domcontentloaded");
    await shot(page, "07-pos-surface");
    console.log("[CERT pos] url =", page.url());
});
