import { test, expect, type Page } from "@playwright/test";

/**
 * CONTEXTUAL FOCUS — a record destination lights no pill.
 *
 * The defect: opening a person resolves their household's case, whose host Work Unit is a
 * builder-owned stage unit, and the surface shows that unit's FIRST Work View as selected. The
 * operator did not choose a cohort — they asked for a person — and the runtime had no way to say so:
 * `findWorkViewById(...) ?? firstVisibleWorkView(...)` makes "no lens requested" and "the first lens"
 * the same input.
 *
 * ── WHAT COUNTS AS PROOF HERE ──
 *
 * The same bar the operational-destinations certification set, inverted. There, a lit pill was not
 * proof of arrival; here, an UNLIT pill is not proof of correctness — a surface that failed to compose
 * also has no pill lit, and an error terminal renders no cohort either. So every contextual assertion
 * below requires BOTH halves:
 *
 *   1. no cohort is claimed — no pill selected, no `work_view_id` in the address, and the queue says
 *      "no Work View selected" rather than "no records in this view" (which would name a view nobody
 *      chose), and
 *   2. the surface is USEFUL — the Focus Panel composes cells > 0 for the record that was asked for.
 *
 * A changed URL, an unlit pill, and the absence of an error banner are each insufficient alone.
 *
 * ── HOW THE SUBJECTS ARE FOUND ──
 *
 * Discovered from the tenant, never hardcoded. A CONTEXTUAL destination is one Search offers with a
 * host work unit and NO `host_work_view_id` — the producer resolves that field only from memberships
 * that provably contain the subject, so its absence is the producer stating that no cohort holds them.
 * The COHORT control is fixture 05's waitlisted sibling, which must be unaffected by any of this.
 */

const OPERATOR = { email: "qa.operator@northwind.invalid", password: "alloy-local-cert" };
const LOGIN_WAIT = Number(process.env.CERT_AUTH_WAIT_MS || 300_000);
const SETTLE = 60_000;

/** Seeded by `certification/search-platform/05-sibling-child-participations.sql`. */
const SIBLING_WAITLIST = "00000000-0000-4000-8000-30000000011c";
const SIBLING_QUERY = "Quinn Testfamily-0284";
/** Queries to sweep for a subject that no cohort holds — a parent, or a household. */
const CONTEXTUAL_QUERIES = ["Testfamily", "Quinn Testfamily-0284", "Testfamily-0284"];

test.use({ storageState: undefined });

async function signIn(page: Page) {
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(OPERATOR.email);
    const pw = page.locator('input[type="password"]').first();
    await pw.fill(OPERATOR.password);
    await pw.press("Enter");
    await page.waitForURL("**/workspace**", { timeout: LOGIN_WAIT });
    await page.waitForLoadState("domcontentloaded");
}

type Destination = {
    key: string;
    label: string;
    host_work_view_id: string | null;
    host_work_unit_key: string | null;
    entity_id: string | null;
    item_id: string | null;
};
type Result = { subject: Record<string, unknown> | null; destinations: Destination[] };

/** The server's own answer — the destination contract as Search actually emits it. */
async function searchDestinations(page: Page, query: string): Promise<Result[]> {
    return page.evaluate(async (q: string) => {
        const res = await fetch(`/api/admin/global-search?q=${encodeURIComponent(q)}`, {
            credentials: "include",
        });
        const body = (await res.json()) as Record<string, unknown>;
        const results = (body.results ?? []) as Array<Record<string, unknown>>;
        return results.map((r) => ({
            subject: (r.subject as Record<string, unknown>) ?? null,
            destinations: ((r.destinations ?? []) as Array<Record<string, unknown>>).map((d) => ({
                key: String(d.key ?? ""),
                label: String(d.label ?? ""),
                host_work_view_id: (d.host_work_view_id as string) ?? null,
                host_work_unit_key: (d.host_work_unit_key as string) ?? null,
                entity_id: (d.entity_id as string) ?? null,
                item_id: (d.item_id as string) ?? null,
            })),
        }));
    }, query);
}

/**
 * The first destination in this tenant that no cohort holds.
 *
 * `host_work_unit_key` present and `host_work_view_id` absent — a real host, no cohort. Swept across
 * several queries because which subjects have no participation is a property of the seed, and pinning
 * one id would make this certification a statement about a fixture rather than about the contract.
 */
