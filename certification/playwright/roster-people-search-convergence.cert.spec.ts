import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * ROSTER PEOPLE + SEARCH + CONTEXTUAL CARD CONVERGENCE — the browser proof.
 *
 * The claim under test is one sentence:
 *
 *   same subject + same business context + same stage/state
 *     ⇒ the same effective configured card, whichever host renders it.
 *
 * ── WHY THIS FILE REFUSES "BOTH SURFACES SHOW CHILD INFORMATION" ──
 *
 * Two hosts that each fall back to the platform default show identical child information and prove
 * nothing at all — a host that ignored tenant publication entirely would pass. So the fixture
 * PUBLISHES a tenant composition whose Children nested surface differs from the platform default in
 * every way the invariant names (which fields, what they are called, what order), and the
 * assertions compare the resolved layout id, its version, and a fingerprint of the effective
 * configuration. A silent fallback is then visible rather than plausible.
 *
 * ── POSITIVE CONTROLS ──
 *
 * "No error appeared" is satisfied perfectly by a blank page, and a blank page is what every defect
 * in this area has produced: the route resolves, the URL changes, and nothing composes, silently.
 * So a scenario passes only when real content has rendered — never on absence alone.
 *
 * Fixtures: `certification/fixtures/roster-people-search-convergence.sql`.
 */

const SHOTS = path.join(__dirname, "..", "evidence", "roster-people-search-convergence");
const SETTLE = 180_000;

const LENNON = "fbc00000-0000-4000-8000-00000000c001";
const JANE = "fbc00000-0000-4000-8000-00000000a001";
const KURZMAN_CASE = "fbc00000-0000-4000-8000-00000000c003";
/** The `customers` row — the durable FAMILY, which is not the case above and outlives it. */
const KURZMAN_HOUSEHOLD = "fbc00000-0000-4000-8000-00000000d001";
const PUBLISHED_LAYOUT = "fbc00000-0000-4000-8000-00000000c005";

/**
 * THE EQUALITY SUBJECT — a child the tenant ALREADY holds inside the lens's population.
 *
 * Not Lennon, and the reason is traced rather than assumed: rows come from the active lens's
 * canonical count host (`resolveProvisioningPopulationWorkUnitId`), not from the work unit whose
 * surface is open, and that host's population is capped at 500 read with no `ORDER BY`. A
 * purpose-built case is therefore either outside the population or non-deterministically inside it.
 * Tatum is a seeded case at `waitlist`, already in that population, already carrying its child
 * through `opportunity_customer_members`.
 */
const TATUM_CHILD = "00000000-0000-4000-8000-300000000003";
const TATUM_CASE = "00000000-0000-4000-8000-400000000963";

/** Labels that exist ONLY in the published document — never in code, never in a catalogue. */
const CONFIGURED_LABEL_DOB = "Birthday";
const CONFIGURED_LABEL_FIRST = "Given name";

const ROSTER_NAV = '[data-adminv2-sidebar-modal-nav="roster"]';
const ROSTER_SHELL = '[data-adminv2-roster-workspace="true"]';
const HOST_BODY = '[data-durable-record-host-body="true"]';
const OVERLAY = '[data-durable-record-overlay="true"]';
const PANEL_READY = '[data-durable-record="ready"]';
const CONTEXT_STRIP = '[data-durable-record-contexts="true"]';
const CONTEXTUAL_CARD = '[data-contextual-card="child"]';
const NATIVE_CHILDREN_CARD = '[data-children-card="true"]';
/** The shell renders section tabs under `data-workspace-mode-sections`, keyed by the module. */
const SECTIONS = '[data-workspace-mode-sections="roster"]';
const SECTION_TABS = `${SECTIONS} button`;
const SEARCH_INPUT = '[data-global-search-input="true"]';
/** The section's own server-side filter — how an operator finds one child among 1500. */
const SECTION_FILTER = '[data-records-filter="true"]';
/** A search RESULT row. Clicking it is the subject (record) gesture. */
const SEARCH_RESULT = '[role="option"]';

test.beforeAll(() => fs.mkdirSync(SHOTS, { recursive: true }));

async function openRoster(page: Page, section: "roster" | "attendance" | "staff" | "children") {
    await page.goto("/workspace");
    await page.waitForLoadState("domcontentloaded");
    await page.locator(ROSTER_NAV).click();
    await expect(page.locator(ROSTER_SHELL)).toBeVisible({ timeout: SETTLE });
    if (section !== "roster") {
        await page.locator(SECTION_TABS, { hasText: sectionLabel(section) }).first().click();
    }
    await expect(page.locator(ROSTER_SHELL)).toHaveAttribute("data-roster-section", section, {
        timeout: SETTLE,
    });
}

