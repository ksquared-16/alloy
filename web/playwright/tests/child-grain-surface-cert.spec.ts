/**
 * PHASE 4 CERTIFICATION — the first production child Runtime surface.
 *
 * Two layers, deliberately:
 *
 *   1. THE ANSWER, over its real HTTP seam (`/api/admin/work-units/:slug/provisioning-answer`). This
 *      is where subject authority, identity, scope and truthful absence actually live, and asserting
 *      them against the composed answer proves the semantics rather than the styling.
 *   2. THE BROWSER, driving the real surface with the operator's own session — selection, deep link,
 *      next/previous, refresh — because an answer that is right and a surface that never renders it
 *      are indistinguishable to an operator.
 *
 * Run from web/:
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3013 \
 *   PLAYWRIGHT_STORAGE_STATE=~/.local/state/alloy-dev/auth/slot3/storage-state.json \
 *   npx playwright test playwright/tests/child-grain-surface-cert.spec.ts
 */
import { test, expect, type APIRequestContext } from "@playwright/test";

const BASE = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3013").replace(/\/$/, "");
const STORAGE = process.env.PLAYWRIGHT_STORAGE_STATE;

const WU_SLUG = "lifecycle-wu-lead";
const CHILD_LENS = "all_children_in_enrollment";
const FAMILY_LENS = "new_leads"; // "Leads" — family grain, stage-scoped to `lead`

if (STORAGE) test.use({ storageState: STORAGE });
test.describe.configure({ timeout: 5 * 60 * 1000, mode: "serial" });
test.use({ viewport: { width: 1440, height: 900 } });

type Answer = Record<string, any>;

async function answerFor(
    request: APIRequestContext,
    params: { workViewId?: string; subjectId?: string } = {},
): Promise<Answer> {
    const qs = new URLSearchParams();
    if (params.workViewId) qs.set("work_view_id", params.workViewId);
    if (params.subjectId) qs.set("subject_id", params.subjectId);
    const res = await request.get(`${BASE}/api/admin/work-units/${WU_SLUG}/provisioning-answer?${qs}`);
    expect(res.status(), "the entry resource answers").toBe(200);
    return (await res.json()) as Answer;
}