async function findContextualDestination(
    page: Page,
): Promise<{ query: string; subjectId: string; destination: Destination } | null> {
    for (const query of CONTEXTUAL_QUERIES) {
        for (const result of await searchDestinations(page, query)) {
            const hit = result.destinations.find(
                (d) => !!(d.host_work_unit_key ?? "").trim() && !(d.host_work_view_id ?? "").trim(),
            );
            if (hit) {
                return { query, subjectId: String(result.subject?.id ?? ""), destination: hit };
            }
        }
    }
    return null;
}

const selectedPill = (page: Page) =>
    page.evaluate(
        () =>
            document
                .querySelector("button[data-work-view-id][aria-selected='true']")
                ?.getAttribute("data-work-view-id") ?? null,
    );

const composedCells = (page: Page) =>
    page.evaluate(() => document.querySelectorAll("[data-focus-panel-grid-cell]").length);

const surfaceState = (page: Page) =>
    page.evaluate(() => {
        const surface = document.querySelector('[data-component="ProvisionedWorkUnitSurface"]');
        return {
            terminal: surface?.getAttribute("data-terminal-outcome") ?? null,
            cohortSelected: surface?.getAttribute("data-cohort-selected") ?? null,
            activeWorkView: surface?.getAttribute("data-active-work-view") ?? null,
            contextualSubject: surface?.getAttribute("data-contextual-subject") ?? null,
            contextualAspect: surface?.getAttribute("data-contextual-aspect") ?? null,
            pillCount: document.querySelectorAll("button[data-work-view-id]").length,
            noCohortQueue: document.querySelectorAll('[data-queue-no-cohort="true"]').length,
            emptyQueue: document.querySelectorAll('[data-queue-empty="true"]').length,
        };
    });

/** No modal, ever. The drawer was eradicated; a destination that reopens one is a regression. */
async function assertNoModal(page: Page) {
    const modals = await page.evaluate(
        () =>
            document.querySelectorAll(
                '[role="dialog"][aria-modal="true"], .admin-entity-drawer, [data-admin-drawer-modal]',
            ).length,
    );
    expect(modals, "a contextual destination opened a modal/drawer").toBe(0);
}

async function waitForSurface(page: Page) {
    await page
        .locator('[data-component="ProvisionedWorkUnitSurface"]')
        .first()
        .waitFor({ timeout: 180_000 });
}

/**
 * BOTH HALVES of the contextual claim: nothing is claimed, and something useful is there.
 * Split into one function so no individual test can accidentally assert only the easy half.
 */
async function assertContextual(page: Page, label: string, subjectId?: string) {
    await expect
        .poll(async () => (await surfaceState(page)).terminal, {
            timeout: SETTLE,
            message: `${label}: never committed a contextual terminal`,
        })
        .toBe("contextual");

    const state = await surfaceState(page);
    expect(state.cohortSelected, `${label}: surface claims a cohort`).toBe("false");
    expect(state.activeWorkView, `${label}: surface names an active Work View`).toBeNull();
    expect(await selectedPill(page), `${label}: a pill is lit`).toBeNull();
    expect(new URL(page.url()).searchParams.get("work_view_id"), `${label}: URL carries a lens`).toBeNull();

    // The cohorts are still OFFERED — the operator must be able to choose one next. Offering the
    // choice is not making it, and a surface with no pills at all would have taken the choice away.
    expect(state.pillCount, `${label}: no cohorts offered to choose from`).toBeGreaterThan(0);

    // "No records in this view" would name a view nobody selected. This is the distinct state.
    expect(state.noCohortQueue, `${label}: queue did not say a cohort was unselected`).toBe(1);
    expect(state.emptyQueue, `${label}: queue claimed an empty VIEW instead`).toBe(0);

    if (subjectId) {
        expect(state.contextualSubject, `${label}: committed a different subject`).toBe(subjectId);
    }

    // USEFUL COMPOSITION — the half an unlit pill cannot prove on its own.
    await expect
        .poll(async () => await composedCells(page), {
            timeout: SETTLE,
            message: `${label}: contextual but composed no Focus Panel cells`,
        })
        .toBeGreaterThan(0);

    await assertNoModal(page);
}

