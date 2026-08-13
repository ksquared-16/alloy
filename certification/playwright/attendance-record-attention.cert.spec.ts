import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * ATTENDANCE → CANONICAL RECORD ATTENTION.
 *
 * Attendance names people all day — a child in a room, a staff member on shift — and the operator
 * clicks those names expecting to be taken to the record. Before this, the gesture called
 * `openDrawer`, which the drawer eradication had already reduced to a dormant helper: the click
 * did nothing at all, silently. These scenarios prove the replacement actually lands.
 *
 * ── WHY "IT DIDN'T CRASH" IS NOT A PASS ──
 *
 * Three different nothings are indistinguishable from a screenshot, and this suite must separate
 * them:
 *
 *   1. the gesture never fired                          → a defect
 *   2. attention moved but stayed BEHIND this modal     → a defect, and an invisible one: the
 *      Assignments workspace is shell chrome mounted in `TopNavBar`, above the kernel, so the
 *      panel composes underneath an opaque overlay and the operator sees their click do nothing
 *   3. the resolver honestly answered "nowhere"          → CORRECT, and the UI must stop offering
 *      the gesture rather than invent a destination
 *
 * So every positive scenario asserts the modal is GONE, the URL carries the resolved subject, and
 * the panel composed a nonzero number of cells — none of which a blank page satisfies.
 *
 * Runs against a dev server, so the first visit to a route compiles it; the warm-up is a warm-up.
 */

const SHOTS = path.join(__dirname, "..", "evidence", "attendance-record-attention");
const SETTLE = 180_000;

/** The overlay the whole drawer eradication removed — it must never come back. */
const MODAL = '[role="dialog"][aria-modal="true"], .adminv2-drawer-modal-panel, .adminv2-drawer-sidebar-panel';
/** The Assignments workspace modal that HOSTS Attendance. */
const SCHEDULING = "[data-adminv2-roster-workspace]";

/**
 * Seeded by `certification/attendance/01-attendance-fixture.sql`.
 *
 * ⚠ Ada Smith, NOT Joe or Emma. Those two carry the Search fixture's sibling-schedule-grain
 * scenario (M/W/F and Tue/Thu), so a spec pinned to either passes or fails depending on the day of
 * the week — which it did, reporting "the seeded child is not on today's roster" the first time a
 * promotion run landed on a Thursday. Ada is on a Mon–Fri cert pattern in the same room and the
 * same household, so the scenario is reproducible on any weekday.
 */
const SITE = "Northwind — Riverside Campus";
const ROOM_ID = "00000000-0000-4000-8000-000000000013";
const CHILD_CM = "00000000-0000-4000-8000-00005000006b";
const CHILD_PERSON = "00000000-0000-4000-8000-00005000006a";
/**
 * The employed staff member certified here: Jane Smith, the Smith household's primary contact,
 * assigned to that same room.
 *
 * ⚠ The tenant's OTHER employed person (Avery Testfamily-0001) is deliberately not used. She
 * resolves a host correctly, but her cases are lead-fixture inquiries the New Leads work view does
 * not page in, so the surface answers "That record isn't in this Work View" — the platform
 * refusing safely rather than substituting a subject. That is a real answer about the queue's
 * contents, not about this gesture, and certifying the card against it would prove nothing.
 */
const STAFF_PERSON = "00000000-0000-4000-8000-000050000010";
/** The other employed person — kept so the Work-View refusal stays observable, not forgotten. */
const STAFF_NOT_ON_PAGE = "00000000-0000-4000-8000-200000000001";

test.beforeAll(() => fs.mkdirSync(SHOTS, { recursive: true }));

const shot = (page: Page, name: string) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });

/**
 * Where the platform says this record is worked — read from the resolver, never assumed.
 *
 * Returns null for "nowhere", which is a real answer this suite asserts on rather than treats as
 * a lookup failure.
 */
async function resolveHost(
    page: Page,
    entityType: string,
    entityId: string,
): Promise<{ workUnitKey: string; hostId: string } | null> {
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
    console.log(`[CERT RESOLVE ${entityType}:${entityId}] ${JSON.stringify(payload.target ?? null)}`);
    const workUnitKey = (payload.target?.host_work_unit_key ?? "").trim();
    const hostId = (payload.target?.host_entity_id ?? "").trim();
    if (!workUnitKey || !hostId) return null;
    return { workUnitKey, hostId };
}

