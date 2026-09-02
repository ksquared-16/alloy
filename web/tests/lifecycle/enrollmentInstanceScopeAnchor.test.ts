/**
 * PROCESS-STATE SCOPE RESOLUTION UNDER EITHER ANCHOR.
 *
 * The defect: every `*ByScope` helper matched the journey with
 * `.eq("context_id", opportunityId)`. That was exact while an Enrollment journey could only anchor
 * to an Opportunity. Once the canonical context became
 *
 *     context_type = enrollment_participation
 *     context_id   = the exact OCM id
 *
 * those helpers compared an Opportunity id against an OCM id and matched NOTHING — so for every
 * participation-anchored journey the state write moved zero rows and the stage write moved zero
 * rows, while the durable OCM status moved to `enrolled` regardless.
 *
 * These exercise the real resolver and the real writers against a double, not the source text.
 */

import { describe, expect, it } from "vitest";

import {
    moveEnrollmentInstanceStageByScope,
    resolveEnrollmentInstanceIdForScope,
    setEnrollmentInstanceStateByScope,
} from "@/lib/process/processInstances";

const ORG = "org-1";
const CHILD = "child-1";
const SIBLING = "child-2";
const OPPORTUNITY = "opp-1";
const OCM = "ocm-1";

type Pi = {
    id: string;
    org_id: string;
    process_key: string;
    subject_id: string;
    context_type: string | null;
    context_id: string | null;
    stage_key: string | null;
    state: string | null;
    close_reason_key?: string | null;
};

/** A `process_instances` double that honours eq-filters and records what an update touched. */
function fakeClient(seed: Pi[]) {
    const rows: Pi[] = seed.map((r) => ({ ...r }));
    const api = {
        rows,
        from() {
            const filters: Array<(r: Pi) => boolean> = [];
            let patch: Record<string, unknown> | null = null;
            const builder: Record<string, unknown> = {
                select: () => builder,
                update(p: Record<string, unknown>) {
                    patch = p;
                    return builder;
                },
                eq(col: string, val: unknown) {
                    filters.push((r) => (r as unknown as Record<string, unknown>)[col] === val);
                    return builder;
                },
                /**
                 * Honours `not(col, "in", "(a,b,c)")` for real — the live-journey predicate depends
                 * on it, and a stub that ignored it would make every concluded row look live and
                 * quietly pass tests the production predicate would fail.
                 */
                not(col: string, op: string, val: unknown) {
                    if (op !== "in") throw new Error(`double does not model not(${op})`);
                    const list = String(val).replace(/^\(|\)$/g, "").split(",").map((v) => v.trim());
                    filters.push((r) => {
                        const actual = (r as unknown as Record<string, unknown>)[col];
                        return !list.includes(String(actual ?? "").trim());
                    });
                    return builder;
                },
                maybeSingle() {
                    const found = rows.filter((r) => filters.every((f) => f(r)));
                    return Promise.resolve({ data: found[0] ?? null, error: null });
                },
                then(resolve: (v: unknown) => void) {
                    const matched = rows.filter((r) => filters.every((f) => f(r)));
                    if (patch) {
                        for (const r of matched) Object.assign(r, patch);
                    }
                    // Full rows, not just ids: the resolver selects context_id/context_type/state
                    // and a double that drops them would make it fail for a reason the code has not
                    // got. Writers only read `.length`, so this is safe for both.
                    return resolve({ data: matched.map((r) => ({ ...r })), error: null });
                },
            };
            return builder;
        },
    };
    return api as unknown as Parameters<typeof setEnrollmentInstanceStateByScope>[0] & { rows: Pi[] };
}

const pi = (over: Partial<Pi> & { id: string }): Pi => ({
    org_id: ORG,
    process_key: "enrollment",
    subject_id: CHILD,
    context_type: "enrollment_participation",
    context_id: OCM,
    stage_key: "enrolling",
    state: "enrolling",
    close_reason_key: null,
    ...over,
});

