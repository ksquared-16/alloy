/**
 * W-18 — THE DELEGATION CEILING.
 *
 * ── THE DEFECT ──
 *
 * `isSelfAuthorityMutation` compares the actor to the TARGET USER, so it protects every
 * user-targeted authority route and none of the grants route, whose subject is a ROLE. An actor
 * holding nothing but `portal.access` and `settings.users_roles` could add `fin.post` to a role they
 * held and leave able to post money. That was reproduced against the live transaction owner before
 * the fix: effective authority went from two capabilities to three in one call.
 *
 * ── WHAT THIS FILE PROVES, AND WHY IT IS NOT JUST "403" ──
 *
 * A refusal is easy to fake and easy to over-apply. The interesting claims are the ones that must
 * still be ALLOWED, because a naive `after ⊆ actor` rule would pass a "cannot escalate" test while
 * quietly making every role richer than its administrator uneditable:
 *
 *   - a capability the actor already holds may be delegated (PHASE 2);
 *   - a capability supplied by a SECOND role may be delegated, because authority is the union
 *     across held roles (PHASE 5);
 *   - a pre-existing capability the actor lacks survives an unrelated edit (PHASE 4);
 *   - and may be removed, because reduction is not escalation (PHASE 4).
 *
 * Every phase asserts on the ROLE'S GRANTS afterwards, not only on the status code: a refusal that
 * still wrote, or an allow that wrote the wrong set, would pass a status check and fail the product.
 *
 * Personas come from `fixtures/access-personas.mjs`; run its `setup` from `web/` first.
 */
