import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Search → Focus Panel convergence (scenarios A–H).
 *
 * The negative reference is the old white modal overlay: clicking a Search result
 * used to open the generic AdminV2 drawer product on top of the workspace. The
 * accepted result is the operator staying in their operational context with the
 * INLINE Focus Panel focused on the card they asked for.
 *
 * ── WHY THESE ASSERTIONS LOOK THE WAY THEY DO ──
 *
 * An earlier revision of this file reported 8/8 PASS while the product was broken.
 * Every scenario asserted only the ABSENCE of a modal — which a completely blank
 * page satisfies perfectly, and a blank page is exactly what the defect produced
 * (`grids: 0, cells: []`). It also filtered focused cells on `data-focused`, an
 * attribute the Focus Panel has never emitted, so "0 focused cells" was
 * indistinguishable from "the assertion cannot fail".
 *
 * A scenario here now passes only on POSITIVE proof:
 *   - the expected work-unit route committed, carrying the expected `?subject_id=`
 *   - the inline Focus Panel root is present with a NONZERO number of composed cells
 *   - the expected card is present AND elevated (`data-fp-elevated="true"`)
 *   - no modal drawer root exists
 *   - no lingering "Preparing record…"
 *
 * The expected route is not hardcoded: it is derived from the Search API's own
 * destination for the query, so the assertion also proves the API and the UI agree
 * about where a click should land. A tenant that renames a work unit changes both.
 *
 * Logs in per test — the harness README records that a reused storage-state session
 * is rejected on a cold SSR load.
 */

const SHOTS = path.join(__dirname, "..", "evidence", "search-focus-panel");
const OPERATOR = { email: "qa.operator@northwind.invalid", password: "alloy-local-cert" };
const LOGIN_WAIT = Number(process.env.CERT_AUTH_WAIT_MS || 300_000);
/**
 * Generous, because this runs against a DEV server: the first request to a route
 * compiles it, which on a loaded host can take minutes and has nothing to do with
 * the product. `warmDestination` removes that from the measured path — see there.
 */
const SETTLE = 180_000;

const CARD = { children: "children", household: "household", assignment: "scheduling" } as const;

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

async function searchFor(page: Page, q: string) {
    const input = page.locator('[data-global-search-input="true"]');
    await input.waitFor({ state: "visible", timeout: 60_000 });
    await input.click();
    await input.fill(q);
    await page.locator("#adminv2-global-search-results").waitFor({ state: "visible", timeout: 60_000 });
    await page.waitForFunction(
        () => {
            const el = document.querySelector("#adminv2-global-search-results");
            return !!el && !el.textContent?.includes("Searching…");
        },
        undefined,
        { timeout: 120_000 }
    );
    return input;
}

type ExpectedLanding = {
    workUnitSlug: string;
    subjectId: string;
    pathname: string;
    cardKey: string;
    itemId: string | null;
};

/**
 * What the Search API says a click on this query's first subject SHOULD do.
 *
 * Reading it from the API rather than hardcoding is what makes these assertions
 * tenant-configuration-driven — and it means a destination that names a work unit
 * the route cannot resolve fails HERE, with the payload in the message, instead of
 * silently as an empty panel.
 */
async function expectedLandingFor(
    page: Page,
    q: string,
    destinationKey?: string,
    resultIndex = 0,
): Promise<ExpectedLanding> {
    const payload = await page.evaluate(async (query) => {
        const res = await fetch(`/api/admin/global-search?q=${encodeURIComponent(query)}`, {
            credentials: "include",
        });
        return (await res.json()) as {
            results?: Array<{
                destinations?: Array<{
                    key: string;
                    primary?: boolean;
                    card_key?: string | null;
                    item_id?: string | null;
                    host_entity_id?: string | null;
                    host_work_unit_key?: string | null;
                }>;
            }>;
        };
    }, q);

    const destinations = payload.results?.[resultIndex]?.destinations ?? [];
    const destination = destinationKey
        ? destinations.find((d) => d.key === destinationKey)
        : destinations.find((d) => d.primary);

    expect(destination, `no ${destinationKey ?? "primary"} destination for "${q}"`).toBeTruthy();

    const workUnitKey = (destination!.host_work_unit_key ?? "").trim();
    const subjectId = (destination!.host_entity_id ?? "").trim();
    // A destination with no work unit cannot be navigated to at all. Fail loudly:
    // this is precisely the state that used to present as an empty Focus Panel.
    expect(workUnitKey, `"${q}" resolved no host work unit — nothing can host its Focus Panel`).not.toBe("");
    expect(subjectId, `"${q}" resolved no host record`).not.toBe("");

    const workUnitSlug = workUnitKey.replace(/_/g, "-");
    // What Search actually resolved, recorded either way. A scenario that fails on the surface is
    // almost always explained by the destination it was given.
    console.log(
        `[CERT DEST "${q}"${destinationKey ? ` (${destinationKey})` : ""}] ${JSON.stringify({
            key: destination!.key,
            card: destination!.card_key ?? null,
            item: destination!.item_id ?? null,
            workUnit: workUnitKey,
            host: subjectId,
        })}`,
    );
    return {
        workUnitSlug,
        subjectId,
        pathname: `/workspace/work-unit/${workUnitSlug}`,
        cardKey: (destination!.card_key ?? "").trim(),
        itemId: (destination!.item_id ?? null) || null,
    };
}

