import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * DRAWER PRODUCT ERADICATION — the operator paths that used to open the modal record overlay.
 *
 * The negative reference is one element: the portaled `role="dialog" aria-modal="true"` panel from
 * `components/admin/Drawer.tsx`. Its router (`AdminEntityDrawer`) and both runtimes it mounted are
 * deleted; these scenarios prove the OPERATOR paths that reached them now land on the inline Focus
 * Panel instead — and, crucially, that they land somewhere at all.
 *
 * ── WHY EVERY SCENARIO NEEDS A POSITIVE CONTROL ──
 *
 * Absence-of-modal is satisfied perfectly by a blank page, and a blank page is exactly what the
 * defect this programme exists to remove produced: `router.push` to a seed-only work-unit route
 * changed the URL, rendered the route fine, and composed nothing, forever, with no error. The Search
 * cert suite reported 8/8 PASS in that state. So a scenario here passes only when the panel has
 * composed a nonzero number of cells, and — where a card was named — that card is present and
 * elevated.
 *
 * Runs against a DEV server, so the first visit to a route compiles it. `warm` removes that from the
 * measured path; it is a warm-up, not a shortcut, and it doubles as the cold-deep-link proof.
 */

const SHOTS = path.join(__dirname, "..", "evidence", "drawer-eradication");
const OPERATOR = { email: "qa.operator@northwind.invalid", password: "alloy-local-cert" };
const LOGIN_WAIT = Number(process.env.CERT_AUTH_WAIT_MS || 300_000);
const SETTLE = 180_000;

/** The one element this whole sprint exists to remove. */
const MODAL = '[role="dialog"][aria-modal="true"], .adminv2-drawer-modal-panel, .adminv2-drawer-sidebar-panel';

/**
 * The queue row's OWN runtime label (`WU.QUEUE_ROW`), not a test hook. Presentation Runtime V2 gives
 * every component exactly one, and certifying against an attribute the product does not emit is how
 * a previous suite reported 8/8 while nothing worked.
 */
const QUEUE_ROW = '[data-runtime-label="WU.QUEUE_ROW"]';

/**
 * A CHILD from the seeded tenant, not the household.
 *
 * The first run of this suite searched the family name and skipped three scenarios: the household is
 * its own subject, and only a child participates in a process or carries a schedule, so the
 * household's result offers no process, assignment or household-context destination to click. The
 * grain matters to what is even testable.
 */
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

type Landing = {
    workUnitSlug: string;
    subjectId: string;
    pathname: string;
    cardKey: string;
    itemId: string | null;
};

/**
 * Where the platform says this record is worked.
 *
 * Read from the resolver rather than hardcoded, so a tenant that renames a work unit changes both
 * sides at once — and so a record that resolves NO work unit fails here, with the payload in the
 * message, instead of silently as an empty panel.
 */
async function resolveHost(page: Page, entityType: string, entityId: string): Promise<{ workUnitKey: string; hostId: string }> {
    const payload = await page.evaluate(
        async ([type, id]) => {
            const res = await fetch("/api/admin/operator-focus/resolve", {
                method: "POST",
                credentials: "include",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ entity_type: type, entity_id: id }),
            });
            return (await res.json()) as {
                ok?: boolean;
                target?: { host_entity_id?: string; host_work_unit_key?: string | null } | null;
            };
        },
        [entityType, entityId],
    );
    const workUnitKey = (payload.target?.host_work_unit_key ?? "").trim();
    const hostId = (payload.target?.host_entity_id ?? "").trim();
    console.log(`[CERT RESOLVE ${entityType}:${entityId}] ${JSON.stringify(payload.target ?? null)}`);
    expect(workUnitKey, `${entityType}:${entityId} resolved no host work unit`).not.toBe("");
    expect(hostId, `${entityType}:${entityId} resolved no host record`).not.toBe("");
    return { workUnitKey, hostId };
}