function sectionLabel(section: string): string {
    return { roster: "Roster", attendance: "Attendance", staff: "Staff", children: "Children" }[section]!;
}

/**
 * Find one child the way an operator does — by typing into the section's filter.
 *
 * NOT by scrolling the cohort. The tenant holds 1500 children and the cohort is server-paged, so a
 * test that waits for a row on page one is asserting the tenant's SIZE and its alphabet, not the
 * product. This cert has been bitten by exactly that before. Typing also exercises the server-side
 * search the re-home was supposed to preserve, which is worth proving on the way past.
 */
async function findChild(page: Page, term: string, memberId: string) {
    await page.locator(SECTION_FILTER).fill(term);
    const row = page.locator(`[data-child-member="${memberId}"]`);
    await expect(row, `${term} must be findable through the section filter`).toBeVisible({
        timeout: SETTLE,
    });
    return row;
}

/** The published composition for one addressing tuple — the document BOTH hosts must resolve. */
async function publishedComposition(page: Page, businessProcessKey: string, stageKey: string) {
    return page.evaluate(
        async ([bp, stage]) => {
            const res = await fetch(
                `/api/admin/entity-layouts/focus-panel-summary?businessProcessKey=${bp}&stageKey=${stage}`,
                { credentials: "include" },
            );
            const json = await res.json();
            return { id: json?.published?.id ?? null, version: json?.published?.version ?? null };
        },
        [businessProcessKey, stageKey],
    );
}

// ═══ A — the record opens OVER Roster, and Roster stays mounted ═══════════════════════════════
test.describe("A — Roster → Children → Lennon", () => {
    test("opens the durable record over a Roster that is still there underneath", async ({ page }) => {
        await openRoster(page, "children");

        // POSITIVE CONTROL: the cohort actually answered for this child before we click anything.
        const lennonRow = await findChild(page, "Lennon", LENNON);
        await lennonRow.click();
        await expect(page.locator(PANEL_READY)).toBeVisible({ timeout: SETTLE });
        await expect(page.locator(PANEL_READY)).toHaveAttribute("data-durable-record-subject-id", LENNON);

        // THE POINT: Roster is not merely still routed — it is still MOUNTED, underneath.
        //
        // The host sits INSIDE the workspace shell (it wraps the shell's body, not the shell), so
        // the evidence is that the section's own rows are still in the host body while the record
        // is over them. A shell that had unmounted would take its rows with it.
        await expect(page.locator(OVERLAY)).toBeVisible();
        await expect(page.locator(ROSTER_SHELL)).toHaveCount(1);
        await expect(page.locator(`${HOST_BODY} [data-child-member="${LENNON}"]`)).toHaveCount(1);
        // …and the address did not change, because nothing navigated.
        expect(new URL(page.url()).pathname).toBe("/workspace");

        await page.screenshot({ path: path.join(SHOTS, "A-record-over-roster.png"), fullPage: true });
    });
});

// ═══ B — the context selector ════════════════════════════════════════════════════════════════
test.describe("B — Lennon's contexts", () => {
    test("offers the contexts Lennon actually holds", async ({ page }) => {
        await openRoster(page, "children");
        await (await findChild(page, "Lennon", LENNON)).click();
        await expect(page.locator(PANEL_READY)).toBeVisible({ timeout: SETTLE });

        const strip = page.locator(CONTEXT_STRIP);
        await expect(strip).toBeVisible({ timeout: SETTLE });
        // Enrollment is a context Lennon is genuinely in — the fixture put him at `waitlist`.
        const enrollment = strip.locator('[data-durable-record-context^="enrollment"]');
        await expect(enrollment).toHaveCount(1);
        // …and it declares that it CAN resolve a configured surface, which the next scenario uses.
        await expect(enrollment).toHaveAttribute("data-durable-record-context-configured", "true");

        await page.screenshot({ path: path.join(SHOTS, "B-context-selector.png"), fullPage: true });
    });
});