/**
 * Which item a card reports as focused, using the attribute the card genuinely emits.
 *
 * These are runtime attributes, not test hooks: `data-children-focused-child` is how the Children
 * card marks the child it has opened. Certifying against an attribute the product does not emit is
 * how the previous suite reported 8/8 while nothing worked — it filtered on `data-focused`, which the
 * Focus Panel has never rendered, so "0 focused cells" and "assertion cannot fail" were the same
 * observation.
 */
const ITEM_FOCUS_ATTRIBUTE: Record<string, string> = {
    // The CANONICAL child, not the card's internal roster row id — Search addresses a child by its
    // durable identity, so that is what must be observed as selected.
    children: "data-children-focused-member",
};

/** Everything the panel is actually showing. Reported as evidence either way. */
async function panelState(page: Page, label: string) {
    const state = await page.evaluate(() => {
        const cells = Array.from(document.querySelectorAll("[data-focus-panel-grid-cell]"));
        return {
            url: location.pathname + location.search,
            cells: cells.map((el) => el.getAttribute("data-focus-panel-grid-cell")),
            elevated: cells
                .filter((el) => el.getAttribute("data-fp-elevated") === "true")
                .map((el) => el.getAttribute("data-focus-panel-grid-cell")),
            depth: document.querySelector("[data-fp-depth]")?.getAttribute("data-fp-depth") ?? null,
            focusedChild:
                document
                    .querySelector("[data-children-focused-member]")
                    ?.getAttribute("data-children-focused-member") ?? null,
            hasModal: !!document.querySelector('[role="dialog"][aria-modal="true"]'),
            preparing: /Preparing record/i.test(document.body.innerText),
        };
    });
    console.log(`[CERT ${label}] ${JSON.stringify(state)}`);
    return state;
}

