/**
 * P1 · Wave C · C2 — ratification behavior (the immutable ratification path).
 * Behavior over the pure orchestration with an in-memory gateway (no live Postgres).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { ratifyOperationalExpectation } from "@/lib/operationalExpectations/ratification/ratifyOperationalExpectation";
import type { RatificationContext, RatifyInput } from "@/lib/operationalExpectations/ratification/ratificationTypes";
import type { RatificationTargetRow } from "@/lib/operationalExpectations/ratification/ratificationGateway";
import { FakeRatificationGateway } from "./fakeRatificationGateway";

const CTX: RatificationContext = {
    orgId: "org-1",
    actorUserId: "admin-1",
    actorLabel: "Director",
    ratifierAuthorityKey: "user:admin-1",
    actorAuthenticated: true,
};

const PROPOSED: RatificationTargetRow = { id: "exp-1", orgId: "org-1", modality: "required", standing: "proposed" };

function input(over: Partial<RatifyInput> = {}): RatifyInput {
    return { idempotencyKey: "rat-key-1", expectationId: "exp-1", rationale: "licensing sign-off", ...over };
}

let gw: FakeRatificationGateway;
beforeEach(() => {
    gw = new FakeRatificationGateway();
    gw.expectations.set("exp-1", PROPOSED);
});

describe("authorization + flag", () => {
    it("rejects an unauthenticated/orgless caller", async () => {
        const r = await ratifyOperationalExpectation(input(), { ...CTX, actorAuthenticated: false }, gw);
        expect(r).toMatchObject({ status: "rejected", code: "unauthorized" });
        expect(gw.commits).toHaveLength(0);
    });
    it("flag OFF → disabled, nothing written", async () => {
        gw.enabled = false;
        const r = await ratifyOperationalExpectation(input(), CTX, gw);
        expect(r.status).toBe("disabled");
        expect(gw.commits).toHaveLength(0);
    });
});

describe("target validation", () => {
    it("rejects a missing expectation", async () => {
        const r = await ratifyOperationalExpectation(input({ expectationId: "nope" }), CTX, gw);
        expect(r).toMatchObject({ status: "rejected", code: "expectation_not_found" });
    });
    it("rejects a cross-org expectation", async () => {
        gw.expectations.set("exp-x", { ...PROPOSED, id: "exp-x", orgId: "org-2" });
        const r = await ratifyOperationalExpectation(input({ expectationId: "exp-x" }), CTX, gw);
        expect(r).toMatchObject({ status: "rejected", code: "cross_org_expectation" });
        expect(gw.commits).toHaveLength(0);
    });
    it("rejects a non-deontic (predicted) expectation", async () => {
        gw.expectations.set("exp-p", { ...PROPOSED, id: "exp-p", modality: "predicted", standing: "model" });
        const r = await ratifyOperationalExpectation(input({ expectationId: "exp-p" }), CTX, gw);
        expect(r).toMatchObject({ status: "rejected", code: "not_ratifiable_modality" });
    });
    it("rejects an expectation that is not proposed (already binding)", async () => {
        gw.expectations.set("exp-b", { ...PROPOSED, id: "exp-b", standing: "binding" });
        const r = await ratifyOperationalExpectation(input({ expectationId: "exp-b" }), CTX, gw);
        expect(r).toMatchObject({ status: "rejected", code: "not_proposed" });
        expect(gw.commits).toHaveLength(0);
    });
});

describe("ratification promotes to binding", () => {
    it("ratifies a proposed deontic expectation → binding, one Ratification Act", async () => {
        const r = await ratifyOperationalExpectation(input(), CTX, gw);
        expect(r.status).toBe("ratified");
        if (r.status === "ratified") {
            expect(r.act.newStanding).toBe("binding");
            expect(r.act.expectationId).toBe("exp-1");
            expect(r.ratificationActEventId).toBe(gw.events[0]);
        }
        expect(gw.commits).toHaveLength(1);
        expect(gw.events).toHaveLength(1);
    });
});

describe("idempotency + immutability", () => {
    it("retry with same key + payload → one ratification, one event (idempotent)", async () => {
        const a = await ratifyOperationalExpectation(input({ idempotencyKey: "same" }), CTX, gw);
        const b = await ratifyOperationalExpectation(input({ idempotencyKey: "same" }), CTX, gw);
        expect(a.status).toBe("ratified");
        expect(b.status).toBe("ratified");
        if (b.status === "ratified") expect(b.idempotent).toBe(true);
        expect(gw.commits).toHaveLength(1);
        expect(gw.events).toHaveLength(1);
    });
    it("a second ratification of the same expectation does NOT create a second act", async () => {
        await ratifyOperationalExpectation(input({ idempotencyKey: "k1" }), CTX, gw);
        const second = await ratifyOperationalExpectation(input({ idempotencyKey: "k2" }), CTX, gw);
        // same expectation, same fingerprint (rationale/authority identical) → idempotent existing
        expect(second.status).toBe("ratified");
        expect(gw.commits).toHaveLength(1);
    });
    it("same key + materially different payload → conflict, nothing new", async () => {
        await ratifyOperationalExpectation(input({ idempotencyKey: "dup" }), CTX, gw);
        const other = await ratifyOperationalExpectation(input({ idempotencyKey: "dup", rationale: "different" }), CTX, gw);
        expect(other).toMatchObject({ status: "conflict", code: "ratification_conflict" });
        expect(gw.commits).toHaveLength(1);
    });
});

describe("authority sufficiency (Wave C — the C3 blocker closed)", () => {
    it("a .ratify holder WITHOUT sufficient held authority is rejected (not merely capability)", async () => {
        gw.expectations.set("exp-1", PROPOSED);
        gw.insufficientAuthority = true; // DB resolver reports no held authority
        const r = await ratifyOperationalExpectation(input(), CTX, gw);
        expect(r).toMatchObject({ status: "rejected", code: "insufficient_authority" });
        expect(gw.commits).toHaveLength(0);
    });
    it("with sufficient held authority the ratification proceeds to binding", async () => {
        gw.expectations.set("exp-1", PROPOSED);
        gw.insufficientAuthority = false;
        const r = await ratifyOperationalExpectation(input(), CTX, gw);
        expect(r.status).toBe("ratified");
    });
});

describe("failure handling", () => {
    it("a failed commit surfaces a typed failure and emits no event", async () => {
        gw.failCommit = true;
        const r = await ratifyOperationalExpectation(input(), CTX, gw);
        expect(r.status).toBe("failed");
        expect(gw.events).toHaveLength(0);
    });
    it("input carries no standing/org/recorded-time (caller cannot forge them)", () => {
        const i = input() as unknown as Record<string, unknown>;
        expect("standing" in i).toBe(false);
        expect("orgId" in i).toBe(false);
        expect("ratifiedAt" in i).toBe(false);
    });
});