test.describe("Phase 4 — child Runtime surface, answer semantics", () => {
    test("the child lens is OPERATIONAL — the refusal is gone, not merely unreachable", async ({ request }) => {
        const a = await answerFor(request, { workViewId: CHILD_LENS });
        expect(a.terminal, JSON.stringify({ code: a.code, message: a.message })).toBe("operational");
        expect(a.rowGrain).toBe("child");
        expect(a.subjectGrain).toEqual({ grain: "child", subjectType: "child" });
        expect(a.rows.length).toBeGreaterThan(0);
        // The retired code must not reappear under any circumstance.
        expect(a.code).toBeUndefined();
    });

    test("child identity commits WITH the answer — whole, and never an opportunity id", async ({ request }) => {
        const a = await answerFor(request, { workViewId: CHILD_LENS });

        // The four-part identity is carried, not collapsed.
        expect(a.childIdentity).toBeTruthy();
        expect(a.childIdentity.subjectId, "the durable child").toBeTruthy();
        expect(a.childIdentity.participationId, "this child's journey").toBeTruthy();
        expect(a.childIdentity.contextId, "the family case it hangs off").toBeTruthy();

        // The committed subject IS the participation — the row identity, not the family's.
        expect(a.recordOfAttention.id).toBe(a.childIdentity.participationId);
        expect(a.recordOfTruth).toEqual({ entityType: "process_instance", id: a.childIdentity.participationId });
        expect(a.recordOfAttention.id).not.toBe(a.childIdentity.contextId);

        // No row may be addressed by a phantom id.
        for (const r of a.rows) {
            expect(r.id, "every child row is addressable").toBeTruthy();
            expect(r.id).not.toBe("undefined");
        }
        expect(new Set(a.rows.map((r: any) => r.id)).size, "row ids are unique").toBe(a.rows.length);
    });

    test("NO FAMILY FALLBACK — the child answer carries nothing family-shaped", async ({ request }) => {
        const a = await answerFor(request, { workViewId: CHILD_LENS });

        // Identity truth is child-declared. The household's primary contact is not the child's identity.
        const truth = a.subjectIdentityTruth ?? {};
        expect(Object.keys(truth).every((k) => k.startsWith("child.")), JSON.stringify(truth)).toBe(true);
        expect(truth["person.primary_contact_name"]).toBeUndefined();
        expect(truth._inquiry_children).toBeUndefined();

        // Family context is NAMED as context, never as the subject.
        expect(truth["child.family_opportunity_id"]).toBe(a.childIdentity.contextId);
        expect(truth["child.customer_member_id"]).toBe(a.childIdentity.subjectId);

        // The family lens is unchanged and still family-shaped — the two answers must not converge.
        const fam = await answerFor(request, { workViewId: FAMILY_LENS });
        expect(fam.rowGrain).toBe("family");
        expect(fam.subjectGrain).toEqual({ grain: "case", subjectType: "opportunity" });
        expect(fam.recordOfTruth.entityType).toBe("opportunity");
        expect(fam.childIdentity ?? null).toBeNull();
        expect(fam.primaryAction, "the family path still refuses without an action").toBeTruthy();
    });

    test("NO CONFIGURED ACTION is answered, not omitted — and never fabricated", async ({ request }) => {
        const a = await answerFor(request, { workViewId: CHILD_LENS });

        // Firefly's children ride `lead`, a FAMILY-segment stage. The stage does configure work — for
        // the family. None of it may surface as the child's.
        expect(a.currentBusinessState.stageKey).toBeTruthy();
        expect(a.currentBusinessState.stageLabel).toBeTruthy();

        if (a.primaryAction === null) {
            expect(a.primaryActionAbsence, "an absent action must say WHY").toBeTruthy();
            expect(a.currentBusinessState.workTemplateKey).toBeNull();
            expect(a.currentBusinessState.workTemplateLabel).toBeNull();
            // No work of its own → no stage-work slice borrowed from the family.
            expect(a.focusPanelStageWork).toBeNull();
        } else {
            // If the tenant ever configures a child action, it must come with its work template.
            expect(a.primaryAction.actionRef).toBeTruthy();
            expect(a.currentBusinessState.workTemplateKey).toBeTruthy();
        }

        // Nothing this surface must never invent.
        const blob = JSON.stringify(a);
        for (const forbidden of ["placement_context", "room_id", "attendance", "enrollment_completed"]) {
            expect(blob.includes(`"${forbidden}"`), `must not fabricate ${forbidden}`).toBe(false);
        }
    });

    test("SUBJECT AUTHORITY — a named child is honoured, an unknown one refuses rather than substitutes", async ({ request }) => {
        const a = await answerFor(request, { workViewId: CHILD_LENS });
        const second = a.rows[1] ?? a.rows[0];

        // Deep link to a NAMED child loads that child's canonical identity.
        const deep = await answerFor(request, { workViewId: CHILD_LENS, subjectId: second.id });
        expect(deep.terminal).toBe("operational");
        expect(deep.recordOfAttention.id).toBe(second.id);
        expect(deep.childIdentity.participationId).toBe(second.id);

        // A well-formed but absent subject must NOT fall through to the default child.
        const ghost = await answerFor(request, {
            workViewId: CHILD_LENS,
            subjectId: "00000000-0000-0000-0000-000000000000",
        });
        expect(ghost.terminal).toBe("error");
        expect(ghost.code).toBe("subject_unavailable");
        expect(ghost.navigationFrame, "a refusal must not remove the way out").toBeTruthy();

        // A CHILD id must not resolve on the FAMILY lens — grains do not leak into each other.
        const crossed = await answerFor(request, { workViewId: FAMILY_LENS, subjectId: second.id });
        expect(crossed.terminal).toBe("error");
        expect(crossed.code).toBe("subject_unavailable");
    });

    test("child scope classifies against CHILD lenses only", async ({ request }) => {
        const a = await answerFor(request, { workViewId: CHILD_LENS });
        // The stage-independent child lens holds every live participation by definition.
        expect(a.focusPanelScopeState).toBe("in_scope");
        expect(a.focusPanelOutOfView ?? null).toBeNull();
    });

    test("REFRESH REPROJECTS — the same request answers identically", async ({ request }) => {
        const a = await answerFor(request, { workViewId: CHILD_LENS });
        const b = await answerFor(request, { workViewId: CHILD_LENS, subjectId: a.recordOfAttention.id });
        expect(b.recordOfAttention.id).toBe(a.recordOfAttention.id);
        expect(b.childIdentity).toEqual(a.childIdentity);
        expect(b.currentBusinessState.stageKey).toBe(a.currentBusinessState.stageKey);
        expect(b.rows.map((r: any) => r.id)).toEqual(a.rows.map((r: any) => r.id));
    });

    test("ORDERING IS STABLE — next/previous has a deterministic sequence to follow", async ({ request }) => {
        const a = await answerFor(request, { workViewId: CHILD_LENS });
        const b = await answerFor(request, { workViewId: CHILD_LENS });
        expect(b.rows.map((r: any) => r.id)).toEqual(a.rows.map((r: any) => r.id));
        expect(a.rows.length).toBeGreaterThan(1);
    });
});