async function shot(page: Page, name: string) {
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

/**
 * THE POSITIVE CONTROL. Nothing here can be satisfied by a blank page.
 */
async function assertLandedOnFocusPanel(
    page: Page,
    label: string,
    expected: ExpectedLanding,
    opts: { requireElevated?: boolean; requireItem?: boolean } = {}
) {
    // 1. The expected work-unit route committed, carrying the expected host record.
    await page.waitForURL(
        (url) =>
            url.pathname === expected.pathname && url.searchParams.get("subject_id") === expected.subjectId,
        { timeout: SETTLE }
    );

    // 2. The INLINE Focus Panel composed — nonzero cells. `cells: []` fails here.
    const cells = page.locator("[data-focus-panel-grid-cell]");
    await expect(cells.first()).toBeVisible({ timeout: SETTLE });
    expect(await cells.count(), "the Focus Panel composed no cells").toBeGreaterThan(0);

    // 3. The card Search asked for is present…
    if (expected.cardKey) {
        await expect(
            page.locator(`[data-focus-panel-grid-cell="${expected.cardKey}"]`),
            `card "${expected.cardKey}" is not on the composed panel`
        ).toHaveCount(1, { timeout: SETTLE });

        // 4. …and elevated. `current_work` opens the Current Work workspace instead of
        //    elevating a cell, so elevation is asserted only where the panel elevates.
        if (opts.requireElevated !== false && expected.cardKey !== "current_work") {
            await expect(
                page.locator(`[data-focus-panel-grid-cell="${expected.cardKey}"][data-fp-elevated="true"]`),
                `card "${expected.cardKey}" composed but was never focused`
            ).toHaveCount(1, { timeout: SETTLE });
        }
    }

    // 4b. The ITEM the operator actually clicked is the one selected inside that card.
    //     Elevating the card alone would leave them to find the child themselves.
    if (expected.itemId && opts.requireItem !== false) {
        const attribute = ITEM_FOCUS_ATTRIBUTE[expected.cardKey];
        if (attribute) {
            await expect(
                page.locator(`[${attribute}="${expected.itemId}"]`),
                `card "${expected.cardKey}" is focused but item ${expected.itemId} is not the selected one`
            ).toHaveCount(1, { timeout: SETTLE });
        }
    }

    const state = await panelState(page, label);

    // 5. The negative reference: the generic modal drawer must never be mounted.
    expect(await page.locator('[role="dialog"][aria-modal="true"], .admin-entity-drawer, [data-admin-drawer-modal]').count()).toBe(0);
    expect(state.hasModal).toBe(false);

    // 6. A surface still saying "Preparing record…" has not landed.
    expect(state.preparing, "the surface is still preparing the record").toBe(false);

    return state;
}

/**
 * Compile the destination route, then return to the workspace.
 *
 * The App Router holds the URL until the server has produced the RSC payload, so on
 * a dev server a first-visit compile presents as "the click did nothing" for as long
 * as the compile takes. That is a harness property, not a product one, and folding
 * it into the perceived-work numbers would make them meaningless.
 *
 * This is a warm-up, NOT a shortcut: the measured click still has to resolve its own
 * destination, navigate, and compose. It also gives each scenario a second, independent
 * proof that the deep link works on a COLD SSR load, not only on a client transition.
 */
async function warmDestination(page: Page, expected: ExpectedLanding) {
    await page.goto(`${expected.pathname}?subject_id=${encodeURIComponent(expected.subjectId)}`);
    await page.locator("[data-focus-panel-grid-cell]").first().waitFor({ state: "visible", timeout: SETTLE });
    await page.goto("/workspace");
    await page.locator('[data-global-search-input="true"]').waitFor({ state: "visible", timeout: SETTLE });
}

/** Click the first subject row and report the perceived-work timings. */
async function clickSubject(page: Page, label: string, expected: ExpectedLanding) {
    const subject = page.locator('[data-search-subject-button="true"]').first();
    await subject.waitFor({ state: "visible", timeout: 60_000 });

    const t0 = Date.now();
    await subject.click();

    await expect(page.locator('[data-global-search-input="true"]')).toHaveValue("", { timeout: 20_000 });
    const dismissed = Date.now() - t0;

    await page.waitForURL(
        (url) =>
            url.pathname === expected.pathname && url.searchParams.get("subject_id") === expected.subjectId,
        { timeout: SETTLE }
    );
    const routed = Date.now() - t0;

    await page.locator("[data-focus-panel-grid-cell]").first().waitFor({ state: "visible", timeout: SETTLE });
    const composed = Date.now() - t0;

    let focused: number | null = null;
    if (expected.cardKey && expected.cardKey !== "current_work") {
        try {
            await page
                .locator(`[data-focus-panel-grid-cell="${expected.cardKey}"][data-fp-elevated="true"]`)
                .waitFor({ state: "attached", timeout: SETTLE });
            focused = Date.now() - t0;
        } catch {
            focused = null;
        }
    }

    let itemFocused: number | null = null;
    const itemAttribute = ITEM_FOCUS_ATTRIBUTE[expected.cardKey];
    if (expected.itemId && itemAttribute) {
        try {
            await page
                .locator(`[${itemAttribute}="${expected.itemId}"]`)
                .waitFor({ state: "attached", timeout: SETTLE });
            itemFocused = Date.now() - t0;
        } catch {
            itemFocused = null;
        }
    }

    console.log(
        `[CERT ${label} TIMING] dismissed=${dismissed}ms attention_route=${routed}ms cards_visible=${composed}ms card_focused=${focused ?? "never"}ms item_focused=${itemFocused ?? "never"}ms`
    );
    return { dismissed, routed, composed, focused, itemFocused };
}

test.describe.configure({ mode: "default" });

test("A — child click lands on the inline Focus Panel with the Children card focused", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 400_000);
    await signIn(page);
    await searchFor(page, "Joe Smith");

    const expected = await expectedLandingFor(page, "Joe Smith");
    expect(expected.cardKey).toBe(CARD.children);
    expect(expected.itemId, "the child itself must be the focused item").toBeTruthy();

    await warmDestination(page, expected);
    await searchFor(page, "Joe Smith");
    await clickSubject(page, "A", expected);
    await assertLandedOnFocusPanel(page, "A", expected);
    await shot(page, "A-child-joe");
});

test("B — a sibling lands on the same panel, focused on the sibling", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 400_000);
    await signIn(page);
    await searchFor(page, "Emma Smith");

    const expected = await expectedLandingFor(page, "Emma Smith");
    await clickSubject(page, "B", expected);
    await assertLandedOnFocusPanel(page, "B", expected);
    await shot(page, "B-sibling-emma");
});