test("A — a record destination commits contextually: no pill, no queue, a composed panel", async ({
    page,
}) => {
    test.setTimeout(LOGIN_WAIT + 600_000);
    await signIn(page);

    const found = await findContextualDestination(page);
    expect(
        found,
        "no destination in this tenant has a host but no cohort — the contextual case is unreachable here",
    ).toBeTruthy();
    const { destination, subjectId } = found!;
    console.log(
        `[CF contextual] subject=${subjectId} unit=${destination.host_work_unit_key} key=${destination.key}`,
    );

    // Entering exactly as the operator focus listener does for a cohort-less destination.
    await page.goto(
        `/workspace/work-unit/${destination.host_work_unit_key}?cohort=none&subject_id=${encodeURIComponent(
            destination.entity_id || subjectId,
        )}`,
    );
    await waitForSurface(page);
    await assertContextual(page, "A cold contextual entry", destination.entity_id || subjectId);
});

test("B — a reload stays contextual and does not resolve a default lens", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 600_000);
    await signIn(page);

    const found = await findContextualDestination(page);
    const { destination, subjectId } = found!;
    const entry = `/workspace/work-unit/${destination.host_work_unit_key}?cohort=none&subject_id=${encodeURIComponent(
        destination.entity_id || subjectId,
    )}`;

    await page.goto(entry);
    await waitForSurface(page);
    await assertContextual(page, "B before reload");

    await page.reload();
    await waitForSurface(page);
    // The whole point: without `?cohort=none` surviving the round trip, this reload is
    // indistinguishable from any link that omits `work_view_id`, and resolves the first view.
    await assertContextual(page, "B after reload");
});

test("C — choosing a cohort from a contextual surface selects it and composes", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 900_000);
    await signIn(page);

    const found = await findContextualDestination(page);
    const { destination, subjectId } = found!;
    await page.goto(
        `/workspace/work-unit/${destination.host_work_unit_key}?cohort=none&subject_id=${encodeURIComponent(
            destination.entity_id || subjectId,
        )}`,
    );
    await waitForSurface(page);
    await assertContextual(page, "C before selecting");

    const pill = page.locator("button[data-work-view-id]").first();
    const chosen = await pill.getAttribute("data-work-view-id");
    await pill.click();

    await expect
        .poll(async () => await selectedPill(page), {
            timeout: SETTLE,
            message: `C: ${chosen} never became the committed view`,
        })
        .toBe(chosen);

    const after = await surfaceState(page);
    expect(after.cohortSelected, "C: a chosen cohort still reports none selected").toBe("true");
    expect(after.activeWorkView, "C: chosen cohort is not the active view").toBe(chosen);
    expect(after.noCohortQueue, "C: queue still says no cohort after one was chosen").toBe(0);
    await assertNoModal(page);
});

test("D — leaving a cohort for a record clears the lens rather than keeping a stale one", async ({
    page,
}) => {
    test.setTimeout(LOGIN_WAIT + 900_000);
    await signIn(page);

    const found = await findContextualDestination(page);
    const { destination, subjectId } = found!;
    const unit = destination.host_work_unit_key!;

    // Start INSIDE a cohort on the same host, so a stale lens has something to be stale from.
    await page.goto(`/workspace/work-unit/${unit}`);
    await waitForSurface(page);
    const lensBefore = await selectedPill(page);
    expect(lensBefore, "D: the host resolved no default lens to leave behind").toBeTruthy();

    await page.goto(
        `/workspace/work-unit/${unit}?cohort=none&subject_id=${encodeURIComponent(
            destination.entity_id || subjectId,
        )}`,
    );
    await waitForSurface(page);
    await assertContextual(page, "D after leaving a cohort");
});

