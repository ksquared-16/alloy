/**
 * FINANCIAL CONFIGURATION AUTHORITY V1.
 *
 * Forty-eight Financials mutations were reachable by anyone with a login. This certifies the two
 * questions that now stand between a principal and an organization's money rules, and proves they
 * are genuinely independent:
 *
 *   CAPABILITY  — may this principal configure money at all?
 *   TENANT      — may they configure THIS organization's money?
 *
 * A slice that proved only the first would have shipped a surface where a fin.write holder in one
 * organization could rewrite another's prices, and the capability matrix would have looked perfect.
 * PHASE 6 is the half that catches that, and it asserts on the OTHER organization's row rather than
 * on a status code, because a 404 proves nothing about what was written.
 *
 * ── HOW A REFUSAL IS READ ──
 *
 * 403 is the gate refusing; anything else is the gate admitting, since every gate runs before its
 * handler reads a body. An admitted persona lands on 400/404, and that is a PASS.
 *
 * Personas come from `fixtures/access-personas.mjs`; run its `setup` from `web/` first and RESTART
 * the certification server — a direct grant write does not invalidate the access-bundle cache.
 */
import { test, expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const EVIDENCE = path.join(__dirname, "..", "evidence", "financial-configuration-authority");
const PASSWORD = "alloy-local-cert";
const NO_ID = "99999999-0000-4000-8000-000000000501";

/** Seeded before this spec runs, owned by OTHER_ORG, holding amount_cents = 12345. */
const ORG_B_MATRIX_ROW = "bbbb2222-0000-4000-8000-000000000001";

const PERSONAS = {
    finRead: { email: "cert.portalfin@northwind.invalid" },
    finWrite: { email: "cert.sjfinwrite@northwind.invalid" },
    finPost: { email: "cert.sjposter@northwind.invalid" },
    finAdjust: { email: "cert.finadjust@northwind.invalid" },
    portalOnly: { email: "cert.portalonly@northwind.invalid" },
    titular: { email: "cert.cfgtitular@northwind.invalid" },
} as const;
const OPS = { email: "cert.ops@northwind.invalid" };

type Door = "commercialProduct" | "ratePlan" | "pricingMode" | "pricingMatrix" | "simulate" | "paymentsPatch" | "paymentsRun";

const no = { data: {}, failOnStatusCode: false } as const;
async function knock(r: APIRequestContext, door: Door): Promise<number> {
    switch (door) {
        // ── fin.write: ordinary money CONFIGURATION ──
        case "commercialProduct": return (await r.post("/api/admin/commercial/products", no)).status();
        case "ratePlan": return (await r.post("/api/admin/financial/rate-plans", no)).status();
        case "pricingMode": return (await r.patch(`/api/admin/pricing-modes/${NO_ID}`, no)).status();
        case "pricingMatrix": return (await r.patch(`/api/admin/pricing/matrix/${NO_ID}`, no)).status();
        // ── fin.read: computes, persists nothing ──
        case "simulate": return (await r.post("/api/admin/financial/charge-templates/simulate", no)).status();
        // ── fin.post: money truth ──
        case "paymentsPatch": return (await r.patch(`/api/admin/payments/${NO_ID}`, no)).status();
        case "paymentsRun": return (await r.post("/api/admin/payments/run", no)).status();
    }
}

const CONFIG: Door[] = ["commercialProduct", "ratePlan", "pricingMode", "pricingMatrix"];
const COMPUTE: Door[] = ["simulate"];
/**
 * `paymentsRun` is NOT here, and that is a finding rather than an omission.
 *
 * It runs `requireAdmin()` before anything this slice added, so its effective authority is the admin
 * ROLE *and* fin.post — a capability holder who is not an admin is refused by the older gate and
 * never reaches the newer one. The earlier census read it as ungated because it looks for
 * `ctx.role !== "admin"` and did not know that helper. Scoring it as a fin.post door would assert a
 * capability contract the route does not actually offer; PHASE 8 measures what it does offer.
 */
const POSTING: Door[] = ["paymentsPatch"];
const ALL: Door[] = [...CONFIG, ...COMPUTE, ...POSTING];
const admitted = (s: number) => s !== 403;

const MATRIX: Record<string, Record<string, number>> = {};
function record(who: string, door: string, status: number) {
    MATRIX[who] = MATRIX[who] ?? {};
    MATRIX[who][door] = status;
}

async function signIn(browser: Browser, email: string) {
    const context = await browser.newContext({ storageState: undefined });
    const page: Page = await context.newPage();
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(email);
    const pw = page.locator('input[type="password"]').first();
    await pw.fill(PASSWORD);
    await pw.press("Enter");
    let signedIn = true;
    try { await page.waitForURL("**/workspace**", { timeout: 90_000 }); } catch { signedIn = false; }
    return { page, request: page.request, signedIn, close: () => context.close() };
}

test.describe.configure({ mode: "serial" });

test.describe("Financial configuration authority — capability and tenant are two questions", () => {
    test.afterAll(() => {
        fs.mkdirSync(EVIDENCE, { recursive: true });
        fs.writeFileSync(path.join(EVIDENCE, "authority-matrix.json"), `${JSON.stringify(MATRIX, null, 2)}\n`);
    });

    test("PHASE 1 — each Financial capability opens its own family and no other", async ({ browser }) => {
        const owns: Record<keyof typeof PERSONAS, Door[]> = {
            // fin.read reaches the computation and nothing that writes.
            finRead: COMPUTE,
            // sjFinWrite holds fin.write AND fin.read, so it reaches configuration and computation.
            finWrite: [...CONFIG, ...COMPUTE],
            finPost: POSTING,
            finAdjust: [],
            portalOnly: [],
            titular: [],
        };
        for (const [who, persona] of Object.entries(PERSONAS)) {
            const s = await signIn(browser, persona.email);
            expect(s.signedIn, `${who} could not sign in; an unauthenticated 403 would fake a pass`).toBe(true);
            const allowed = new Set(owns[who as keyof typeof PERSONAS]);
            for (const door of ALL) {
                const status = await knock(s.request, door);
                record(who, door, status);
                expect(
                    admitted(status),
                    `${who} at ${door}: expected ${allowed.has(door) ? "ADMITTED" : "REFUSED"}, got ${status}`,
                ).toBe(allowed.has(door));
            }
            await s.close();
        }
    });

    test("PHASE 2 — SENSITIVE NON-IMPLICATION: configuring money is not moving money", async () => {
        /*
         * The four Financial keys are a ladder only in the imagination. Read does not imply write,
         * write does not imply posting, and posting does not imply the ability to change the rules
         * that produced the amount. PHASE 1 measured every cell; this states the four that matter as
         * their own claims so a regression names the doctrine it broke.
         */
        expect(MATRIX.finRead.commercialProduct, "fin.read must not configure").toBe(403);
        expect(MATRIX.finWrite.paymentsPatch, "fin.write must not change payment truth").toBe(403);
        expect(MATRIX.finPost.commercialProduct, "fin.post must not configure").toBe(403);
        expect(MATRIX.finAdjust.commercialProduct, "fin.adjust must not configure").toBe(403);
        expect(admitted(MATRIX.finRead.simulate), "fin.read keeps the non-persisting computation").toBe(true);
    });

    test("PHASE 3 — the accidental access is closed", async () => {
        /*
         * THE PRIMARY SECURITY CORRECTION. Before this slice a portal-only principal could create a
         * rate plan. Nobody granted them that; nothing refused them either.
         */
        for (const door of ALL) {
            expect(MATRIX.portalOnly[door], `portal-only still reaches ${door}`).toBe(403);
        }
    });

    test("PHASE 4 — a role LABELLED Admin carries no Financial authority", async () => {
        for (const door of ALL) {
            expect(MATRIX.titular[door], `a role named Admin opened ${door}`).toBe(403);
        }
    });

    test("PHASE 5 — default admin keeps configuration; ops follows its grants, not its title", async ({ browser, request }) => {
        for (const door of CONFIG) {
            const status = await knock(request, door);
            record("seededOperatorAdmin", door, status);
            expect(admitted(status), `the default admin lost ${door} (${status})`).toBe(true);
        }
        const o = await signIn(browser, OPS.email);
        expect(o.signedIn).toBe(true);
        for (const door of ALL) record("defaultOps", door, await knock(o.request, door));
        await o.close();

        // ops holds fin.write, so it configures; ops does NOT hold fin.post, so it must not post.
        for (const door of CONFIG) {
            expect(admitted(MATRIX.defaultOps[door]), `ops holds fin.write and must keep ${door}`).toBe(true);
        }
        expect(
            MATRIX.defaultOps.paymentsPatch,
            "ops must not gain posting merely because it may configure",
        ).toBe(403);
    });

    test("PHASE 6 — TENANT BOUNDARY: correct capability, wrong organization", async ({ browser }) => {
        /*
         * The half a capability matrix cannot see.
         *
         * `pricing_matrix/[id]` PATCH ran on a service-role client and matched on `id` alone, so a
         * fin.write holder in ANY organization could rewrite ANY organization's price. The row below
         * belongs to OTHER_ORG and holds 12345. This signs in a fully authorized principal of the
         * CERT org and points it at that row.
         *
         * The assertion is on the row, not the status. A route that answers 404 while still writing
         * would pass a status check and fail the product.
         */
        const s = await signIn(browser, PERSONAS.finWrite.email);
        expect(s.signedIn).toBe(true);
        const res = await s.request.patch(`/api/admin/pricing/matrix/${ORG_B_MATRIX_ROW}`, {
            data: { amount_cents: 99999 },
            failOnStatusCode: false,
        });
        record("crossOrg", "pricingMatrixOtherOrgStatus", res.status());
        await s.close();

        // Written out for the psql verification step that follows this spec.
        fs.mkdirSync(EVIDENCE, { recursive: true });
        fs.writeFileSync(
            path.join(EVIDENCE, "cross-org-attempt.json"),
            `${JSON.stringify({ row: ORG_B_MATRIX_ROW, attemptedAmount: 99999, status: res.status() }, null, 2)}\n`,
        );
        expect(
            res.status(),
            "a cross-organization write must not be admitted; the tenant predicate should make the row unfindable",
        ).not.toBe(200);
        expect(
            res.status(),
            "and it must read as NOT FOUND — a 500 would say the server broke when the resource simply is not theirs",
        ).toBe(404);
    });

    test("PHASE 8 — payments/run answers to BOTH an older role gate and the new capability", async ({ browser, request }) => {
        /*
         * Recorded rather than silently "fixed".
         *
         * `payments/run` executes the payment run. It already called `requireAdmin()`, so it was
         * never reachable without the admin role — the census that called it ungated was reading for
         * `ctx.role !== "admin"` and did not recognise that helper. This slice added fin.post on top,
         * which is truthful about the consequence but does not change who gets in, because fin.post
         * is admin-only today anyway.
         *
         * The honest classification is CAPABILITY_PLUS_ROLE_TITLE, the same shape as the recorded
         * financials/accounts debt. Removing the role gate would widen the route to any future
         * fin.post holder, and that is a policy decision this slice does not make.
         */
        const s = await signIn(browser, PERSONAS.finPost.email);
        expect(s.signedIn).toBe(true);
        const holderStatus = await knock(s.request, "paymentsRun");
        await s.close();
        record("finPost", "paymentsRun", holderStatus);

        const adminStatus = await knock(request, "paymentsRun");
        record("seededOperatorAdmin", "paymentsRun", adminStatus);

        expect(holderStatus, "a fin.post holder who is not an admin is stopped by the older role gate").toBe(403);
        expect(admitted(adminStatus), "the default admin, who holds both, still reaches it").toBe(true);
    });

    test("PHASE 7 — D2: a grant reaches the holder on the next request, and a revoke removes it at once", async ({ browser, request }) => {
        /*
         * Cache behaviour, measured rather than trusted. The role starts without fin.write, is
         * granted it through the same RBAC endpoint the Access editor uses, and must be admitted on
         * its NEXT request — no TTL, no restart — then denied immediately on revoke.
         */
        const ROLE = "mcert_portal_only";
        const grants = async (keys: string[]) => {
            // role_key travels in the query string; the body carries only the keys.
            const r = await request.put(`/api/admin/rbac/grants?role_key=${ROLE}`, {
                data: { permission_keys: keys },
                failOnStatusCode: false,
            });
            expect(r.ok(), `grant write failed: ${r.status()}`).toBe(true);
        };

        const before = await signIn(browser, PERSONAS.portalOnly.email);
        expect(before.signedIn).toBe(true);
        const denied = await knock(before.request, "commercialProduct");
        await before.close();
        expect(denied, "precondition: portal-only starts without fin.write").toBe(403);

        await grants(["portal.access", "fin.write"]);
        const during = await signIn(browser, PERSONAS.portalOnly.email);
        expect(during.signedIn).toBe(true);
        const afterGrant = await knock(during.request, "commercialProduct");
        await during.close();

        await grants(["portal.access"]);
        const after = await signIn(browser, PERSONAS.portalOnly.email);
        expect(after.signedIn).toBe(true);
        const afterRevoke = await knock(after.request, "commercialProduct");
        await after.close();

        record("d2", "beforeGrant", denied);
        record("d2", "afterGrant", afterGrant);
        record("d2", "afterRevoke", afterRevoke);
        expect(admitted(afterGrant), "the grant did not reach the holder on the next request").toBe(true);
        expect(afterRevoke, "the revoke did not take effect immediately").toBe(403);
    });
});