/** Everything the panel is actually showing. Logged either way, so a failure carries its evidence. */
async function panelState(page: Page, label: string) {
    const state = await page.evaluate(
        ([modalSel, schedSel]) => {
            const cells = Array.from(document.querySelectorAll("[data-focus-panel-grid-cell]"));
            return {
                url: location.pathname + location.search,
                cellCount: cells.length,
                cells: cells.map((el) => el.getAttribute("data-focus-panel-grid-cell")),
                elevated: cells
                    .filter((el) => el.getAttribute("data-fp-elevated") === "true")
                    .map((el) => el.getAttribute("data-focus-panel-grid-cell")),
                employmentPeople: Array.from(document.querySelectorAll("[data-employment-person]")).map((el) =>
                    el.getAttribute("data-employment-person"),
                ),
                recordModals: document.querySelectorAll(modalSel).length,
                schedulingModals: document.querySelectorAll(schedSel).length,
            };
        },
        [MODAL, SCHEDULING],
    );
    console.log(`[CERT ${label}] ${JSON.stringify(state)}`);
    return state;
}

/** Open Attendance for the seeded site and drill into the populated room. */
async function openAttendanceRoom(page: Page) {
    await page.goto("/workspace");
    await page.waitForLoadState("domcontentloaded");

    // The product's own deep-link contract (the Focus Panel Assignments card uses it), not a test hook.
    await page.evaluate(() => {
        sessionStorage.setItem(
            "alloy.roster.workspace.deeplink",
            JSON.stringify({ section: "attendance" }),
        );
    });
    await page.locator('[data-adminv2-sidebar-modal-nav="roster"]').click();
    await expect(page.locator(SCHEDULING)).toBeVisible({ timeout: SETTLE });

    // Site selection. Attendance is site-scoped and opens on "All sites", which renders NO rooms —
    // so without this the room locators below would simply time out and the failure would read as
    // "the fixture is gone". `AlloySelect` is a custom listbox (button + [role=option]), not a
    // native <select>, so `selectOption` silently matches nothing here.
    const sitePicker = page.locator('button[aria-label="Site"]').first();
    await expect(sitePicker, "the site picker is absent — Attendance cannot be scoped to a site").toBeVisible({
        timeout: SETTLE,
    });
    await sitePicker.click();
    await page.locator('[role=option]', { hasText: "Riverside" }).first().click();
    await expect(sitePicker).toContainText("Riverside", { timeout: SETTLE });

    await expect(page.locator('[data-attendance-overview="true"]')).toBeVisible({ timeout: SETTLE });
    await shot(page, "01-attendance-overview");

    const roomCard = page.locator(`[data-attendance-room-card="${ROOM_ID}"]`);
    await expect(roomCard, "the seeded room is not on the Attendance overview — the fixture is gone").toBeVisible({
        timeout: SETTLE,
    });
    await roomCard.click();
    await expect(page.locator(`[data-attendance-room="${ROOM_ID}"]`)).toBeVisible({ timeout: SETTLE });
    await shot(page, "02-attendance-room");
}

/**
 * The room is genuinely populated.
 *
 * Without this, every scenario below could "pass" against an empty room by never finding a name to
 * click — the same class of vacuous pass that let a previous suite report 8/8 while nothing worked.
 */
async function assertRoomPopulated(page: Page) {
    const staff = page.locator(`[data-attendance-staff="${STAFF_PERSON}"]`);
    const child = page.locator(`[data-attendance-child="${CHILD_CM}"]`);
    await expect(staff, "seeded staff member is not on today's roster").toHaveCount(1, { timeout: SETTLE });
    await expect(child, "seeded child is not on today's roster").toHaveCount(1, { timeout: SETTLE });
}

