/**
 * W-4 — Service-client principal check (I-3), regression lock RL-15.
 *
 * Locks three things that are each easy to lose:
 *   1. The check is GREEN against the committed, reviewed allow-list.
 *   2. The check is NOT VACUOUS — it discriminates gated routes from ungated ones, and it
 *      genuinely fails when a route is unlisted. Phase 3 §10.2 exists because a census that
 *      always passes was mistaken for verification for two phases.
 *   3. The exception count RATCHETS. Both lists may only shrink; the baseline may not grow.
 *
 * The check itself is `web/scripts/checkServiceClientPrincipal.mjs`.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runServiceClientPrincipalCheck } from "../../scripts/checkServiceClientPrincipal.mjs";

type Row = {
    route: string;
    holdsServiceClient: boolean;
    reachesServiceClient: boolean;
    resolvesPrincipal: boolean;
};
type Report = {
    ok: boolean;
    counts: Record<string, number>;
    violations: { route: string; kind: string }[];
    stale: { route: string; kind: string; list: string }[];
    rows: Row[];
};

const ALLOWLIST_PATH = resolve(__dirname, "../../scripts/serviceClientPrincipal.allowlist.json");
const allowlist = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8")) as {
    reviewed: string;
    exceptions: { route: string; model: string; reason: string }[];
    baseline: { route: string; frozen: string; why_not_an_exception: string; w15_note: string }[];
    advisory_transitive_only: { route: string; reason: string }[];
};

/**
 * The W-4 baseline, recorded 2026-07-31 (assignment asg_d203f547736c16).
 * These five routes have NO orthogonal authorization model. They are W-15's work.
 * This list is frozen: it may shrink as routes are fixed, never grow.
 */
const FROZEN_BASELINE: string[] = [
    // book-v2 routes were removed from the tree; baseline shrank (allowed) on 2026-08-03.
];

const report = runServiceClientPrincipalCheck() as Report;
const byRoute = new Map(report.rows.map((r) => [r.route, r]));

describe("W-4 · service-client principal check", () => {
    it("passes against the committed allow-list", () => {
        expect({ violations: report.violations, stale: report.stale }).toEqual({ violations: [], stale: [] });
        expect(report.ok).toBe(true);
    });

    it("covers the whole API surface", () => {
        expect(report.counts.routes).toBeGreaterThanOrEqual(539);
        expect(report.rows.length).toBe(report.counts.routes);
    });
});

describe("W-4 · the check is not vacuous", () => {
    // If these ever flip, the predicate has stopped meaning what it says — which is exactly
    // how `auditAuthorityPaths.mjs` came to credit 507 routes when 17 qualified.

    it("credits a route that resolves a principal behind a wrapper", () => {
        // Gated by `getAdminContextCached` → `loadAdminAccessBundleCached` → `getCachedAuthUserId`
        // → `supabase.auth.getClaims()`. Four binding hops from the route; no token appears in
        // the route's own text, so a grep over the file would miss it.
        expect(byRoute.get("app/api/admin/users/route.ts")?.resolvesPrincipal).toBe(true);
    });

    it("credits a route gated through the W-1 analytics helper", () => {
        // `requireAnalyticsReadAccess` — shipped by W-1, never named by this check.
        // Discovered by the graph walk, which is the property that stops the check rotting.
        expect(byRoute.get("app/api/admin/metrics/trends/route.ts")?.resolvesPrincipal).toBe(true);
    });

    it("does NOT credit an unauthenticated public route", () => {
        expect(byRoute.get("app/api/verticals/route.ts")?.resolvesPrincipal).toBe(false);
        expect(byRoute.get("app/api/public/booking-config/route.ts")?.resolvesPrincipal).toBe(false);
    });

    it("analyses bare re-export routes rather than silently passing them", () => {
        // `export { GET } from "…"` carries no identifier reference in the module body. Before
        // this was handled, three admin drawer routes read as "no principal" purely because the
        // walker never followed the re-export edge.
        const reexport = byRoute.get("app/api/admin/v2/view-models/drawer/person/[id]/route.ts");
        expect(reexport?.holdsServiceClient).toBe(true);
        expect(reexport?.resolvesPrincipal).toBe(true);
    });

    it("FAILS when the allow-list is empty — the red state", () => {
        const red = runServiceClientPrincipalCheck({
            exceptions: [],
            baseline: [],
            advisory_transitive_only: [],
        }) as Report;
        expect(red.ok).toBe(false);
        // Every listed route is a genuine finding, not padding.
        expect(red.violations.filter((v) => v.kind === "unlisted")).toHaveLength(
            allowlist.exceptions.length + allowlist.baseline.length
        );
        expect(red.violations.filter((v) => v.kind === "advisory-unlisted")).toHaveLength(
            allowlist.advisory_transitive_only.length
        );
    });

    it("FAILS on a stale entry, so the lists cannot accumulate residue", () => {
        const stale = runServiceClientPrincipalCheck({
            ...allowlist,
            exceptions: [
                ...allowlist.exceptions,
                { route: "app/api/deleted/route.ts", model: "none", reason: "route does not exist" },
                // A gated route has no business being exempted.
                { route: "app/api/admin/users/route.ts", model: "none", reason: "already gated" },
            ],
        }) as Report;
        expect(stale.ok).toBe(false);
        expect(stale.stale.map((s) => s.kind).sort()).toEqual(["stale-missing", "stale-now-resolves"]);
    });
});

describe("W-4 · the exception register is reviewed, not residue", () => {
    it("gives every exception a model and a reason", () => {
        for (const e of allowlist.exceptions) {
            expect(e.model, e.route).toBeTruthy();
            expect(e.reason?.length ?? 0, e.route).toBeGreaterThan(40);
        }
    });

    it("gives every baseline entry a stated reason it is not an exception", () => {
        for (const e of allowlist.baseline) {
            expect(e.why_not_an_exception?.length ?? 0, e.route).toBeGreaterThan(40);
            expect(e.w15_note, e.route).toBeTruthy();
        }
    });

    it("keeps exceptions and baseline disjoint", () => {
        const exc = new Set(allowlist.exceptions.map((e) => e.route));
        expect(allowlist.baseline.filter((b) => exc.has(b.route))).toEqual([]);
    });

    it("every listed route still exists and still holds a service client", () => {
        for (const e of [...allowlist.exceptions, ...allowlist.baseline]) {
            expect(byRoute.get(e.route)?.holdsServiceClient, e.route).toBe(true);
        }
    });
});

describe("W-4 · the ratchet", () => {
    it("does not grow the frozen W-15 baseline", () => {
        // Removing an entry (fixing a route) is expected and allowed; adding one is not.
        const current = allowlist.baseline.map((b) => b.route);
        expect(current.filter((r) => !FROZEN_BASELINE.includes(r))).toEqual([]);
    });

    it("does not grow the total exception count past the 2026-07-31 baseline of 26", () => {
        expect(report.counts.subject_unresolved).toBeLessThanOrEqual(26);
    });

    it("does not grow the advisory transitive-only set past its baseline of 3", () => {
        expect(report.counts.transitive_only_unresolved).toBeLessThanOrEqual(3);
    });
});
