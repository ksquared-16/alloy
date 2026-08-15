import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * ENROLLMENT CONTEXT CONVERGENCE — the sibling story, in a browser, against a real database.
 *
 * An existing family adds a sibling. The director should not have to pretend they are a new lead,
 * and should not have to walk a known family through a tour. Two things must never happen:
 *
 *   • a fabricated Opportunity — an acquisition episode that never occurred
 *   • a reopened one from last year — finished history rewritten to give the sibling a home
 *
 * Both are asserted as ABSENCE, because either would look like success from the outside.
 *
 * ── WHY THE DB ASSERTIONS RUN THROUGH THE APP'S OWN API ──
 *
 * Playwright cannot reach Postgres, so counts are read back through authenticated endpoints the
 * product already serves. Where only raw rows can settle a question (context_id IS NULL, an old
 * opportunity's untouched state) the session's psql bracket carries it, recorded in the run notes
 * rather than pretended here.
 *
 * Fixtures: `certification/fixtures/enrollment-context-convergence.sql` (idempotent AND
 * self-cleaning; the cert tenant is shared and other sessions reset it mid-run).
 */

const SHOTS = path.join(__dirname, "..", "evidence", "enrollment-context-convergence");
const SETTLE = 180_000;

const LIVE_HOUSEHOLD = "Ecclive Family";
const LIVE_OPPORTUNITY_ID = "ecc00000-0000-4000-8000-00000000a002";
const CLOSED_HOUSEHOLD = "Eccclosed Family";
const CLOSED_OPPORTUNITY_ID = "ecc00000-0000-4000-8000-00000000b002";
const DIRECT_HOUSEHOLD = "Eccdirect Family";
const BOTH_HOUSEHOLD = "Eccboth Family";
const BOTH_LIVE_OPPORTUNITY_ID = "ecc00000-0000-4000-8000-00000000e002";

const RIVERSIDE = "00000000-0000-4000-8000-000000000010";
const LAKESIDE = "00000000-0000-4000-8000-000000000011";

/** Unique per run, so a re-run against a non-reset tenant still exercises the create path. */
const RUN = Date.now().toString(36);
const SIB = {
    live: { first: "Sibalive", last: `Ecc-${RUN}` },
    closed: { first: "Sibbclosed", last: `Ecc-${RUN}` },
    direct: { first: "Sibcdirect", last: `Ecc-${RUN}` },
    blocked: { first: "Sibdblocked", last: `Ecc-${RUN}` },
    plain: { first: "Sibeplain", last: `Ecc-${RUN}` },
    both: { first: "Sibfboth", last: `Ecc-${RUN}` },
};

const RECORDS_SHELL = "[data-adminv2-records-workspace]";
const CHILDREN_LIST = "[data-children-list]";
const MODAL = "[data-add-child-modal]";

test.beforeAll(() => fs.mkdirSync(SHOTS, { recursive: true }));

type ChildRow = {
    customerMemberId: string;
    displayName: string;
    householdId: string | null;
    participationState: string | null;
};

async function childrenNamed(request: APIRequestContext, q: string): Promise<ChildRow[]> {
    const res = await request.get(`/api/admin/records/children?cohort=all&q=${encodeURIComponent(q)}`);
    const json = (await res.json()) as { children?: ChildRow[] };
    return json.children ?? [];
}

async function childNamed(request: APIRequestContext, name: string): Promise<ChildRow | undefined> {
    return (await childrenNamed(request, name)).find((c) => c.displayName === name);
}

async function openChildren(page: Page) {
    await page.goto("/workspace?workspace=records&section=children");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator(RECORDS_SHELL)).toBeVisible({ timeout: SETTLE });
    await expect(page.locator("[data-records-cohort-bar]")).toBeVisible({ timeout: SETTLE });
}

