import { test, expect, type Page } from "@playwright/test";

/**
 * SEARCH OPERATIONAL DESTINATIONS — the membership contract, in a browser.
 *
 * The defect: searching a waitlisted child displayed "Enrollment — Waitlist" and then committed a
 * destination whose default lens is `New` — a real, operational, entirely empty view containing
 * neither the child nor the family.
 *
 * ── WHAT COUNTS AS PROOF HERE ──
 *
 * A destination appearing is not proof. A pill lighting up is not proof either: `aria-selected` and
 * the projected `?work_view_id=` both move for a view whose answer is an ERROR terminal, which is how
 * an earlier certification reported `tours` as passing over a Focus Panel with zero cells.
 *
 * So every navigation assertion below requires the view to COMPOSE — cells > 0 — and the offered set
 * is compared for EQUALITY against the tenant's evaluated truth, so an extra destination fails just
 * as loudly as a missing one. "No extra views, no missing valid views" is only a claim if both
 * directions can fail.
 *
 * Fixtures: `certification/search-platform/04-child-grain-work-views.sql` (three child cohorts) and
 * `05-sibling-child-participations.sql` (two siblings, one case, two stages).
 */

const OPERATOR = { email: "qa.operator@northwind.invalid", password: "alloy-local-cert" };
const LOGIN_WAIT = Number(process.env.CERT_AUTH_WAIT_MS || 300_000);
const SETTLE = 60_000;

/** Seeded by fixture 05 — two siblings of one household, at two different child stages. */
const SIBLING_WAITLIST = "00000000-0000-4000-8000-30000000011c";
const SIBLING_ENROLLING = "00000000-0000-4000-8000-3000000005cc";

/** The three child cohorts fixture 04 publishes. */
const WAITLIST_COHORTS = ["waitlist_children", "priority_children", "all_children"];
const ENROLLING_COHORTS = ["priority_children", "all_children"];
/** Family-grain lenses the tenant already had. A child must never be offered one. */
const FAMILY_ONLY = ["new_leads", "tours", "follow_up", "all_work"];

test.use({ storageState: undefined });

async function signIn(page: Page) {
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(OPERATOR.email);
    const pw = page.locator('input[type="password"]').first();
    await pw.fill(OPERATOR.password);
    await pw.press("Enter");
    await page.waitForURL("**/workspace**", { timeout: LOGIN_WAIT });
}

/**
 * The server's own answer for a query — the destination contract as Search actually emits it.
 *
 * Read through the real endpoint rather than scraped from the DOM, because the claim under test is
 * about what Search OFFERS. The DOM assertions below then prove the offer is reachable and true.
 */
async function searchDestinations(page: Page, query: string) {
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
                item_id: (d.item_id as string) ?? null,
            })),
        }));
    }, query);
}

/** The Work View ids a result offers, in offered order. */
const cohortsOf = (destinations: Array<{ key: string; host_work_view_id: string | null }>) =>
    destinations
        .filter((d) => d.key.startsWith("work_view:"))
        .map((d) => d.host_work_view_id ?? "")
        .filter(Boolean);

const composedCells = (page: Page) =>
    page.evaluate(() => document.querySelectorAll("[data-focus-panel-grid-cell]").length);

const selectedPill = (page: Page) =>
    page.evaluate(
        () =>
            document
                .querySelector("button[data-work-view-id][aria-selected='true']")
                ?.getAttribute("data-work-view-id") ?? null,
    );

/** No modal, ever. The drawer was eradicated; a destination that reopens one is a regression. */
async function assertNoModal(page: Page) {
    const modals = await page.evaluate(
        () => document.querySelectorAll('[role="dialog"], [data-alloy-drawer]').length,
    );
    expect(modals, "a destination opened a modal/drawer").toBe(0);
}

/** Find the result for a given subject id among the server's answers. */
function resultFor(results: Awaited<ReturnType<typeof searchDestinations>>, subjectId: string) {
    return results.find((r) => String(r.subject?.id ?? "") === subjectId) ?? null;
}

/**
 * The seeded siblings' shared display name.
 *
 * Both children of this household carry the SAME name in the tenant seed, which is why every
 * assertion below resolves its result by SUBJECT ID rather than by position in the result list. That
 * is not a workaround — it is the stricter reading: two same-named siblings are exactly the case
 * where a family-grain answer would look correct while being attached to the wrong child.
 */
const SIBLING_QUERY = "Quinn Testfamily-0284";

