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
    ratchet: {
        max_subject_unresolved: number | null;
        max_transitive_only_unresolved: number | null;
        max_baseline: number | null;
    };
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
    ratchet: { max_subject_unresolved: number; max_transitive_only_unresolved: number; max_baseline: number };
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
                // Reasons are long enough to clear the register-integrity floor, so this test
                // isolates staleness rather than also tripping the reviewedness clause.
                {
                    route: "app/api/deleted/route.ts",
                    model: "none",
                    reason: "fixture: the route file does not exist, which is the staleness this asserts",
                },
                // A gated route has no business being exempted.
                {
                    route: "app/api/admin/users/route.ts",
                    model: "none",
                    reason: "fixture: already gated, so listing it as an exception is stale residue",
                },
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

    // The ceilings now live in the register and are enforced by the CHECK, so `prebuild` fails on
    // a breach rather than only `vitest`. That change is the fix for how this lock came to be red:
    // e7e585010 grew the advisory set 3 → 9 in an allow-list-only commit, and nothing in the build
    // path could see it. These tests assert the ceilings are pinned to the live floor — which is
    // strictly stronger than the old `toBeLessThanOrEqual`, because a ceiling sitting ABOVE the
    // floor is exactly the slack that handed out 9 free exceptions in the 2026-08-04 run.

    it("pins all three ceilings to the live floor — no slack, in either direction", () => {
        expect({
            unresolved: allowlist.ratchet.max_subject_unresolved,
            advisory: allowlist.ratchet.max_transitive_only_unresolved,
            baseline: allowlist.ratchet.max_baseline,
        }).toEqual({
            unresolved: report.counts.subject_unresolved,
            advisory: report.counts.transitive_only_unresolved,
            baseline: report.counts.listed_baseline,
        });
    });

    it("reports the register's ceilings rather than inventing its own", () => {
        expect(report.ratchet).toEqual({
            max_subject_unresolved: allowlist.ratchet.max_subject_unresolved,
            max_transitive_only_unresolved: allowlist.ratchet.max_transitive_only_unresolved,
            max_baseline: allowlist.ratchet.max_baseline,
        });
    });

    it("FAILS when a ceiling is left above a fallen floor — the slack state", () => {
        const slack = runServiceClientPrincipalCheck({
            ...allowlist,
            ratchet: {
                max_subject_unresolved: allowlist.ratchet.max_subject_unresolved + 9,
                max_transitive_only_unresolved: allowlist.ratchet.max_transitive_only_unresolved,
            },
        }) as Report;
        expect(slack.ok).toBe(false);
        expect(slack.stale.filter((s) => s.kind === "ratchet-slack").map((s) => s.route)).toEqual([
            "ratchet.max_subject_unresolved",
        ]);
    });

    it("FAILS when the count grows past a ceiling — the breach state", () => {
        // The shape of the actual regression: the advisory set grew and the ceiling did not move.
        const breach = runServiceClientPrincipalCheck({
            ...allowlist,
            ratchet: { max_subject_unresolved: allowlist.ratchet.max_subject_unresolved, max_transitive_only_unresolved: 3 },
        }) as Report;
        expect(breach.ok).toBe(false);
        expect(breach.violations.filter((v) => v.kind === "ratchet-exceeded").map((v) => v.route)).toEqual([
            "ratchet.max_transitive_only_unresolved",
        ]);
    });

    it("FAILS when no ceiling is recorded at all, so the count cannot be left unbounded", () => {
        const missing = runServiceClientPrincipalCheck({ ...allowlist, ratchet: undefined }) as Report;
        expect(missing.ok).toBe(false);
        expect(missing.violations.filter((v) => v.kind === "ratchet-missing")).toHaveLength(3);
    });
});

/**
 * The 2026-08-06 repair moved the ceilings into the check because `prebuild` could not see the
 * lock. It moved ONLY the ceilings. On 2026-09-06 the sixth issuance showed the consequence at the
 * CLI: relabel all 22 reviewed exceptions as unreasoned `baseline`, drop every `model` and
 * `reason`, and the check exits 0 — the register loses its reviewedness with a green build.
 *
 * These lock the clauses now enforced by the check itself. Each asserts the RED state, because a
 * clause that cannot be shown to fail is not enforced; §10.2 exists for exactly that reason.
 */
describe("W-4 · the register cannot be stripped of its review while staying green", () => {
    it("FAILS when a reviewed exception is relabelled as unreasoned frozen baseline", () => {
        const [first, ...rest] = allowlist.exceptions;
        const relabelled = runServiceClientPrincipalCheck({
            ...allowlist,
            exceptions: rest,
            baseline: [{ route: first.route }],
        }) as Report;
        expect(relabelled.ok).toBe(false);
        // Both clauses bite: the baseline grew past 0, and the moved entry states no reason.
        expect(relabelled.violations.filter((v) => v.kind === "register-baseline-unreasoned")).toHaveLength(1);
        expect(relabelled.violations.filter((v) => v.kind === "ratchet-exceeded").map((v) => v.route)).toContain(
            "ratchet.max_baseline"
        );
    });

    it("FAILS when the WHOLE exception list is relabelled — the demonstrated escape", () => {
        const stripped = runServiceClientPrincipalCheck({
            ...allowlist,
            exceptions: [],
            baseline: allowlist.exceptions.map((e) => ({ route: e.route })),
        }) as Report;
        expect(stripped.ok).toBe(false);
        expect(stripped.violations.filter((v) => v.kind === "register-baseline-unreasoned")).toHaveLength(
            allowlist.exceptions.length
        );
    });

    it("FAILS when an exception is stripped of its model or its reason in place", () => {
        const [first, ...rest] = allowlist.exceptions;
        const unreasoned = runServiceClientPrincipalCheck({
            ...allowlist,
            exceptions: [{ route: first.route, model: "", reason: "" }, ...rest],
        }) as Report;
        expect(unreasoned.ok).toBe(false);
        expect(unreasoned.violations.filter((v) => v.kind === "register-exception-unreasoned")).toEqual([
            expect.objectContaining({ route: first.route }),
        ]);
    });

    it("FAILS when the same route is listed in both lists, which mean opposite things", () => {
        const [first] = allowlist.exceptions;
        const overlapping = runServiceClientPrincipalCheck({
            ...allowlist,
            baseline: [
                {
                    route: first.route,
                    why_not_an_exception:
                        "a reason long enough to clear the forty-character floor this check enforces",
                    w15_note: "fixture",
                },
            ],
        }) as Report;
        expect(overlapping.ok).toBe(false);
        expect(overlapping.violations.filter((v) => v.kind === "register-overlap").map((v) => v.route)).toEqual([
            first.route,
        ]);
    });

    it("is GREEN on the committed register — the clauses cost the current lists nothing", () => {
        expect(report.violations.filter((v) => v.kind.startsWith("register-"))).toEqual([]);
    });
});
