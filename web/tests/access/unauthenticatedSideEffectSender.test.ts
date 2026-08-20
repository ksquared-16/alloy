/**
 * W-40 — `S-1`: every unauthenticated side-effect route authenticates its sender. Lock `RL-30`.
 *
 * `01…§17` states S-1 as *"held today by both webhook families and the delegated-link family; V2
 * must make it a **property, not a pattern**."* Until this suite existed it was a pattern: every
 * family that held the invariant held it because someone had written it that way, and nothing in
 * the build could tell a route that verifies its sender from one that forgot.
 *
 * Locks four things, each easy to lose:
 *   1. The check is GREEN against the committed, reviewed register.
 *   2. The check is NOT VACUOUS — it discriminates each of the three sender models from no model
 *      at all, and it genuinely fails when a route is unlisted. Phase 3 §10.2 exists because a
 *      census that always passes was mistaken for verification for two phases.
 *   3. The exemption count RATCHETS, in both directions.
 *   4. The check AGREES with W-4's independent implementation of the shared base case, over all
 *      572 routes. See the agreement block for why that is load-bearing.
 *
 * The check itself is `web/scripts/checkUnauthenticatedSideEffects.mjs`.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runUnauthenticatedSideEffectCheck } from "../../scripts/checkUnauthenticatedSideEffects.mjs";
import { runServiceClientPrincipalCheck } from "../../scripts/checkServiceClientPrincipal.mjs";

type Row = {
    route: string;
    methods: string[];
    sideEffecting: boolean;
    authenticatesSender: boolean;
    model: "session" | "signature" | "credential" | null;
};
type Report = {
    ok: boolean;
    counts: {
        routes: number;
        side_effecting: number;
        side_effecting_authenticated: number;
        side_effecting_unauthenticated: number;
        sessionless_side_effecting: number;
        sessionless_sender_verified: number;
        listed_exemptions: number;
        by_model: { session: number; signature: number; credential: number };
    };
    ratchet: { max_unauthenticated_side_effect_routes: number | null };
    violations: { route: string; kind: string }[];
    stale: { route: string; kind: string; list: string }[];
    unauthenticated: { route: string; methods: string[] }[];
    sessionless_side_effecting_routes: { route: string; model: string | null }[];
    rows: Row[];
};

const REGISTER_PATH = resolve(__dirname, "../../scripts/unauthenticatedSideEffects.allowlist.json");
const register = JSON.parse(readFileSync(REGISTER_PATH, "utf8")) as {
    reviewed: string;
    ratchet: { max_unauthenticated_side_effect_routes: number };
    exemptions: { route: string; model: string; reason: string }[];
};

const report = runUnauthenticatedSideEffectCheck() as Report;
const byRoute = new Map(report.rows.map((r) => [r.route, r]));

describe("W-40 · S-1 · the unauthenticated side-effect check", () => {
    it("passes against the committed register", () => {
        expect({ violations: report.violations, stale: report.stale }).toEqual({ violations: [], stale: [] });
        expect(report.ok).toBe(true);
    });

    it("covers the whole API surface", () => {
        expect(report.counts.routes).toBeGreaterThanOrEqual(539);
        expect(report.rows.length).toBe(report.counts.routes);
    });

    it("derives the side-effecting subject from the export table, not from the body", () => {
        // Next.js's own contract: a module exporting POST/PUT/PATCH/DELETE produces a side effect
        // by declaration. Asserting a known GET-only route stays OUT keeps the subject honest —
        // if this flips, the predicate has started guessing from handler text.
        const readOnly = byRoute.get("app/api/verticals/route.ts");
        expect(readOnly?.methods).toEqual(["GET"]);
        expect(readOnly?.sideEffecting).toBe(false);
    });
});

describe("W-40 · the check is not vacuous — each sender model is discriminated", () => {
    // If any of these flips, the predicate has stopped meaning what it says — which is how
    // `auditAuthorityPaths.mjs` came to credit 507 routes when 17 qualified.

    it("credits the webhook family by SIGNATURE, not by session", () => {
        // `new Webhook(secret).verify(...)` at resend/route.ts:69. This route resolves no principal
        // at all — W-4 lists it as a reviewed exception for exactly that reason — so if this said
        // "session" the two checks would be measuring the same thing and one of them is wrong.
        const resend = byRoute.get("app/api/webhooks/resend/route.ts");
        expect(resend?.sideEffecting).toBe(true);
        expect(resend?.model).toBe("signature");
    });

    it("credits the delegated-link family by CREDENTIAL-BOUND selection", () => {
        // The row is selected BY the bearer token — `.eq("token", token)` — which is the property
        // the W-4 register already reasons in ("Row selected by the bearer token").
        expect(byRoute.get("app/api/action/[token]/consume/route.ts")?.model).toBe("credential");
        // Reached through a helper (`resolvePublicFormLink` → `.eq("token_hash", …)`), so a grep
        // over the route file would miss it. This is the binding walk earning its keep.
        expect(byRoute.get("app/api/public/forms/[token]/submissions/route.ts")?.model).toBe("credential");
    });

    it("credits an ordinary admin route by SESSION, and so removes it from S-1's subject", () => {
        const admin = byRoute.get("app/api/admin/users/route.ts");
        expect(admin?.model).toBe("session");
        expect(report.sessionless_side_effecting_routes.map((r) => r.route)).not.toContain(
            "app/api/admin/users/route.ts"
        );
    });

    it("does NOT credit a public intake route that verifies nothing", () => {
        for (const route of register.exemptions.map((e) => e.route)) {
            expect(byRoute.get(route)?.authenticatesSender, route).toBe(false);
            expect(byRoute.get(route)?.model, route).toBeNull();
        }
    });

    it("FAILS when the register is empty — the red state", () => {
        const red = runUnauthenticatedSideEffectCheck({
            exemptions: [],
            ratchet: register.ratchet,
        }) as Report;
        expect(red.ok).toBe(false);
        // Every listed route is a genuine finding, not padding.
        expect(red.violations.filter((v) => v.kind === "unlisted").map((v) => v.route).sort()).toEqual(
            register.exemptions.map((e) => e.route).sort()
        );
    });

    it("FAILS on a stale entry, so the register cannot accumulate residue", () => {
        const stale = runUnauthenticatedSideEffectCheck({
            ...register,
            exemptions: [
                ...register.exemptions,
                { route: "app/api/deleted/route.ts", model: "none", reason: "route does not exist" },
                // A route that authenticates its sender has no business being exempted.
                { route: "app/api/webhooks/resend/route.ts", model: "none", reason: "already verified" },
                // Neither has a read-only route.
                { route: "app/api/verticals/route.ts", model: "none", reason: "GET only" },
            ],
        }) as Report;
        expect(stale.ok).toBe(false);
        expect(stale.stale.map((s) => s.kind).sort()).toEqual([
            "stale-missing",
            "stale-no-side-effect",
            "stale-now-authenticates",
        ]);
    });
});

describe("W-40 · S-1's population is the public surface, and it is small and named", () => {
    it("separates 'behind a session' from 'sessionless' rather than counting them together", () => {
        // The number that matters is not "376 side-effecting routes" — it is the far smaller set
        // reachable with no session at all. Reporting the big number would make the invariant look
        // unmeetable and would hide the set that actually needs review.
        expect(report.counts.sessionless_side_effecting).toBeLessThan(report.counts.side_effecting / 5);
        expect(report.counts.sessionless_side_effecting).toBe(
            report.counts.sessionless_sender_verified + report.counts.side_effecting_unauthenticated
        );
    });

    it("finds every family the invariant says holds it today", () => {
        // `01…§17`: "held today by both webhook families and the delegated-link family". Discovery,
        // not enumeration: if a family stops being found, the check has gone blind to it.
        const sessionless = report.sessionless_side_effecting_routes;
        const verified = sessionless.filter((r) => r.model !== null).map((r) => r.route);
        expect(verified.some((r) => r.startsWith("app/api/webhooks/resend"))).toBe(true);
        expect(verified.some((r) => r.startsWith("app/api/webhooks/twilio/"))).toBe(true);
        expect(verified.some((r) => r.startsWith("app/api/action-links/"))).toBe(true);
        expect(verified.some((r) => r.startsWith("app/api/public/forms/"))).toBe(true);
        expect(verified.some((r) => r.startsWith("app/api/public/tour-booking/"))).toBe(true);
    });

    it("leaves exactly the reviewed public-intake routes unverified", () => {
        expect(report.unauthenticated.map((r) => r.route).sort()).toEqual(
            register.exemptions.map((e) => e.route).sort()
        );
    });
});

describe("W-40 · the register is reviewed, not residue", () => {
    it("gives every exemption a model and a reason", () => {
        for (const e of register.exemptions) {
            expect(e.model, e.route).toBeTruthy();
            expect(e.reason?.length ?? 0, e.route).toBeGreaterThan(80);
        }
    });

    it("records the unbounded side effect for each, so W-35 inherits a sized list", () => {
        // An exemption from "authenticate the sender" is not an exemption from "be bounded". If a
        // reason stops naming what is unbounded, the handoff to W-35 has quietly become a TODO.
        for (const e of register.exemptions) {
            expect(e.reason, e.route).toMatch(/UNBOUNDED|no rate limit/i);
            expect(e.reason, e.route).toMatch(/W-35/);
        }
    });

    it("every listed route still exists and still exports a side-effecting method", () => {
        for (const e of register.exemptions) {
            expect(byRoute.get(e.route)?.sideEffecting, e.route).toBe(true);
        }
    });
});

describe("W-40 · the ratchet", () => {
    it("pins the ceiling to the live floor — no slack, in either direction", () => {
        expect(register.ratchet.max_unauthenticated_side_effect_routes).toBe(
            report.counts.side_effecting_unauthenticated
        );
    });

    it("reports the register's ceiling rather than inventing its own", () => {
        expect(report.ratchet).toEqual({
            max_unauthenticated_side_effect_routes:
                register.ratchet.max_unauthenticated_side_effect_routes,
        });
    });

    it("FAILS when a ceiling is left above a fallen floor — the slack state", () => {
        const slack = runUnauthenticatedSideEffectCheck({
            ...register,
            ratchet: {
                max_unauthenticated_side_effect_routes:
                    register.ratchet.max_unauthenticated_side_effect_routes + 5,
            },
        }) as Report;
        expect(slack.ok).toBe(false);
        expect(slack.stale.filter((s) => s.kind === "ratchet-slack")).toHaveLength(1);
    });

    it("FAILS when the count grows past a ceiling — the breach state", () => {
        const breach = runUnauthenticatedSideEffectCheck({
            ...register,
            ratchet: { max_unauthenticated_side_effect_routes: 0 },
        }) as Report;
        expect(breach.ok).toBe(false);
        expect(breach.violations.filter((v) => v.kind === "ratchet-exceeded")).toHaveLength(1);
    });

    it("FAILS when no ceiling is recorded at all, so the count cannot be left unbounded", () => {
        const missing = runUnauthenticatedSideEffectCheck({ ...register, ratchet: undefined }) as Report;
        expect(missing.ok).toBe(false);
        expect(missing.violations.filter((v) => v.kind === "ratchet-missing")).toHaveLength(1);
    });
});

describe("W-40 · agreement with W-4 on the shared base case", () => {
    /**
     * Both checks answer "does this route reach `x.auth.getUser|getClaims|getSession()` through
     * real bindings", from two INDEPENDENT implementations — W-4's own walker, and this check's
     * via `scripts/lib/bindingGraph.mjs`. The graph module was extracted from W-4's walker, and
     * `checkServiceClientPrincipal.mjs` was deliberately NOT rewritten to consume it: rewriting a
     * green, load-bearing, build-gating check to prove a refactor is risk taken for nothing.
     *
     * The cost of not rewriting it is two copies that can drift. This test is the payment: drift
     * is caught continuously, over all 572 routes, rather than assumed away. It is a strictly
     * stronger guarantee than shared code would give, because shared code cannot fail a test.
     */
    it("agrees with the W-4 check on session-principal resolution for every route", () => {
        const w4 = runServiceClientPrincipalCheck() as {
            rows: { route: string; resolvesPrincipal: boolean }[];
        };
        const w4ByRoute = new Map(w4.rows.map((r) => [r.route, r.resolvesPrincipal]));

        const disagreements = report.rows
            .filter((r) => w4ByRoute.has(r.route))
            .filter((r) => (r.model === "session") !== w4ByRoute.get(r.route))
            .map((r) => ({ route: r.route, thisCheck: r.model, w4: w4ByRoute.get(r.route) }));

        expect(disagreements).toEqual([]);
    });
});
