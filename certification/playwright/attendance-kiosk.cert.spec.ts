import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * THREAD 5 — the Attendance kiosk, in a real browser at a real tablet size.
 *
 * ── WHY SO MUCH OF THIS IS API-LEVEL ──
 *
 * A kiosk's value is mostly in what it REFUSES, and a refusal proven only by a
 * disabled button proves nothing: the question is whether the server refuses when
 * the browser is bypassed. So the denial scenarios drive the deployed routes
 * directly with manipulated payloads, and every one of them then asserts that
 * ZERO attendance facts exist for that child — read back through the admin API,
 * not inferred from a screen.
 *
 * The success scenarios do the opposite: real touch interaction at 768px, then
 * the persisted fact, then the operator's own workspace.
 *
 * ── FIXTURE ──
 *
 * `certification/kiosk/01-kiosk-fixture.sql`. Every denial subject is a NEAR-MISS
 * — everything present except the one fact under test — so a green run cannot be
 * green because something was missing.
 */

const SHOTS = path.join(__dirname, "..", "evidence", "attendance-kiosk");
const SETTLE = 60_000;
const TABLET = { width: 768, height: 1024 };

// Devices (synthetic, local-only).
const RIVERSIDE = "cert-kiosk-riverside-secret";
const LAKESIDE = "cert-kiosk-lakeside-secret";
const REVOKED = "cert-kiosk-revoked-secret";
const CAPLESS = "cert-kiosk-capless-secret";

// Adults.
const NADIA = "10000001"; // parent+pickup on Leo, Nils, Zara; parent-only on Mia
const PRIYA = "10000002"; // parent+pickup on Ivy, who has NO screening
const MARCUS = "10000003"; // parent+pickup on Theo, and barred by an active restriction

// Children.
const LEO = "00000000-0000-4000-8000-000070000050";
const MIA = "00000000-0000-4000-8000-000070000051";
const IVY = "00000000-0000-4000-8000-000070000052";
const THEO = "00000000-0000-4000-8000-000070000053";
const NILS = "00000000-0000-4000-8000-000070000054";
const ZARA = "00000000-0000-4000-8000-000070000055";

/** Words a shared lobby screen must never contain. */
const SENSITIVE = ["restriction", "safeguarding", "court", "order", "custody", "screen", "authorized_pickup", "person_id"];

test.beforeAll(() => fs.mkdirSync(SHOTS, { recursive: true }));
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });

// ── server helpers ──────────────────────────────────────────────────────────

async function kioskPost(
    request: APIRequestContext,
    route: "identify" | "attendance",
    credential: string,
    body: Record<string, unknown>,
) {
    return request.post(`/api/public/kiosk/${route}`, {
        headers: { "content-type": "application/json", "x-alloy-kiosk-credential": credential },
        data: body,
    });
}

/** Attendance facts for one child today, read back through the admin API. */
async function factsFor(request: APIRequestContext, childId: string): Promise<Record<string, unknown>[]> {
    const res = await request.get(`/api/admin/childcare-attendance?customer_member_id=${childId}`);
    if (!res.ok()) return [];
    const json = (await res.json()) as { events?: Record<string, unknown>[] };
    const today = new Date().toISOString().slice(0, 10);
    return (json.events ?? []).filter((e) => String(e.service_date ?? "").slice(0, 10) === today);
}

async function countFacts(request: APIRequestContext, childId: string, kind?: string): Promise<number> {
    const rows = await factsFor(request, childId);
    return kind ? rows.filter((r) => r.event_kind === kind).length : rows.length;
}

// ── browser helpers ─────────────────────────────────────────────────────────

/** Open the kiosk as a paired device, at tablet size. */
async function openKiosk(page: Page, credential = RIVERSIDE) {
    await page.setViewportSize(TABLET);
    await page.addInitScript((cred) => {
        try {
            window.localStorage.setItem("alloy.kiosk.credential", cred as string);
        } catch {
            /* ignore */
        }
    }, credential);
    await page.goto("/kiosk");
    await expect(page.locator('[data-kiosk="true"]')).toBeVisible({ timeout: SETTLE });
}