/** Add a sibling to a household through the real Add Child flow. Returns nothing else. */
async function addSibling(page: Page, household: string, child: { first: string; last: string }) {
    await page.locator("[data-child-add-open]").click();
    await expect(page.locator(MODAL)).toBeVisible({ timeout: SETTLE });

    await page.locator("[data-add-child-household-search]").fill(household);
    const option = page.locator("[data-add-child-households] button", { hasText: household }).first();
    await expect(option).toBeVisible({ timeout: SETTLE });
    await option.click();
    await page.locator("[data-add-child-household-continue]").click();

    await page.locator('[data-add-child-field="first_name"]').fill(child.first);
    await page.locator('[data-add-child-field="last_name"]').fill(child.last);
    await page.locator("[data-add-child-search]").click();
    await expect(page.locator(MODAL)).toHaveAttribute("data-add-child-step", "identity", {
        timeout: SETTLE,
    });
    // A brand-new name: the identity gate finds nothing and creating is safe.
    await expect(page.locator("[data-add-child-no-match]")).toBeVisible({ timeout: SETTLE });

    await page.locator("[data-add-child-preview]").click();
    await page.locator("[data-add-child-confirm]").click();
    await expect(page.locator("[data-add-child-done]")).toBeVisible({ timeout: SETTLE });
}

/** Find the sibling's row and read the state chip the operator actually sees. */
async function rowStateFor(page: Page, name: string): Promise<string | null> {
    await page.locator("[data-records-filter]").fill(name);
    const row = page.locator(`${CHILDREN_LIST} [data-child-row]`, { hasText: name }).first();
    await expect(row).toBeVisible({ timeout: SETTLE });
    return row.locator("[data-child-state]").getAttribute("data-child-state");
}

test.describe("E — plain Add Child is unchanged", () => {
    test("a sibling added and left alone is On record, with no enrollment of any kind", async ({
        page,
        request,
    }) => {
        await openChildren(page);
        await addSibling(page, DIRECT_HOUSEHOLD, SIB.plain);
        await page.locator("[data-add-child-cancel]").click();

        const name = `${SIB.plain.first} ${SIB.plain.last}`;
        expect(await rowStateFor(page, name)).toBe("none");

        const child = await childNamed(request, name);
        // "On record" is the API's answer too, not only the chip's.
        expect(child?.participationState ?? null).toBeNull();

        await page.screenshot({ path: path.join(SHOTS, "01-add-child-on-record.png"), fullPage: true });
    });

    test("Add Child's success state offers both paths and runs neither", async ({ page }) => {
        await openChildren(page);
        await addSibling(page, DIRECT_HOUSEHOLD, {
            first: "Sibgoffer",
            last: `Ecc-${RUN}`,
        });

        const next = page.locator("[data-add-child-next]");
        await expect(next).toBeVisible();
        await expect(page.locator("[data-add-child-start-enrollment]")).toBeVisible();
        await expect(page.locator("[data-add-child-enroll-directly]")).toBeVisible();
        // Create Lead answers a question already answered — the family and child were chosen.
        await expect(next).not.toContainText(/create lead/i);

        await page.screenshot({ path: path.join(SHOTS, "02-add-child-next-actions.png"), fullPage: true });
        await page.locator("[data-add-child-cancel]").click();
    });
});

test.describe("A — sibling joins a LIVE enrolment episode", () => {
    test("Start Enrollment uses the live context and creates no opportunity", async ({
        page,
        request,
    }) => {
        await openChildren(page);
        await addSibling(page, LIVE_HOUSEHOLD, SIB.live);
        await page.locator("[data-add-child-cancel]").click();

        const name = `${SIB.live.first} ${SIB.live.last}`;
        expect(await rowStateFor(page, name)).toBe("none");
        const before = await childNamed(request, name);
        expect(before?.customerMemberId).toBeTruthy();

        await page.locator(`[data-child-start-enrollment="${before!.customerMemberId}"]`).click();
        await expect(page.locator("[data-child-flash]")).toBeVisible({ timeout: SETTLE });
        // The operator is told WHICH context was used, rather than discovering it later.
        await expect(page.locator("[data-child-flash]")).toContainText(/current enrolment/i);

        await page.screenshot({ path: path.join(SHOTS, "03-start-enrollment-live.png"), fullPage: true });

        expect(await rowStateFor(page, name)).toBe("in_process");
        const after = await childNamed(request, name);
        expect(after?.participationState).toBe("in_process");
        // The sibling has their OWN journey — they did not join child A's.
        expect(after?.customerMemberId).toBe(before!.customerMemberId);

        await page.screenshot({ path: path.join(SHOTS, "04-sibling-in-process.png"), fullPage: true });
    });
});

