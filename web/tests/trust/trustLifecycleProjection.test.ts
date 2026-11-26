/**
 * Phase 0 Slice 0.4 — Decision Package lifecycle projection.
 *
 * Proves the projection is TOTAL and DETERMINISTIC over an immutable package
 * plus append-only observations, that contradictory persisted history fails
 * loudly rather than resolving to whichever row was read last, and that a future
 * BOS status can be derived from it without any mutable field.
 *
 * Every case here is synthetic. Nothing in this suite touches a database, a
 * route, a BOS surface or a live adapter.
 *
 * @see docs/platform/planning/trust-adoption/TRUST-PLATFORM-ADOPTION-ASSESSMENT.md — Slice 0.4
 */

import { describe, expect, it } from "vitest";

import {
    bosStatusFromLifecycleProjection,
    deriveBosProposalPresentation,
    UNREACHABLE_BOS_STATUSES,
} from "@/lib/trust/lifecycle/bosStatusCompatibility";
import {
    DecisionPackageLifecycleError,
    LIFECYCLE_DISPOSITIONS,
    projectDecisionPackageLifecycle,
    requireDecisionPackageLifecycle,
    type DecisionPackageLifecycleProjection,
    type LifecycleProjectionResult,
} from "@/lib/trust/lifecycle/decisionPackageLifecycle";
import {
    orderObservationsCanonically,
    TRUST_OBSERVATION_KINDS,
    type LifecycleObservationRecord,
    type LifecycleSubjectPackage,
} from "@/lib/trust/lifecycle/lifecycleObservation";

const ORG = "org-1";
const PKG = "pkg-1";
const NEXT_PKG = "pkg-2";
const NOW = "2026-08-04T12:00:00.000Z";

function subject(over: Partial<LifecycleSubjectPackage> = {}): LifecycleSubjectPackage {
    return {
        id: PKG,
        org_id: ORG,
        outcome: "recommended",
        created_at_iso: "2026-08-04T10:00:00.000Z",
        supersedes_package_id: null,
        ...over,
    };
}

let seq = 0;
function obs(
    kind: string,
    over: Partial<LifecycleObservationRecord> = {},
): LifecycleObservationRecord {
    seq += 1;
    return {
        id: `obs-${String(seq).padStart(4, "0")}`,
        org_id: ORG,
        package_id: PKG,
        observation_kind: kind,
        observed_by_actor_type: "operator",
        observed_by_actor_id: "user-1",
        channel: "operator",
        execution_reference: null,
        detail: {},
        observed_at_iso: `2026-08-04T11:0${(seq % 10).toString()}:00.000Z`,
        ...over,
    };
}

function project(
    observations: readonly LifecycleObservationRecord[],
    over: {
        pkg?: LifecycleSubjectPackage;
        supersedingPackages?: Parameters<typeof projectDecisionPackageLifecycle>[0]["supersedingPackages"];
    } = {},
): LifecycleProjectionResult {
    return projectDecisionPackageLifecycle({
        package: over.pkg ?? subject(),
        observations,
        projectedAtIso: NOW,
        supersedingPackages: over.supersedingPackages,
    });
}

function ok(result: LifecycleProjectionResult): DecisionPackageLifecycleProjection {
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`expected a projection, got ${result.error.code}`);
    return result.projection;
}

const supersededDetail = (id = NEXT_PKG, reason = "newer evidence") => ({
    superseding_package_id: id,
    reason,
});

// ---------------------------------------------------------------------------
// The core cases
// ---------------------------------------------------------------------------

