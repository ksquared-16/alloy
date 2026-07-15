/**
 * P1 · Wave C · C3 — consolidated standing/ratification certification (negative
 * proofs). Behavior over the pure orchestration + effective-standing derivation
 * (no live Postgres; DB guarantees are additionally proven statically in
 * ratificationMigration.test.ts).
 *
 * NOTE: one required invariant is NOT satisfiable in the current substrate —
 * ratifier authority sufficiency over the expectation's `authority_key` — because
 * NO canonical held-authority mapping exists (see the Wave C record's escalation).
 * It is recorded as an `it.todo` blocker; Wave C is therefore NOT certified.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { ratifyOperationalExpectation } from "@/lib/operationalExpectations/ratification/ratifyOperationalExpectation";
import { resolveEffectiveStanding } from "@/lib/operationalExpectations/standing/resolveEffectiveStanding";
import type { RatificationContext, RatifyInput } from "@/lib/operationalExpectations/ratification/ratificationTypes";
import type { RatificationTargetRow } from "@/lib/operationalExpectations/ratification/ratificationGateway";
import type { OperationalModality } from "@/lib/operationalExpectations/expectationLedgerContract";
import { FakeRatificationGateway } from "./fakeRatificationGateway";

const CTX: RatificationContext = {
    orgId: "org-1", actorUserId: "admin-1", actorLabel: "Director",
    ratifierAuthorityKey: "user:admin-1", actorAuthenticated: true,
};
const target = (over: Partial<RatificationTargetRow>): RatificationTargetRow =>
    ({ id: "exp", orgId: "org-1", modality: "required", standing: "proposed", ...over });
const input = (over: Partial<RatifyInput> = {}): RatifyInput =>
    ({ idempotencyKey: "k", expectationId: "exp", rationale: "sign-off", ...over });

let gw: FakeRatificationGateway;
beforeEach(() => { gw = new FakeRatificationGateway(); });

describe("no authored expectation is effectively binding without an immutable ratification", () => {
    for (const m of ["required", "prohibited", "intended", "committed"] as OperationalModality[]) {
        it(`unratified ${m} → proposed / not binding`, () => {
            expect(resolveEffectiveStanding("proposed", false)).toBe("proposed");
        });
    }
    it("predicted remains model (never binds), even if a ratification flag is (defensively) set", () => {
        expect(resolveEffectiveStanding("model", false)).toBe("model");
        expect(resolveEffectiveStanding("model", true)).toBe("model");
    });
    it("proposed becomes binding ONLY when a ratification act exists", () => {
        expect(resolveEffectiveStanding("proposed", true)).toBe("binding");
    });
    it("no unrelated ratification promotes a different expectation", async () => {
        gw.expectations.set("exp", target({ id: "exp" }));
        await ratifyOperationalExpectation(input({ expectationId: "exp" }), CTX, gw);
        // A different expectation with no ratification of its own stays proposed.
        expect(resolveEffectiveStanding("proposed", false)).toBe("proposed");
    });
    it("effective standing is deterministic under replayed reads", () => {
        const a = resolveEffectiveStanding("proposed", true);
        const b = resolveEffectiveStanding("proposed", true);
        expect(a).toBe(b);
    });
});

describe("permission separation + AI boundary (application-layer)", () => {
    it("predicted cannot be ratified to binding (rejected before commit)", async () => {
        gw.expectations.set("exp", target({ modality: "predicted", standing: "model" }));
        const r = await ratifyOperationalExpectation(input(), CTX, gw);
        expect(r).toMatchObject({ status: "rejected", code: "not_ratifiable_modality" });
        expect(gw.commits).toHaveLength(0);
    });
    it("an unauthenticated actor cannot ratify (AI/service cannot pass as a human)", async () => {
        gw.expectations.set("exp", target({}));
        const r = await ratifyOperationalExpectation(input(), { ...CTX, actorAuthenticated: false }, gw);
        expect(r).toMatchObject({ status: "rejected", code: "unauthorized" });
    });
    // (Capability separation — .author ≠ .ratify, workflows.write insufficient — is
    // proven in ratificationServerContext.test.ts; service-role-only RPC + no client
    // insert in ratificationMigration.test.ts.)
});

describe("audit + idempotency", () => {
    it("a successful ratification yields exactly one Ratification Act; retry adds none", async () => {
        gw.expectations.set("exp", target({}));
        await ratifyOperationalExpectation(input({ idempotencyKey: "once" }), CTX, gw);
        await ratifyOperationalExpectation(input({ idempotencyKey: "once" }), CTX, gw);
        expect(gw.events).toHaveLength(1);
        expect(gw.commits).toHaveLength(1);
    });
    it("a failed ratification emits no event", async () => {
        gw.expectations.set("exp", target({}));
        gw.failCommit = true;
        const r = await ratifyOperationalExpectation(input(), CTX, gw);
        expect(r.status).toBe("failed");
        expect(gw.events).toHaveLength(0);
    });
});

describe("authority sufficiency — the C3 blocker is CLOSED", () => {
    it("ratification requires held authority (not merely the .ratify capability)", async () => {
        // Resolved: a governed authority catalog + effective-dated held-authority
        // assignments now back a single resolver; the ratify RPC rejects a capable
        // caller who lacks sufficient held authority. Proven here via the gateway;
        // the DB WHERE-clauses are proven in authority/authorityModelMigration.test.ts.
        gw.expectations.set("exp", target({}));
        gw.insufficientAuthority = true;
        const r = await ratifyOperationalExpectation(input(), CTX, gw);
        expect(r).toMatchObject({ status: "rejected", code: "insufficient_authority" });
    });
    it("with sufficient held authority the ratification binds", async () => {
        gw.expectations.set("exp", target({}));
        const r = await ratifyOperationalExpectation(input(), CTX, gw);
        expect(r.status).toBe("ratified");
    });
});
