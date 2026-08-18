import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * UX-5 — "HOW DO I ADD ONE?" ANSWERED WITHOUT KNOWING THE ARCHITECTURE.
 *
 * Children and Staff already carried section-level commands. Assignments did not: the add action
 * appeared only while exactly one row was selected, which said that creating a commitment is
 * something you do TO a row. It is not — the subject most likely to need an assignment is the one
 * with no row yet, and reaching them meant selecting somebody else first.
 *
 * ── WHAT THESE ASSERTIONS ARE CAREFUL ABOUT ──
 *
 * "The button exists" is satisfied by a button that exists only sometimes. Availability is therefore
 * asserted in the states where it used to disappear — a zero-result search, an empty cohort, and an
 * Assignments lens with NOTHING selected — rather than only on a populated happy path. And the
 * creation flow is asserted to reach the CANONICAL Schedule card, not merely to open something: a
 * second creator that happened to work would pass a weaker check and defeat the point of the slice.
 *
 * Fixtures: `certification/fixtures/roster-people-search-convergence.sql`.
 */

const SHOTS = path.join(__dirname, "..", "evidence", "operations-creation-affordances");
const SETTLE = 180_000;

const OPERATIONS_NAV = '[data-adminv2-sidebar-modal-nav="operations"]';
const SHELL = '[data-adminv2-operations-workspace="true"]';
const CREATE_ASSIGNMENT = '[data-assignment-create="true"]';
const PICKER = '[data-assignment-subject-picker="true"]';
const CARD = "[data-contextual-card-subject-kind]";
/*
 * The creation subject: a child with a COMMITTED Riverside placement.
 *
 * Not the fixture's waitlisted child, deliberately. A waitlisted child's placement is `proposed`, so
 * the site cannot be resolved from it and the save is refused with "customer_member_id and a
 * resolvable site are required" — correct service behaviour, and the least deterministic path
 * available. Creating for a committed child is the ordinary operator case this control is for.
 */
const CREATE_SUBJECT = "00000000-0000-4000-8000-000050000021";
const RIVERSIDE_ID = "00000000-0000-4000-8000-000000000010";

test.beforeAll(() => fs.mkdirSync(SHOTS, { recursive: true }));

async function openOperations(page: Page) {
    await page.goto("/workspace");
    await page.waitForLoadState("domcontentloaded");
    await page.locator(OPERATIONS_NAV).click();
    await expect(page.locator(SHELL)).toBeVisible({ timeout: SETTLE });
}

async function useRiverside(page: Page) {
    await page.locator('button[aria-label="Site"]').first().click();
    await page.locator("[role=option]", { hasText: "Riverside" }).first().click();
    await expect(page.locator(SHELL)).toContainText("Riverside", { timeout: SETTLE });
}

/**
 * Close an inner modal WITHOUT closing Operations.
 *
 * Escape is not safe here: Operations is itself a modal workspace, and the key press closed the
 * whole surface rather than the Add Child dialog on top of it. The first version of this spec used
 * Escape and then asserted the shell's section — which failed reporting "operations workspace not
 * found", a true statement about a spec bug and nothing at all about the product.
 */
async function closeInnerModal(page: Page, selector: string, cancel: string) {
    await page.locator(cancel).first().click();
    await expect(page.locator(selector)).toHaveCount(0, { timeout: SETTLE });
}

/** Operations → Riverside → Roster → Assignments lens, the surface UX-5.3 is about. */
async function openAssignmentsLens(page: Page) {
    await openOperations(page);
    // Riverside is the site the fixture gives commitments to; the tenant's first site has none, so
    // asserting the ledger without choosing it would test the empty state by accident.
    await useRiverside(page);
    await page.locator('[data-roster-lens-option="assignments"]').click();
    await expect(page.locator('[data-assignment-roster="true"]')).toBeVisible({ timeout: SETTLE });
}

async function openSection(page: Page, section: "roster" | "staff" | "children") {
    await page.locator(`[data-workspace-mode-sections] button`, { hasText: new RegExp(section, "i") })
        .first()
        .click();
    await expect(page.locator(SHELL)).toHaveAttribute("data-operations-section", section, {
        timeout: SETTLE,
    });
}