/** Nothing here is satisfied by a blank page, and nothing by a panel hidden behind the modal. */
async function assertLandedOn(page: Page, host: { workUnitKey: string; hostId: string }, label: string) {
    const pathname = `/workspace/work-unit/${host.workUnitKey.replace(/_/g, "-")}`;
    await page.waitForURL(
        (url) => url.pathname === pathname && url.searchParams.get("subject_id") === host.hostId,
        { timeout: SETTLE },
    );

    // The Assignments modal must have yielded, or the operator cannot see what they asked for.
    await expect(
        page.locator(SCHEDULING),
        "attention moved but the Assignments modal stayed on top — the operator sees nothing",
    ).toHaveCount(0, { timeout: SETTLE });

    // ── PRECONDITION, stated by the product itself ──
    //
    // Landing on a Focus Panel needs the subject to be on the committed Work View's evaluated page,
    // which means a tenant whose enrollment configuration has been PUBLISHED. Straight after
    // `alloy-certify reset` the tenant is deliberately pre-publication, the queues evaluate nothing,
    // and the surface answers "That record isn't in this Work View" — which is scenario A4's
    // assertion, not a defect here. These scenarios belong to the harness's INHERITED-tenant class,
    // exactly like `schedule-tour` T0; `alloy-certify journey` resets only before files that demand
    // pristineness and lets these inherit.
    //
    // Failing fast with that reason beats a two-minute timeout on an empty panel, which is how this
    // cost a promotion run to diagnose.
    const refused = page.getByText(/isn.t in this Work View/i);
    if (await refused.count()) {
        throw new Error(
            "Work View refused the subject: this tenant is PRE-PUBLICATION, so no queue pages this " +
                "record in. Run through `alloy-certify journey` (inherited tenant) rather than " +
                "straight after a reset. The refusal itself is certified by scenario A4.",
        );
    }

    const cells = page.locator("[data-focus-panel-grid-cell]");
    await expect(cells.first()).toBeVisible({ timeout: SETTLE });
    expect((await panelState(page, label)).cellCount, "the Focus Panel composed no cells").toBeGreaterThan(0);

    // The removed product, asserted absent on the surface the gesture actually reached.
    await expect(page.locator(MODAL)).toHaveCount(0);
}