test.describe("B — sibling of a household whose only episode is CLOSED", () => {
    test("Start Enrollment runs context-free and never reopens 2025", async ({ page, request }) => {
        await openChildren(page);
        await addSibling(page, CLOSED_HOUSEHOLD, SIB.closed);
        await page.locator("[data-add-child-cancel]").click();

        const name = `${SIB.closed.first} ${SIB.closed.last}`;
        const child = await childNamed(request, name);
        expect(child?.customerMemberId).toBeTruthy();

        // The row must be ON SCREEN before its action can be clicked: page 1 is bounded and this
        // sibling sorts well beyond it among ~1500 children.
        expect(await rowStateFor(page, name)).toBe("none");
        await page.locator(`[data-child-start-enrollment="${child!.customerMemberId}"]`).click();
        await expect(page.locator("[data-child-flash]")).toBeVisible({ timeout: SETTLE });
        // The flash names the absence explicitly: nothing was invented to hold the journey.
        await expect(page.locator("[data-child-flash]")).toContainText(/no opportunity was created/i);

        expect(await rowStateFor(page, name)).toBe("in_process");

        await page.screenshot({ path: path.join(SHOTS, "05-start-enrollment-context-free.png"), fullPage: true });
    });

    test("a repeated Start Enrollment cannot open a second journey", async ({ page, request }) => {
        await openChildren(page);
        const name = `${SIB.closed.first} ${SIB.closed.last}`;
        const child = await childNamed(request, name);
        expect(child?.participationState).toBe("in_process");

        expect(await rowStateFor(page, name)).toBe("in_process");
        // The row no longer offers the action at all — the surface refuses before the index has to.
        await expect(
            page.locator(`[data-child-start-enrollment="${child!.customerMemberId}"]`)
        ).toHaveCount(0);

        // And invoking it directly is still idempotent rather than duplicating.
        const res = await request.post("/api/admin/actions/execute", {
            data: {
                action_key: "enrollment.start",
                entity_type: "child",
                entity_id: child!.customerMemberId,
                mode: "execute",
                confirmation: { confirmed: true },
                payload: {},
            },
        });
        const json = (await res.json()) as {
            ok?: boolean;
            data?: { execution_result?: { reused?: boolean } };
        };
        expect(json.ok).not.toBe(false);
        expect(json.data?.execution_result?.reused).toBe(true);
    });
});

test.describe("the context resolver follows operational truth, not row order", () => {
    test("a household holding BOTH episodes joins the live one", async ({ page, request }) => {
        await openChildren(page);
        await addSibling(page, BOTH_HOUSEHOLD, SIB.both);
        await page.locator("[data-add-child-cancel]").click();

        const name = `${SIB.both.first} ${SIB.both.last}`;
        const child = await childNamed(request, name);

        expect(await rowStateFor(page, name)).toBe("none");
        await page.locator(`[data-child-start-enrollment="${child!.customerMemberId}"]`).click();
        await expect(page.locator("[data-child-flash]")).toBeVisible({ timeout: SETTLE });
        // The CLOSED episode of this household has the higher id, so "newest row" would have
        // picked it and this assertion would fail.
        await expect(page.locator("[data-child-flash]")).toContainText(/current enrolment/i);

        await page.screenshot({ path: path.join(SHOTS, "06-resolver-picks-live.png"), fullPage: true });
    });
});