/** The first household the seeded tenant actually has, taken from Search rather than assumed. */
async function firstSubject(page: Page, q: string) {
    const payload = await page.evaluate(async (query) => {
        const res = await fetch(`/api/admin/global-search?q=${encodeURIComponent(query)}`, { credentials: "include" });
        return (await res.json()) as {
            results?: Array<{
                subject?: { kind?: string; id?: string; display_name?: string; person_id?: string | null; household_id?: string | null };
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
    const first = payload.results?.[0];
    expect(first, `search for "${q}" returned nothing — the fixture does not contain it`).toBeTruthy();
    return first!;
}

function landingFrom(destination: {
    card_key?: string | null;
    item_id?: string | null;
    host_entity_id?: string | null;
    host_work_unit_key?: string | null;
}): Landing {
    const workUnitKey = (destination.host_work_unit_key ?? "").trim();
    const subjectId = (destination.host_entity_id ?? "").trim();
    expect(workUnitKey, "destination resolved no host work unit").not.toBe("");
    const slug = workUnitKey.replace(/_/g, "-");
    return {
        workUnitSlug: slug,
        subjectId,
        pathname: `/workspace/work-unit/${slug}`,
        cardKey: (destination.card_key ?? "").trim(),
        itemId: (destination.item_id ?? null) || null,
    };
}

/** Everything the panel is actually showing. Recorded as evidence either way. */
async function panelState(page: Page, label: string) {
    const state = await page.evaluate((modalSelector) => {
        const cells = Array.from(document.querySelectorAll("[data-focus-panel-grid-cell]"));
        return {
            url: location.pathname + location.search,
            cells: cells.map((el) => el.getAttribute("data-focus-panel-grid-cell")),
            elevated: cells
                .filter((el) => el.getAttribute("data-fp-elevated") === "true")
                .map((el) => el.getAttribute("data-focus-panel-grid-cell")),
            focusedChild:
                document.querySelector("[data-children-focused-member]")?.getAttribute("data-children-focused-member") ?? null,
            modalCount: document.querySelectorAll(modalSelector).length,
            preparing: /Preparing record/i.test(document.body.innerText),
        };
    }, MODAL);
    console.log(`[CERT ${label}] ${JSON.stringify(state)}`);
    return state;
}

const shot = (page: Page, name: string) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });

/**
 * Click a destination ON THE FIRST RESULT ROW.
 *
 * `[data-search-destination="household"].first()` is not the same thing: a query matching several
 * families renders a Household chip on each of them, and the first in DOM order can belong to
 * another row entirely. That is how this scenario failed — it clicked one family's Household chip
 * and then asserted it had landed on another's, which reads exactly like a broken destination.
 */
async function clickDestination(page: Page, key: string) {
    const row = page.locator('[data-search-result-index="0"]');
    await row.waitFor({ state: "visible", timeout: 60_000 });
    const chip = row.locator(`[data-search-destination="${key}"]`).first();
    // Only the first few destinations render inline; the rest sit behind `More`. A child carries
    // subject + process + assignment + household, so Household is genuinely the one that overflows.
    if (!(await chip.count())) {
        await row.getByRole("button", { name: "More", exact: true }).click();
    }
    await chip.click();
}

/** Nothing here can be satisfied by a blank page. */
async function assertLanded(page: Page, label: string, expected: Landing, opts: { requireElevated?: boolean } = {}) {
    await page.waitForURL(
        (url) => url.pathname === expected.pathname && url.searchParams.get("subject_id") === expected.subjectId,
        { timeout: SETTLE },
    );

    const cells = page.locator("[data-focus-panel-grid-cell]");
    await expect(cells.first()).toBeVisible({ timeout: SETTLE });
    expect(await cells.count(), "the Focus Panel composed no cells").toBeGreaterThan(0);

    if (expected.cardKey) {
        await expect(
            page.locator(`[data-focus-panel-grid-cell="${expected.cardKey}"]`),
            `card "${expected.cardKey}" is not on the composed panel`,
        ).toHaveCount(1, { timeout: SETTLE });

        // `current_work` opens the Current Work workspace rather than elevating a cell.
        if (opts.requireElevated !== false && expected.cardKey !== "current_work") {
            await expect(
                page.locator(`[data-focus-panel-grid-cell="${expected.cardKey}"][data-fp-elevated="true"]`),
                `card "${expected.cardKey}" composed but was never focused`,
            ).toHaveCount(1, { timeout: SETTLE });
        }
    }

    if (expected.itemId && expected.cardKey === "children") {
        await expect(
            page.locator(`[data-children-focused-member="${expected.itemId}"]`),
            `Children is focused but ${expected.itemId} is not the selected child`,
        ).toHaveCount(1, { timeout: SETTLE });
    }

    const state = await panelState(page, label);
    expect(state.modalCount, "the modal record overlay is mounted").toBe(0);
    expect(state.preparing, "the surface is still preparing the record").toBe(false);
    await shot(page, label);
    return state;
}

/** Compile the destination, prove the COLD deep link, then return to the workspace. */
async function warm(page: Page, expected: Landing) {
    const aspect = expected.cardKey
        ? `&aspect=${encodeURIComponent(`card:${expected.cardKey}${expected.itemId ? `|item:${expected.itemId}` : ""}`)}`
        : "";
    await page.goto(`${expected.pathname}?subject_id=${encodeURIComponent(expected.subjectId)}${aspect}`);
    await page.locator("[data-focus-panel-grid-cell]").first().waitFor({ state: "visible", timeout: SETTLE });
    await page.goto("/workspace");
    await page.locator('[data-global-search-input="true"]').waitFor({ state: "visible", timeout: SETTLE });
}

test.describe("no operator path opens the modal record overlay", () => {
    test("1 · queue row → subject → inline Focus Panel, no modal", async ({ page }) => {
        await signIn(page);
        const subject = await firstSubject(page, CHILD);
        const destination = subject.destinations?.find((d) => d.primary);
        expect(destination, "no primary destination").toBeTruthy();
        const expected = landingFrom(destination!);
        await warm(page, expected);

        await page.goto(expected.pathname);
        // A queue row selection: the inline panel composes for the row's subject with no overlay.
        const row = page.locator(QUEUE_ROW).first();
        await row.waitFor({ state: "visible", timeout: SETTLE });
        await row.click();

        const cells = page.locator("[data-focus-panel-grid-cell]");
        await expect(cells.first()).toBeVisible({ timeout: SETTLE });
        const state = await panelState(page, "01-queue-row");
        expect(state.cells.length).toBeGreaterThan(0);
        expect(state.modalCount).toBe(0);
        await shot(page, "01-queue-row");
    });

    test("2 · a child lands on the Children card with that child selected", async ({ page }) => {
        await signIn(page);
        const subject = await firstSubject(page, CHILD);
        const destination = subject.destinations?.find((d) => d.primary);
        const expected = landingFrom(destination!);
        expect(expected.cardKey, "the primary destination named no card").not.toBe("");
        await warm(page, expected);

        await page.locator('[data-global-search-input="true"]').fill(CHILD);
        await page.locator("#adminv2-global-search-results").waitFor({ state: "visible", timeout: 60_000 });
        await page.locator('[data-search-subject-button="true"]').first().click();
        await assertLanded(page, "02-child-card", expected);
    });

    test("3 · a person lands on the Household card, no modal", async ({ page }) => {
        await signIn(page);
        const subject = await firstSubject(page, CHILD);
        const household = subject.destinations?.find((d) => d.key === "household");
        test.skip(!household, "the fixture's first subject has no household destination");
        const expected = landingFrom(household!);
        await warm(page, expected);

        await page.locator('[data-global-search-input="true"]').fill(CHILD);
        await page.locator("#adminv2-global-search-results").waitFor({ state: "visible", timeout: 60_000 });
        await clickDestination(page, "household");
        await assertLanded(page, "03-household", expected);
    });

    test("4 · an assignment lands on the Assignments card, no modal", async ({ page }) => {
        await signIn(page);
        const subject = await firstSubject(page, CHILD);
        const assignment = subject.destinations?.find((d) => d.key === "assignment");
        test.skip(!assignment, "the fixture's first subject has no assignment context");
        const expected = landingFrom(assignment!);
        await warm(page, expected);

        await page.locator('[data-global-search-input="true"]').fill(CHILD);
        await page.locator("#adminv2-global-search-results").waitFor({ state: "visible", timeout: 60_000 });
        await clickDestination(page, "assignment");
        await assertLanded(page, "04-assignment", expected);
    });

    test("5 · a process context resolves the real Work Unit, not the process key", async ({ page }) => {
        await signIn(page);
        const subject = await firstSubject(page, CHILD);
        const process = subject.destinations?.find((d) => d.key.startsWith("process:"));
        test.skip(!process, "the fixture's first subject participates in no process");
        const expected = landingFrom(process!);

        // The whole defect, stated: the destination must name a WORK UNIT the route can resolve.
        // A process key parses fine as a slug, which is why it failed silently.
        const processKey = process!.key.slice("process:".length);
        expect(expected.workUnitSlug).not.toBe(processKey.replace(/_/g, "-"));

        await warm(page, expected);
        await page.locator('[data-global-search-input="true"]').fill(CHILD);
        await page.locator("#adminv2-global-search-results").waitFor({ state: "visible", timeout: 60_000 });
        await clickDestination(page, process!.key);
        await assertLanded(page, "05-process", expected, { requireElevated: false });
    });

    test("6 · the record resolver agrees with Search about where a record is worked", async ({ page }) => {
        await signIn(page);
        const subject = await firstSubject(page, CHILD);
        const destination = subject.destinations?.find((d) => d.primary);
        const expected = landingFrom(destination!);

        // Every migrated caller resolves through this endpoint rather than through Search. If the
        // two disagreed, a task's "Open record" and a Search click would land in different queues
        // for the same family.
        const resolved = await resolveHost(page, "opportunities", expected.subjectId);
        expect(resolved.hostId).toBe(expected.subjectId);
        expect(resolved.workUnitKey.replace(/_/g, "-")).toBe(expected.workUnitSlug);
    });

    test("7 · Previous / Next queue traversal keeps the inline panel and never opens a modal", async ({ page }) => {
        await signIn(page);
        const subject = await firstSubject(page, CHILD);
        const expected = landingFrom(subject.destinations!.find((d) => d.primary)!);
        await warm(page, expected);
        await page.goto(expected.pathname);
        await page.locator("[data-focus-panel-grid-cell]").first().waitFor({ state: "visible", timeout: SETTLE });

        const rows = page.locator(QUEUE_ROW);
        const count = await rows.count();
        test.skip(count < 2, "the fixture queue has fewer than two rows");

        // Waiting for a grid cell proves nothing here: the surface's DEFAULT subject has already
        // composed one before the first click. The observable that actually moves is the committed
        // subject the kernel projects into the address, so wait on that.
        const committedSubject = () =>
            page.evaluate(() => new URL(location.href).searchParams.get("subject_id"));

        await rows.nth(0).click();
        await page.waitForFunction(() => !!new URL(location.href).searchParams.get("subject_id"), undefined, {
            timeout: SETTLE,
        });
        const firstSubjectId = await committedSubject();
        const first = await panelState(page, "07-traversal-first");

        await rows.nth(1).click();
        await page.waitForFunction(
            (previous) => new URL(location.href).searchParams.get("subject_id") !== previous,
            firstSubjectId,
            { timeout: SETTLE },
        );
        const secondSubjectId = await committedSubject();
        const second = await panelState(page, "07-traversal-second");

        expect(first.modalCount).toBe(0);
        expect(second.modalCount).toBe(0);
        expect(firstSubjectId, "the first row click committed no subject").toBeTruthy();
        expect(secondSubjectId, "the second row click did not change the committed subject").not.toBe(firstSubjectId);
        await shot(page, "07-traversal");
    });

    test("8 · rapid switching commits the LAST selection", async ({ page }) => {
        await signIn(page);
        const subject = await firstSubject(page, CHILD);
        const expected = landingFrom(subject.destinations!.find((d) => d.primary)!);
        await warm(page, expected);
        await page.goto(expected.pathname);
        const rows = page.locator(QUEUE_ROW);
        await rows.first().waitFor({ state: "visible", timeout: SETTLE });
        const count = await rows.count();
        test.skip(count < 2, "the fixture queue has fewer than two rows");

        // No settle between clicks: the kernel supersedes an in-flight movement, so the newest wins.
        await rows.nth(0).click();
        await rows.nth(1).click();
        await page.locator("[data-focus-panel-grid-cell]").first().waitFor({ state: "visible", timeout: SETTLE });
        const state = await panelState(page, "08-rapid-switch");
        expect(state.modalCount).toBe(0);
        expect(state.preparing).toBe(false);
        await shot(page, "08-rapid-switch");
    });

    test("9 · a cold deep link establishes attention, card and item", async ({ page }) => {
        await signIn(page);
        const subject = await firstSubject(page, CHILD);
        const expected = landingFrom(subject.destinations!.find((d) => d.primary)!);
        test.skip(!expected.cardKey, "the primary destination named no card");

        const aspect = `card:${expected.cardKey}${expected.itemId ? `|item:${expected.itemId}` : ""}`;
        await page.goto(
            `${expected.pathname}?subject_id=${encodeURIComponent(expected.subjectId)}&aspect=${encodeURIComponent(aspect)}`,
        );
        // A URL may establish attention exactly once, on cold load — this is that path.
        await assertLanded(page, "09-cold-deep-link", expected);
    });

    test("10 · every operator surface reachable from the workspace mounts no modal", async ({ page }) => {
        await signIn(page);
        // The fixture tenant has never customised Surface Builder, so this doubles as the
        // usable-defaults check: whatever composes here composes on a newly seeded tenant.
        const subject = await firstSubject(page, CHILD);
        const expected = landingFrom(subject.destinations!.find((d) => d.primary)!);

        for (const [name, url] of [
            ["10-workspace", "/workspace"],
            ["10-work-unit", `${expected.pathname}?subject_id=${encodeURIComponent(expected.subjectId)}`],
        ] as const) {
            await page.goto(url);
            await page.waitForLoadState("domcontentloaded");
            await page.waitForTimeout(2_000);
            const modals = await page.locator(MODAL).count();
            console.log(`[CERT ${name}] modals=${modals} url=${url}`);
            expect(modals, `${url} mounted a modal overlay`).toBe(0);
            await shot(page, name);
        }

        // And the panel that composed on this unconfigured tenant is a real one.
        const cells = await page.locator("[data-focus-panel-grid-cell]").count();
        expect(cells, "the default composition produced no cards on an unconfigured tenant").toBeGreaterThan(0);
    });
});