test.describe("Attendance → canonical record attention", () => {
    test("A0 · the seeded room is populated (positive control for every scenario below)", async ({ page }) => {
        await openAttendanceRoom(page);
        await assertRoomPopulated(page);
    });

    test("A1 · a child gesture lands on the canonical record", async ({ page }) => {
        await openAttendanceRoom(page);
        await assertRoomPopulated(page);

        const host = await resolveHost(page, "persons", CHILD_PERSON);
        expect(host, "the seeded child resolved no host — A1 cannot prove landing").not.toBeNull();

        await page.locator(`[data-attendance-open-child="${CHILD_CM}"]`).click();
        await assertLandedOn(page, host!, "A1-child-landed");
        await shot(page, "03-child-landed");
    });

    test("A2 · a staff gesture lands and the Employment card shows that person", async ({ page }) => {
        await openAttendanceRoom(page);
        await assertRoomPopulated(page);

        const host = await resolveHost(page, "persons", STAFF_PERSON);
        expect(host, "the employed person resolved no host — see A3 for the valid-null contract").not.toBeNull();

        await page.locator(`[data-attendance-open-staff="${STAFF_PERSON}"]`).click();
        await assertLandedOn(page, host!, "A2-staff-landed");

        // The re-homed capability: Employment composed on the panel the person resolves to.
        await expect(
            page.locator('[data-focus-panel-grid-cell="employment"]'),
            "the Employment card is not on the composed panel",
        ).toHaveCount(1, { timeout: SETTLE });

        // What the record the panel composes from actually carries. A composed CELL is only
        // geometry; the card body needs the projection — logging both separates "not projected"
        // from "projected but not rendered".
        const payload = await page.evaluate(async (oppId) => {
            // The VM route is what the Focus Panel composes from. Probing the entity route would
            // answer a question the panel never asks — that mistake cost a whole diagnosis cycle.
            const res = await fetch(`/api/admin/view-models/drawer/opportunity/${oppId}`, {
                credentials: "include",
            });
            const text = await res.text();
            let json: Record<string, unknown> = {};
            try {
                json = JSON.parse(text) as Record<string, unknown>;
            } catch {
                /* surfaced via status + head below */
            }
            // Walk to the composed record without assuming the envelope's exact nesting.
            const seen = new Set<unknown>();
            let rec: Record<string, unknown> | null = null;
            const walk = (node: unknown, depth: number) => {
                if (rec || !node || typeof node !== "object" || depth > 6 || seen.has(node)) return;
                seen.add(node);
                const obj = node as Record<string, unknown>;
                if ("_record_surface" in obj || "_case_employment" in obj) {
                    rec = obj;
                    return;
                }
                for (const v of Object.values(obj)) walk(v, depth + 1);
            };
            walk(json, 0);
            const r = (rec ?? {}) as Record<string, unknown>;
            return {
                status: res.status,
                head: text.slice(0, 120),
                foundRecord: rec !== null,
                recordSurface: r._record_surface ?? null,
                hasCaseEmployment: "_case_employment" in r,
                caseEmployment: r._case_employment ?? null,
                custPersons: Array.isArray(r._customer_persons) ? r._customer_persons.length : null,
            };
        }, host!.hostId);
        console.log(`[CERT A2 payload] ${JSON.stringify(payload)}`);

        // …elevated by the gesture's ASPECT, not merely present in the composition.
        await expect(
            page.locator('[data-focus-panel-grid-cell="employment"][data-fp-elevated="true"]'),
            "the Employment card composed but the staff gesture never focused it",
        ).toHaveCount(1, { timeout: SETTLE });

        // …and it answers about the person the operator pointed at.
        //
        // ⚠ Asserted on the RENDERED ANSWER, not on the card's wrapper element. An elevated card
        // exists twice — the focused copy and the receded grid cell it was raised from — and the
        // focused copy's wrapper does not satisfy Playwright's `:visible` box test, so locating by
        // wrapper waits forever on a card that is plainly on screen. The answer line is also the
        // thing the operator actually reads, which makes it the honest assertion.
        await expect(
            page.getByText(/Jane Smith\s+—\s+Lead Teacher/),
            "the Employment card is not answering about the staff member clicked",
        ).toBeVisible({ timeout: SETTLE });
        await expect(page.getByText("Part time").first()).toBeVisible({ timeout: SETTLE });

        await shot(page, "04-staff-employment-card");
    });

    test("A4 · a host the Work View does not page in is REFUSED in words, never substituted", async ({ page }) => {
        // Driven by COLD ENTRY (`?subject_id=` on the work-unit route), not by a click in Attendance.
        //
        // The claim here is about the platform's answer, not about Attendance's gesture: when a
        // record resolves a host that the Work View's evaluated page does not contain, the surface
        // must say so rather than quietly composing a different subject. That is the failure mode
        // that once let a suite report 8/8 while the operator was looking at somebody else's record.
        //
        // Cold entry is the one case where a URL may establish attention (Art 2.4), and it removes
        // this scenario's dependency on the subject also being on today's Attendance roster — a
        // coupling that broke it the moment the tenant was rebuilt.
        await page.goto("/workspace");
        await page.waitForLoadState("domcontentloaded");

        const host = await resolveHost(page, "persons", STAFF_NOT_ON_PAGE);
        expect(host, "expected a resolvable host for the lead-fixture person").not.toBeNull();

        const href = `/workspace/work-unit/${host!.workUnitKey.replace(/_/g, "-")}?subject_id=${host!.hostId}`;
        await page.goto(href);
        await page.waitForLoadState("domcontentloaded");

        // Typographic apostrophe in the product copy — match the words, not the glyph.
        await expect(
            page.getByText(/isn.t in this Work View/i),
            "the surface neither presented the record nor explained why",
        ).toBeVisible({ timeout: SETTLE });
        // Refusing is not the same as substituting: the removed overlay must not appear either.
        await expect(page.locator(MODAL)).toHaveCount(0);
        await shot(page, "05-work-view-refusal");
    });

    test("A3 · a person no active Work Unit hosts resolves to null, and nothing invents a destination", async ({
        page,
    }) => {
        await openAttendanceRoom(page);

        // A person with no household has no case, so no Work Unit holds them. The resolver must
        // say so plainly — this is the contract Attendance's non-navigable name depends on.
        const orphan = await page.evaluate(async () => {
            const res = await fetch("/api/admin/global-search?q=Testfamily", { credentials: "include" });
            return (await res.json()) as unknown;
        });
        console.log(`[CERT A3 search probe] ${JSON.stringify(orphan).slice(0, 300)}`);

        // A synthetic id cannot belong to any household — the resolver's honest answer is null.
        const nowhere = await resolveHost(page, "persons", "00000000-0000-4000-8000-0000000dead0");
        expect(nowhere, "the resolver invented a host for a record that has none").toBeNull();

        // And the UI's rule: a subject whose gesture answered false renders as text, not a control.
        const unreachable = page.locator("[data-attendance-staff-unreachable], [data-attendance-child-unreachable]");
        const openable = page.locator("[data-attendance-open-staff], [data-attendance-open-child]");
        const counts = { unreachable: await unreachable.count(), openable: await openable.count() };
        console.log(`[CERT A3 attendance affordances] ${JSON.stringify(counts)}`);
        // Every name is either a control or plain text — never a control that does nothing.
        for (const el of await unreachable.all()) {
            await expect(el).not.toHaveAttribute("type", "button");
        }
    });
});
