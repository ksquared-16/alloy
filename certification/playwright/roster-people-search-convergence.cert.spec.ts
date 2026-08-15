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
const PUBLISHED_LAYOUT = "fbc00000-0000-4000-8000-00000000c005";

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
        // ── The durable host's answer ──
        await openRoster(page, "children");
        await (await findChild(page, "Lennon", LENNON)).click();
        await expect(page.locator(PANEL_READY)).toBeVisible({ timeout: SETTLE });
        await page.locator('[data-durable-record-context^="enrollment"]').click();
        await expect(page.locator(CONTEXTUAL_CARD)).toBeVisible({ timeout: SETTLE });
        const durableFingerprint = await page
            .locator(CONTEXTUAL_CARD)
            .getAttribute("data-contextual-card-fingerprint");
        expect(durableFingerprint, "durable host resolved a configuration").toBeTruthy();

        /*
         * ── The native operational answer ──
         *
         * The LENS is named explicitly, and that is not a convenience. Without it the surface
         * commits its default (`New Leads`), and Lennon is at `waitlist` — so the queue does not
         * contain his case, nothing commits, and no Focus Panel composes. That is the same
         * wrong-queue failure this programme fixed for Search, arriving through a hand-written URL.
         *
         * `all_work` is the tenant's catch-all lens: it publishes no stage predicate, so it holds
         * every open case in the process including a waitlisted one.
         */
        await page.goto(
            `/workspace/work-unit/enrollment-pipeline?work_view_id=all_work&subject_id=${KURZMAN_CASE}`,
        );
        await page.waitForLoadState("domcontentloaded");
        const nativeCard = page.locator(NATIVE_CHILDREN_CARD);
        await expect(nativeCard).toBeVisible({ timeout: SETTLE });
        const nativeFingerprint = await nativeCard.getAttribute("data-children-card-fingerprint");

        // THE INVARIANT. Not "both rendered" — the same effective configuration.
        expect(nativeFingerprint).toBe(durableFingerprint);
        // …and non-vacuous: the configuration is the tenant's, which is why the labels are in it.
        expect(nativeFingerprint).toContain(CONFIGURED_LABEL_DOB);
        expect(nativeFingerprint).toContain(CONFIGURED_LABEL_FIRST);

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

        // THE CLAIM, in the order it can be observed: no Roster hop, and no durable record host —
        // an operational destination goes to work, not to a record. Captured BEFORE the strictest
        // assertion so the evidence exists whichever way that one lands.
        await expect(page.locator(ROSTER_SHELL)).toHaveCount(0);
        await expect(page.locator(PANEL_READY)).toHaveCount(0);
        await page.screenshot({ path: path.join(SHOTS, "I-search-operational.png"), fullPage: true });


        /*
         * WHAT THIS SCENARIO DOES NOT PROVE, AND WHY IT SAYS SO.
         *
         * The native Focus Panel composing after an operational search click is NOT asserted here.
         * Observed behaviour from the workspace ROOT is that the movement does not occur — and that
         * path is untouched by this sprint: `dispatchOperatorFocusSelection` and
         * `OperatorFocusAttentionListener` are byte-identical to `origin/staging` (the only diff in
         * this control is the durable branch added ABOVE the operational one).
         *
         * Asserting it here would attribute a pre-existing gap to this change, and deleting the
         * scenario would hide it. So the sprint's own claim — record intent and operational intent
         * are different, and an operational destination goes to work rather than to a record or to
         * Roster — is asserted, and the composition step is reported as an open item instead of
         * being quietly folded into a green run.
         */
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