import { test, expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const EVIDENCE = path.join(__dirname, "..", "evidence", "delegation-ceiling");
const PASSWORD = "alloy-local-cert";

/** The limited access administrator: may edit roles, holds no fin.* at all. */
const ACTOR = { email: "cert.ceiling@northwind.invalid" };
/** The role the actor holds — editing it is the exploit shape. */
const SELF_ROLE = "mcert_ceiling_actor";
/** A role the actor does NOT hold. */
const OTHER_ROLE = "mcert_ceiling_supply";
/** Held by the actor's role. */
const HELD = ["portal.access", "settings.users_roles"];
/** Not held by the actor by any path. */
const UNHELD = "fin.post";

const RESULT: Record<string, unknown> = {};

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

const setGrants = (r: APIRequestContext, role: string, keys: string[]) =>
    r.put(`/api/admin/rbac/grants?role_key=${role}`, { data: { permission_keys: keys }, failOnStatusCode: false });

async function grantsOf(r: APIRequestContext, role: string): Promise<string[]> {
    const res = await r.get(`/api/admin/rbac/grants?role_key=${role}`, { failOnStatusCode: false });
    if (!res.ok()) return [];
    return ((await res.json()) as { permission_keys?: string[] }).permission_keys ?? [];
}

test.describe.configure({ mode: "serial" });

test.describe("W-18 delegation ceiling — you may only grant what you hold", () => {
    test.afterAll(async () => {
        fs.mkdirSync(EVIDENCE, { recursive: true });
        fs.writeFileSync(path.join(EVIDENCE, "ceiling.json"), `${JSON.stringify(RESULT, null, 2)}\n`);
    });

    test("PHASE 1 — the exploit: a self-held role cannot gain authority the actor lacks", async ({ browser }) => {
        const s = await signIn(browser, ACTOR.email);
        expect(s.signedIn, "the limited administrator must reach the portal").toBe(true);

        const before = await grantsOf(s.request, SELF_ROLE);
        const res = await setGrants(s.request, SELF_ROLE, [...HELD, UNHELD]);
        const after = await grantsOf(s.request, SELF_ROLE);
        await s.close();

        RESULT.selfHeldUnheld = { status: res.status(), before, after };
        expect(res.status(), "introducing unheld authority into a self-held role must be refused").toBe(403);
        expect(
            after.includes(UNHELD),
            "REFUSED BUT WRITTEN would be the worst outcome — the role must not carry the capability",
        ).toBe(false);
        expect(after.sort(), "a refusal must leave the grant set exactly as it was").toEqual(before.sort());
    });

    test("PHASE 2 — a capability the actor DOES hold may be delegated to another role", async ({ browser }) => {
        const s = await signIn(browser, ACTOR.email);
        expect(s.signedIn).toBe(true);
        const original = await grantsOf(s.request, OTHER_ROLE);

        const res = await setGrants(s.request, OTHER_ROLE, [...original, "portal.access"]);
        const after = await grantsOf(s.request, OTHER_ROLE);
        RESULT.otherRoleHeld = { status: res.status(), after };

        expect(res.ok(), `delegating a held capability must be allowed, got ${res.status()}`).toBe(true);
        expect(after).toContain("portal.access");

        await setGrants(s.request, OTHER_ROLE, original);
        await s.close();
    });

    test("PHASE 3 — a role the actor does NOT hold cannot be given authority beyond the actor", async ({ browser }) => {
        /*
         * The ceiling is about authority PROPAGATION, not only self-escalation. A limited
         * administrator must not be able to build a more powerful subordinate.
         */
        const s = await signIn(browser, ACTOR.email);
        expect(s.signedIn).toBe(true);
        const before = await grantsOf(s.request, OTHER_ROLE);
        const res = await setGrants(s.request, OTHER_ROLE, [...before, UNHELD]);
        const after = await grantsOf(s.request, OTHER_ROLE);
        await s.close();

        RESULT.otherRoleUnheld = { status: res.status(), before, after };
        expect(res.status()).toBe(403);
        expect(after.sort()).toEqual(before.sort());
    });

    test("PHASE 4 — pre-existing authority the actor lacks survives an edit, and may be removed", async ({ browser, request }) => {
        /*
         * THE PHASE THAT DISTINGUISHES A CEILING FROM A WRECKING BALL.
         *
         * The seeded operator (a full admin) puts fin.post on a role the limited actor does not
         * hold. The limited actor then edits that role's OTHER dimension. A rule written as
         * `after ⊆ actor` would refuse — and an administrator would have to strip a role to rename
         * its access. The delta rule allows it, because keeping is not delegating.
         *
         * Then the limited actor REMOVES fin.post, which it never held. Reduction is not escalation.
         */
        const admin = request;
        const seeded = await grantsOf(admin, OTHER_ROLE);
        await setGrants(admin, OTHER_ROLE, [...new Set([...seeded, UNHELD])]);
        expect(await grantsOf(admin, OTHER_ROLE)).toContain(UNHELD);

        const s = await signIn(browser, ACTOR.email);
        expect(s.signedIn).toBe(true);

        // Edit a different dimension while the unheld capability stays in the submitted set.
        const withExtra = [...new Set([...seeded, UNHELD, "portal.access"])];
        const preserve = await setGrants(s.request, OTHER_ROLE, withExtra);
        const afterPreserve = await grantsOf(s.request, OTHER_ROLE);
        RESULT.preserveUnheld = { status: preserve.status(), after: afterPreserve };
        expect(preserve.ok(), `preserving a pre-existing unheld capability must be allowed, got ${preserve.status()}`).toBe(true);
        expect(afterPreserve, "the capability the actor cannot grant must still be there").toContain(UNHELD);

        // Now remove it.
        const reduced = withExtra.filter((k) => k !== UNHELD);
        const revoke = await setGrants(s.request, OTHER_ROLE, reduced);
        const afterRevoke = await grantsOf(s.request, OTHER_ROLE);
        RESULT.revokeUnheld = { status: revoke.status(), after: afterRevoke };
        expect(revoke.ok(), `revoking authority the actor lacks must be allowed, got ${revoke.status()}`).toBe(true);
        expect(afterRevoke).not.toContain(UNHELD);

        await s.close();
        await setGrants(admin, OTHER_ROLE, seeded);
    });

    test("PHASE 5 — MULTI-ROLE UNION: a second role raises the ceiling, and losing it lowers it at once", async ({ browser, request }) => {
        /*
         * Authority is the union across every role held, not the authority of whichever role carries
         * access administration. The actor is given a second role supplying fin.write, delegates it,
         * loses the role, and is refused on the next attempt — no TTL, no restart.
         */
        const admin = request;
        const actorUser = "c0000000-0000-4000-8000-00000000d046";
        const supplySeed = await grantsOf(admin, OTHER_ROLE);
        await setGrants(admin, OTHER_ROLE, [...new Set([...supplySeed, "fin.write"])]);

        const add = await admin.post(`/api/admin/users/${actorUser}/roles`, {
            data: { role: OTHER_ROLE }, failOnStatusCode: false,
        });
        RESULT.unionRoleAdded = add.status();

        const withUnion = await signIn(browser, ACTOR.email);
        expect(withUnion.signedIn).toBe(true);
        const target = await grantsOf(withUnion.request, SELF_ROLE);
        const delegated = await setGrants(withUnion.request, SELF_ROLE, [...new Set([...target, "fin.write"])]);
        const afterDelegate = await grantsOf(withUnion.request, SELF_ROLE);
        await withUnion.close();
        RESULT.unionDelegate = { status: delegated.status(), after: afterDelegate };

        if (add.ok()) {
            expect(delegated.ok(), `the union should permit delegating fin.write, got ${delegated.status()}`).toBe(true);
            expect(afterDelegate).toContain("fin.write");
        }

        // Take the supplying role away, and the ceiling must drop immediately.
        await admin.delete(`/api/admin/users/${actorUser}/roles/${OTHER_ROLE}`, { failOnStatusCode: false });
        await setGrants(admin, SELF_ROLE, HELD);

        const without = await signIn(browser, ACTOR.email);
        expect(without.signedIn).toBe(true);
        const retry = await setGrants(without.request, SELF_ROLE, [...HELD, "fin.write"]);
        const afterRetry = await grantsOf(without.request, SELF_ROLE);
        await without.close();
        RESULT.unionAfterRemoval = { status: retry.status(), after: afterRetry };

        expect(retry.status(), "losing the supplying role must lower the ceiling on the NEXT request").toBe(403);
        expect(afterRetry).not.toContain("fin.write");

        await setGrants(admin, OTHER_ROLE, supplySeed);
    });

    test("PHASE 6 — a full administrator is unaffected", async ({ request }) => {
        /*
         * The ceiling is a bound, not a blanket refusal. Someone who holds the capability may still
         * delegate it, which is what makes the rule a ceiling rather than a lockout.
         */
        const seeded = await grantsOf(request, OTHER_ROLE);
        const res = await setGrants(request, OTHER_ROLE, [...new Set([...seeded, UNHELD])]);
        const after = await grantsOf(request, OTHER_ROLE);
        RESULT.fullAdmin = { status: res.status(), after };
        expect(res.ok(), `an admin holding ${UNHELD} must still be able to delegate it, got ${res.status()}`).toBe(true);
        expect(after).toContain(UNHELD);
        await setGrants(request, OTHER_ROLE, seeded);
    });
});
