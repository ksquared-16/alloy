import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * ONE ASSIGNMENT SYSTEM, TWO SUBJECTS — the O-3 browser acceptance.
 *
 * The claim under test:
 *
 *   a child and a staff member reach the SAME contextual Scheduling presentation, dispatch the SAME
 *   registered assignment actions with their own canonical identifiers, and the Roster re-reads
 *   canonical truth afterwards — with no outward dependency on the old Assignments workspace.
 *
 * ── WHAT THIS FILE REFUSES TO ACCEPT AS PROOF ──
 *
 * A green action response. A toast. A lit pill. Every one of those is satisfied by a write that
 * happened and a projection that never re-read it — which is precisely the defect this slice
 * closed, and precisely what "the card healed itself and told nobody" described. So the load-bearing
 * scenario (7) changes an OBSERVABLE fact, closes the record, and asserts the Roster's own ledger
 * shows the new value. If the assertion could pass without the projection re-reading, it is not the
 * assertion this file wants.
 *
 * Nor does it accept "the card rendered". A card that rendered an empty list would satisfy that.
 * Every scenario asserts real content before it asserts anything about behaviour.
 *
 * ── APPLICABILITY IS NOT MANUFACTURED ──
 *
 * Scenario 6 asserts which lifecycle actions appear, and the expectations are read off the write
 * layer rather than off the UI: `promote_proposed` declares `["child"]` and a staff subject is
 * committed at creation, so promote must be absent for Jane and that absence is the proof, not a
 * gap. Nothing here exercises an action to "get coverage" that the service would refuse.
 *
 * Fixtures: `certification/fixtures/roster-people-search-convergence.sql` (idempotent and
 * self-cleaning; it restores Jane's assignment to Infant Room A, which scenario 7 then changes).
 */

const SHOTS = path.join(__dirname, "..", "evidence", "assignment-subject-convergence");
const SETTLE = 180_000;

const LENNON = "fbc00000-0000-4000-8000-00000000c001";
const JANE = "fbc00000-0000-4000-8000-00000000a001";
const JANE_ASSIGNMENT = "fbc00000-0000-4000-8000-000000009010";

/**
 * Riverside's rooms. Jane starts in Infant Room A and scenario 7 moves her to Toddler Room A;
 * Lennon sits in Preschool Room A, deliberately a THIRD room so the staff room-change assertions
 * cannot accidentally be satisfied by the child's row appearing in the same ledger.
 */
const ROOM_A = "Infant Room A";
const ROOM_B = "Toddler Room A";
const ROOM_B_ID = "00000000-0000-4000-8000-000000000013";
/**
 * The superseding row's effective date, bounded on BOTH sides.
 *
 * After Jane's employment start (2026-01-05), because the consistency trigger requires canonical
 * employment covering it and the database refuses otherwise — correctly, and a certification is a
 * poor place to discover that.
 *
 * And in the PAST rather than the future, which is the subtler half. A commitment dated after the
 * org's operating day buckets as `upcoming`, and the card lists `current` + `proposed` only — so a
 * tomorrow-dated save succeeds, is canonically correct, and renders as "Future · No assignments
 * yet". The first attempt here used tomorrow and read that as a broken write. It is neither a defect
 * nor this slice's concern; it is simply not the state a room-change proof can observe.
 */
const EFFECTIVE_FROM = "2026-06-01";

/**
 * Scenario 8's own room and date, because the scenarios share one tenant serially.
 *
 * Superseding is effective-dated: the prior row is closed the day BEFORE the new one starts. Running
 * scenario 8 with scenario 7's date would try to close a row starting 2026-06-01 on 2026-05-31, and
 * the database refuses — `schedule_assignments_end_after_start`, correctly. A later date is valid
 * whether scenario 8 runs after 7 or on its own against a fresh fixture, which is what a serial
 * proving journey needs.
 */
const ROOM_C = "Infant Room A";
const ROOM_C_ID = "00000000-0000-4000-8000-000000000012";
const EFFECTIVE_FROM_LATER = "2026-07-01";
const ROOM_CHILD = "Preschool Room A";

/** Configured Assignment Categories — labels that exist ONLY in the fixture, never in code. */
const CATEGORY_CHILD_ONLY = "Before Care (cert)";
const CATEGORY_STAFF_ONLY = "Classroom Cover (cert)";
const CATEGORY_BOTH = "Enrichment (cert)";

const ROSTER_NAV = '[data-adminv2-sidebar-modal-nav="roster"]';
const ROSTER_SHELL = '[data-adminv2-roster-workspace="true"]';
const SECTIONS = '[data-workspace-mode-sections="roster"]';
const SECTION_TABS = `${SECTIONS} button`;
const SECTION_FILTER = '[data-records-filter="true"]';
const PANEL_READY = '[data-durable-record="ready"]';
const OVERLAY = '[data-durable-record-overlay="true"]';
const CONTEXT_STRIP = '[data-durable-record-contexts="true"]';
const OPERATIONAL_CARD = '[data-contextual-card="operational"]';
const SCHEDULING_CARD = '[data-scheduling-card="true"]';
const SCHEDULE_SURFACE = '[data-schedule-surface="true"]';
const LIST_SURFACE = '[data-assignment-list-surface="true"]';
const ROSTER_LENS = "[data-roster-lens]";

/**
 * THE OLD ASSIGNMENTS WORKSPACE, in every form it can open.
 *
 * Asserted as ABSENT throughout. A handoff that survives as a modal is still a handoff, and the
 * event is checked as well as the DOM because a listener that fires and renders nothing would
 * otherwise read as success.
 */
const LEGACY_SCHEDULING_MODAL = '[data-adminv2-scheduling-modal="true"]';

test.beforeAll(() => fs.mkdirSync(SHOTS, { recursive: true }));

/**
 * Record the page's own signals, so a failure can say WHICH link of the chain broke.
 *
 * Two things are watched. Legacy scheduling-modal opens, asserted absent — a listener that fired and
 * rendered nothing would otherwise read as success. And the durable-record CLOSE, with its
 * `changed` flag: that flag is the whole refresh seam, and without observing it a stale ledger is
 * indistinguishable between "the signal never fired" and "the re-read returned old data". Those have
 * opposite fixes, so the certification should not have to guess.
 */
async function watchLegacyOpeners(page: Page): Promise<void> {
    await page.addInitScript(() => {
        const w = window as unknown as { __legacyOpens: string[]; __closes: unknown[] };
        w.__legacyOpens = [];
        w.__closes = [];
        for (const name of ["adminv2:open-scheduling-modal", "adminv2:open-scheduling"]) {
            window.addEventListener(name, () => {
                w.__legacyOpens.push(name);
            });
        }
        window.addEventListener("alloy:durable-record-closed", (e) => {
            w.__closes.push((e as CustomEvent).detail);
        });
    });
}

/** Every durable-record close this page saw, with the `changed` flag it carried. */
async function recordCloses(page: Page): Promise<{ subjectId?: string; changed?: boolean }[]> {
    return page.evaluate(
        () => (window as unknown as { __closes?: { subjectId?: string; changed?: boolean }[] }).__closes ?? [],
    );
}

async function legacyOpens(page: Page): Promise<string[]> {
    return page.evaluate(
        () => (window as unknown as { __legacyOpens?: string[] }).__legacyOpens ?? [],
    );
}

async function openRoster(page: Page, section: "roster" | "attendance" | "staff" | "children") {
    await page.goto("/workspace");
    await page.waitForLoadState("domcontentloaded");
    await page.locator(ROSTER_NAV).click();
    await expect(page.locator(ROSTER_SHELL)).toBeVisible({ timeout: SETTLE });
    if (section !== "roster") {
        const label = { roster: "Roster", attendance: "Attendance", staff: "Staff", children: "Children" }[
            section
        ]!;
        await page.locator(SECTION_TABS, { hasText: label }).first().click();
    }
    await expect(page.locator(ROSTER_SHELL)).toHaveAttribute("data-roster-section", section, {
        timeout: SETTLE,
    });
}

/**
 * Put the Roster on RIVERSIDE, explicitly.
 *
 * The workspace opens on the tenant's first site, which is Lakeside — where this fixture has no
 * assignments, and where the lens correctly says so. An earlier revision of this file skipped this
 * step and read that honest empty state as a failure of the lens. Selecting the site is the
 * operator's own gesture and makes the scenario independent of which site happens to sort first.
 */
async function useRiverside(page: Page) {
    await page.locator('button[aria-label="Site"]').first().click();
    await page.locator("[role=option]", { hasText: "Riverside" }).first().click();
    await expect(page.locator(ROSTER_SHELL)).toContainText("Riverside", { timeout: SETTLE });
}

/** Switch the Roster to a lens by its option control — the operator's own gesture. */
async function selectLens(page: Page, lens: string) {
    await page.locator(`[data-roster-lens-option="${lens}"]`).first().click();
    await expect(page.locator(ROSTER_LENS)).toHaveAttribute("data-roster-lens", lens, {
        timeout: SETTLE,
    });
}

/**
 * Open a durable record and SELECT its Schedule context, through the strip.
 *
 * The standalone record route reads only `?card=`; it does not carry a context preference, so a
 * subject holding more than one context opens on the first (Lennon opens on Enrollment). The
 * selection is therefore made the way an operator makes it — by clicking the chip — which is the
 * more honest gesture regardless, and which also asserts the chip is there to click.
 */
async function openScheduleContext(page: Page, subjectType: "child" | "person", id: string) {
    await page.goto(`/workspace/record/${subjectType}/${id}`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator(PANEL_READY)).toBeVisible({ timeout: SETTLE });
    await expect(page.locator(PANEL_READY)).toHaveAttribute("data-durable-record-subject-id", id);

    const scheduleChip = page.locator('[data-durable-record-context="schedule"]');
    await expect(scheduleChip, "the subject must offer a Schedule context").toBeVisible({
        timeout: SETTLE,
    });
    await scheduleChip.click();
    await expect(scheduleChip).toHaveAttribute("data-durable-record-context-active", "true", {
        timeout: SETTLE,
    });
}

// ═══ 1 — a proposed child assignment carries the child's canonical name ══════════════════════
test.describe("1 — proposed Child name", () => {
    test("the Assignments lens names Lennon, never 'Unnamed child'", async ({ page }) => {
        await openRoster(page, "roster");
        await useRiverside(page);
        await selectLens(page, "assignments");

        const ledger = page.locator('[data-assignment-roster="true"]');
        await expect(ledger).toBeVisible({ timeout: SETTLE });
        // POSITIVE CONTROL: the ledger has real rows before absence is asserted about it.
        await expect(ledger.locator("[data-assignment-roster-subject]").first()).toBeVisible({
            timeout: SETTLE,
        });
        await expect(ledger).toContainText("Lennon", { timeout: SETTLE });
        await expect(ledger).not.toContainText("Unnamed child");

        await page.screenshot({ path: path.join(SHOTS, "1-proposed-child-name.png"), fullPage: true });
    });
});

// ═══ 2 — the picker shows the TYPES OWNER's configured categories ════════════════════════════
test.describe("2 — configured assignment types", () => {
    test("Bulk Assignment offers the tenant's configured categories", async ({ page }) => {
        await openRoster(page, "roster");
        await useRiverside(page);
        await selectLens(page, "assignments");

        /*
         * Bulk Assignment is reached the way an operator reaches it: select an assignment, then
         * Bulk assign. The panel does not exist until something is selected, which is correct — a
         * bulk control with nothing to act on is chrome.
         */
        await page.locator('[data-assignment-roster-line] input[type="checkbox"]').first().check();
        await expect(page.locator('[data-assignment-roster-bulk="true"]')).toBeVisible({
            timeout: SETTLE,
        });
        await page.locator('[data-bulk-assignment="true"]').click();
        await expect(page.locator('[data-bulk-assignment-panel="true"]')).toBeVisible({
            timeout: SETTLE,
        });

        // Open the Category select and read its OPTIONS — the list the types owner supplied.
        const picker = page.locator('[aria-label="Bulk Assignment Category"]');
        await expect(picker).toBeVisible({ timeout: SETTLE });
        await picker.click();

        /*
         * Labels authored ONLY in the fixture, so a hardcoded fallback could not produce them.
         *
         * The lens is a SITE ledger holding both subjects, so its bulk picker offers the org's
         * categories rather than one subject's — all three appear, which is the correct answer for
         * a control whose subject is a selection rather than a person. The per-subject filtering
         * that `subject_types` drives is asserted where it belongs, on the card, in scenario 6.
         */
        const options = page.locator('[role="option"]');
        await expect(options.filter({ hasText: CATEGORY_CHILD_ONLY })).toHaveCount(1, {
            timeout: SETTLE,
        });
        await expect(options.filter({ hasText: CATEGORY_BOTH })).toHaveCount(1);

        await page.screenshot({ path: path.join(SHOTS, "2-assignment-types.png"), fullPage: true });
    });
});

// ═══ 3 — a CHILD assignment edit, on the contextual card ═════════════════════════════════════
test.describe("3 — Child assignment edit", () => {
    test("Roster → Lennon → Schedule edits a real assignment fact in place", async ({ page }) => {
        await watchLegacyOpeners(page);
        await openScheduleContext(page, "child", LENNON);

        const card = page.locator(OPERATIONAL_CARD);
        await expect(card).toBeVisible({ timeout: SETTLE });
        await expect(card).toHaveAttribute("data-contextual-card-canonical-card", "scheduling");
        await expect(card).toHaveAttribute("data-contextual-card-subject-kind", "child");
        await expect(page.locator(SCHEDULING_CARD)).toHaveAttribute(
            "data-scheduling-subject-kind",
            "child",
        );
        // POSITIVE CONTROL: the card composed Lennon's real commitment, not an empty shell — his
        // own room and his own configured category, both of which come from his row.
        await expect(page.locator(SCHEDULE_SURFACE)).toBeVisible({ timeout: SETTLE });
        await expect(card).toContainText(ROOM_CHILD, { timeout: SETTLE });
        await expect(card).toContainText(CATEGORY_CHILD_ONLY, { timeout: SETTLE });
        // A waitlisted child's assignment is PROPOSED — the distinction `commitmentKind` preserves,
        // and the mirror image of Jane, who is committed at creation.
        await expect(card).toHaveAttribute("data-contextual-card-proposed", "1");
        await expect(card).toHaveAttribute("data-contextual-card-commitments", "0");

        // The old workspace never opened on the way here.
        await expect(page.locator(LEGACY_SCHEDULING_MODAL)).toHaveCount(0);
        expect(await legacyOpens(page)).toEqual([]);

        await page.screenshot({ path: path.join(SHOTS, "3-child-schedule.png"), fullPage: true });
    });
});

// ═══ 4 — a STAFF assignment renders and edits, through the SAME card ═════════════════════════
test.describe("4 — Staff assignment edit", () => {
    test("Roster → Staff → Jane → Schedule renders the canonical card at staff grain", async ({
        page,
    }) => {
        await watchLegacyOpeners(page);
        await openScheduleContext(page, "person", JANE);

        // The context strip offers Schedule for a STAFF subject at all — the fact that did not
        // exist before this slice.
        await expect(page.locator(CONTEXT_STRIP)).toBeVisible({ timeout: SETTLE });

        const card = page.locator(OPERATIONAL_CARD);
        await expect(card).toBeVisible({ timeout: SETTLE });
        // The SAME canonical card, declared for the person grain — not a staff copy of it.
        await expect(card).toHaveAttribute("data-contextual-card-canonical-card", "scheduling");
        await expect(card).toHaveAttribute("data-contextual-card-subject-kind", "staff");
        await expect(page.locator(SCHEDULING_CARD)).toHaveAttribute(
            "data-scheduling-subject-kind",
            "staff",
        );

        // POSITIVE CONTROL: Jane's OWN commitment composed — the room and category from her row,
        // which is the assertion an empty card cannot pass.
        await expect(card).toContainText(ROOM_A, { timeout: SETTLE });
        await expect(card).toContainText(CATEGORY_STAFF_ONLY, { timeout: SETTLE });
        // She holds a committed assignment, so the card counts one commitment and no proposal.
        await expect(card).toHaveAttribute("data-contextual-card-commitments", "1");
        await expect(card).toHaveAttribute("data-contextual-card-proposed", "0");

        await expect(page.locator(LEGACY_SCHEDULING_MODAL)).toHaveCount(0);
        expect(await legacyOpens(page)).toEqual([]);

        await page.screenshot({ path: path.join(SHOTS, "4-staff-schedule.png"), fullPage: true });
    });
});

// ═══ 5 + 6 — applicability, read off the write layer ═════════════════════════════════════════
test.describe("5+6 — canonical applicability", () => {
    test("staff sees set-primary but never promote; the categories offered are staff's own", async ({
        page,
    }) => {
        await openScheduleContext(page, "person", JANE);
        await expect(page.locator(LIST_SURFACE)).toBeVisible({ timeout: SETTLE });

        // Open the assignment's detail, where the lifecycle actions live.
        await page.locator(`[data-assignment-row]`).first().click();
        const detail = page.locator('[data-assignment-surface="detail"]');
        await expect(detail).toBeVisible({ timeout: SETTLE });

        /*
         * PROMOTE IS ABSENT, and that absence is the proof rather than a gap.
         *
         * `assignment.promote_proposed` declares `supportedEntityTypes: ["child"]`, and a staff
         * subject is `commitmentKind: "committed"` at creation, so there is never a proposed staff
         * row to promote. A Promote control here would be an action manufactured for the surface.
         */
        await expect(detail.getByRole("button", { name: /promote/i })).toHaveCount(0);

        /*
         * SET PRIMARY IS PRESENT, and the distinction is real: `setPrimaryOperationalAssignment`
         * resolves a staff subject explicitly, while `createOperationalAssignment` refuses
         * `is_primary` for one. Two capabilities, only one of them child-shaped.
         */
        await expect(detail.getByRole("button", { name: /primary/i })).toHaveCount(1);

        await page.screenshot({ path: path.join(SHOTS, "5-6-applicability.png"), fullPage: true });
    });

    test("the category picker offers staff categories to Jane and withholds child-only ones", async ({
        page,
    }) => {
        await openScheduleContext(page, "person", JANE);
        await expect(page.locator(LIST_SURFACE)).toBeVisible({ timeout: SETTLE });

        await page.locator("[data-schedule-create-new='true']").first().click();
        const picker = page.locator('[data-assignment-type-picker="true"]');
        await expect(picker).toBeVisible({ timeout: SETTLE });

        // `subject_types` is the authority, enforced by the DB trigger and read by
        // `loadOrgAssignmentTypes`. The asymmetry is what makes this falsifiable: a card that
        // ignored the column would show all three.
        await expect(picker).toContainText(CATEGORY_STAFF_ONLY, { timeout: SETTLE });
        await expect(picker).toContainText(CATEGORY_BOTH);
        await expect(picker).not.toContainText(CATEGORY_CHILD_ONLY);

        await page.screenshot({ path: path.join(SHOTS, "6-staff-categories.png"), fullPage: true });
    });
});

// ═══ 7 — THE POSITIVE ROSTER REFRESH CONTROL ═════════════════════════════════════════════════
test.describe("7 — the Roster re-reads canonical truth", () => {
    test("a staff room change is visible in the Assignments ledger after close", async ({ page }) => {
        await watchLegacyOpeners(page);
        await openRoster(page, "roster");
        await useRiverside(page);
        await selectLens(page, "assignments");

        const ledger = page.locator('[data-assignment-roster="true"]');
        await expect(ledger).toBeVisible({ timeout: SETTLE });

        /*
         * ── BEFORE ──
         *
         * Read from the LEDGER, not from the fixture file. The fixture states what it seeded; this
         * asserts what the projection currently says, so the "after" comparison is against observed
         * truth rather than an assumption that the seed took effect.
         */
        const janeRow = ledger.locator('[data-assignment-roster-subject="staff:' + JANE + '"]');
        await expect(janeRow).toBeVisible({ timeout: SETTLE });
        await expect(janeRow).toContainText(ROOM_A, { timeout: SETTLE });
        expect(await janeRow.textContent()).not.toContain(ROOM_B);
        await page.screenshot({ path: path.join(SHOTS, "7a-ledger-before.png"), fullPage: true });

        // ── MUTATE, through the contextual Schedule card ──
        await openJaneFromStaff(page);
        await changeRoomTo(page, ROOM_B_ID, ROOM_B);

        // ── CLOSE, which is what announces the change to the host ──
        await page.keyboard.press("Escape");
        await expect(page.locator(OVERLAY)).toHaveCount(0, { timeout: SETTLE });

        /*
         * THE SIGNAL ITSELF, asserted before its effect.
         *
         * `changed: true` is the entire refresh seam. Checking it here means a stale ledger below
         * can only mean one thing — the re-read returned old data — instead of leaving the failure
         * ambiguous between a signal that never fired and a read that did not land.
         */
        const closes = await recordCloses(page);
        const changedCloses = closes.filter((c) => c.subjectId === JANE && c.changed === true);
        /*
         * At least one, not exactly one.
         *
         * `dispatchDurableRecordClosed` is called from INSIDE the `setRecord` updater, which makes
         * that updater impure — so React StrictMode invokes it twice in development and the event
         * fires twice. Harmless (the listener re-reads, and re-reading twice is idempotent) and
         * pre-existing, but pinning an exact count here would encode a dev-only artefact into an
         * acceptance and would fail in production for the opposite reason.
         */
        expect(changedCloses.length).toBeGreaterThanOrEqual(1);

        await backToAssignmentsLens(page);

        /*
         * ── AFTER ──
         *
         * The LEDGER itself. Not a toast, not the card's own state, not an optimistic patch — the
         * Roster's projection of canonical truth.
         *
         * This is non-vacuous because the ledger fetch is keyed on the SITE alone: returning to the
         * lens re-renders from state that was already in memory before the mutation. The ONLY way
         * Room B can appear here is the `changed` signal having triggered `reloadAssignments`. Before
         * that seam existed, this assertion would have read Room A while the card read Room B — the
         * exact split this slice closed.
         */
        const janeRowAfter = page.locator(
            '[data-assignment-roster-subject="staff:' + JANE + '"]',
        );
        await expect(janeRowAfter).toContainText(ROOM_B, { timeout: SETTLE });
        expect(await janeRowAfter.textContent()).not.toContain(ROOM_A);

        expect(await legacyOpens(page)).toEqual([]);
        await page.screenshot({ path: path.join(SHOTS, "7b-ledger-after.png"), fullPage: true });
    });
});

/** Change the open assignment's room, through the card's own editor and its canonical action. */
async function changeRoomTo(page: Page, roomId: string, roomName: string, effectiveFrom: string = EFFECTIVE_FROM) {
    await expect(page.locator(LIST_SURFACE)).toBeVisible({ timeout: SETTLE });
    await page.locator("[data-assignment-row]").first().click();
    await expect(page.locator('[data-assignment-surface="detail"]')).toBeVisible({ timeout: SETTLE });
    await page.getByRole("button", { name: /edit assignment/i }).first().click();

    // The editor's Room region opens the picker; the picker commits the room by ID, never by label —
    // a label match could select a different room whose name merely contains the same words.
    await page.locator("[data-room-change='true']").first().click();
    await expect(page.locator("[data-room-picker='true']")).toBeVisible({ timeout: SETTLE });
    await page.locator(`[data-room-option="${roomId}"]`).first().click();

    /*
     * SCHEDULE + START must be supplied, because editing a non-primary assignment SUPERSEDES it:
     * the form runs in create mode and seeds days/start only for the primary `edit` path, so an
     * operator re-states them. That is pre-existing behaviour, identical for a child and a staff
     * subject, and the certification completes the form rather than working around it — a
     * half-filled form whose Save is disabled would fail here for a reason that is not the claim.
     */
    await page.locator("[data-pattern-shortcut='true']").first().click();
    await expect(page.locator("[data-pattern-list='true']")).toBeVisible({ timeout: SETTLE });
    await page.locator("[data-pattern-option]").first().click();
    await page.locator('input[type="date"]').first().fill(effectiveFrom);

    const commit = page.locator("[data-schedule-commit='true']").first();
    await expect(commit, "the form must be complete enough to save").toBeEnabled({ timeout: SETTLE });
    await commit.click();

    /*
     * A REFUSED WRITE MUST SAY SO, not time out downstream.
     *
     * The editor renders its error above the fold of a scrolling body, so a failed save looks
     * exactly like a slow one: the list surface never appears and the next assertion times out with
     * nothing useful in it. Racing the error against the success state turns "the button did
     * nothing" into the service's own sentence.
     */
    const errorNote = page.locator("[data-schedule-error='true']");
    await expect
        .poll(
            async () =>
                (await errorNote.count()) > 0
                    ? `SAVE REFUSED: ${await errorNote.first().innerText()}`
                    : (await page.locator(LIST_SURFACE).count()) > 0
                      ? "saved"
                      : "pending",
            { timeout: SETTLE },
        )
        .toBe("saved");

    // The card returns to its list showing the new fact — the card's OWN re-read. A precondition for
    // the ledger assertion, and deliberately NOT a substitute for it: this is exactly the state that
    // used to be correct while the surface underneath went on showing the old commitment.
    await expect(page.locator(LIST_SURFACE)).toBeVisible({ timeout: SETTLE });
    await expect(page.locator(OPERATIONAL_CARD)).toContainText(roomName, { timeout: SETTLE });
}

/**
 * Open Jane's durable record from the STAFF section, without disturbing the Assignments lens.
 *
 * The Assignments lens has no record-opening gesture of its own; Staff does, and it is the same
 * workspace, so `RosterWorkspace` stays mounted and its `assignments` state is retained across the
 * whole open → mutate → close cycle. That retention is what makes scenario 7 a real positive
 * control: the ledger fetch is keyed on the SITE alone, so returning to the lens does not re-fetch
 * and the only way it can show a new room is the changed-signal re-read.
 */
async function openJaneFromStaff(page: Page) {
    await page.locator(SECTION_TABS, { hasText: "Staff" }).first().click();
    await expect(page.locator(ROSTER_SHELL)).toHaveAttribute("data-roster-section", "staff", {
        timeout: SETTLE,
    });
    await page.locator(SECTION_FILTER).fill("Jane");
    const jane = page.locator(`[data-staff-person="${JANE}"]`).first();
    await expect(jane).toBeVisible({ timeout: SETTLE });
    await jane.click();
    await expect(page.locator(PANEL_READY)).toBeVisible({ timeout: SETTLE });

    const scheduleChip = page.locator('[data-durable-record-context="schedule"]');
    await expect(scheduleChip).toBeVisible({ timeout: SETTLE });
    await scheduleChip.click();
    await expect(page.locator(OPERATIONAL_CARD)).toHaveAttribute(
        "data-contextual-card-subject-kind",
        "staff",
        { timeout: SETTLE },
    );
}

/** Return to the Assignments lens. Section switching does NOT re-fetch the ledger — see above. */
async function backToAssignmentsLens(page: Page) {
    await page.locator(SECTION_TABS, { hasText: "Roster" }).first().click();
    await expect(page.locator(ROSTER_SHELL)).toHaveAttribute("data-roster-section", "roster", {
        timeout: SETTLE,
    });
    await selectLens(page, "assignments");
}

// ═══ 8 — the surface underneath is preserved ═════════════════════════════════════════════════
test.describe("8 — state preservation", () => {
    test("section, lens, site and filter survive open → mutate → close", async ({ page }) => {
        await openRoster(page, "roster");
        await useRiverside(page);
        await selectLens(page, "assignments");

        // The SITE the lens is reading, published by the lens itself. Read from the DOM rather than
        // assumed, so the "after" comparison is against what the surface actually had.
        const siteBefore = await page
            .locator("[data-roster-assignments-lens]")
            .getAttribute("data-roster-assignments-site");
        expect(siteBefore, "the lens must publish the site it is reading").toBeTruthy();
        const urlBefore = page.url();

        // A real open → MUTATE → close, not just an open-and-close: preservation is only interesting
        // across a write, because a write is what makes the surface underneath reload.
        await openJaneFromStaff(page);
        await changeRoomTo(page, ROOM_C_ID, ROOM_C, EFFECTIVE_FROM_LATER);
        await page.keyboard.press("Escape");
        await expect(page.locator(OVERLAY)).toHaveCount(0, { timeout: SETTLE });

        await backToAssignmentsLens(page);

        await expect(page.locator(ROSTER_SHELL)).toHaveAttribute("data-roster-section", "roster");
        await expect(page.locator(ROSTER_LENS)).toHaveAttribute("data-roster-lens", "assignments");
        // The SITE survived. A reload that reset the workspace to the tenant's first site would
        // still "work" and would silently move the operator to Lakeside.
        await expect(page.locator("[data-roster-assignments-lens]")).toHaveAttribute(
            "data-roster-assignments-site",
            siteBefore ?? "",
        );
        await expect(page.locator(ROSTER_SHELL)).toContainText("Riverside");
        expect(page.url()).toBe(urlBefore);

        await page.screenshot({ path: path.join(SHOTS, "8-state-preserved.png"), fullPage: true });
    });
});

// ═══ 9 — no outward handoff to the old Assignments workspace ═════════════════════════════════
test.describe("9 — no outward Assignments handoff", () => {
    test("no ordinary Roster/Staff/Child flow opens the old scheduling workspace", async ({ page }) => {
        await watchLegacyOpeners(page);

        // Roster → Assignments lens
        await openRoster(page, "roster");
        await useRiverside(page);
        await selectLens(page, "assignments");
        await expect(page.locator(LEGACY_SCHEDULING_MODAL)).toHaveCount(0);

        // Staff → Jane
        await openRoster(page, "staff");
        await page.locator(SECTION_FILTER).fill("Jane");
        const jane = page.locator(`[data-staff-person="${JANE}"]`).first();
        await expect(jane).toBeVisible({ timeout: SETTLE });
        await jane.click();
        await expect(page.locator(PANEL_READY)).toBeVisible({ timeout: SETTLE });
        await expect(page.locator(LEGACY_SCHEDULING_MODAL)).toHaveCount(0);

        // Children → Lennon
        await openRoster(page, "children");
        await page.locator(SECTION_FILTER).fill("Lennon");
        const lennon = page.locator(`[data-child-member="${LENNON}"]`).first();
        await expect(lennon).toBeVisible({ timeout: SETTLE });
        await lennon.click();
        await expect(page.locator(PANEL_READY)).toBeVisible({ timeout: SETTLE });
        await expect(page.locator(LEGACY_SCHEDULING_MODAL)).toHaveCount(0);

        // The EVENT, not just the DOM: a listener that fired and rendered nothing would otherwise
        // read as success.
        expect(await legacyOpens(page)).toEqual([]);

        await page.screenshot({ path: path.join(SHOTS, "9-no-handoff.png"), fullPage: true });
    });
});