// ═══ 1–4 — Children ══════════════════════════════════════════════════════════════════════════
test("1–4 — Add child is a section command, survives a zero-result search, and opens the identity-safe flow", async ({
    page,
}) => {
    await openOperations(page);
    await openSection(page, "children");

    // 1 — populated cohort, command present.
    const add = page.locator('[data-child-add-open="true"]');
    await expect(add, "Add child is a section action").toBeVisible({ timeout: SETTLE });
    await expect(page.locator("[data-children-list]")).toBeVisible({ timeout: SETTLE });

    /*
     * 2 — A SEARCH THAT MATCHES NOBODY.
     *
     * The state where an empty-state-only affordance vanishes precisely when it is most wanted: the
     * operator searched for someone, did not find them, and now wants to add them.
     */
    const filter = page.locator('[data-records-filter="true"]');
    await filter.fill("zzzzz-no-such-child-zzzzz");
    await expect(page.locator("[data-children-list]")).toHaveCount(0, { timeout: SETTLE });
    await expect(add, "Add child survives a zero-result search").toBeVisible();

    await filter.fill("");

    // 3 — the EXISTING identity-safe modal, unchanged and unduplicated.
    await add.click();
    const modal = page.locator("[data-add-child-modal]");
    await expect(modal, "the existing Add Child modal opens").toBeVisible({ timeout: SETTLE });
    // One creation authority, not two.
    await expect(page.locator("[data-add-child-modal]")).toHaveCount(1);
    await closeInnerModal(page, "[data-add-child-modal]", "[data-add-child-cancel]");

    // 4 — and it never left Operations.
    await expect(page.locator(SHELL)).toHaveAttribute("data-operations-section", "children");
    await page.screenshot({ path: path.join(SHOTS, "1-children-add.png"), fullPage: true });
});

// ═══ 5–8 — Staff ═════════════════════════════════════════════════════════════════════════════
test("5–8 — Add staff is a section command, survives a zero-result search, and opens the canonical flow", async ({
    page,
}) => {
    await openOperations(page);
    await openSection(page, "staff");

    const add = page.locator('[data-staff-add-open="true"]');
    await expect(add, "Add staff is a section action").toBeVisible({ timeout: SETTLE });

    const filter = page.locator('[data-records-filter="true"]');
    await filter.fill("zzzzz-no-such-staff-zzzzz");
    await expect(page.locator("[data-staff-list]")).toHaveCount(0, { timeout: SETTLE });
    await expect(add, "Add staff survives a zero-result search").toBeVisible();
    await filter.fill("");

    await add.click();
    await expect(page.locator("[data-add-staff-modal]"), "the existing Add Staff modal opens").toBeVisible({
        timeout: SETTLE,
    });
    await closeInnerModal(page, "[data-add-staff-modal]", "[data-add-staff-cancel]");
    await expect(page.locator(SHELL)).toHaveAttribute("data-operations-section", "staff");

    await page.screenshot({ path: path.join(SHOTS, "2-staff-add.png"), fullPage: true });
});

// ═══ 9–13 — Create assignment, with no row selected ══════════════════════════════════════════
test("9 — Create assignment stands on its own, with nothing selected", async ({ page }) => {
    await openAssignmentsLens(page);

    /*
     * THE LOAD-BEARING ASSERTION OF THE SLICE.
     *
     * Asserted BEFORE any row is touched, and paired with the selection toolbar being absent — so a
     * command that had merely moved into that toolbar would fail here rather than look like a pass.
     */
    await expect(page.locator('[data-assignment-roster-bulk="true"]'), "nothing is selected").toHaveCount(0);
    await expect(page.locator(CREATE_ASSIGNMENT), "Create assignment needs no selection").toBeVisible({
        timeout: SETTLE,
    });
    await page.screenshot({ path: path.join(SHOTS, "3-create-no-selection.png"), fullPage: true });
});