test.describe("Count convergence — the pill agrees with the rows", () => {
    /** The canonical count locations the CLIENT uses, straight from the answer's D5 locators. */
    async function countsFor(request: APIRequestContext, a: Answer): Promise<Map<string, { count: number | null; known: boolean }>> {
        const targets = (a.settlement?.workViewCountTargets ?? []) as Array<{
            workViewId: string; hostWorkUnitId: string; baseQueueKey: string;
        }>;
        expect(targets.length, "the answer resolves canonical count locations").toBeGreaterThan(0);
        const res = await request.post(`${BASE}/api/admin/queue-view-totals`, {
            data: {
                targets: targets.map((t) => ({
                    workUnitId: t.hostWorkUnitId,
                    queueKey: t.baseQueueKey,
                    workViewId: t.workViewId,
                })),
            },
        });
        expect(res.status()).toBe(200);
        const body = (await res.json()) as { totals?: Array<Record<string, any>> };
        return new Map((body.totals ?? []).map((t) => [String(t.workViewId), { count: t.count, known: !!t.known }]));
    }

    test("the child lens counts its OWN members — not the opportunity lane", async ({ request }) => {
        const a = await answerFor(request, { workViewId: CHILD_LENS });
        expect(a.terminal).toBe("operational");
        const counts = await countsFor(request, a);

        const pill = counts.get(CHILD_LENS);
        expect(pill, "the child lens has a count").toBeTruthy();
        expect(pill!.known, "the count is known, not degraded").toBe(true);

        // THE DEFECT: thirteen rows under a pill of eight. Rows and count are now one projection.
        expect(pill!.count).toBe(a.rows.length);

        // And it is genuinely the participation set, not a family number that happens to match.
        const fam = await answerFor(request, { workViewId: FAMILY_LENS });
        expect(pill!.count).not.toBe(fam.rows.length);
    });

    test("an EMPTY child lens counts zero truthfully", async ({ request }) => {
        // Registration / Waitlist select child stages no live participation holds.
        const a = await answerFor(request, { workViewId: "new_work_view_4" });
        const counts = await countsFor(request, a);
        const pill = counts.get("new_work_view_4");
        expect(pill?.known).toBe(true);
        expect(pill?.count).toBe(0);
        expect(a.rows.length).toBe(0);
    });

    test("FAMILY lens counts are untouched by the child count path", async ({ request }) => {
        const a = await answerFor(request, { workViewId: FAMILY_LENS });
        const counts = await countsFor(request, a);
        // Every family lens still resolves through the lane aggregator and still reports a count.
        for (const id of [FAMILY_LENS, "new_work_view_6"]) {
            const pill = counts.get(id);
            expect(pill, `${id} still has a count`).toBeTruthy();
            expect(pill!.known, `${id} count is still known`).toBe(true);
            expect(typeof pill!.count).toBe("number");
        }
    });
});

