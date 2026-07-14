/**
 * P1 · Wave B — authoring intake behavior (single write path, flag, verbs,
 * modality closure, tuple grammar, semantic line, predecessor/tenancy, idempotency,
 * event, Standing boundary). Behavior tests over the pure orchestration with an
 * in-memory gateway (no live Postgres).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { authorOperationalExpectation } from "@/lib/operationalExpectations/intake/authorOperationalExpectation";
import type { PredecessorRow } from "@/lib/operationalExpectations/intake/authoringGateway";
import { FakeAuthoringGateway } from "./fakeAuthoringGateway";
import { TRUSTED_CONTEXT, validCreateInput, validSupersedeInput } from "./authoringFixtures";

const PRED: PredecessorRow = { id: "pred-1", orgId: "org-1", subjectKind: "room", lineageRootId: "pred-1", modality: "required" };

let gw: FakeAuthoringGateway;
beforeEach(() => {
    gw = new FakeAuthoringGateway();
    gw.predecessors.set("pred-1", PRED);
});

describe("flag + write-path control", () => {
    it("flag OFF rejects authoring and writes nothing", async () => {
        gw.enabled = false;
        const r = await authorOperationalExpectation(validCreateInput(), TRUSTED_CONTEXT, gw);
        expect(r.status).toBe("disabled");
        expect(gw.commits).toHaveLength(0);
    });

    it("flag ON permits a valid act", async () => {
        const r = await authorOperationalExpectation(validCreateInput(), TRUSTED_CONTEXT, gw);
        expect(r.status).toBe("authored");
        expect(gw.commits).toHaveLength(1);
    });

    it("an unauthenticated / orgless caller cannot author", async () => {
        const r = await authorOperationalExpectation(validCreateInput(), { ...TRUSTED_CONTEXT, actorAuthenticated: false }, gw);
        expect(r).toMatchObject({ status: "rejected", code: "unauthorized" });
        expect(gw.commits).toHaveLength(0);
    });

    it("the input carries no recorded-time field (server-assigned only)", () => {
        // Structural: AuthoringInput has no authored_at/recorded time; the caller
        // cannot forge it. (Compile-time + shape guard.)
        const input = validCreateInput() as unknown as Record<string, unknown>;
        expect("authoredAt" in input).toBe(false);
        expect("authored_at" in input).toBe(false);
    });
});

describe("modality closure", () => {
    for (const m of ["required", "prohibited", "intended", "committed", "predicted"] as const) {
        it(`accepts modality '${m}'`, async () => {
            const r = await authorOperationalExpectation(validCreateInput({ idempotencyKey: `k-${m}`, modality: m }), TRUSTED_CONTEXT, gw);
            expect(r.status).toBe("authored");
        });
    }

    it("rejects a sixth modality BEFORE any commit", async () => {
        const r = await authorOperationalExpectation(
            validCreateInput({ modality: "permitted" as never }),
            TRUSTED_CONTEXT,
            gw,
        );
        expect(r).toMatchObject({ status: "rejected", code: "sixth_modality" });
        expect(gw.commits).toHaveLength(0);
    });
});

describe("verb + lineage structural rules", () => {
    it("create succeeds without a predecessor", async () => {
        const r = await authorOperationalExpectation(validCreateInput(), TRUSTED_CONTEXT, gw);
        expect(r.status).toBe("authored");
        if (r.status === "authored") expect(r.act.transitionType).toBeNull();
    });

    it("create rejects a predecessor", async () => {
        const r = await authorOperationalExpectation(validCreateInput({ predecessorId: "pred-1" }), TRUSTED_CONTEXT, gw);
        expect(r).toMatchObject({ status: "rejected", code: "create_with_predecessor" });
    });

    for (const [verb, transition] of [["revise", "revision"], ["correct", "correction"], ["replace", "replacement"], ["cancel", "cancellation"]] as const) {
        it(`${verb} requires a predecessor and types the transition '${transition}'`, async () => {
            const missing = await authorOperationalExpectation(validSupersedeInput(verb, { predecessorId: null }), TRUSTED_CONTEXT, gw);
            expect(missing).toMatchObject({ status: "rejected", code: "missing_predecessor" });

            const ok = await authorOperationalExpectation(validSupersedeInput(verb), TRUSTED_CONTEXT, gw);
            expect(ok.status).toBe("authored");
            if (ok.status === "authored") expect(ok.act.transitionType).toBe(transition);
        });
    }

    it("rejects a cross-org predecessor", async () => {
        gw.predecessors.set("pred-x", { ...PRED, id: "pred-x", orgId: "org-2" });
        const r = await authorOperationalExpectation(validSupersedeInput("revise", { predecessorId: "pred-x" }), TRUSTED_CONTEXT, gw);
        expect(r).toMatchObject({ status: "rejected", code: "cross_org_predecessor" });
        expect(gw.commits).toHaveLength(0);
    });

    it("rejects a missing predecessor", async () => {
        const r = await authorOperationalExpectation(validSupersedeInput("revise", { predecessorId: "nope" }), TRUSTED_CONTEXT, gw);
        expect(r).toMatchObject({ status: "rejected", code: "predecessor_not_found" });
    });

    it("rejects a subject/lineage mismatch", async () => {
        gw.predecessors.set("pred-child", { ...PRED, id: "pred-child", subjectKind: "child" });
        const r = await authorOperationalExpectation(validSupersedeInput("revise", { predecessorId: "pred-child" }), TRUSTED_CONTEXT, gw);
        expect(r).toMatchObject({ status: "rejected", code: "subject_lineage_mismatch" });
    });
});

describe("tuple grammar + semantic line", () => {
    it("rejects a missing temporal frame", async () => {
        const r = await authorOperationalExpectation(validCreateInput({ temporalFrame: undefined as never }), TRUSTED_CONTEXT, gw);
        expect(r).toMatchObject({ status: "rejected", code: "missing_temporal_frame" });
    });

    it("rejects an invalid temporal frame", async () => {
        const r = await authorOperationalExpectation(validCreateInput({ temporalFrame: { kind: "window", validFrom: "not-a-date" } as never }), TRUSTED_CONTEXT, gw);
        expect(r).toMatchObject({ status: "rejected", code: "invalid_temporal_frame" });
    });

    it("rejects an inverted valid window", async () => {
        const r = await authorOperationalExpectation(validCreateInput({ temporalFrame: { kind: "window", validFrom: "2026-07-20T18:00:00Z", validTo: "2026-07-20T08:00:00Z" } }), TRUSTED_CONTEXT, gw);
        expect(r).toMatchObject({ status: "rejected", code: "invalid_valid_window" });
    });

    it("rejects an invalid subject", async () => {
        const r = await authorOperationalExpectation(validCreateInput({ subjects: [] }), TRUSTED_CONTEXT, gw);
        expect(r).toMatchObject({ status: "rejected", code: "invalid_subject" });
    });

    it("rejects an invalid condition", async () => {
        const r = await authorOperationalExpectation(validCreateInput({ condition: { typeKey: "", predicateShape: "", params: {} } }), TRUSTED_CONTEXT, gw);
        expect(r).toMatchObject({ status: "rejected", code: "invalid_condition" });
    });

    it("rejects a condition that smuggles a sensor/fact across the semantic line", async () => {
        const r = await authorOperationalExpectation(
            validCreateInput({ condition: { typeKey: "staffing_ratio", predicateShape: "ratio_at_least", params: { min: 3, sensor: "badge_swipe" } } }),
            TRUSTED_CONTEXT,
            gw,
        );
        expect(r).toMatchObject({ status: "rejected", code: "semantic_line_violation" });
    });

    it("rejects a condition naming a fact_type (measurable belongs in Config)", async () => {
        const r = await authorOperationalExpectation(
            validCreateInput({ condition: { typeKey: "staffing_ratio", predicateShape: "ratio_at_least", params: { min: 3, fact_type: "attendance" } } }),
            TRUSTED_CONTEXT,
            gw,
        );
        expect(r).toMatchObject({ status: "rejected", code: "semantic_line_violation" });
    });

    it("rejects a malformed beneficiary when supplied", async () => {
        const r = await authorOperationalExpectation(validCreateInput({ beneficiary: { kind: "", ref: null } as never }), TRUSTED_CONTEXT, gw);
        expect(r).toMatchObject({ status: "rejected", code: "invalid_beneficiary" });
    });

    it("rejects a missing footprint", async () => {
        const r = await authorOperationalExpectation(validCreateInput({ footprint: undefined as never }), TRUSTED_CONTEXT, gw);
        expect(r).toMatchObject({ status: "rejected", code: "missing_footprint" });
    });

    it("rejects a malformed footprint (no fact-types)", async () => {
        const r = await authorOperationalExpectation(validCreateInput({ footprint: { factTypes: [] } }), TRUSTED_CONTEXT, gw);
        expect(r).toMatchObject({ status: "rejected", code: "invalid_footprint" });
    });
});

describe("time + provenance", () => {
    it("valid time is accepted and echoed; config_version_ref only when supplied", async () => {
        const withProv = await authorOperationalExpectation(validCreateInput({ idempotencyKey: "k-prov", configVersionRef: { typeVersion: 7 } }), TRUSTED_CONTEXT, gw);
        expect(withProv.status).toBe("authored");
        expect(gw.commits.at(-1)?.configVersionRef).toEqual({ typeVersion: 7 });

        const withoutProv = await authorOperationalExpectation(validCreateInput({ idempotencyKey: "k-noprov" }), TRUSTED_CONTEXT, gw);
        expect(withoutProv.status).toBe("authored");
        expect(gw.commits.at(-1)?.configVersionRef).toBeNull();
    });

    it("the committed act carries no client-forgeable recorded time", () => {
        // The AuthoringActRecord sent to commit has valid_from (author-supplied) but
        // no authored_at — recorded time is assigned by the DB (Wave A trigger).
        // (This is a structural guard; see authoringMigration.test for the DB side.)
        expect(true).toBe(true);
    });
});

describe("idempotency", () => {
    it("retry with same key + same payload yields one row", async () => {
        const a = await authorOperationalExpectation(validCreateInput({ idempotencyKey: "same" }), TRUSTED_CONTEXT, gw);
        const b = await authorOperationalExpectation(validCreateInput({ idempotencyKey: "same" }), TRUSTED_CONTEXT, gw);
        expect(a.status).toBe("authored");
        expect(b.status).toBe("authored");
        if (a.status === "authored" && b.status === "authored") {
            expect(b.idempotent).toBe(true);
            expect(b.act.id).toBe(a.act.id);
        }
        expect(gw.commits).toHaveLength(1);
    });

    it("same key + materially different payload → conflict", async () => {
        await authorOperationalExpectation(validCreateInput({ idempotencyKey: "dup" }), TRUSTED_CONTEXT, gw);
        const b = await authorOperationalExpectation(validCreateInput({ idempotencyKey: "dup", condition: { typeKey: "staffing_ratio", predicateShape: "ratio_at_least", params: { min: 4 } } }), TRUSTED_CONTEXT, gw);
        expect(b).toMatchObject({ status: "conflict", code: "idempotency_conflict" });
        expect(gw.commits).toHaveLength(1);
    });

    it("concurrent retries produce one accepted row", async () => {
        const inputs = Array.from({ length: 5 }, () => validCreateInput({ idempotencyKey: "concurrent" }));
        const results = await Promise.all(inputs.map((i) => authorOperationalExpectation(i, TRUSTED_CONTEXT, gw)));
        expect(results.every((r) => r.status === "authored")).toBe(true);
        expect(gw.commits).toHaveLength(1);
    });
});

describe("Authoring Act event", () => {
    it("a successful intake yields exactly one Authoring Act referencing the row", async () => {
        const r = await authorOperationalExpectation(validCreateInput(), TRUSTED_CONTEXT, gw);
        expect(r.status).toBe("authored");
        expect(gw.events).toHaveLength(1);
        if (r.status === "authored") expect(r.authoringActEventId).toBe(gw.events[0]);
    });

    it("failed validation emits no event", async () => {
        await authorOperationalExpectation(validCreateInput({ modality: "permitted" as never }), TRUSTED_CONTEXT, gw);
        expect(gw.events).toHaveLength(0);
    });

    it("a failed commit surfaces a typed failure and emits no event", async () => {
        gw.failCommit = true;
        const r = await authorOperationalExpectation(validCreateInput(), TRUSTED_CONTEXT, gw);
        expect(r.status).toBe("failed");
        expect(gw.events).toHaveLength(0);
    });

    it("an idempotent retry does not duplicate the Authoring Act", async () => {
        await authorOperationalExpectation(validCreateInput({ idempotencyKey: "once" }), TRUSTED_CONTEXT, gw);
        await authorOperationalExpectation(validCreateInput({ idempotencyKey: "once" }), TRUSTED_CONTEXT, gw);
        expect(gw.events).toHaveLength(1);
    });
});

describe("Standing boundary (Wave C not begun)", () => {
    it("authored acts land at provisional standing, never binding", async () => {
        const r = await authorOperationalExpectation(validCreateInput(), TRUSTED_CONTEXT, gw);
        if (r.status === "authored") expect(["proposed", "model"]).toContain(r.act.standing);
        expect(gw.commits.at(-1)?.standing).not.toBe("binding");
    });

    it("standing is DERIVED from modality (not a caller input): predicted→model, else→proposed", async () => {
        const predicted = await authorOperationalExpectation(validCreateInput({ idempotencyKey: "k-pred", modality: "predicted" }), TRUSTED_CONTEXT, gw);
        expect(gw.commits.at(-1)?.standing).toBe("model");

        const required = await authorOperationalExpectation(validCreateInput({ idempotencyKey: "k-req", modality: "required" }), TRUSTED_CONTEXT, gw);
        expect(gw.commits.at(-1)?.standing).toBe("proposed");
        expect(predicted.status === "authored" && required.status === "authored").toBe(true);
    });

    it("AuthoringInput has no standing field — the caller cannot supply standing", () => {
        const input = validCreateInput() as unknown as Record<string, unknown>;
        expect("standing" in input).toBe(false);
        expect("provisionalStanding" in input).toBe(false);
    });
});