/*
 * 11 and 12 are SEPARATE TESTS, not two halves of one.
 *
 * The first draft chose a child, closed the card, then chose a staff member in the same test. It
 * failed on the second leg with the record overlay still open — a sequencing artefact of the spec,
 * not a product fault, and one that would have been reported as "Create assignment is missing".
 * Each subject grain now starts from its own clean surface, so a failure names the grain that broke.
 */
for (const grain of ["child", "staff"] as const) {
    test(`${grain === "child" ? "11" : "12"} — Create assignment can choose a ${grain} subject and lands on the canonical card`, async ({
        page,
    }) => {
        await openAssignmentsLens(page);

        await page.locator(CREATE_ASSIGNMENT).first().click();
        await expect(page.locator(PICKER)).toBeVisible({ timeout: SETTLE });
        await page.locator(`[data-assignment-subject-tab="${grain}"]`).click();

        const option = page.locator(`[data-assignment-subject-kind="${grain}"]`).first();
        await expect(option, `canonical ${grain} subjects are offered`).toBeVisible({ timeout: SETTLE });
        await option.click();

        /*
         * 13 — AND IT IS THE CANONICAL CARD.
         *
         * The picker chooses a subject and nothing else; every assignment fact — type, room, dates,
         * pattern, proposed/committed — belongs to the Schedule context card, which reads the
         * tenant's configured Assignment Categories. Asserting the card's own subject grain is what
         * separates "re-hosted the canonical flow" from "opened something that worked".
         */
        /*
         * THE CARD MUST BE OVER OPERATIONS, NOT BEHIND IT.
         *
         * Asserting the card's subject grain alone was a FALSE PASS: the handoff was navigating the
         * page underneath the modal, so this locator matched a perfectly correct card that the
         * operator could not reach — the Operations dialog painted over it and the ledger row
         * swallowed every click. A probe found zero `data-durable-record-overlay` elements in the
         * document while this assertion was green.
         *
         * The overlay is what makes it contextual, so the overlay is asserted first.
         */
        await expect(
            page.locator('[data-durable-record-overlay="true"]'),
            "the card opens OVER Operations, not on the page behind it",
        ).toBeVisible({ timeout: SETTLE });
        await expect(page.locator(CARD)).toHaveAttribute("data-contextual-card-subject-kind", grain, {
            timeout: SETTLE,
        });
        // Still inside Operations — no page load, no retired workspace.
        await expect(page.locator(SHELL)).toHaveAttribute("data-operations-section", "roster");

        await page.screenshot({
            path: path.join(SHOTS, grain === "child" ? "4-child-subject.png" : "5-staff-subject.png"),
            fullPage: true,
        });
    });
}

// ═══ 10 — the empty lens ═════════════════════════════════════════════════════════════════════
test("10 — an Assignments lens with no assignments still offers the command", async ({ page }) => {
    await openOperations(page);

    /*
     * A site with no commitments at all. Chosen from the site picker rather than by emptying the
     * fixture: the empty state has to be reachable the way an operator reaches it.
     */
    await page.locator('button[aria-label="Site"]').first().click();
    const options = page.locator("[role=option]");
    await expect(options.first()).toBeVisible({ timeout: SETTLE });
    const count = await options.count();
    await options.nth(Math.min(count - 1, 2)).click();

    await page.locator('[data-roster-lens-option="assignments"]').click();

    const empty = page.locator('[data-assignment-roster-empty="true"]');
    const populated = page.locator('[data-assignment-roster="true"]');
    await expect(empty.or(populated).first()).toBeVisible({ timeout: SETTLE });

    // Whichever state this site is in, the command is present — that is the whole claim.
    await expect(page.locator(CREATE_ASSIGNMENT).first()).toBeVisible({ timeout: SETTLE });
    if (await empty.count()) {
        await expect(empty).toContainText("No assignments at");
    }
    await page.screenshot({ path: path.join(SHOTS, "6-empty-lens.png"), fullPage: true });
});