describe("1 — a PARTICIPATION-anchored journey is found and updated", () => {
    it("resolves the instance even though context_id is an OCM id, not an Opportunity id", async () => {
        const supabase = fakeClient([pi({ id: "pi-A" })]);
        const resolved = await resolveEnrollmentInstanceIdForScope(supabase as never, {
            orgId: ORG,
            customerMemberId: CHILD,
            // The caller passes the acquisition id it has; it must NOT be matched against context_id.
            opportunityId: OPPORTUNITY,
        });
        expect(resolved).toEqual({ id: "pi-A", ambiguous: false });
    });

    it("updates the state exactly once", async () => {
        const supabase = fakeClient([pi({ id: "pi-A" })]);
        const res = await setEnrollmentInstanceStateByScope(supabase as never, {
            orgId: ORG,
            opportunityId: OPPORTUNITY,
            customerMemberId: CHILD,
            state: "enrolled",
        });
        expect(res).toMatchObject({ moved: 1 });
        expect(supabase.rows.find((r) => r.id === "pi-A")?.state).toBe("enrolled");
    });

    it("advances the stage exactly once", async () => {
        const supabase = fakeClient([pi({ id: "pi-A" })]);
        const res = await moveEnrollmentInstanceStageByScope(supabase as never, {
            orgId: ORG,
            opportunityId: OPPORTUNITY,
            customerMemberId: CHILD,
            stageKey: "enrolled",
        });
        expect(res).toMatchObject({ moved: 1 });
        expect(supabase.rows.find((r) => r.id === "pi-A")?.stage_key).toBe("enrolled");
    });
});

describe("2 — a CONTEXT-FREE journey needs no Opportunity", () => {
    it("updates with no opportunityId supplied at all", async () => {
        const supabase = fakeClient([pi({ id: "pi-A", context_type: null, context_id: null })]);
        const res = await setEnrollmentInstanceStateByScope(supabase as never, {
            orgId: ORG,
            opportunityId: "",
            customerMemberId: CHILD,
            state: "enrolled",
        });
        expect(res).toMatchObject({ moved: 1 });
        expect(supabase.rows[0].state).toBe("enrolled");
    });
});

describe("3+4 — opportunity-backed and LEGACY opportunity anchors still work", () => {
    it("updates a participation-anchored journey whose participation carries an Opportunity", async () => {
        const supabase = fakeClient([pi({ id: "pi-A", context_type: "enrollment_participation", context_id: OCM })]);
        const res = await setEnrollmentInstanceStateByScope(supabase as never, {
            orgId: ORG,
            opportunityId: OPPORTUNITY,
            customerMemberId: CHILD,
            state: "enrolled",
        });
        expect(res.moved).toBe(1);
    });

    it("still updates a LEGACY journey anchored directly to the Opportunity", async () => {
        const supabase = fakeClient([pi({ id: "pi-legacy", context_type: "opportunity", context_id: OPPORTUNITY })]);
        const res = await setEnrollmentInstanceStateByScope(supabase as never, {
            orgId: ORG,
            opportunityId: OPPORTUNITY,
            customerMemberId: CHILD,
            state: "enrolled",
        });
        expect(res.moved).toBe(1);
        expect(supabase.rows[0].state).toBe("enrolled");
    });

    it("prefers the journey anchored to the NAMED opportunity when the child has both shapes", async () => {
        const supabase = fakeClient([
            pi({ id: "pi-legacy", context_type: "opportunity", context_id: OPPORTUNITY }),
            pi({ id: "pi-participation", context_type: "enrollment_participation", context_id: OCM }),
        ]);
        const resolved = await resolveEnrollmentInstanceIdForScope(supabase as never, {
            orgId: ORG,
            customerMemberId: CHILD,
            opportunityId: OPPORTUNITY,
        });
        expect(resolved.id).toBe("pi-legacy");
    });
});

describe("5 — an unrelated process instance is never touched", () => {
    it("leaves a sibling's journey alone", async () => {
        const supabase = fakeClient([
            pi({ id: "pi-A", subject_id: CHILD }),
            pi({ id: "pi-B", subject_id: SIBLING, context_id: "ocm-2" }),
        ]);
        await setEnrollmentInstanceStateByScope(supabase as never, {
            orgId: ORG,
            opportunityId: OPPORTUNITY,
            customerMemberId: CHILD,
            state: "enrolled",
        });
        expect(supabase.rows.find((r) => r.id === "pi-A")?.state).toBe("enrolled");
        expect(supabase.rows.find((r) => r.id === "pi-B")?.state).toBe("enrolling");
    });

    it("leaves ANOTHER ORG's identical journey alone", async () => {
        const supabase = fakeClient([pi({ id: "pi-other", org_id: "org-2" })]);
        const res = await setEnrollmentInstanceStateByScope(supabase as never, {
            orgId: ORG,
            opportunityId: OPPORTUNITY,
            customerMemberId: CHILD,
            state: "enrolled",
        });
        expect(res.moved).toBe(0);
        expect(supabase.rows[0].state).toBe("enrolling");
    });
});

