import { test, expect, type Page } from "@playwright/test";

/**
 * WORK VIEW ROW IDENTITY — the handoff, in a browser.
 *
 * The defect: a truthful Waitlist destination committed the view and then refused with
 * "That record isn't in this Work View". Two causes — the HOST was sent where the runtime asked for
 * the ROW, and membership was being answered by PAGINATION.
 *
 * ── WHAT COUNTS AS PROOF ──
 *
 * Not a changed URL, not a lit pill, and NOT the mere absence of the error banner. A pass requires the
 * exact operational member to validate AND the surface to compose. Every scenario below asserts
 * composition (cells > 0) and asserts the banner is absent as a separate, explicit check.
 *
 * ── THE PAGINATION SCENARIO IS SELF-VERIFYING ──
 *
 * Below `PROVISIONING_ROW_PAGE_CAP` the published page and the membership are the SAME set, so a small
 * tenant cannot tell the repair from the defect. The test therefore proves its own premise: it selects
 * a member, asserts that member is ABSENT from the published page, and only then proves navigation to
 * it succeeds. If the tenant is too small the test fails rather than passing vacuously.
 */

const OPERATOR = { email: "qa.operator@northwind.invalid", password: "alloy-local-cert" };
const LOGIN_WAIT = Number(process.env.CERT_AUTH_WAIT_MS || 300_000);
const SETTLE = 60_000;
const UNIT = "enrollment_pipeline";

/** Seeded siblings — one household, two children, two child stages. */
const SIBLING_WAITLIST = "00000000-0000-4000-8000-30000000011c";
const SIBLING_ENROLLING = "00000000-0000-4000-8000-3000000005cc";

test.use({ storageState: undefined });

async function signIn(page: Page) {
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(OPERATOR.email);
    const pw = page.locator('input[type="password"]').first();
    await pw.fill(OPERATOR.password);
    await pw.press("Enter");
    await page.waitForURL("**/workspace**", { timeout: LOGIN_WAIT });
}

type Dest = {
    key: string;
    label: string;
    host_work_view_id: string | null;
    host_work_unit_key: string | null;
    host_entity_id: string | null;
    operational_member_id: string | null;
    item_id: string | null;
};

async function search(page: Page, query: string) {
    return page.evaluate(async (q: string) => {
        const res = await fetch(`/api/admin/global-search?q=${encodeURIComponent(q)}`, {
            credentials: "include",
        });
        const body = (await res.json()) as Record<string, unknown>;
        return ((body.results ?? []) as Array<Record<string, unknown>>).map((r) => ({
            subject: (r.subject ?? {}) as Record<string, unknown>,
            destinations: ((r.destinations ?? []) as Array<Record<string, unknown>>).map((d) => ({
                key: String(d.key ?? ""),
                label: String(d.label ?? ""),
                host_work_view_id: (d.host_work_view_id as string) ?? null,
                host_work_unit_key: (d.host_work_unit_key as string) ?? null,
                host_entity_id: (d.host_entity_id as string) ?? null,
                operational_member_id: (d.operational_member_id as string) ?? null,
                item_id: (d.item_id as string) ?? null,
            })) as Dest[],
        }));
    }, query);
}

/** The member ids the answer actually PUBLISHES for a view — the capped page. */
async function publishedPageMemberIds(page: Page, viewId: string): Promise<string[]> {
    return page.evaluate(
        async ([unit, id]: string[]) => {
            const res = await fetch(
                `/api/admin/work-units/${unit}/provisioning-answer?work_view_id=${encodeURIComponent(id!)}`,
                { credentials: "include" },
            );
            const body = (await res.json()) as Record<string, unknown>;
            const answer = (body.answer ?? body) as Record<string, unknown>;
            const rows = (answer.rows ?? []) as Array<Record<string, unknown>>;
            return rows.map((r) => String(r.id ?? r.entityId ?? ""));
        },
        [UNIT, viewId],
    );
}

/** Ask the runtime directly whether it will select a given member in a given view. */
async function terminalFor(page: Page, viewId: string, subjectId: string | null) {
    return page.evaluate(
        async ([unit, id, subject]: Array<string | null>) => {
            const qs = new URLSearchParams({ work_view_id: id! });
            if (subject) qs.set("subject_id", subject);
            const res = await fetch(`/api/admin/work-units/${unit}/provisioning-answer?${qs}`, {
                credentials: "include",
            });
            const body = (await res.json()) as Record<string, unknown>;
            const answer = (body.answer ?? body) as Record<string, unknown>;
            return {
                terminal: (answer.terminal as string) ?? null,
                code: (answer.code as string) ?? null,
                recordOfAttention:
                    ((answer.recordOfAttention as Record<string, unknown>)?.id as string) ?? null,
            };
        },
        [UNIT, viewId, subjectId],
    );
}