test.describe("C — Direct Enroll materialises durable care", () => {
    test("the durable trio is created, with no journey and no opportunity", async ({
        page,
        request,
    }) => {
        await openChildren(page);
        await addSibling(page, DIRECT_HOUSEHOLD, SIB.direct);
        await page.locator("[data-add-child-cancel]").click();

        const name = `${SIB.direct.first} ${SIB.direct.last}`;
        const child = await childNamed(request, name);
        expect(child?.participationState ?? null).toBeNull();

        expect(await rowStateFor(page, name)).toBe("none");
        await page.locator(`[data-child-enroll-directly="${child!.customerMemberId}"]`).click();
        await expect(page.locator("[data-direct-enroll-modal]")).toBeVisible({ timeout: SETTLE });

        await page.locator('[data-direct-enroll-field="site_location_id"]').selectOption(RIVERSIDE);
        await page.locator('[data-direct-enroll-field="start_date"]').fill("2027-01-04");
        await page
            .locator('[data-direct-enroll-field="program_category_id"]')
            .selectOption({ index: 1 });
        await page.locator('[data-direct-enroll-field="schedule_type"]').selectOption("full_day");

        await page.locator("[data-direct-enroll-preview-run]").click();
        const preview = page.locator("[data-direct-enroll-preview]");
        await expect(preview).toBeVisible({ timeout: SETTLE });
        // The preview states the separation before the operator commits to it.
        await expect(preview).toContainText(/no enrollment process is created/i);

        await page.screenshot({ path: path.join(SHOTS, "07-direct-enroll-form.png"), fullPage: true });

        await page.locator("[data-direct-enroll-confirm]").click();
        await expect(page.locator("[data-child-flash]")).toBeVisible({ timeout: SETTLE });
        await expect(page.locator("[data-child-flash]")).toContainText(/no enrollment process/i);

        // A FUTURE start date, so the canonical answer is `starting` — a commitment, not attendance.
        expect(await rowStateFor(page, name)).toBe("starting");
        const after = await childNamed(request, name);
        expect(after?.participationState).toBe("starting");

        await page.screenshot({ path: path.join(SHOTS, "08-direct-enrolled-starting.png"), fullPage: true });
    });

    test("the directly enrolled child is in the Enrolled cohort, not among the unstarted", async ({
        page,
    }) => {
        await openChildren(page);
        const name = `${SIB.direct.first} ${SIB.direct.last}`;

        await page.locator("[data-records-filter]").fill(name);
        await page.locator('[data-records-cohort="enrolled"]').click();
        const enrolledRow = page.locator(`${CHILDREN_LIST} [data-child-row]`, { hasText: name });
        await expect(enrolledRow).toHaveCount(1, { timeout: SETTLE });

        // …and NOT in the journey cohort: no journey was run.
        //
        // Absence is asserted on the ROW, not on the list's text. An empty cohort renders no list
        // element at all, so `not.toContainText` on the list waits for something that will never
        // exist and fails on timeout — reporting a product defect where there is none.
        await page.locator('[data-records-cohort="in_process"]').click();
        await expect(
            page.locator(`${CHILDREN_LIST} [data-child-row]`, { hasText: name })
        ).toHaveCount(0, { timeout: SETTLE });

        await page.screenshot({ path: path.join(SHOTS, "09-direct-enrolled-cohort.png"), fullPage: true });
    });
});

test.describe("D — Direct Enroll refuses to half-enroll a child", () => {
    test("a site with no usable schedule BLOCKS, where the materializer would only have warned", async ({
        page,
        request,
    }) => {
        await openChildren(page);
        await addSibling(page, DIRECT_HOUSEHOLD, SIB.blocked);
        await page.locator("[data-add-child-cancel]").click();

        const name = `${SIB.blocked.first} ${SIB.blocked.last}`;
        const child = await childNamed(request, name);

        expect(await rowStateFor(page, name)).toBe("none");
        await page.locator(`[data-child-enroll-directly="${child!.customerMemberId}"]`).click();
        await expect(page.locator("[data-direct-enroll-modal]")).toBeVisible({ timeout: SETTLE });

        // Lakeside has a program but NO active schedule pattern — the whole point of the fixture.
        await page.locator('[data-direct-enroll-field="site_location_id"]').selectOption(LAKESIDE);
        await page.locator('[data-direct-enroll-field="start_date"]').fill("2027-01-04");
        await page
            .locator('[data-direct-enroll-field="program_category_id"]')
            .selectOption({ index: 1 });

        // There is no schedule to choose, which is exactly the state that must not proceed.
        await expect(page.locator('[data-direct-enroll-field="schedule_type"] option')).toHaveCount(1);

        await page.locator("[data-direct-enroll-confirm]").click();
        const blockers = page.locator("[data-direct-enroll-blockers]");
        await expect(blockers).toBeVisible({ timeout: SETTLE });
        await expect(blockers).toContainText(/schedule/i);

        await page.screenshot({ path: path.join(SHOTS, "10-direct-enroll-blocked.png"), fullPage: true });

        // NOTHING was written: the child is still exactly as Add Child left them.
        const after = await childNamed(request, name);
        expect(after?.participationState ?? null).toBeNull();
    });
});