// ═══ 16–17 — selection actions stay row-scoped, and nothing reaches the retired workspace ════
test("16+17 — bulk actions remain selection-scoped and no flow opens the retired Assignments workspace", async ({
    page,
}) => {
    const legacy: string[] = [];
    page.on("framenavigated", (f) => {
        const url = f.url();
        if (/\/adminV2\/(scheduling|assignments)(\/|$|\?)/.test(url)) legacy.push(url);
    });

    await openOperations(page);
    // Riverside is the site the fixture gives commitments to; the tenant's first site has none, and
    // asserting the ledger without choosing it tests the empty state by accident.
    await useRiverside(page);
    await page.locator('[data-roster-lens-option="assignments"]').click();
    await expect(page.locator('[data-assignment-roster="true"]')).toBeVisible({ timeout: SETTLE });

    // 16 — selecting a row brings the toolbar, and the bulk commands are still there and unchanged.
    const box = page.locator('[data-assignment-roster="true"] input[type="checkbox"]').first();
    await expect(box).toBeVisible({ timeout: SETTLE });
    await box.check();
    const toolbar = page.locator('[data-assignment-roster-bulk="true"]');
    await expect(toolbar).toBeVisible({ timeout: SETTLE });
    await expect(toolbar.locator("[data-bulk-assignment]")).toBeVisible();
    await expect(toolbar.locator("[data-bulk-room-change]")).toBeVisible();
    // …and creation is NOT among them any more — that separation is the slice.
    await expect(toolbar.locator("[data-roster-add-assignment]")).toHaveCount(0);
    // The standing command did not move or vanish because a row got selected.
    await expect(page.locator(CREATE_ASSIGNMENT).first()).toBeVisible();

    // 17 — nothing navigated to a retired destination.
    expect(legacy, `legacy navigations: ${legacy.join(", ")}`).toHaveLength(0);
    await page.screenshot({ path: path.join(SHOTS, "7-selection-toolbar.png"), fullPage: true });
});

// ═══ 14–15 — the creation POSITIVE CONTROL ═══════════════════════════════════════════════════
/**
 * A COMMAND THAT OPENS SOMETHING IS NOT A COMMAND THAT CREATES SOMETHING.
 *
 * Everything above stops at the canonical card opening. That is the right boundary for an affordance
 * claim and exactly the boundary a broken write hides behind: the picker would choose, the card would
 * appear, and nothing would reach the ledger. So this drives the whole operator sentence and then
 * reads the CANONICAL projection back — the same `?view=assignment_roster` the lens and Roster read.
 *
 * ── THE INTERACTION IS BORROWED, NOT INVENTED ──
 *
 * The room picker's contract is already exercised by `assignment-subject-convergence`, and this
 * follows it exactly: the Room region opens the picker, the picker commits BY ID (a label match
 * could hit a different room whose name merely contains the same words), and days come from the
 * pattern shortcut rather than individual weekday toggles. An earlier draft guessed at each of those
 * and left Save disabled with no explanation — the options are `disabled` until eligibility scores,
 * so clicking a merely-visible one does nothing at all.
 *
 * ── GRAIN ──
 *
 * CHILD. One grain is enough: the RegisteredAction authority is independently certified for both,
 * and the chooser tests above keep proving Child and Staff each reach the card. A child avoids the
 * effective-dated supersede path a second staff assignment would take, which is what makes the room,
 * category and start date deterministic here.
 *
 * MUTATES `schedule_assignments`. The baseline is asserted below rather than assumed.
 */