describe("dispositions", () => {
    it("no observations → proposed, and the operator may still act", () => {
        const p = ok(project([]));
        expect(p.disposition).toBe("proposed");
        expect(p.review.state).toBe("unreviewed");
        expect(p.execution.state).toBe("not_bound");
        expect(p.expiry.expired).toBe(false);
        expect(p.supersession.superseded).toBe(false);
        expect(p.operator_action_available).toBe(true);
        expect(p.observation_count).toBe(0);
        expect(p.latest_observation).toBeNull();
    });

    it("presented → presented, still actionable", () => {
        const p = ok(project([obs("presented")]));
        expect(p.disposition).toBe("presented");
        expect(p.operator_action_available).toBe(true);
    });

    it("accepted → accepted, no longer actionable, execution NOT inferred", () => {
        const p = ok(project([obs("presented"), obs("accepted")]));
        expect(p.disposition).toBe("accepted");
        expect(p.review.state).toBe("accepted");
        // The whole point of the execution boundary: acceptance is not execution.
        expect(p.execution.state).toBe("not_bound");
        expect(p.operator_action_available).toBe(false);
    });

    it("rejected → rejected", () => {
        const p = ok(project([obs("presented"), obs("rejected")]));
        expect(p.disposition).toBe("rejected");
        expect(p.review.state).toBe("rejected");
        expect(p.operator_action_available).toBe(false);
    });

    it("deferred → deferred, still actionable", () => {
        const p = ok(project([obs("deferred")]));
        expect(p.disposition).toBe("deferred");
        expect(p.operator_action_available).toBe(true);
    });

    it("expired before review → expired, review still unreviewed", () => {
        const p = ok(project([obs("expired", { detail: { expiry_kind: "scheduled" } })]));
        expect(p.disposition).toBe("expired");
        expect(p.expiry).toMatchObject({ expired: true, kind: "scheduled" });
        expect(p.review.state).toBe("unreviewed");
        expect(p.operator_action_available).toBe(false);
    });

    it("superseded before review → superseded, review still unreviewed", () => {
        const p = ok(project([obs("superseded", { detail: supersededDetail() })]));
        expect(p.disposition).toBe("superseded");
        expect(p.supersession).toMatchObject({ superseded: true, superseding_package_id: NEXT_PKG });
        expect(p.review.state).toBe("unreviewed");
    });

    it("accepted then expired → BOTH facts survive; disposition is expired", () => {
        const p = ok(project([obs("accepted"), obs("expired", { detail: { expiry_kind: "scheduled" } })]));
        expect(p.disposition).toBe("expired");
        // The dimension separation earns its keep here.
        expect(p.review.state).toBe("accepted");
        expect(p.expiry.expired).toBe(true);
    });

    it("accepted then superseded → BOTH facts survive; disposition is superseded", () => {
        const p = ok(project([obs("accepted"), obs("superseded", { detail: supersededDetail() })]));
        expect(p.disposition).toBe("superseded");
        expect(p.review.state).toBe("accepted");
        expect(p.supersession.superseded).toBe(true);
    });

    it("accepted then executed → executed, with the execution reference", () => {
        const p = ok(project([obs("accepted"), obs("executed", { execution_reference: "cmd-invocation-9" })]));
        expect(p.disposition).toBe("executed");
        expect(p.execution).toMatchObject({ state: "executed", reference: "cmd-invocation-9" });
        expect(p.review.state).toBe("accepted");
    });

    it("accepted then execution failed → execution_failed", () => {
        const p = ok(
            project([obs("accepted"), obs("outcome", { detail: { result: "failed" }, execution_reference: "cmd-7" })]),
        );
        expect(p.disposition).toBe("execution_failed");
        expect(p.execution).toMatchObject({ state: "failed", result: "failed", reference: "cmd-7" });
    });

    it("execution outranks standing — executed after supersession still projects executed", () => {
        const p = ok(
            project([
                obs("accepted"),
                obs("superseded", { detail: supersededDetail() }),
                obs("executed", { execution_reference: "cmd-late" }),
            ]),
        );
        expect(p.disposition).toBe("executed");
        // Standing is not erased; it is simply outranked.
        expect(p.supersession.superseded).toBe(true);
    });

    it("a refusal package is not actionable, whatever observations exist", () => {
        for (const outcome of ["refused_policy", "refused_permission", "failed_validation", "failed_reasoning"]) {
            const p = ok(project([obs("presented")], { pkg: subject({ outcome }) }));
            expect(p.disposition).toBe("not_actionable");
            expect(p.operator_action_available).toBe(false);
        }
    });

    it("every declared disposition is reachable", () => {
        const seen = new Set<string>();
        seen.add(ok(project([])).disposition);
        seen.add(ok(project([obs("presented")])).disposition);
        seen.add(ok(project([obs("deferred")])).disposition);
        seen.add(ok(project([obs("accepted")])).disposition);
        seen.add(ok(project([obs("rejected")])).disposition);
        seen.add(ok(project([obs("expired", { detail: { expiry_kind: "policy" } })])).disposition);
        seen.add(ok(project([obs("superseded", { detail: supersededDetail() })])).disposition);
        seen.add(ok(project([obs("executed")])).disposition);
        seen.add(ok(project([obs("outcome", { detail: { result: "failed" } })])).disposition);
        seen.add(ok(project([obs("presented")], { pkg: subject({ outcome: "refused_policy" }) })).disposition);

        expect([...seen].sort()).toEqual([...LIFECYCLE_DISPOSITIONS].sort());
    });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe("the projection is deterministic and order-independent", () => {
    const history = [
        obs("presented", { id: "obs-b", observed_at_iso: "2026-08-04T11:00:00.000Z" }),
        obs("accepted", { id: "obs-c", observed_at_iso: "2026-08-04T11:05:00.000Z" }),
        obs("expired", {
            id: "obs-a",
            observed_at_iso: "2026-08-04T11:09:00.000Z",
            detail: { expiry_kind: "scheduled" },
        }),
    ];

    it("shuffled input produces an identical projection", () => {
        const forward = ok(project(history));
        const reversed = ok(project([...history].reverse()));
        const rotated = ok(project([history[2]!, history[0]!, history[1]!]));

        expect(reversed).toEqual(forward);
        expect(rotated).toEqual(forward);
    });

    it("equal timestamps tie-break on the canonical identifier, not array order", () => {
        const t = "2026-08-04T11:00:00.000Z";
        const a = obs("presented", { id: "obs-aaa", observed_at_iso: t });
        const b = obs("deferred", { id: "obs-bbb", observed_at_iso: t });

        const forward = ok(project([a, b]));
        const backward = ok(project([b, a]));
        expect(backward).toEqual(forward);
        // `latest_observation` must be the id-greater row, in both input orders.
        expect(forward.latest_observation?.observation_id).toBe("obs-bbb");
        expect(backward.latest_observation?.observation_id).toBe("obs-bbb");
    });

    it("out-of-chronological-order input is ordered before projection", () => {
        const late = obs("accepted", { id: "obs-1", observed_at_iso: "2026-08-04T11:30:00.000Z" });
        const early = obs("presented", { id: "obs-2", observed_at_iso: "2026-08-04T11:00:00.000Z" });
        const p = ok(project([late, early]));

        expect(p.review.state).toBe("accepted");
        expect(p.latest_observation?.observation_id).toBe("obs-1");
    });

    it("repeated identical observations are idempotent", () => {
        const once = ok(project([obs("accepted", { id: "obs-x", observed_at_iso: "2026-08-04T11:00:00.000Z" })]));
        const thrice = ok(
            project([
                obs("accepted", { id: "obs-x", observed_at_iso: "2026-08-04T11:00:00.000Z" }),
                obs("accepted", { id: "obs-y", observed_at_iso: "2026-08-04T11:01:00.000Z" }),
                obs("accepted", { id: "obs-z", observed_at_iso: "2026-08-04T11:02:00.000Z" }),
            ]),
        );

        expect(thrice.disposition).toBe(once.disposition);
        expect(thrice.review.state).toBe(once.review.state);
        // The FIRST occurrence is the evidence — a fact cannot re-happen.
        expect(thrice.review.evidence?.observation_id).toBe("obs-x");
        expect(once.review.evidence?.observation_id).toBe("obs-x");
    });

    it("canonical ordering never mutates its input", () => {
        const input = [obs("accepted"), obs("presented")];
        const snapshot = JSON.stringify(input);
        orderObservationsCanonically(input);
        expect(JSON.stringify(input)).toBe(snapshot);
    });

    it("projection mutates neither the package nor the observations", () => {
        const pkg = subject();
        const observations = [obs("accepted"), obs("expired", { detail: { expiry_kind: "policy" } })];
        const pkgBefore = JSON.stringify(pkg);
        const obsBefore = JSON.stringify(observations);

        projectDecisionPackageLifecycle({ package: pkg, observations, projectedAtIso: NOW });

        expect(JSON.stringify(pkg)).toBe(pkgBefore);
        expect(JSON.stringify(observations)).toBe(obsBefore);
    });

    it("the same input projected twice is identical", () => {
        const observations = [obs("accepted"), obs("executed", { execution_reference: "ref" })];
        expect(ok(project(observations))).toEqual(ok(project(observations)));
    });
});

// ---------------------------------------------------------------------------
// Invalid persisted history
// ---------------------------------------------------------------------------

describe("contradictory history fails loudly", () => {
    const errorOf = (result: LifecycleProjectionResult) => {
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected a structured error");
        return result.error;
    };

    it("accepted and rejected together is invalid history, not a precedence question", () => {
        const e = errorOf(project([obs("accepted"), obs("rejected")]));
        expect(e.code).toBe("CONTRADICTORY_REVIEW");
        expect(e.observation_ids.length).toBe(2);
        // Neither row silently wins.
        expect(e.detail).toContain("one of these rows is invalid history");
    });

    it("the contradiction is detected in either input order", () => {
        const a = obs("accepted", { id: "obs-a", observed_at_iso: "2026-08-04T11:00:00.000Z" });
        const r = obs("rejected", { id: "obs-r", observed_at_iso: "2026-08-04T11:01:00.000Z" });
        expect(errorOf(project([a, r])).code).toBe("CONTRADICTORY_REVIEW");
        expect(errorOf(project([r, a])).code).toBe("CONTRADICTORY_REVIEW");
    });

    it("disagreeing execution results are invalid", () => {
        const e = errorOf(
            project([obs("outcome", { detail: { result: "succeeded" } }), obs("outcome", { detail: { result: "failed" } })]),
        );
        expect(e.code).toBe("CONTRADICTORY_EXECUTION_RESULT");
    });

    it("two different superseding packages are invalid", () => {
        const e = errorOf(
            project([
                obs("superseded", { detail: supersededDetail("pkg-2") }),
                obs("superseded", { detail: supersededDetail("pkg-3") }),
            ]),
        );
        expect(e.code).toBe("CONTRADICTORY_SUPERSESSION");
    });

    it("disagreeing expiry kinds are invalid", () => {
        const e = errorOf(
            project([
                obs("expired", { detail: { expiry_kind: "scheduled" } }),
                obs("expired", { detail: { expiry_kind: "administrative" } }),
            ]),
        );
        expect(e.code).toBe("CONTRADICTORY_EXPIRY");
    });

    it("self-supersession is refused", () => {
        const e = errorOf(project([obs("superseded", { detail: supersededDetail(PKG) })]));
        expect(e.code).toBe("SELF_SUPERSESSION");
    });

    it("cross-org supersession is refused when the successor is supplied", () => {
        const e = errorOf(
            project([obs("superseded", { detail: supersededDetail(NEXT_PKG) })], {
                supersedingPackages: {
                    [NEXT_PKG]: { id: NEXT_PKG, org_id: "another-org", supersedes_package_id: PKG },
                },
            }),
        );
        expect(e.code).toBe("CROSS_ORG_SUPERSESSION");
    });

    it("a two-package supersession cycle is refused", () => {
        const e = errorOf(
            project([obs("superseded", { detail: supersededDetail(NEXT_PKG) })], {
                pkg: subject({ supersedes_package_id: NEXT_PKG }),
                supersedingPackages: {
                    [NEXT_PKG]: { id: NEXT_PKG, org_id: ORG, supersedes_package_id: PKG },
                },
            }),
        );
        expect(e.code).toBe("SUPERSESSION_CYCLE");
    });

    it("supersession without a superseding package id is refused", () => {
        expect(errorOf(project([obs("superseded", { detail: { reason: "x" } })])).code).toBe(
            "MISSING_SUPERSEDING_PACKAGE_ID",
        );
    });

    it("expiry without a recognised kind is refused", () => {
        expect(errorOf(project([obs("expired", { detail: {} })])).code).toBe("MISSING_EXPIRY_KIND");
        expect(errorOf(project([obs("expired", { detail: { expiry_kind: "whenever" } })])).code).toBe(
            "MISSING_EXPIRY_KIND",
        );
    });

    it("an unknown observation kind fails closed", () => {
        const e = errorOf(project([obs("some_future_kind")]));
        expect(e.code).toBe("UNKNOWN_OBSERVATION_KIND");
        expect(e.detail).toContain("The vocabulary is closed");
    });

    it("an observation for another package or another org is refused", () => {
        expect(errorOf(project([obs("accepted", { package_id: "other-pkg" })])).code).toBe(
            "OBSERVATION_PACKAGE_MISMATCH",
        );
        expect(errorOf(project([obs("accepted", { org_id: "other-org" })])).code).toBe("OBSERVATION_ORG_MISMATCH");
    });

    it("lineage verification is reported as unverified when the successor is not supplied", () => {
        const p = ok(project([obs("superseded", { detail: supersededDetail() })]));
        expect(p.supersession.lineage_verified).toBe(false);
        const verified = ok(
            project([obs("superseded", { detail: supersededDetail() })], {
                supersedingPackages: { [NEXT_PKG]: { id: NEXT_PKG, org_id: ORG, supersedes_package_id: PKG } },
            }),
        );
        expect(verified.supersession.lineage_verified).toBe(true);
    });

    it("require* throws a structured error; project* never throws", () => {
        expect(() =>
            requireDecisionPackageLifecycle({
                package: subject(),
                observations: [obs("accepted"), obs("rejected")],
                projectedAtIso: NOW,
            }),
        ).toThrow(DecisionPackageLifecycleError);

        expect(() => project([obs("accepted"), obs("rejected")])).not.toThrow();
    });

    it("the vocabulary the projection accepts matches the persisted vocabulary", () => {
        // If a kind is added to the database CHECK without being handled here,
        // this fails rather than the projection silently refusing live rows.
        expect([...TRUST_OBSERVATION_KINDS].sort()).toEqual(
            [
                "accepted",
                "deferred",
                "executed",
                "expired",
                "modified",
                "outcome",
                "overridden",
                "presented",
                "rejected",
                "superseded",
            ].sort(),
        );
        for (const kind of TRUST_OBSERVATION_KINDS) {
            const detail =
                kind === "expired"
                    ? { expiry_kind: "scheduled" }
                    : kind === "superseded"
                      ? supersededDetail()
                      : {};
            expect(project([obs(kind, { detail })]).ok).toBe(true);
        }
    });
});

// ---------------------------------------------------------------------------
// Package immutability and provider independence
// ---------------------------------------------------------------------------

describe("the projection respects the package contract", () => {
    it("carries no provider identity anywhere", () => {
        const p = ok(
            project([obs("accepted"), obs("executed", { execution_reference: "cmd-1" })]),
        );
        const serialized = JSON.stringify(p);
        for (const forbidden of ["openai", "anthropic", "azure", "provider_key", "model", "api_key"]) {
            expect(serialized.toLowerCase()).not.toContain(forbidden);
        }
    });

    it("exposes no writable lifecycle field on the package itself", () => {
        const pkg = subject();
        for (const forbidden of ["status", "lifecycle_state", "expired", "superseded_at", "accepted_at"]) {
            expect(Object.keys(pkg)).not.toContain(forbidden);
        }
    });

    it("is a projection at a supplied time, never a clock read", () => {
        const a = ok(
            projectDecisionPackageLifecycle({
                package: subject(),
                observations: [obs("accepted")],
                projectedAtIso: "2026-01-01T00:00:00.000Z",
            }),
        );
        expect(a.projected_at_iso).toBe("2026-01-01T00:00:00.000Z");
    });
});

// ---------------------------------------------------------------------------
// BOS compatibility — pure, dormant
// ---------------------------------------------------------------------------

describe("a future BOS status derives from the projection alone", () => {
    it("maps every disposition to a BOS status", () => {
        for (const disposition of LIFECYCLE_DISPOSITIONS) {
            const fake = { disposition } as unknown as DecisionPackageLifecycleProjection;
            expect(typeof bosStatusFromLifecycleProjection(fake)).toBe("string");
        }
    });

    it("derives the statuses the current BOS vocabulary expects", () => {
        const cases: [readonly LifecycleObservationRecord[], string][] = [
            [[], "validated"],
            [[obs("presented")], "validated"],
            [[obs("accepted")], "approved"],
            [[obs("rejected")], "rejected"],
            [[obs("executed")], "applied"],
            [[obs("outcome", { detail: { result: "failed" } })], "failed"],
            [[obs("expired", { detail: { expiry_kind: "scheduled" } })], "expired"],
            [[obs("superseded", { detail: supersededDetail() })], "superseded"],
        ];
        for (const [observations, expected] of cases) {
            expect(bosStatusFromLifecycleProjection(ok(project(observations)))).toBe(expected);
        }
    });

    it("the derived presentation needs no mutable status field", () => {
        const p = ok(project([obs("accepted")]));
        const presentation = deriveBosProposalPresentation(p);

        expect(presentation).toEqual({
            status: "approved",
            actionable: false,
            reason: p.reason,
            as_of_iso: NOW,
        });
        // The adapter's ONLY input is the projection.
        expect(deriveBosProposalPresentation(p)).toEqual(presentation);
    });

    it("records `draft` as unreachable rather than pretending to produce it", () => {
        expect(Object.keys(UNREACHABLE_BOS_STATUSES)).toEqual(["draft"]);
        for (const disposition of LIFECYCLE_DISPOSITIONS) {
            const fake = { disposition } as unknown as DecisionPackageLifecycleProjection;
            expect(bosStatusFromLifecycleProjection(fake)).not.toBe("draft");
        }
    });

    it("the compatibility adapter is dormant — nothing live imports it", async () => {
        const { readdirSync, readFileSync, statSync } = await import("node:fs");
        const { join } = await import("node:path");
        const WEB_ROOT = join(__dirname, "..", "..");

        function walk(dir: string, out: string[] = []): string[] {
            let entries: string[];
            try {
                entries = readdirSync(dir);
            } catch {
                return out;
            }
            for (const entry of entries) {
                if (entry === "node_modules" || entry === ".next") continue;
                const full = join(dir, entry);
                if (statSync(full).isDirectory()) walk(full, out);
                else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
            }
            return out;
        }

        const importers = [...walk(join(WEB_ROOT, "lib")), ...walk(join(WEB_ROOT, "app"))].filter((f) =>
            /from\s+"@\/lib\/trust\/lifecycle\/bosStatusCompatibility"/.test(readFileSync(f, "utf8")),
        );
        // Only this suite may import it until the Phase 3 cutover.
        expect(importers.map((f) => f.replace(WEB_ROOT, ""))).toEqual([]);
    });
});