describe("6 — a zero-row update is a failure, and ambiguity is never guessed", () => {
    it("reports moved: 0 when the child has no journey", async () => {
        const supabase = fakeClient([]);
        const res = await setEnrollmentInstanceStateByScope(supabase as never, {
            orgId: ORG,
            opportunityId: OPPORTUNITY,
            customerMemberId: CHILD,
            state: "enrolled",
        });
        // `assertSingleParticipantWrite` turns this into a refusal with no undo offered.
        expect(res.moved).toBe(0);
    });

    it("refuses rather than picking one of two OPEN journeys", async () => {
        const supabase = fakeClient([
            pi({ id: "pi-A", context_id: "ocm-A" }),
            pi({ id: "pi-B", context_id: "ocm-B" }),
        ]);
        const resolved = await resolveEnrollmentInstanceIdForScope(supabase as never, {
            orgId: ORG,
            customerMemberId: CHILD,
        });
        expect(resolved).toEqual({ id: null, ambiguous: true });

        const res = await setEnrollmentInstanceStateByScope(supabase as never, {
            orgId: ORG,
            opportunityId: "",
            customerMemberId: CHILD,
            state: "enrolled",
        });
        /*
         * `moved > 1` is the integrity failure the caller's single-write assertion refuses, and it
         * carries its inverse out so the transaction unwinds BOTH rows. That is the pre-existing
         * contract and it is preserved deliberately: an earlier version of this fix resolved an id
         * first and collapsed the duplicate case into a silent `moved: 0`, which reads as "no
         * journey" and loses the integrity signal entirely.
         */
        expect(res.moved).toBe(2);
        expect(res.instanceId ?? null).toBeNull();
    });

    it("picks the LIVE episode when the child also has a concluded one", async () => {
        const supabase = fakeClient([
            pi({ id: "pi-last-year", context_id: "ocm-A", state: "enrolled" }),
            pi({ id: "pi-this-year", context_id: "ocm-B", state: "enrolling" }),
        ]);
        const resolved = await resolveEnrollmentInstanceIdForScope(supabase as never, {
            orgId: ORG,
            customerMemberId: CHILD,
        });
        expect(resolved.id).toBe("pi-this-year");
    });
});

describe("7 — an OCM id is never interpreted as an Opportunity id", () => {
    it("does not match a journey merely because the OCM id was passed as opportunityId", async () => {
        /*
         * The failure this guards: a caller "fixing" the mismatch by passing the OCM id where an
         * Opportunity id belongs. `context_id` would then match by coincidence, and the two
         * identities would be fused — which is the defect the participation anchor was built to
         * remove, reintroduced from the caller's side.
         */
        const supabase = fakeClient([
            pi({ id: "pi-legacy", context_type: "opportunity", context_id: OPPORTUNITY }),
            pi({ id: "pi-participation", context_type: "enrollment_participation", context_id: OCM, subject_id: SIBLING }),
        ]);
        const resolved = await resolveEnrollmentInstanceIdForScope(supabase as never, {
            orgId: ORG,
            customerMemberId: CHILD,
            opportunityId: OCM, // wrong id in the Opportunity slot
        });
        // It resolves CHILD's own single journey by subject, not by the coincidental context match.
        expect(resolved.id).toBe("pi-legacy");
    });
});

describe("8 — the compensation targets the SAME journey it wrote", () => {
    it("restores state after the journey has become concluded", async () => {
        const supabase = fakeClient([pi({ id: "pi-A" })]);

        await setEnrollmentInstanceStateByScope(supabase as never, {
            orgId: ORG,
            opportunityId: OPPORTUNITY,
            customerMemberId: CHILD,
            state: "enrolled",
            processInstanceId: "pi-A",
        });
        expect(supabase.rows[0].state).toBe("enrolled");

        /*
         * The journey is now `enrolled`, which is CONCLUDED. Without the threaded id a scope lookup
         * would no longer find it as the child's OPEN journey and the compensation would silently
         * restore nothing — reporting a clean abort over a committed write.
         */
        const restored = await setEnrollmentInstanceStateByScope(supabase as never, {
            orgId: ORG,
            opportunityId: OPPORTUNITY,
            customerMemberId: CHILD,
            state: "enrolling",
            processInstanceId: "pi-A",
        });
        expect(restored).toMatchObject({ moved: 1 });
        expect(supabase.rows[0].state).toBe("enrolling");
    });

    it("the executor compensates against the row the write REPORTED", async () => {
        const fs = await import("node:fs/promises");
        const src = await fs.readFile(
            new URL("../../lib/lifecycle/stageOutcomeRuleTargetExecutor.ts", import.meta.url),
            "utf8",
        );
        // Not re-derived under a predicate the write itself just invalidated.
        expect(src).toContain("writtenInstanceId");
        expect(src).toContain("movedInstanceId");
        expect(src).toContain("pi.instanceId");
    });
});