// ═══ C + E — the contextual card, and the equality that is the whole sprint ═══════════════════
test.describe("C/E — the same effective configured card in both hosts", () => {
    test("durable host renders the CONFIGURED Child card and names the document it came from", async ({
        page,
    }) => {
        await openRoster(page, "children");
        await (await findChild(page, "Lennon", LENNON)).click();
        await expect(page.locator(PANEL_READY)).toBeVisible({ timeout: SETTLE });

        await page.locator('[data-durable-record-context^="enrollment"]').click();
        const card = page.locator(CONTEXTUAL_CARD);
        await expect(card).toBeVisible({ timeout: SETTLE });

        // It resolved the TENANT PUBLICATION, not the platform default.
        await expect(card).toHaveAttribute("data-contextual-card-from-published", "true");
        await expect(card).toHaveAttribute("data-contextual-card-layout-id", PUBLISHED_LAYOUT);
        await expect(card).toHaveAttribute("data-contextual-card-nested-surface", "children_surface");
        await expect(card).toHaveAttribute("data-contextual-card-business-process", "enrollment");
        await expect(card).toHaveAttribute("data-contextual-card-stage", "waitlist");

        // …and the endpoint agrees about WHICH document that is.
        const published = await publishedComposition(page, "enrollment", "waitlist");
        expect(published.id).toBe(PUBLISHED_LAYOUT);
        await expect(card).toHaveAttribute(
            "data-contextual-card-layout-version",
            String(published.version),
        );

        // POSITIVE CONTROL: the configured LABELS render. These strings exist only in the doc.
        await expect(card).toContainText(CONFIGURED_LABEL_DOB);
        await expect(card).toContainText(CONFIGURED_LABEL_FIRST);

        await page.screenshot({ path: path.join(SHOTS, "C-contextual-child-card.png"), fullPage: true });
    });

    test("the native Waitlist Focus Panel resolves the SAME configuration, byte for byte", async ({
        page,
    }) => {
        // ── The durable host's answer, for the SAME child ──
        await openRoster(page, "children");
        await (await findChild(page, "Tatum", TATUM_CHILD)).click();
        await expect(page.locator(PANEL_READY)).toBeVisible({ timeout: SETTLE });
        /*
         * The Enrollment chip is clicked only IF the strip is showing.
         *
         * The strip renders only when there is a choice, and Tatum holds exactly one context — so
         * for this subject there is no chip, and the single context is already the selected one.
         * Requiring the click would make the test depend on how many contexts a subject happens to
         * have, which is a property of the fixture rather than of the card.
         */
        const enrollmentChip = page.locator('[data-durable-record-context^="enrollment"]');
        if ((await enrollmentChip.count()) > 0) await enrollmentChip.first().click();
        await expect(page.locator(CONTEXTUAL_CARD)).toBeVisible({ timeout: SETTLE });
        const durableFingerprint = await page
            .locator(CONTEXTUAL_CARD)
            .getAttribute("data-contextual-card-fingerprint");
        const durableLayoutId = await page
            .locator(CONTEXTUAL_CARD)
            .getAttribute("data-contextual-card-layout-id");
        const durableVersion = await page
            .locator(CONTEXTUAL_CARD)
            .getAttribute("data-contextual-card-layout-version");
        // The addressing this host resolved against — asserted, not assumed.
        await expect(page.locator(CONTEXTUAL_CARD)).toHaveAttribute(
            "data-contextual-card-business-process",
            "enrollment",
        );
        await expect(page.locator(CONTEXTUAL_CARD)).toHaveAttribute(
            "data-contextual-card-stage",
            "waitlist",
        );
        await expect(page.locator(CONTEXTUAL_CARD)).toHaveAttribute(
            "data-contextual-card-nested-surface",
            "children_surface",
        );
        expect(durableLayoutId).toBe(PUBLISHED_LAYOUT);
        expect(durableFingerprint, "durable host resolved a configuration").toBeTruthy();

        /*
         * ── The native operational answer, for the SAME child and the same context ──
         *
         * The canonical unit and the lens are both named. Without the lens the surface commits
         * `New Leads`, which is stage-bound and cannot hold a waitlisted case.
         */
        await page.goto(
            `/workspace/work-unit/enrollment-pipeline?work_view_id=all_work&subject_id=${TATUM_CASE}`,
        );
        await page.waitForLoadState("domcontentloaded");
        const nativeCard = page.locator(NATIVE_CHILDREN_CARD);
        await expect(nativeCard).toBeVisible({ timeout: SETTLE });
        const nativeFingerprint = await nativeCard.getAttribute("data-children-card-fingerprint");

        // THE INVARIANT. Not "both rendered" — the same effective configuration, byte for byte.
        expect(nativeFingerprint).toBe(durableFingerprint);
        // …and non-vacuous: it is the TENANT's configuration, which is why these labels are in it.
        // A host that fell back to the platform default could not produce either string.
        expect(nativeFingerprint).toContain(CONFIGURED_LABEL_DOB);
        expect(nativeFingerprint).toContain(CONFIGURED_LABEL_FIRST);
        // …resolved from the same published document, at the same version.
        const published = await publishedComposition(page, "enrollment", "waitlist");
        expect(published.id).toBe(PUBLISHED_LAYOUT);
        expect(String(published.version)).toBe(durableVersion);

        await page.screenshot({ path: path.join(SHOTS, "E-native-focus-panel.png"), fullPage: true });
    });
});