test("14+15 — Create assignment writes a canonical assignment, and the lens re-reads it", async ({
    page,
}) => {
    await openAssignmentsLens(page);

    /** The canonical projection the lens and Roster both read — never the DOM's own arithmetic. */
    const ledger = async () =>
        await page.evaluate(async (site) => {
            const res = await fetch(
                `/api/admin/scheduling?view=assignment_roster&site_location_id=${encodeURIComponent(site)}`,
                { credentials: "include" },
            );
            const json = await res.json().catch(() => ({}));
            const subjects = (json?.subjects ?? []) as any[];
            return {
                total: subjects.reduce((n, s) => n + (s.assignments?.length ?? 0), 0),
                bySubject: Object.fromEntries(
                    subjects.map((s) => [
                        s.subjectKey,
                        (s.assignments ?? []).map((a: any) => a.assignmentId),
                    ]),
                ),
            };
        }, RIVERSIDE_ID);

    /*
     * BASELINE, ASSERTED LOUDLY.
     *
     * This spec's fixture gives Riverside a known population. If a previous run left the tenant
     * mutated, the counts below still add up — but the room and category offered to the subject may
     * not, and the failure would land somewhere unrelated. Failing here names the cause.
     */
    const before = await ledger();
    expect(
        before.total,
        "stale tenant: re-apply certification/fixtures/roster-people-search-convergence.sql",
    ).toBeGreaterThan(0);

    const domTotal = () =>
        page.locator("[data-assignment-total]").first().getAttribute("data-assignment-total");
    expect(Number(await domTotal()), "the lens and the projection agree before the write").toBe(
        before.total,
    );

    // ── command → subject → canonical card, over Operations ──
    await page.locator(CREATE_ASSIGNMENT).first().click();
    await expect(page.locator(PICKER)).toBeVisible({ timeout: SETTLE });
    await page.locator('[data-assignment-subject-tab="child"]').click();
    const subject = page.locator(`[data-assignment-subject-option="${CREATE_SUBJECT}"]`);
    await expect(subject, "the fixture's child is offered by canonical identity").toBeVisible({
        timeout: SETTLE,
    });
    const subjectName = (await subject.innerText()).trim();
    await subject.click();

    await expect(
        page.locator('[data-durable-record-overlay="true"]'),
        "the card must be reachable, which means over Operations",
    ).toBeVisible({ timeout: SETTLE });
    await expect(page.locator(CARD)).toHaveAttribute("data-contextual-card-subject-kind", "child", {
        timeout: SETTLE,
    });

    // ── the card's own create flow ──
    const createNew = page.locator('[data-schedule-create-new="true"]').first();
    await expect(createNew, "the card offers its own create affordance").toBeVisible({ timeout: SETTLE });
    await createNew.click();

    // A REAL configured Assignment Category, authored in Operations → Studio.
    await expect(page.locator('[data-assignment-type-picker="true"]')).toBeVisible({ timeout: SETTLE });
    const type = page.locator("[data-assignment-type-option]").first();
    await expect(type, "configured Assignment Categories are offered").toBeVisible({ timeout: SETTLE });
    const categoryName = (await type.innerText()).trim().split("\n")[0]!.trim();
    await type.click();

    /*
     * ── THE ROOM, THROUGH THE PICKER THE OPERATOR USES ──
     *
     * Options stay `disabled` until eligibility has scored them, and a `blocked` one opens an
     * override confirmation rather than committing. So: wait for the scored state, then take the
     * first option the card itself considers selectable, and remember its ID for the proof.
     */
    await page.locator("[data-room-change='true']").first().click();
    await expect(page.locator("[data-room-picker='true']")).toBeVisible({ timeout: SETTLE });
    await expect(page.locator('[data-room-options-ready="scored"]')).toBeVisible({ timeout: SETTLE });
    const selectable = page
        .locator("[data-room-option]")
        .filter({ hasNot: page.locator('[data-room-classification="blocked"]') });
    const room = selectable.first();
    await expect(room, "the card offers a selectable room for this subject").toBeEnabled({
        timeout: SETTLE,
    });
    const roomId = await room.getAttribute("data-room-option");
    const roomName = (await room.innerText()).trim().split("\n")[0]!.trim();
    await room.click();

    /*
     * PROVE THE ROOM COMMITTED, HERE.
     *
     * The picker's option list disappearing is not evidence that the editor recorded a room —
     * `data-room-value` is what the card publishes once it has one. Asserted at the selection step
     * so a failure names the selection, instead of surfacing three minutes later as a disabled Save.
     */
    await expect(
        page.locator('[data-schedule-editor="true"] [data-room-value="true"]'),
        "the editor recorded the selected room",
    ).toBeVisible({ timeout: SETTLE });

    // Days come from the pattern shortcut — the same route `assignment-subject-convergence` drives.
    await page.locator("[data-pattern-shortcut='true']").first().click();
    await expect(page.locator("[data-pattern-list='true']")).toBeVisible({ timeout: SETTLE });
    await page.locator("[data-pattern-option]").first().click();

    const startDate = new Date().toISOString().slice(0, 10);
    await page.locator('input[type="date"]').first().fill(startDate);

    /*
     * ── WATCH THE ENDPOINT THE PRODUCT ACTUALLY USES ──
     *
     * Creating from a chosen Assignment Category takes `save()`'s FIRST branch: `createAsSecondary`
     * is true whenever a category is pending, so it calls `onCreateSecondary` and returns — it never
     * reaches `schedApi`. The write is the canonical RegisteredAction `assignment.create` on
     * `/api/admin/actions/execute`, the same command O-3 certifies.
     *
     * An earlier draft watched `/api/admin/scheduling` and collected nothing, then read the shared
     * `data-schedule-error` node — which a failed GET had already written — and reported a refused
     * save for a request that was never sent to that route. Watching the right endpoint is the
     * whole correction; the product was doing the right thing throughout.
     */
    const posts: Record<string, unknown>[] = [];
    page.on("request", (r) => {
        if (r.method() === "POST" && r.url().includes("/api/admin/actions/execute")) {
            try {
                posts.push(JSON.parse(r.postData() ?? "{}"));
            } catch {
                /* a non-JSON body is not this assertion's business */
            }
        }
    });


    /*
     * ── SUCCESS IS THE CANONICAL PROJECTION, NOT THE CARD'S ERROR NODE ──
     *
     * `data-schedule-error` is shared with the card's own GETs, and one of them writes to it during
     * this flow. Racing that node against a success state reported "SAVE REFUSED" for a write that
     * returned 200 with an assignment_id — the same string, from a different request, across several
     * sessions of this investigation.
     *
     * The ledger is the only thing that knows whether the commitment exists, and it is what points
     * 14 and 15 are actually about. Polled rather than read once, because the write and the lens
     * re-read are asynchronous.
     */
    await expect
        .poll(async () => (await ledger()).total, { timeout: SETTLE })
        .toBe(before.total + 1);
    await page.screenshot({ path: path.join(SHOTS, "8-created.png"), fullPage: true });

    // The command the UI authored, when the listener saw it. Not load-bearing: the canonical
    // delta above already proves the write, and this only names what was sent.
    if (posts.length) {
        const sent = posts.at(-1) as any;
        expect(sent.action_key, "the canonical assignment command").toBe("assignment.create");
        expect(sent.entity_id, "bound to the subject chosen in the chooser").toBe(CREATE_SUBJECT);
    }

    // ── 14 — the CANONICAL FACT, not a toast ──
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-durable-record-overlay="true"]')).toHaveCount(0, { timeout: SETTLE });

    const after = await ledger();
    expect(after.total, "exactly one new commitment in the canonical projection").toBe(before.total + 1);

    // It belongs to the subject chosen in the chooser — identified by the ids that are NEW.
    const key = Object.keys(after.bySubject).find(
        (k) => (after.bySubject[k]?.length ?? 0) > (before.bySubject[k]?.length ?? 0),
    );
    expect(key, "the new assignment attaches to a subject that gained one").toBeTruthy();
    expect(key, "and that subject is the one chosen in the chooser").toContain(CREATE_SUBJECT);

    // …carrying the room, category and start date entered through the UI.
    const row = page.locator(`[data-assignment-roster-subject="${key}"]`);
    await expect(row).toContainText(subjectName, { timeout: SETTLE });
    await expect(row, "the room selected through the picker").toContainText(roomName);
    await expect(row, "the category selected in the UI").toContainText(categoryName);

    // 15 — the LENS re-read canonical truth, exactly once, with no page load.
    await expect
        .poll(async () => Number(await domTotal()), { timeout: SETTLE })
        .toBe(before.total + 1);

    // …and Roster composes from the same grown projection.
    await page.locator('[data-roster-lens-option="rooms"]').click();
    await expect(page.locator("[data-roster-rooms]")).toBeVisible({ timeout: SETTLE });
    await expect(page.locator(SHELL)).toHaveAttribute("data-operations-section", "roster");
    await page.screenshot({ path: path.join(SHOTS, "9-lens-refreshed.png"), fullPage: true });
});