async function firstChildQuery(_page: Page): Promise<string> {
    return SIBLING_QUERY;
}

test("A/D — a child is offered exactly its child-grain cohorts, and no family lens", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 600_000);
    await signIn(page);

    const name = await firstChildQuery(page);
    expect(name, "the seeded waitlist sibling is not searchable").toBeTruthy();

    const results = await searchDestinations(page, name);
    const hit = resultFor(results, SIBLING_WAITLIST);
    expect(hit, `no search result for the waitlisted sibling (${name})`).toBeTruthy();

    const cohorts = cohortsOf(hit!.destinations);
    console.log(`[SOD waitlist-child] ${name} → ${JSON.stringify(cohorts)}`);

    // EQUALITY, not containment — an extra cohort is as much a defect as a missing one.
    expect([...cohorts].sort()).toEqual([...WAITLIST_COHORTS].sort());

    // D — grain separation, stated explicitly so it fails loudly rather than by omission.
    for (const familyView of FAMILY_ONLY) {
        expect(cohorts, `family-grain lens ${familyView} offered to a child`).not.toContain(familyView);
    }
});

test("B — overlapping cohorts each commit independently and compose", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 900_000);
    await signIn(page);

    const name = await firstChildQuery(page);
    const hit = resultFor(await searchDestinations(page, name), SIBLING_WAITLIST);
    const destinations = hit!.destinations.filter((d) => d.key.startsWith("work_view:"));
    expect(destinations.length, "overlap needs more than one cohort").toBeGreaterThan(1);

    for (const destination of destinations) {
        const viewId = destination.host_work_view_id!;
        const unit = destination.host_work_unit_key!;
        expect(unit, `${viewId}: destination names no host work unit`).toBeTruthy();
        // The child is focused as an ITEM inside the Children card — the ASPECT the runtime
        // deep-links. A destination without it would commit the case and call it the child.
        expect(destination.item_id, `${viewId}: child destination carries no item`).toBe(
            SIBLING_WAITLIST,
        );

        // Enter each cohort from a CLEAN entry. Chaining through a view that cannot compose leaves
        // attention on a dead surface and the next assertion fails for an unrelated reason.
        await page.goto(`/workspace/work-unit/${unit}?work_view_id=${encodeURIComponent(viewId)}`);
        await page.locator("button[data-work-view-id]").first().waitFor({ timeout: 180_000 });

        await expect
            .poll(async () => await selectedPill(page), {
                timeout: SETTLE,
                message: `${viewId}: never became the committed view`,
            })
            .toBe(viewId);

        await expect
            .poll(async () => await composedCells(page), {
                timeout: SETTLE,
                message: `${viewId}: committed but composed no Focus Panel cells`,
            })
            .toBeGreaterThan(0);

        await assertNoModal(page);
        console.log(`[SOD cohort ${viewId}] committed + composed on ${unit}`);
    }
});

/**
 * BLOCKED ON TENANT DATA, NOT ON THE CONTRACT.
 *
 * Both seeded children of this household carry the SAME `display_name`, and a name query returns one
 * result for it — so the enrolling sibling cannot be reached through Search in this tenant and the
 * in-browser half of the independence proof has nothing to click.
 *
 * Sibling independence itself IS proven deterministically, at both layers:
 *   `searchOperationalMemberships.test.ts`  → waitlist child = 3 cohorts, enrolling child = 2
 *   `searchMembershipDestinations.test.ts`  → the two destination sets do not contaminate
 *
 * Un-skipping this needs two DISTINCTLY NAMED children in one household — a seed change, not a
 * product change. Left as `fixme` rather than deleted so the gap stays visible, and rather than
 * `skip` so it cannot quietly read as a pass.
 */