async function tapCode(page: Page, code: string) {
    for (const d of code.split("")) await page.locator(`[data-kiosk-key="${d}"]`).click();
    await page.locator('[data-kiosk-code-submit="true"]').click();
}

/** Idle → operation → code → child list. */
async function identifyInBrowser(page: Page, operation: "check_in" | "check_out", code: string) {
    await page.locator(`[data-kiosk-start="${operation}"]`).click();
    await expect(page.locator('[data-kiosk-code="true"]')).toBeVisible({ timeout: SETTLE });
    await tapCode(page, code);
}

async function bodyText(page: Page): Promise<string> {
    return (await page.evaluate(() => document.body.innerText)).toLowerCase();
}

async function expectNothingSensitive(page: Page) {
    const text = await bodyText(page);
    for (const word of SENSITIVE) expect(text, `lobby screen leaked "${word}"`).not.toContain(word);
}

test.describe.configure({ mode: "serial" });

// ═══════════════════════════════════════════════════════════════════════════
test.describe("Thread 5 · kiosk", () => {
    test("K5-0 · the fixture is present, so nothing below is vacuous", async ({ request }) => {
        const res = await kioskPost(request, "identify", RIVERSIDE, { operation: "check_in", code: NADIA });
        expect(res.status(), "the Riverside kiosk credential did not resolve — fixture missing").toBe(200);
        const json = (await res.json()) as { children: { child_id: string }[] };
        const ids = json.children.map((c) => c.child_id);
        expect(ids, "Nadia's Riverside children are absent — fixture missing").toEqual(
            expect.arrayContaining([LEO, MIA, NILS]),
        );
        // Scenario E's read half: her Lakeside child is not in a Riverside answer.
        expect(ids, "an out-of-site child appeared in the eligible set").not.toContain(ZARA);
    });

    // ── A ───────────────────────────────────────────────────────────────────
    test("K5-A · ordinary arrival: browser, server, fact, workspace, reload, reset", async ({ page, request }) => {
        const before = await countFacts(request, LEO, "check_in");

        await openKiosk(page);
        await shot(page, "A1-idle");
        await expectNothingSensitive(page);

        await identifyInBrowser(page, "check_in", NADIA);
        await expect(page.locator(`[data-kiosk-child="${LEO}"]`)).toBeVisible({ timeout: SETTLE });
        await shot(page, "A2-children");

        await page.locator(`[data-kiosk-child="${LEO}"]`).click();
        await page.locator('[data-kiosk-confirm="true"]').click();
        await expect(page.locator('[data-kiosk-done="true"]')).toBeVisible({ timeout: SETTLE });
        await expect(page.locator(`[data-kiosk-result="${LEO}"]`)).toHaveAttribute("data-kiosk-result-recorded", "true");
        await shot(page, "A3-done");

        // PERSISTED TRUTH, not a screen.
        const rows = await factsFor(request, LEO);
        const checkIns = rows.filter((r) => r.event_kind === "check_in");
        expect(checkIns.length).toBe(before + 1);
        const fact = checkIns[checkIns.length - 1];
        // Provenance: the DEVICE is the source, the ADULT is the actor. Two fields.
        expect(fact.source_type).toBe("kiosk");
        expect(String(fact.source_key)).toContain("kiosk:cert:riverside-front-desk");
        expect(fact.actor_person_id).toBeTruthy();
        expect(fact.actor_user_id).toBeNull();

        // PRIVACY RESET after success, and nothing of the family left behind.
        await page.locator('[data-kiosk-done-dismiss="true"]').click();
        await expect(page.locator('[data-kiosk-idle="true"]')).toBeVisible({ timeout: SETTLE });
        expect(await bodyText(page)).not.toContain("leo");

        // Truth survives a reload of the kiosk, and the kiosk still shows nothing.
        await page.reload();
        await expect(page.locator('[data-kiosk-idle="true"]')).toBeVisible({ timeout: SETTLE });
        expect(await bodyText(page)).not.toContain("leo");
        expect(await countFacts(request, LEO, "check_in")).toBe(before + 1);
    });

    // ── B1 ──────────────────────────────────────────────────────────────────
    test("K5-B1 · two eligible siblings get two independent facts", async ({ page, request }) => {
        const beforeMia = await countFacts(request, MIA, "check_in");
        const beforeNils = await countFacts(request, NILS, "check_in");

        await openKiosk(page);
        await identifyInBrowser(page, "check_in", NADIA);
        await page.locator(`[data-kiosk-child="${MIA}"]`).click();
        await page.locator(`[data-kiosk-child="${NILS}"]`).click();
        await shot(page, "B1-multi-select");
        await page.locator('[data-kiosk-confirm="true"]').click();
        await expect(page.locator('[data-kiosk-done="true"]')).toBeVisible({ timeout: SETTLE });

        expect(await countFacts(request, MIA, "check_in")).toBe(beforeMia + 1);
        expect(await countFacts(request, NILS, "check_in")).toBe(beforeNils + 1);
    });

    // ── B2 ──────────────────────────────────────────────────────────────────
    test("K5-B2 · mixed sibling checkout states each child's own result", async ({ page, request }) => {
        const beforeMia = await countFacts(request, MIA, "check_out");

        await openKiosk(page);
        await identifyInBrowser(page, "check_out", NADIA);
        await expect(page.locator(`[data-kiosk-child="${LEO}"]`)).toBeVisible({ timeout: SETTLE });

        // Leo: parent + authorized_pickup. Mia: parent only. Same adult, same
        // household, different answers — derived per child, never inferred.
        await expect(page.locator(`[data-kiosk-child="${LEO}"]`)).toHaveAttribute("data-kiosk-child-eligible", "true");
        await expect(page.locator(`[data-kiosk-child="${MIA}"]`)).toHaveAttribute("data-kiosk-child-eligible", "false");
        await shot(page, "B2-mixed-eligibility");

        // The ineligible sibling cannot even be selected, so the batch cannot
        // silently carry her — and the screen still says nothing sensitive.
        await expect(page.locator(`[data-kiosk-child="${MIA}"]`)).toBeDisabled();
        await expectNothingSensitive(page);
        expect(await countFacts(request, MIA, "check_out")).toBe(beforeMia);
    });

    test("K5-B2b · a partial batch reports per child rather than one verdict", async ({ request }) => {
        // Driven server-side with the ineligible sibling forced into the payload,
        // which is the only way to reach a genuinely partial batch.
        const beforeLeo = await countFacts(request, LEO, "check_out");
        const beforeMia = await countFacts(request, MIA, "check_out");

        const res = await kioskPost(request, "attendance", RIVERSIDE, {
            operation: "check_out",
            code: NADIA,
            child_ids: [LEO, MIA],
            operation_token: `cert-partial-${Date.now()}`,
        });
        expect(res.status()).toBe(200);
        const json = (await res.json()) as { results: { child_id: string; recorded: boolean; message: string | null }[] };
        const byChild = new Map(json.results.map((r) => [r.child_id, r]));

        expect(byChild.get(LEO)?.recorded, "the authorized sibling should still commit").toBe(true);
        expect(byChild.get(MIA)?.recorded, "the unauthorized sibling must not").toBe(false);
        expect(byChild.get(MIA)?.message).toBe("Please see a member of staff.");
        for (const word of SENSITIVE) {
            expect(String(byChild.get(MIA)?.message).toLowerCase()).not.toContain(word);
        }
        expect(await countFacts(request, LEO, "check_out")).toBe(beforeLeo + 1);
        expect(await countFacts(request, MIA, "check_out")).toBe(beforeMia);
    });

    // ── C ───────────────────────────────────────────────────────────────────
    test("K5-C · authorized checkout appends, and the check-in survives", async ({ page, request }) => {
        // Put Nils back in the building first, so a checkout has something to end.
        await kioskPost(request, "attendance", RIVERSIDE, {
            operation: "check_in",
            code: NADIA,
            child_ids: [NILS],
            operation_token: `cert-c-in-${Date.now()}`,
        });
        const checkInsBefore = await countFacts(request, NILS, "check_in");
        const outBefore = await countFacts(request, NILS, "check_out");

        await openKiosk(page);
        await identifyInBrowser(page, "check_out", NADIA);
        await page.locator(`[data-kiosk-child="${NILS}"]`).click();
        await page.locator('[data-kiosk-confirm="true"]').click();
        await expect(page.locator('[data-kiosk-done="true"]')).toBeVisible({ timeout: SETTLE });
        await shot(page, "C1-checked-out");

        expect(await countFacts(request, NILS, "check_out")).toBe(outBefore + 1);
        // APPEND-ONLY: the arrival is still there. A checkout that erased it would
        // make the day unreconstructable.
        expect(await countFacts(request, NILS, "check_in")).toBe(checkInsBefore);
    });

    // ── D ───────────────────────────────────────────────────────────────────
    for (const [name, code, child, why] of [
        ["D1-restricted", MARCUS, THEO, "an active may_not_pick_up restriction names this adult"],
        ["D3-unscreened", PRIYA, IVY, "no safeguarding screening evidence exists for this child"],
        ["D5-parent-not-pickup", NADIA, MIA, "parent relationship without the authorized_pickup role"],
    ] as const) {
        test(`K5-${name} · checkout denied, zero facts, nothing disclosed`, async ({ request }) => {
            const before = await countFacts(request, child, "check_out");

            const res = await kioskPost(request, "attendance", RIVERSIDE, {
                operation: "check_out",
                code,
                child_ids: [child],
                operation_token: `cert-${name}-${Date.now()}`,
            });
            expect(res.status(), why).toBe(200);
            const json = (await res.json()) as { results: { recorded: boolean; message: string | null }[] };
            expect(json.results[0]?.recorded, why).toBe(false);
            expect(json.results[0]?.message).toBe("Please see a member of staff.");
            for (const word of SENSITIVE) {
                expect(JSON.stringify(json).toLowerCase(), `leaked "${word}"`).not.toContain(word);
            }
            expect(await countFacts(request, child, "check_out"), "a denial authored a fact").toBe(before);
        });
    }

    test("K5-D5b · the same adult and child ARE eligible to check in", async ({ request }) => {
        // The asymmetry is the point: dropping off and collecting are different
        // questions, and D5 must not read as "this relationship is broken".
        const res = await kioskPost(request, "identify", RIVERSIDE, { operation: "check_in", code: NADIA });
        const json = (await res.json()) as { children: { child_id: string; eligible: boolean }[] };
        expect(json.children.find((c) => c.child_id === MIA)?.eligible).toBe(true);
    });

    // ── E ───────────────────────────────────────────────────────────────────
    test("K5-E · a Site B child cannot be captured from a Site A kiosk", async ({ request }) => {
        const before = await countFacts(request, ZARA);

        // Direct manipulation: name the out-of-site child explicitly.
        const res = await kioskPost(request, "attendance", RIVERSIDE, {
            operation: "check_in",
            code: NADIA,
            child_ids: [ZARA],
            operation_token: `cert-e-${Date.now()}`,
        });
        const json = (await res.json()) as { results: { recorded: boolean }[] };
        expect(json.results[0]?.recorded, "a manipulated payload reached another site").toBe(false);
        expect(await countFacts(request, ZARA)).toBe(before);
    });

    // ── F ───────────────────────────────────────────────────────────────────
    test("K5-F · one logical operation converges to one fact under replay", async ({ request }) => {
        const before = await countFacts(request, LEO, "check_in");
        const token = `cert-replay-${Date.now()}`;
        const body = { operation: "check_in", code: NADIA, child_ids: [LEO], operation_token: token };

        // Rapid concurrent submission, then a later replay of the same identity —
        // a double tap and a network retry, which are the same thing to the server.
        await Promise.all([
            kioskPost(request, "attendance", RIVERSIDE, body),
            kioskPost(request, "attendance", RIVERSIDE, body),
            kioskPost(request, "attendance", RIVERSIDE, body),
        ]);
        await kioskPost(request, "attendance", RIVERSIDE, body);

        expect(await countFacts(request, LEO, "check_in"), "replay duplicated a fact").toBe(before + 1);
    });

    test("K5-F2 · a DIFFERENT logical operation is not swallowed by idempotency", async ({ request }) => {
        // The mirror failure: dedupe so eager that a genuine second decision is lost.
        const before = await countFacts(request, LEO, "check_out");
        await kioskPost(request, "attendance", RIVERSIDE, {
            operation: "check_out",
            code: NADIA,
            child_ids: [LEO],
            operation_token: `cert-distinct-${Date.now()}`,
        });
        expect(await countFacts(request, LEO, "check_out")).toBe(before + 1);
    });

    // ── G ───────────────────────────────────────────────────────────────────
    test("K5-G · a known-away child may arrive, and the plan survives", async ({ request }) => {
        const before = await countFacts(request, NILS, "check_in");
        const res = await kioskPost(request, "attendance", RIVERSIDE, {
            operation: "check_in",
            code: NADIA,
            child_ids: [NILS],
            operation_token: `cert-g-${Date.now()}`,
        });
        const json = (await res.json()) as { results: { recorded: boolean }[] };
        // Reality is recorded. The kiosk does not rewrite the plan because the
        // plan turned out wrong.
        expect(json.results[0]?.recorded, "an authored vacation blocked a real arrival").toBe(true);
        expect(await countFacts(request, NILS, "check_in")).toBe(before + 1);
    });

    // ── H / N ───────────────────────────────────────────────────────────────
    test("K5-H · the device forgets the family on every ending", async ({ page }) => {
        await openKiosk(page);

        // 1. A denial ends the interaction and says only the generic thing.
        await identifyInBrowser(page, "check_in", "99999999");
        await expect(page.locator('[data-kiosk-idle="true"]')).toBeVisible({ timeout: SETTLE });
        await expect(page.locator('[data-kiosk-notice="true"]')).toContainText("member of staff");
        await expectNothingSensitive(page);

        // 2. Start Over from a screen that HAS family data on it.
        await identifyInBrowser(page, "check_in", NADIA);
        await expect(page.locator(`[data-kiosk-child="${LEO}"]`)).toBeVisible({ timeout: SETTLE });
        expect(await bodyText(page)).toContain("leo");
        await page.locator('[data-kiosk-start-over="true"]').click();
        await expect(page.locator('[data-kiosk-idle="true"]')).toBeVisible();
        expect(await bodyText(page)).not.toContain("leo");

        // 3. Browser BACK must not repaint the previous family (bfcache).
        await identifyInBrowser(page, "check_in", NADIA);
        await expect(page.locator(`[data-kiosk-child="${LEO}"]`)).toBeVisible({ timeout: SETTLE });
        await page.goto("/kiosk?away=1");
        await page.goBack();
        await expect(page.locator('[data-kiosk-idle="true"]')).toBeVisible({ timeout: SETTLE });
        expect(await bodyText(page), "browser back restored the previous family").not.toContain("leo");
        await shot(page, "H1-idle-after-back");

        // 4. Family B starts clean and sees only its own child.
        await identifyInBrowser(page, "check_in", PRIYA);
        await expect(page.locator(`[data-kiosk-child="${IVY}"]`)).toBeVisible({ timeout: SETTLE });
        const text = await bodyText(page);
        expect(text).toContain("ivy");
        expect(text, "Family A crossed into Family B's interaction").not.toContain("leo");
    });

    test("K5-N · no Alloy human session is ever minted at the kiosk", async ({ page }) => {
        await openKiosk(page);
        await identifyInBrowser(page, "check_in", NADIA);
        await expect(page.locator(`[data-kiosk-child="${LEO}"]`)).toBeVisible({ timeout: SETTLE });

        // The device credential is the ONLY durable thing the browser holds.
        const cookies = await page.context().cookies();
        const authCookies = cookies.filter((c) => /sb-|supabase|auth-token/i.test(c.name));
        expect(authCookies, "the kiosk minted a human auth session").toEqual([]);
        const stored = await page.evaluate(() => Object.keys(window.localStorage));
        expect(stored).toEqual(["alloy.kiosk.credential"]);
    });

    // ── I ───────────────────────────────────────────────────────────────────
    for (const [name, credential, expected] of [
        ["I1-unknown", "cert-kiosk-not-a-real-secret", 401],
        ["I2-revoked", REVOKED, 401],
        ["I3-no-capability", CAPLESS, 403],
    ] as const) {
        test(`K5-${name} · refused before any attendance work`, async ({ request }) => {
            const before = await countFacts(request, LEO);
            const res = await kioskPost(request, "attendance", credential, {
                operation: "check_in",
                code: NADIA,
                child_ids: [LEO],
                operation_token: `cert-${name}-${Date.now()}`,
            });
            expect(res.status(), name).toBe(expected);
            expect(await countFacts(request, LEO), "an untrusted device authored a fact").toBe(before);
        });
    }

    test("K5-I4 · the browser cannot assert its own site or capability", async ({ request }) => {
        const before = await countFacts(request, ZARA);
        // Every trusted claim is read from the device row; these are ignored.
        const res = await kioskPost(request, "attendance", RIVERSIDE, {
            operation: "check_in",
            code: NADIA,
            child_ids: [ZARA],
            site_location_id: "00000000-0000-4000-8000-000000000011",
            org_id: "00000000-0000-4000-8000-000000000001",
            capabilities: ["attendance.record"],
            operation_token: `cert-i4-${Date.now()}`,
        });
        const json = (await res.json()) as { results: { recorded: boolean }[] };
        expect(json.results[0]?.recorded).toBe(false);
        expect(await countFacts(request, ZARA)).toBe(before);
    });

    // ── J ───────────────────────────────────────────────────────────────────
    test("K5-J · a closed site refuses ordinary capture", async ({ request }) => {
        const before = await countFacts(request, ZARA);
        // The Lakeside kiosk, its own site, its own child — and the site is closed today.
        const res = await kioskPost(request, "attendance", LAKESIDE, {
            operation: "check_in",
            code: NADIA,
            child_ids: [ZARA],
            operation_token: `cert-j-${Date.now()}`,
        });
        expect(res.status()).toBe(200);
        const json = (await res.json()) as { results: { recorded: boolean; message: string | null }[] };
        expect(json.results[0]?.recorded, "a closed site accepted an arrival").toBe(false);
        expect(json.results[0]?.message).toBe("Please see a member of staff.");
        expect(await countFacts(request, ZARA)).toBe(before);
    });

    // ── M ───────────────────────────────────────────────────────────────────
    test("K5-M · guessing is bounded per device and discloses nothing", async ({ request }) => {
        const bodies: string[] = [];
        let throttled = 0;
        // Each guess is DIFFERENT, which is the case a code-keyed limiter misses
        // entirely: it would give every one of these its own fresh budget.
        for (let i = 0; i < 14; i += 1) {
            const res = await kioskPost(request, "identify", RIVERSIDE, {
                operation: "check_in",
                code: String(20000000 + i),
            });
            if (res.status() === 429) throttled += 1;
            else bodies.push(JSON.stringify(await res.json()));
        }
        expect(throttled, "unbounded guessing was permitted from one device").toBeGreaterThan(0);
        // And nothing in any response says whether a person or child exists.
        for (const body of bodies) {
            expect(body).not.toContain("child_id");
            for (const word of SENSITIVE) expect(body.toLowerCase()).not.toContain(word);
        }
    });
});