test("E — a child's cohort destination is unchanged: pill lit, panel composed", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 600_000);
    await signIn(page);

    const results = await searchDestinations(page, SIBLING_QUERY);
    const hit = results.find((r) => String(r.subject?.id ?? "") === SIBLING_WAITLIST);
    expect(hit, "the seeded waitlist sibling is not searchable").toBeTruthy();

    const cohort = hit!.destinations.find((d) => !!(d.host_work_view_id ?? "").trim());
    expect(cohort, "the waitlisted child is offered no cohort at all").toBeTruthy();
    const viewId = cohort!.host_work_view_id!;

    await page.goto(
        `/workspace/work-unit/${cohort!.host_work_unit_key}?work_view_id=${encodeURIComponent(viewId)}`,
    );
    await waitForSurface(page);

    // THE CONTROL. A child's destination names its lens, so nothing about contextual focus may touch
    // it — the pill lights, the cohort is claimed, and the panel composes exactly as before.
    await expect
        .poll(async () => await selectedPill(page), {
            timeout: SETTLE,
            message: `E: ${viewId} never became the committed view`,
        })
        .toBe(viewId);
    const state = await surfaceState(page);
    expect(state.cohortSelected, "E: a cohort destination reports none selected").toBe("true");
    expect(state.noCohortQueue, "E: a cohort destination rendered the no-cohort queue").toBe(0);
    await expect
        .poll(async () => await composedCells(page), {
            timeout: SETTLE,
            message: `E: ${viewId} committed but composed no cells`,
        })
        .toBeGreaterThan(0);
    await assertNoModal(page);
});

test("F — Back from a cohort returns to the record, not to a default lens", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 900_000);
    await signIn(page);

    const found = await findContextualDestination(page);
    const { destination, subjectId } = found!;
    await page.goto(
        `/workspace/work-unit/${destination.host_work_unit_key}?cohort=none&subject_id=${encodeURIComponent(
            destination.entity_id || subjectId,
        )}`,
    );
    await waitForSurface(page);
    await assertContextual(page, "F contextual entry");

    const pill = page.locator("button[data-work-view-id]").first();
    const chosen = await pill.getAttribute("data-work-view-id");
    await pill.click();
    await expect.poll(async () => await selectedPill(page), { timeout: SETTLE }).toBe(chosen);

    await page.goBack();
    await waitForSurface(page);
    // History is the one road where the defect would look like correct restoration: a stamped
    // destination whose lens is null must restore as null, not as the host's first view.
    await assertContextual(page, "F after Back");
});

test("G — rapid switching between a record and a cohort never lands mixed", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 900_000);
    await signIn(page);

    const found = await findContextualDestination(page);
    const { destination, subjectId } = found!;
    const unit = destination.host_work_unit_key!;
    const contextualEntry = `/workspace/work-unit/${unit}?cohort=none&subject_id=${encodeURIComponent(
        destination.entity_id || subjectId,
    )}`;

    await page.goto(contextualEntry);
    await waitForSurface(page);
    const cohortId = await page.locator("button[data-work-view-id]").first().getAttribute("data-work-view-id");

    for (let round = 0; round < 3; round++) {
        await page.locator(`button[data-work-view-id="${cohortId}"]`).click();
        await expect
            .poll(async () => await selectedPill(page), {
                timeout: SETTLE,
                message: `G round ${round}: cohort did not commit`,
            })
            .toBe(cohortId);

        await page.goto(contextualEntry);
        await waitForSurface(page);
        // The newest movement wins, and the loser never stands in for it. A mixed frame here would be
        // a lit pill over a contextual terminal, or the reverse — both are caught by the pairing.
        await assertContextual(page, `G round ${round}`);
    }
});

test("H — the cohorts are reachable by keyboard from a contextual surface", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 600_000);
    await signIn(page);

    const found = await findContextualDestination(page);
    const { destination, subjectId } = found!;
    await page.goto(
        `/workspace/work-unit/${destination.host_work_unit_key}?cohort=none&subject_id=${encodeURIComponent(
            destination.entity_id || subjectId,
        )}`,
    );
    await waitForSurface(page);
    await assertContextual(page, "H before keyboard");

    const pill = page.locator("button[data-work-view-id]").first();
    const chosen = await pill.getAttribute("data-work-view-id");
    // Focus + Enter, not a click. A contextual surface that can only be left with a pointer has taken
    // the choice away from anyone who does not use one.
    await pill.focus();
    await page.keyboard.press("Enter");

    await expect
        .poll(async () => await selectedPill(page), {
            timeout: SETTLE,
            message: `H: ${chosen} did not commit from the keyboard`,
        })
        .toBe(chosen);
    expect((await surfaceState(page)).cohortSelected, "H: keyboard selection claimed no cohort").toBe(
        "true",
    );
});