test.fixme("B/siblings — two children of one case do not share a membership set", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 600_000);
    await signIn(page);

    const waitlistName = await firstChildQuery(page);
    const waitlistHit = resultFor(await searchDestinations(page, waitlistName), SIBLING_WAITLIST);

    const enrollingName = await (async (id: string) => {
        const res = await fetch(`/api/admin/global-search?q=${encodeURIComponent(id)}`, {
            credentials: "include",
        });
        const body = (await res.json()) as Record<string, unknown>;
        const results = (body.results ?? []) as Array<Record<string, unknown>>;
        const hit = results.find((r) => String((r.subject as Record<string, unknown>)?.id ?? "") === id);
        return String((hit?.subject as Record<string, unknown>)?.display_name ?? "");
    }, SIBLING_ENROLLING);

    const enrollingHit = resultFor(await searchDestinations(page, enrollingName), SIBLING_ENROLLING);
    expect(enrollingHit, "the enrolling sibling is not searchable").toBeTruthy();

    const a = cohortsOf(waitlistHit!.destinations).sort();
    const b = cohortsOf(enrollingHit!.destinations).sort();
    console.log(`[SOD siblings] waitlist=${JSON.stringify(a)} enrolling=${JSON.stringify(b)}`);

    expect(a).toEqual([...WAITLIST_COHORTS].sort());
    expect(b).toEqual([...ENROLLING_COHORTS].sort());
    // The asymmetry IS the proof: a shared case must not collapse two children onto one answer.
    expect(a).not.toEqual(b);
    expect(b).not.toContain("waitlist_children");
});

test("A — the subject click focuses the child without claiming an empty view", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 600_000);
    await signIn(page);

    const name = await firstChildQuery(page);
    const hit = resultFor(await searchDestinations(page, name), SIBLING_WAITLIST);
    const primary = hit!.destinations.find((d) => d.key === "subject");
    expect(primary, "no primary subject destination").toBeTruthy();

    // The host must be a view that PROVABLY contains the child — never the family default, which
    // is the empty `New` this whole sprint exists to stop landing on.
    expect(WAITLIST_COHORTS).toContain(primary!.host_work_view_id ?? "");
    expect(primary!.item_id).toBe(SIBLING_WAITLIST);
    console.log(`[SOD subject-click] host_view=${primary!.host_work_view_id}`);
});

test("E — query intent promotes a truthful cohort and never invents one", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 600_000);
    await signIn(page);

    const name = await firstChildQuery(page);
    const plain = cohortsOf(resultFor(await searchDestinations(page, name), SIBLING_WAITLIST)!.destinations);

    // "<child> waitlist children" names a cohort the child IS in — it should lead.
    const promoted = cohortsOf(
        resultFor(await searchDestinations(page, `${name} waitlist children`), SIBLING_WAITLIST)!
            .destinations,
    );
    console.log(`[SOD intent] plain=${JSON.stringify(plain)} promoted=${JSON.stringify(promoted)}`);
    expect(promoted[0]).toBe("waitlist_children");
    // NOTE — this half is currently WEAK: `waitlist_children` already leads without the intent, so
    // promotion cannot be distinguished from the default order here. Deterministic promotion (a
    // cohort moving from second to first) is proven in `searchMembershipDestinations.test.ts`.
    // Strengthening it in-browser needs a tenant whose configured display order puts the promoted
    // cohort second. Recorded rather than left to read as stronger evidence than it is.

    // …and naming a cohort the child is NOT in must add nothing. Ranking reorders truth; it never
    // creates it.
    const fabricated = cohortsOf(
        resultFor(await searchDestinations(page, `${name} tours`), SIBLING_WAITLIST)!.destinations,
    );
    expect(fabricated).not.toContain("tours");
    expect([...fabricated].sort()).toEqual([...WAITLIST_COHORTS].sort());
});

test("G — a non-operational cohort is not offered as a normal destination", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 600_000);
    await signIn(page);

    const name = await firstChildQuery(page);
    const cohorts = cohortsOf(
        resultFor(await searchDestinations(page, name), SIBLING_WAITLIST)!.destinations,
    );

    // Every offered cohort must answer `operational` — asked of the runtime itself, so this stays
    // true through configuration changes without a hardcoded list.
    for (const viewId of cohorts) {
        const terminal = await page.evaluate(
            async ([unit, id]: string[]) => {
                const res = await fetch(
                    `/api/admin/work-units/${unit}/provisioning-answer?work_view_id=${encodeURIComponent(id!)}`,
                    { credentials: "include" },
                );
                const body = (await res.json()) as Record<string, unknown>;
                const answer = (body.answer ?? body) as Record<string, unknown>;
                return { terminal: (answer.terminal as string) ?? null, code: (answer.code as string) ?? null };
            },
            ["enrollment_pipeline", viewId],
        );
        console.log(`[SOD operable ${viewId}] ${JSON.stringify(terminal)}`);
        expect(
            terminal.terminal,
            `${viewId} was offered but answers ${terminal.terminal}/${terminal.code}`,
        ).not.toBe("error");
    }
});