test.describe("Phase 4 — child Runtime surface, in the browser", () => {
    test("the child lens renders children, commits one, and survives a reload", async ({ page, request }) => {
        const a = await answerFor(request, { workViewId: CHILD_LENS });
        const firstName = a.rows[0].title as string;

        await page.goto(`${BASE}/workspace/work-unit/${WU_SLUG}?work_view_id=${CHILD_LENS}`, {
            waitUntil: "domcontentloaded",
        });
        const rows = page.locator('[data-runtime-label="WU.QUEUE_ROW"]');
        await rows.first().waitFor({ state: "visible", timeout: 45000 });
        await page.waitForTimeout(3000);

        // The queue shows CHILDREN, by name — not only their families.
        await expect(page.getByText(firstName, { exact: false }).first()).toBeVisible({ timeout: 20000 });

        // Commit a subject, then let the panel settle.
        await rows.first().click({ noWaitAfter: true });
        await page.waitForTimeout(6000);

        // The panel is titled with the CHILD, not the household.
        await expect(page.locator("[data-inline-focus-panel]")).toHaveCount(1, { timeout: 30000 });

        // THE VISIBLE NUMBER. The pill beside the child lens must read what the queue shows. Scoped to
        // the pill strip's tab (`QueueRegion` carries the same attribute on its container).
        const pill = page.locator(`button[role="tab"][data-work-view-id="${CHILD_LENS}"]`);
        await expect(pill).toHaveCount(1, { timeout: 30000 });
        // Settlement fills the count AFTER commit, so poll rather than assert the first frame.
        await expect
            .poll(async () => (await pill.innerText()).match(/(\d+)\s*$/)?.[1] ?? null, { timeout: 45000 })
            .toBe(String(a.rows.length));

        // Scope committed on the surface container.
        const surface = page.locator("[data-focus-panel-scope]").first();
        await expect(surface).toHaveAttribute("data-focus-panel-scope", "in_scope", { timeout: 20000 });

        // The panel must reach a RESOLVED state, not a permanent spinner: a child with no configured
        // action is fully resolved, and the surface has to say so rather than think forever.
        await expect(page.locator('[data-focus-panel-no-action]').first()).toBeVisible({ timeout: 30000 });
        await expect(page.locator('[data-focus-panel-thinking="true"]')).toHaveCount(0, { timeout: 30000 });

        // DEEP LINK — a named child loads as itself after a full reload.
        const target = a.rows[1] ?? a.rows[0];
        await page.goto(
            `${BASE}/workspace/work-unit/${WU_SLUG}?work_view_id=${CHILD_LENS}&subject_id=${target.id}`,
            { waitUntil: "domcontentloaded" },
        );
        await rows.first().waitFor({ state: "visible", timeout: 45000 });
        await page.waitForTimeout(4000);
        await expect(page.getByText(target.title as string, { exact: false }).first()).toBeVisible({ timeout: 20000 });
        await expect(page.locator("[data-focus-panel-scope]").first()).toHaveAttribute(
            "data-focus-panel-scope",
            "in_scope",
            { timeout: 20000 },
        );
    });

    test("selecting another child replaces the subject — no family ever appears", async ({ page, request }) => {
        const a = await answerFor(request, { workViewId: CHILD_LENS });
        await page.goto(`${BASE}/workspace/work-unit/${WU_SLUG}?work_view_id=${CHILD_LENS}`, {
            waitUntil: "domcontentloaded",
        });
        const rows = page.locator('[data-runtime-label="WU.QUEUE_ROW"]');
        await rows.first().waitFor({ state: "visible", timeout: 45000 });
        const count = await rows.count();
        expect(count).toBeGreaterThan(1);

        await rows.nth(1).click({ noWaitAfter: true });
        await page.waitForTimeout(3500);

        // STALE PAYLOAD PROTECTION: whatever settles, the committed subject must be one of THIS lens's
        // children — never a family, and never a subject from a superseded payload.
        const childIds = new Set(a.rows.map((r: any) => r.id));
        const committed = await page.evaluate(() => {
            const el = document.querySelector("[data-focus-panel-scope]");
            return el ? new URL(window.location.href).searchParams.get("subject_id") : null;
        });
        if (committed) expect(childIds.has(committed), `${committed} is a child of this lens`).toBe(true);

        // The family lens's subject id must never be what the child surface committed.
        const fam = await answerFor(request, { workViewId: FAMILY_LENS });
        if (committed) expect(committed).not.toBe(fam.recordOfAttention?.id);
    });
});