test("C — a parent lands on Household context, not a modal", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 400_000);
    await signIn(page);
    await searchFor(page, "Jane Smith");

    const expected = await expectedLandingFor(page, "Jane Smith");
    expect(expected.cardKey).toBe(CARD.household);

    await clickSubject(page, "C", expected);
    await assertLandedOnFocusPanel(page, "C", expected);
    await shot(page, "C-parent-jane");
});

test("D — a household subject lands on its own case panel", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 400_000);
    await signIn(page);
    await searchFor(page, "Smith Household");

    const expected = await expectedLandingFor(page, "Smith Household");
    await clickSubject(page, "D", expected);
    await assertLandedOnFocusPanel(page, "D", expected);
    await shot(page, "D-household");
});

test("E — a process context is a DISTINCT destination and lands on its own card", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 400_000);
    await signIn(page);
    await searchFor(page, "Joe Smith");

    // The process pill must EXIST alongside the subject — the defect was that the
    // dedupe collapsed them and left only Household.
    const pills = page.locator("[data-search-destination]");
    const keys = await pills.evaluateAll((els) => els.map((e) => e.getAttribute("data-search-destination")));
    console.log(`[CERT E] destination keys: ${JSON.stringify(keys)}`);
    const processKey = keys.find((k) => k?.startsWith("process:"));
    expect(processKey, "no process destination alongside the subject").toBeTruthy();

    const expected = await expectedLandingFor(page, "Joe Smith", processKey!);
    const subjectExpected = await expectedLandingFor(page, "Joe Smith");
    // Same host record, different operator intent — that is why dedupe keys on the
    // destination and never on the record.
    expect(expected.subjectId).toBe(subjectExpected.subjectId);
    expect(expected.cardKey).not.toBe(subjectExpected.cardKey);

    // Click the pill directly. `pills.filter({ has: … })` searched for a descendant matching the
    // same selector as the pill itself, so it matched nothing and the fallback click raced the page.
    await page.locator(`[data-search-destination="${processKey}"]`).first().click();

    await assertLandedOnFocusPanel(page, "E", expected);
    await shot(page, "E-process-context");
});

test("F — assignment intent targets the assignment card", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 400_000);
    await signIn(page);
    await searchFor(page, "Joe Smith schedule");
    const keys = await page
        .locator("[data-search-destination]")
        .evaluateAll((els) => els.map((e) => e.getAttribute("data-search-destination")));
    console.log(`[CERT F] destination keys: ${JSON.stringify(keys)}`);
    expect(keys).toContain("assignment");

    const expected = await expectedLandingFor(page, "Joe Smith schedule", "assignment");
    expect(expected.cardKey).toBe(CARD.assignment);

    await page.locator('[data-search-destination="assignment"]').first().click();
    await assertLandedOnFocusPanel(page, "F", expected);
    await shot(page, "F-assignment-intent");
});

test("G — rapid switching: the NEWER selection wins", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 400_000);
    await signIn(page);

    await searchFor(page, "Joe Smith");
    const first = await expectedLandingFor(page, "Joe Smith");
    await page.locator('[data-search-subject-button="true"]').first().click();
    await page.waitForTimeout(400);

    // A DIFFERENT record, not merely a different query string. Emma is Joe's sibling in the same
    // household, so this would not prove supersession — the Rivers household's Joe is a distinct
    // case, which is what makes "the newer selection wins" observable at all.
    await searchFor(page, "Rivers");
    const second = await expectedLandingFor(page, "Rivers");
    // The scenario is only meaningful if the two clicks target different records.
    expect(second.subjectId).not.toBe(first.subjectId);
    await page.locator('[data-search-subject-button="true"]').first().click();

    const state = await assertLandedOnFocusPanel(page, "G", second);
    // The superseded selection must not win a race and land afterwards.
    expect(state.url).toContain(second.subjectId);
    expect(state.url).not.toContain(first.subjectId);
    await shot(page, "G-rapid-switch");
});

test("H — keyboard selection has the same semantics as a click", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 400_000);
    await signIn(page);
    const input = await searchFor(page, "Joe Smith");

    // ArrowDown moves the highlight OFF the default first row, so the keyboard lands on the SECOND
    // result — that is the point of the scenario. Asserting against the first result made this test
    // wait forever for a URL the operator never asked for, and read as a product failure.
    const expected = await expectedLandingFor(page, "Joe Smith", undefined, 1);
    await page.locator('[data-search-subject-button="true"]').first().waitFor({ timeout: 60_000 });
    await input.press("ArrowDown");
    await input.press("Enter");
    await expect(input).toHaveValue("", { timeout: 20_000 });

    await assertLandedOnFocusPanel(page, "H", expected);
    await shot(page, "H-keyboard");
});