const composedCells = (page: Page) =>
    page.evaluate(() => document.querySelectorAll("[data-focus-panel-grid-cell]").length);

const selectedPill = (page: Page) =>
    page.evaluate(
        () =>
            document
                .querySelector("button[data-work-view-id][aria-selected='true']")
                ?.getAttribute("data-work-view-id") ?? null,
    );

/** The refusal banner, asserted as its own explicit check — absence of it is necessary, not sufficient. */
async function membershipErrorText(page: Page): Promise<string | null> {
    return page.evaluate(() => {
        const text = document.body?.innerText ?? "";
        const marker = "isn't in this Work View";
        if (!text.includes(marker) && !text.includes("not present in this work unit")) return null;
        return text.split("\n").find((l) => l.includes(marker) || l.includes("not present")) ?? marker;
    });
}

async function assertNoModal(page: Page) {
    const modals = await page.evaluate(
        () => document.querySelectorAll('[role="dialog"], [data-alloy-drawer]').length,
    );
    expect(modals, "a destination opened a modal/drawer").toBe(0);
}

/**
 * THE FULL PASS. Navigate to a destination and require everything a real commit produces.
 */
async function proveDestination(page: Page, destination: Dest, label: string) {
    const viewId = destination.host_work_view_id!;
    const member = destination.operational_member_id!;
    expect(viewId, `${label}: destination names no Work View`).toBeTruthy();
    expect(member, `${label}: destination names no operational member`).toBeTruthy();

    const qs = new URLSearchParams({ work_view_id: viewId, subject_id: member });
    await page.goto(`/workspace/work-unit/${destination.host_work_unit_key}?${qs}`);
    await page.locator("button[data-work-view-id]").first().waitFor({ timeout: 180_000 });

    // 1. the exact member validated — the runtime's own record of attention IS this member
    const answer = await terminalFor(page, viewId, member);
    expect(answer.terminal, `${label}: terminal ${answer.terminal}/${answer.code}`).toBe("operational");
    expect(answer.recordOfAttention, `${label}: runtime selected a different member`).toBe(member);

    // 2. no refusal banner — explicit, and separate from the terminal
    await expect
        .poll(async () => await membershipErrorText(page), { timeout: SETTLE })
        .toBeNull();

    // 3. the view actually committed
    await expect
        .poll(async () => await selectedPill(page), {
            timeout: SETTLE,
            message: `${label}: pill never became selected`,
        })
        .toBe(viewId);

    // 4. useful composition — the observable only a real commit produces
    await expect
        .poll(async () => await composedCells(page), {
            timeout: SETTLE,
            message: `${label}: committed but composed nothing`,
        })
        .toBeGreaterThan(0);

    await assertNoModal(page);
    console.log(
        `[RID ${label}] view=${viewId} member=${member} host=${destination.host_entity_id} item=${destination.item_id} attention=${answer.recordOfAttention}`,
    );
}

test("A — a child's Work View destination selects its PARTICIPATION and composes", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 900_000);
    await signIn(page);

    const results = await search(page, "Quinn Testfamily-0284");
    const hit = results.find((r) => String(r.subject.id ?? "") === SIBLING_WAITLIST);
    expect(hit, "the waitlisted sibling is not searchable").toBeTruthy();

    const destination = hit!.destinations.find((d) => d.key.startsWith("work_view:"));
    expect(destination, "no Work View destination offered").toBeTruthy();

    // THE SEPARATION: member, host and ASPECT item are three different objects for a child.
    expect(destination!.operational_member_id).toBeTruthy();
    expect(destination!.operational_member_id).not.toBe(destination!.host_entity_id);
    expect(destination!.operational_member_id).not.toBe(destination!.item_id);
    expect(destination!.item_id).toBe(SIBLING_WAITLIST);

    await proveDestination(page, destination!, "A child");
});

test("B — the sibling selects a DIFFERENT member on the same host", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 900_000);
    await signIn(page);

    const results = await search(page, "Quinn Testfamily-0284");
    const a = results.find((r) => String(r.subject.id ?? "") === SIBLING_WAITLIST);
    const b = results.find((r) => String(r.subject.id ?? "") === SIBLING_ENROLLING);
    expect(b, "the enrolling sibling is not searchable").toBeTruthy();

    const da = a!.destinations.find((d) => d.key.startsWith("work_view:"))!;
    const db = b!.destinations.find((d) => d.key.startsWith("work_view:"))!;

    // Same household, same case — different participations. A shared host must not collapse them.
    expect(db.operational_member_id).not.toBe(da.operational_member_id);
    expect(db.host_entity_id).toBe(da.host_entity_id);
    expect(db.item_id).toBe(SIBLING_ENROLLING);

    await proveDestination(page, db, "B sibling");
});