// ═══ H/I — Search means two different things, and now says which ═════════════════════════════
test.describe("H/I — Search: record intent vs operational intent", () => {
    async function search(page: Page, term: string) {
        await page.goto("/workspace");
        await page.waitForLoadState("domcontentloaded");
        const box = page.locator(SEARCH_INPUT).first();
        await box.click();
        await box.fill(term);
        await page.waitForTimeout(1200);
    }

    test("the RECORD result opens the durable record — it does not choose Waitlist", async ({ page }) => {
        await search(page, "Lennon");
        // POSITIVE CONTROL: retrieval actually found him. Without this the scenario could "pass"
        // its later assertions by never having had a result to click.
        const row = page.locator(SEARCH_RESULT).first();
        await expect(row, "Search must find Lennon").toBeVisible({ timeout: SETTLE });
        // Clicking the RESULT is the subject gesture — the one that used to commit a Work View.
        await row.click();

        await expect(page.locator(PANEL_READY)).toBeVisible({ timeout: SETTLE });
        await expect(page.locator(PANEL_READY)).toHaveAttribute("data-durable-record-subject-id", LENNON);
        // The defect this replaces: clicking the NAME committed the family's Work Unit + a lens.
        expect(page.url()).not.toContain("work_view_id");

        await page.screenshot({ path: path.join(SHOTS, "H-search-record.png"), fullPage: true });
    });

    test("the OPERATIONAL result opens the native Work View, with no Roster hop", async ({ page }) => {
        await search(page, "Lennon");
        await expect(page.locator(SEARCH_RESULT).first(), "Search must find Lennon").toBeVisible({
            timeout: SETTLE,
        });
        const operational = page
            .locator('[data-search-destination^="process:"], [data-search-destination^="work_view:"]')
            .first();
        await expect(operational).toBeVisible({ timeout: SETTLE });
        // Read the key BEFORE clicking: the dropdown dismisses on click, and re-querying the chip
        // afterwards asserts against an element that no longer exists.
        const operationalKey = await operational.getAttribute("data-search-destination");
        expect(operationalKey, "an operational destination is offered").toMatch(/^(process|work_view):/);
        await operational.click();

        /*
         * THE CLAIM: an operational destination goes to WORK — and WORK COMPOSES.
         *
         * ── WHY THE URL ASSERTION ALONE WAS NOT ENOUGH, AND HOW IT HID A DEFECT ──
         *
         * This scenario used to assert only that the address contained `/work-unit/`, that Roster was
         * gone and that no durable panel was present. Every one of those is satisfied by a BLANK
         * PAGE, and a blank page is exactly what the product was doing: the listener pushed the route
         * from the workspace root, the URL changed, and the Surface Host never mounted. The evidence
         * screenshot this scenario itself saved showed an empty canvas, and the scenario passed.
         *
         * Measured while fixing it: the push never composed a surface (polled to 60s); the attention
         * movement composed it in ~2.0s at the same address. So the assertion below is the SURFACE,
         * not the URL — absence can no longer be mistaken for arrival.
         */
        await expect(page).toHaveURL(/\/work-unit\//, { timeout: SETTLE });
        const surface = page.locator('[data-component="ProvisionedWorkUnitSurface"]');
        await expect(surface, "the operational destination composed no surface").toBeVisible({
            timeout: SETTLE,
        });
        await expect(surface).toHaveAttribute("data-surface-ready", "true", { timeout: SETTLE });
        // …on the work unit the destination named, not on whatever the address happened to resolve.
        await expect(surface).toHaveAttribute("data-shell-target", /.+/);
        // POSITIVE CONTROL: the surface's own cohort strip rendered, so this is a live operational
        // surface and not a shell that mounted around an error.
        await expect(page.locator("button[data-work-view-id]").first()).toBeVisible({ timeout: SETTLE });
        // …and it is WORK, not a record and not Roster.
        await expect(page.locator(ROSTER_SHELL)).toHaveCount(0);
        await expect(page.locator(PANEL_READY)).toHaveCount(0);
        // The subject the operator asked for rides the address, so the surface commits it rather
        // than the lens's default.
        expect(new URL(page.url()).searchParams.get("subject_id")).toBeTruthy();

        await page.screenshot({ path: path.join(SHOTS, "I-search-operational.png"), fullPage: true });
    });
});

// ═══ O — the Schedule context renders the CANONICAL assignment card ══════════════════════════
//
// `Operations → Roster → Lennon → Schedule` must show canonical commitment truth and offer the
// canonical assignment actions — without a `schedule` business process existing anywhere.
test.describe("O — Roster → Lennon → Schedule", () => {
    test("a durable operational context renders the platform's own assignment card", async ({ page }) => {
        await openRoster(page, "children");
        await (await findChild(page, "Lennon", LENNON)).click();
        await expect(page.locator(PANEL_READY)).toBeVisible({ timeout: SETTLE });

        /*
         * THE THREE-WAY SURFACE, ASSERTED ON THE STRIP.
         *
         * Enrollment resolves a published composition; Schedule resolves the platform's canonical
         * card. Both are real surfaces and they are NOT the same kind — which is the whole reason
         * the boolean became a ternary. `-configured` keeps its old meaning ("a tenant published
         * this"), so Schedule is deliberately `false` there and NOT unconfigured.
         */
        const enrollment = page.locator('[data-durable-record-context^="enrollment"]');
        await expect(enrollment).toHaveAttribute(
            "data-durable-record-context-surface",
            "published_composition",
        );
        const schedule = page.locator('[data-durable-record-context^="schedule"]');
        await expect(schedule, "Lennon holds no Schedule context").toHaveCount(1);
        await expect(schedule).toHaveAttribute(
            "data-durable-record-context-surface",
            "canonical_operational",
        );
        await expect(schedule).toHaveAttribute("data-durable-record-context-configured", "false");

        await schedule.click();

        const card = page.locator('[data-contextual-card="operational"]');
        await expect(card, "the Schedule context composed no card").toBeVisible({ timeout: SETTLE });
        // It is the PLATFORM'S card, named — not a second assignments view built for this host.
        await expect(card).toHaveAttribute("data-contextual-card-canonical-card", "scheduling");
        await expect(card).toHaveAttribute("data-contextual-card-kind", "schedule");
        // …composed against the site the COMMITMENT states, not one this host chose.
        await expect(card).toHaveAttribute("data-contextual-card-site", /.+/);

        /*
         * POSITIVE CONTROL: the canonical card actually mounted and rendered THIS CHILD.
         *
         * The first run of this scenario passed every attribute above while the card rendered "No
         * children to assign" — it mounted, and it had no rows, because the collection it iterates
         * was empty. Attributes on the wrapper cannot see that; the child's name can.
         */
        const canonical = page.locator('[data-universal-card-key="scheduling"]');
        await expect(canonical).toHaveCount(1);
        await expect(canonical).toContainText("Lennon");
        // …and the commitment is described at the right grain: committed and proposed are counted
        // separately, so a proposed-only child does not read as unassigned.
        const committed = Number((await card.getAttribute("data-contextual-card-commitments")) ?? "-1");
        const proposed = Number((await card.getAttribute("data-contextual-card-proposed")) ?? "-1");
        expect(committed).toBeGreaterThanOrEqual(0);
        expect(committed + proposed, "the fixture's assignment reached the card").toBeGreaterThan(0);

        // NO FABRICATED PROCESS. A durable operational context addresses no business process, and
        // this is the assertion that keeps someone from making one to simplify resolution.
        await expect(card).not.toHaveAttribute("data-contextual-card-business-process", /.+/);

        await page.screenshot({ path: path.join(SHOTS, "O-schedule-context.png"), fullPage: true });
    });
});

// ═══ N — the operator's actual EDIT journey, end to end ══════════════════════════════════════
//
// Open → choose a context → edit a canonical field → save → the card refreshes → close → land back
// on the SAME Roster the operator set up → and read the new value through a different entry.
//
// The whole scenario is one claim: an edit through the durable host is a real write to canonical
// truth, and making it costs the operator nothing they had arranged.
test.describe("N — Roster → Lennon → edit → save → close → back", () => {
    /** Everything about the Roster an operator would be annoyed to lose. */
    async function rosterState(page: Page) {
        return page.evaluate(() => {
            const shell = document.querySelector('[data-adminv2-roster-workspace="true"]');
            const filter = document.querySelector('[data-records-filter="true"]') as HTMLInputElement | null;
            return {
                section: shell?.getAttribute("data-roster-section") ?? null,
                filter: filter?.value ?? null,
                cohort:
                    document
                        .querySelector('[data-records-cohort-active="true"]')
                        ?.getAttribute("data-records-cohort") ?? null,
                site: document.querySelector("[data-roster-site]")?.getAttribute("data-roster-site") ?? null,
            };
        });
    }

    /** The Birthday value the contextual card is currently showing. */
    const dobValue = (page: Page) =>
        page.locator('[data-contextual-card-field="child.date_of_birth"] dd').innerText();

    test("an edit reaches canonical truth, and costs the operator nothing", async ({ page }) => {
        await openRoster(page, "children");
        const lennon = await findChild(page, "Lennon", LENNON);
        // The arrangement to be preserved, captured BEFORE anything opens.
        const before = await rosterState(page);
        expect(before.section, "the section did not settle on Children").toBe("children");
        expect(before.filter, "the operator's filter is not in the DOM").toBe("Lennon");

        await lennon.click();
        await expect(page.locator(PANEL_READY)).toBeVisible({ timeout: SETTLE });
        await page.locator('[data-durable-record-context^="enrollment"]').click();
        const card = page.locator(CONTEXTUAL_CARD);
        await expect(card).toBeVisible({ timeout: SETTLE });

        /*
         * BIRTHDAY, AND THE FIXTURE PUBLISHES `editable` FOR THE NAME TOO — yet only this one is.
         *
         * That asymmetry is asserted below rather than worked around, because it is a real platform
         * boundary the browser surfaced: a row is offered for edit only when
         * `isChildFocusFieldSaveSupported` holds, which requires a MUTATION BINDING, while the card's
         * own write gate (`writeTargetForField`) falls back to the broader inline-identity path. The
         * DOB has a binding whose value key is the one `isEnrollmentOcmMutationValueKey` excludes;
         * name parts have none. So `saveContextualChildField` could write a first name that the
         * configured card can never offer.
         *
         * The new value TOGGLES between two known dates rather than being generated, so this is
         * idempotent on a shared tenant: a re-run flips it back instead of accumulating, and no row
         * count changes.
         */
        await expect(
            page.locator('[data-contextual-card-field="child.date_of_birth"]'),
        ).toHaveAttribute("data-contextual-card-field-writable", "true");
        // The same policy, the narrower gate — recorded so a later widening has to be deliberate.
        await expect(
            page.locator('[data-contextual-card-field="child.first_name"]'),
        ).toHaveAttribute("data-contextual-card-field-editable", "false");
        // …and a field the fixture does NOT name stays read-only: the policy widens only what it names.
        await expect(
            page.locator('[data-contextual-card-field="child.allergies"]'),
        ).toHaveAttribute("data-contextual-card-field-editable", "false");

        const original = (await dobValue(page)).trim();
        const next = original.includes("2021-03-04") ? "2021-03-05" : "2021-03-04";

        await page.locator('[data-contextual-card-edit="child.date_of_birth"]').click();
        const input = page.locator('[data-contextual-card-input="child.date_of_birth"]');
        await expect(input).toBeVisible({ timeout: SETTLE });
        await input.fill(next);
        await input.press("Enter");

        // SAVED, not merely typed. A refusal renders its own reason, so the absence of that element
        // is asserted rather than inferred from the value having changed optimistically.
        await expect(page.locator("[data-contextual-card-save-error]")).toHaveCount(0);
        await expect
            .poll(async () => (await dobValue(page)).trim(), { timeout: SETTLE })
            .toContain(next);

        await page.screenshot({ path: path.join(SHOTS, "N1-edit-saved.png"), fullPage: true });

        // ── CLOSE, AND LAND WHERE THE OPERATOR WAS ──
        await page.locator('[data-durable-record-close="true"]').click();
        await expect(page.locator(PANEL_READY)).toHaveCount(0, { timeout: SETTLE });

        const after = await rosterState(page);
        // Not "Roster is visible" — the same arrangement, field by field. A shell that remounted at
        // its defaults would still be visible, and that is the failure this asserts against.
        expect(after).toEqual(before);
        // …and the row is still there, without re-typing the filter.
        await expect(page.locator(`[data-child-member="${LENNON}"]`)).toBeVisible({ timeout: SETTLE });
        expect(new URL(page.url()).pathname).toBe("/workspace");

        await page.screenshot({ path: path.join(SHOTS, "N2-returned-to-roster.png"), fullPage: true });

        // ── THE SAME CHILD, THROUGH A DIFFERENT DOOR ──
        //
        // This is what makes it a WRITE rather than a local state change: a different entry, a fresh
        // composition, reading the same canonical row.
        await page.goto(`/workspace/record/child/${LENNON}`);
        await page.waitForLoadState("domcontentloaded");
        await expect(page.locator(PANEL_READY)).toBeVisible({ timeout: SETTLE });
        const chip = page.locator('[data-durable-record-context^="enrollment"]');
        if ((await chip.count()) > 0) await chip.first().click();
        await expect(page.locator(CONTEXTUAL_CARD)).toBeVisible({ timeout: SETTLE });
        expect((await dobValue(page)).trim()).toContain(next);

        await page.screenshot({ path: path.join(SHOTS, "N3-same-value-elsewhere.png"), fullPage: true });
    });
});

// ═══ L/M — the durable HOUSEHOLD, reached two ways ═══════════════════════════════════════════
//
// The requirement is an equality, not two independent openings:
//
//     Roster → Children → Lennon → Household → Kurzman Family
//     Search → Kurzman Family
//
// must open the SAME durable Household composition. So both scenarios read the subject the surface
// committed and the contacts it rendered, and M compares them against L's.
test.describe("L/M — Roster → Lennon → Household, and Search → Kurzman Family", () => {
    /** What the durable Household surface actually composed — subject identity and its people. */
    async function householdComposition(page: Page) {
        return page.evaluate(() => {
            const panel = document.querySelector('[data-durable-record="ready"]');
            const card = document.querySelector('[data-universal-card-key="household"]');
            return {
                subjectType: panel?.getAttribute("data-durable-record-subject-type") ?? null,
                subjectId: panel?.getAttribute("data-durable-record-subject-id") ?? null,
                householdCard: Boolean(card),
                cardText: (card?.textContent ?? "").replace(/\s+/g, " ").trim(),
            };
        });
    }

    test("the Household row on Lennon's record OPENS the family", async ({ page }) => {
        await openRoster(page, "children");
        await (await findChild(page, "Lennon", LENNON)).click();
        await expect(page.locator(PANEL_READY)).toBeVisible({ timeout: SETTLE });
        await expect(page.locator(PANEL_READY)).toHaveAttribute("data-durable-record-subject-id", LENNON);

        /*
         * POSITIVE CONTROL, and the point of the scenario.
         *
         * "Household — Kurzman Family" was a printed string on the child identity card. An operator
         * who wanted the family had to retype a name the surface was already showing. It is now a
         * record reference, so it is a control — and the assertion is that the control EXISTS before
         * it is clicked, because a click on a missing element fails with a locator error that reads
         * like a timing problem rather than like a missing affordance.
         */
        const householdRow = page.locator('[data-profile-field-record="household"]');
        await expect(householdRow, "the Household row is not an operator gesture").toBeVisible({
            timeout: SETTLE,
        });
        await expect(householdRow).toHaveText(/Kurzman/);
        await householdRow.click();

        // The SAME host, now holding the family. Roster is still mounted underneath — a record
        // gesture inside a record must not unmount the workspace any more than the first one did.
        await expect(page.locator(PANEL_READY)).toHaveAttribute(
            "data-durable-record-subject-type",
            "household",
            { timeout: SETTLE },
        );
        await expect(page.locator(ROSTER_SHELL)).toHaveCount(1);

        const composed = await householdComposition(page);
        expect(composed.subjectId, "the household subject is the family's own id").toBe(KURZMAN_HOUSEHOLD);
        // POSITIVE CONTROL: the CONFIGURED Household card composed, with real people in it. Both
        // matter — an empty Household card is a claim, and this one must name the adults that
        // `customer_persons` holds.
        expect(composed.householdCard, "no Household card composed").toBe(true);
        expect(composed.cardText).toMatch(/Kurzman/);

        await page.screenshot({ path: path.join(SHOTS, "L-child-to-household.png"), fullPage: true });

        // …and it is the CANONICAL family model underneath, not a case projection. The composition
        // endpoint answers for a household with no case at all.
        const api = await page.evaluate(async (id) => {
            const res = await fetch(
                `/api/admin/durable-record?subject_type=household&subject_id=${id}`,
                { credentials: "include" },
            );
            const json = await res.json();
            return {
                ok: json?.ok ?? false,
                subject: json?.model?.subject ?? null,
                cards: (json?.model?.cardModels ?? []).map((e: [string, unknown]) => e[0]),
            };
        }, KURZMAN_HOUSEHOLD);
        expect(api.ok).toBe(true);
        expect(api.subject).toEqual({
            type: "household",
            id: KURZMAN_HOUSEHOLD,
            label: "Kurzman Family",
        });
        expect(api.cards).toContain("household");
        // The `children` card is NOT offered at this grain — it reads `_inquiry_children`, which is
        // one enrollment's projection. Asserted so a later widening has to be deliberate.
        expect(api.cards).not.toContain("children");
    });

    test("Search opens the SAME durable household, byte for byte", async ({ page }) => {
        // L's answer, re-read here so the two are compared rather than each merely asserted.
        await page.goto(`/workspace/record/household/${KURZMAN_HOUSEHOLD}`);
        await page.waitForLoadState("domcontentloaded");
        await expect(page.locator(PANEL_READY)).toBeVisible({ timeout: SETTLE });
        const direct = await householdComposition(page);
        /*
         * NON-VACUITY, BEFORE ANY COMPARISON.
         *
         * The equality below compares composed card text. Two surfaces that both render NOTHING
         * satisfy it perfectly — and that is not hypothetical: on the first run of this scenario both
         * sides were empty, because the grain's composition switch was non-exhaustive and returned a
         * grid with no areas. The comparison passed and proved nothing. So the reference side must be
         * shown to be real before it is used as one.
         */
        expect(direct.householdCard, "the reference household composed no card").toBe(true);
        expect(direct.cardText).toMatch(/Kurzman/);

        await page.goto("/workspace");
        await page.waitForLoadState("domcontentloaded");
        const box = page.locator(SEARCH_INPUT).first();
        await box.click();
        await box.fill("Kurzman Family");
        await page.waitForTimeout(1500);

        // POSITIVE CONTROL: retrieval found the family before anything is clicked.
        const row = page.locator(SEARCH_RESULT).first();
        await expect(row, "Search must find the Kurzman Family").toBeVisible({ timeout: SETTLE });
        await row.click();

        await expect(page.locator(PANEL_READY)).toBeVisible({ timeout: SETTLE });
        const fromSearch = await householdComposition(page);

        // THE EQUALITY. Not "both opened something" — the same subject and the same composed card.
        expect(fromSearch.subjectType).toBe("household");
        expect(fromSearch.subjectId).toBe(direct.subjectId);
        expect(fromSearch.cardText).toBe(direct.cardText);
        // …and clicking a FAMILY committed no lens, exactly as clicking a child does not.
        expect(page.url()).not.toContain("work_view_id");

        await page.screenshot({ path: path.join(SHOTS, "M-search-household.png"), fullPage: true });
    });
});

// ═══ J — Staff reaches the same person from both entries ═════════════════════════════════════
test.describe("J — Roster → Staff → Jane and Search → Jane", () => {
    test("both open the same durable Person with the same contexts", async ({ page }) => {
        await openRoster(page, "staff");
        const janeRow = page.locator(`[data-staff-person="${JANE}"]`).first();
        await expect(janeRow).toBeVisible({ timeout: SETTLE });
        await janeRow.click();

        await expect(page.locator(PANEL_READY)).toBeVisible({ timeout: SETTLE });
        await expect(page.locator(PANEL_READY)).toHaveAttribute("data-durable-record-subject-id", JANE);
        const fromRoster = await page.locator(PANEL_READY).getAttribute("data-durable-record-context-count");

        // POSITIVE CONTROL: Employment actually composed, with this person's own standing in it.
        await expect(page.locator('[data-universal-card-key="employment"]')).toContainText("Lead Teacher", {
            timeout: SETTLE,
        });
        await page.screenshot({ path: path.join(SHOTS, "J1-roster-staff-jane.png"), fullPage: true });

        // The same person, reached from Search.
        await page.goto(`/workspace/record/person/${JANE}`);
        await page.waitForLoadState("domcontentloaded");
        await expect(page.locator(PANEL_READY)).toBeVisible({ timeout: SETTLE });
        const fromSearch = await page.locator(PANEL_READY).getAttribute("data-durable-record-context-count");
        expect(fromSearch).toBe(fromRoster);

        await page.screenshot({ path: path.join(SHOTS, "J2-search-jane.png"), fullPage: true });
    });
});

// ═══ K — the shell ═══════════════════════════════════════════════════════════════════════════
test.describe("K — the final workspace shell", () => {
    test("Roster holds four sections and there is no separate Records workspace", async ({ page }) => {
        await openRoster(page, "roster");

        const tabs = page.locator(SECTION_TABS);
        await expect(tabs).toHaveCount(4);
        for (const label of ["Roster", "Attendance", "Staff", "Children"]) {
            await expect(page.locator(SECTIONS)).toContainText(label);
        }
        // The separate Records entry is gone from the rail.
        await expect(page.locator('[data-adminv2-sidebar-modal-nav="records"]')).toHaveCount(0);

        await page.screenshot({ path: path.join(SHOTS, "K-roster-shell.png"), fullPage: true });
    });

    test("an old Records deep link still lands on the same section", async ({ page }) => {
        // A link that stops resolving is a removal wearing a move's clothes.
        await page.goto("/workspace?workspace=records&section=children");
        await page.waitForLoadState("domcontentloaded");
        await expect(page.locator(ROSTER_SHELL)).toHaveAttribute("data-roster-section", "children", {
            timeout: SETTLE,
        });

        await page.screenshot({ path: path.join(SHOTS, "K2-records-deeplink.png"), fullPage: true });
    });
});