test("D — a member BEYOND the published page still navigates", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 900_000);
    await signIn(page);

    // The stage-independent child inventory lens holds every live participation, so it is the lens
    // that can exceed the cap.
    const published = await publishedPageMemberIds(page, "all_children");
    console.log(`[RID pagination] published page holds ${published.length} rows`);

    // Find a searchable child whose member is NOT on the published page. Proving this premise is what
    // stops the test passing vacuously in a tenant too small to exhibit the defect.
    const results = await search(page, "Testfamily");
    let offPage: Dest | null = null;
    for (const result of results) {
        const dest = result.destinations.find(
            (d) => d.host_work_view_id === "all_children" && d.operational_member_id,
        );
        if (dest && !published.includes(dest.operational_member_id!)) {
            offPage = dest;
            break;
        }
    }

    expect(
        offPage,
        `no searchable child sits beyond the published page (${published.length} rows) — the tenant is too small for this scenario to prove anything; run 06-oversized-child-cohort.sql`,
    ).toBeTruthy();

    console.log(`[RID pagination] off-page member=${offPage!.operational_member_id}`);
    await proveDestination(page, offPage!, "D off-page");
});

test("D2 — a bogus member is still refused, fail-closed", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 600_000);
    await signIn(page);

    // The repair widened SELECTABILITY to true membership. It must not have widened it to anything
    // else — an id naming no member still refuses, and nothing is substituted.
    const bogus = await terminalFor(page, "all_children", "00000000-0000-4000-8000-ffffffffffff");
    console.log(`[RID fail-closed] ${JSON.stringify(bogus)}`);
    expect(bogus.terminal).toBe("error");
    expect(bogus.code).toBe("subject_unavailable");
    expect(bogus.recordOfAttention).toBeNull();

    // And a FAMILY id is not a member of a CHILD lens — the original defect, still refused.
    const results = await search(page, "Quinn Testfamily-0284");
    const hit = results.find((r) => String(r.subject.id ?? "") === SIBLING_WAITLIST);
    const caseId = hit!.destinations.find((d) => d.key.startsWith("work_view:"))!.host_entity_id!;
    const asHost = await terminalFor(page, "all_children", caseId);
    console.log(`[RID fail-closed host-as-subject] ${JSON.stringify(asHost)}`);
    expect(asHost.terminal).toBe("error");
});

test("C — a family destination selects the CASE", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 900_000);
    await signIn(page);

    const results = await search(page, "Testfamily-0284");
    const household = results.find((r) => String(r.subject.kind ?? "") !== "child");
    test.skip(!household, "no household subject surfaced for this query in the cert tenant");

    const destination = household!.destinations.find((d) => d.key.startsWith("work_view:"));
    test.skip(!destination, "the household holds no operational family-grain cohort in this tenant");

    // At family grain the member IS the host — that coincidence is why the child bug hid so long.
    expect(destination!.operational_member_id).toBe(destination!.host_entity_id);
    expect(destination!.item_id ?? null).toBeNull();

    await proveDestination(page, destination!, "C family");
});

test("E — rapid switch: the LAST child wins everywhere", async ({ page }) => {
    test.setTimeout(LOGIN_WAIT + 900_000);
    await signIn(page);

    const results = await search(page, "Quinn Testfamily-0284");
    const a = results.find((r) => String(r.subject.id ?? "") === SIBLING_WAITLIST)!;
    const b = results.find((r) => String(r.subject.id ?? "") === SIBLING_ENROLLING)!;
    const da = a.destinations.find((d) => d.key.startsWith("work_view:"))!;
    const db = b.destinations.find((d) => d.key.startsWith("work_view:"))!;

    // Enter the first, then immediately the second, with no settle between.
    await page.goto(
        `/workspace/work-unit/${da.host_work_unit_key}?work_view_id=${da.host_work_view_id}&subject_id=${da.operational_member_id}`,
    );
    await page.goto(
        `/workspace/work-unit/${db.host_work_unit_key}?work_view_id=${db.host_work_view_id}&subject_id=${db.operational_member_id}`,
    );
    await page.locator("button[data-work-view-id]").first().waitFor({ timeout: 180_000 });

    const answer = await terminalFor(page, db.host_work_view_id!, db.operational_member_id!);
    expect(answer.recordOfAttention, "a stale first selection won").toBe(db.operational_member_id);
    expect(await membershipErrorText(page)).toBeNull();
    await expect.poll(async () => await composedCells(page), { timeout: SETTLE }).toBeGreaterThan(0);
    console.log(`[RID rapid] final member=${answer.recordOfAttention}`);
});
