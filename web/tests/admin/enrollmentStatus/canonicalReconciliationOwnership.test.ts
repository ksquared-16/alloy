/**
 * The canonical lifecycle path now owns prior-stage reconciliation.
 *
 * This is the move that unblocks D-BP1. Prior-stage reconciliation — the operator's answer for the
 * work being left behind — used to live only on the generic Opportunity PATCH, which is the only
 * reason an operator surface still had to change lifecycle state through that route. These cases pin
 * the semantics that moved, and the ORDER, because ordering is the part that can silently regress.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

const calls: string[] = [];

vi.mock("@/lib/emitEvent", () => ({ emitEvent: vi.fn().mockResolvedValue(undefined) }));

const validateTransition = vi.fn();
vi.mock("@/lib/admin/statusTransitionRules", () => ({
    validateStatusTransition: (...a: unknown[]) => {
        calls.push("transition-policy");
        return validateTransition(...a);
    },
}));


vi.mock("@/lib/admin/enrollmentStatus/evaluateEnrollmentStatusTransitionPreflight", () => ({
    evaluateEnrollmentStatusTransitionPreflight: vi.fn().mockResolvedValue({
        ok: true,
        targetStatusKey: "closed",
        validation: { ok: true, blocking: [], warnings: [], recommendations: [] },
        requiresBypassReason: false,
        currentStatusKey: "open",
    }),
}));

vi.mock("@/lib/admin/enrollmentStatus/applyEnrollmentStatusTransitionOutcomeEffects", () => ({
    applyEnrollmentStatusTransitionOutcomeEffects: vi.fn().mockResolvedValue({
        outcome_execution: null, stage_entry_spawn: null, outcome_key: null,
        source_builder_stage_key: null, errors: [],
    }),
}));

const preflightReconciliation = vi.fn();
vi.mock("@/lib/lifecycle/preflightStageTransitionReconciliation", () => ({
    preflightStageTransitionReconciliation: (...a: unknown[]) => {
        calls.push("preflight");
        return preflightReconciliation(...a);
    },
}));

const applyReconciliation = vi.fn();
vi.mock("@/lib/lifecycle/applyStageTransitionReconciliation", () => ({
    applyStageTransitionReconciliation: (...a: unknown[]) => {
        calls.push("apply-reconciliation");
        return applyReconciliation(...a);
    },
}));

const validatePayload = vi.fn();
vi.mock("@/lib/lifecycle/validateStageTransitionReconciliationPayload", () => ({
    validateStageTransitionReconciliationPayload: (...a: unknown[]) => validatePayload(...a),
}));

const caseStatusWrite = vi.fn();
vi.mock("@/lib/opportunities/updateOpportunityStatusWithEvent", () => ({
    updateOpportunityStatusWithEvent: (...a: unknown[]) => {
        calls.push("status-write");
        return caseStatusWrite(...a);
    },
}));

import { executeEnrollmentStatusTransition } from "@/lib/admin/enrollmentStatus/executeEnrollmentStatusTransition";

/** Minimal client: the executor reads the case's current status to key the preflight. */
function fakeSupabase(currentStatusKey: string | null) {
    return {
        from: () => ({
            select: () => ({
                eq: () => ({
                    eq: () => ({ maybeSingle: async () => ({ data: { status_key: currentStatusKey } }) }),
                }),
            }),
        }),
    } as never;
}

const REQUIRED_PREFLIGHT = {
    required: true,
    previous_builder_stage_key: "tour",
    next_builder_stage_key: "closed",
    work: [{ work_id: "w1", title: "Call the family", status: "open" }],
    attention: null,
};

function run(overrides: { reconciliation?: unknown } = {}) {
    return executeEnrollmentStatusTransition({
        supabase: fakeSupabase("open"),
        orgId: "org-1",
        userId: "user-1",
        reconciliation: overrides.reconciliation,
        request: {
            actionKey: "update_enrollment_status",
            scope: { grain: "case", opportunityId: "opp-1" },
            destinationKey: "closed",
            targetStatusKey: "closed",
            confirmationRequired: true,
        },
    } as never);
}

beforeEach(() => {
    calls.length = 0;
    preflightReconciliation.mockReset();
    applyReconciliation.mockReset().mockResolvedValue({ errors: [] });
    validatePayload.mockReset();
    validateTransition.mockReset().mockResolvedValue({ ok: true });
    caseStatusWrite.mockReset().mockResolvedValue({ error: null });
});

describe("prior-stage reconciliation is owned by the canonical path", () => {
    it("refuses the transition and returns the preflight when the operator has not answered", async () => {
        preflightReconciliation.mockResolvedValue(REQUIRED_PREFLIGHT);
        const r = (await run()) as { ok: boolean; reconciliationRequired?: true; reconciliationPreflight?: unknown };
        expect(r.ok).toBe(false);
        expect(r.reconciliationRequired).toBe(true);
        expect(r.reconciliationPreflight).toEqual(REQUIRED_PREFLIGHT);
    });

    it("writes NOTHING when reconciliation is required but unanswered", async () => {
        // The operator is mid-decision. A status write here is the partial state the move must avoid.
        preflightReconciliation.mockResolvedValue(REQUIRED_PREFLIGHT);
        await run();
        expect(calls).toEqual(["transition-policy", "preflight"]);
        expect(caseStatusWrite).not.toHaveBeenCalled();
        expect(applyReconciliation).not.toHaveBeenCalled();
    });

    it("reconciles BEFORE the status write, never after", async () => {
        /*
         * Order is the invariant. The preflight derives the prior stage from the CURRENT status, and
         * outcome execution may move the stage — so reconciling after the write would resolve work
         * against the wrong stage.
         */
        preflightReconciliation.mockResolvedValue(REQUIRED_PREFLIGHT);
        validatePayload.mockReturnValue({ ok: true, reconciliation: { work: [{ work_id: "w1", resolution: "completed" }] } });
        const r = (await run({ reconciliation: { work: [{ work_id: "w1", resolution: "completed" }] } })) as { ok: boolean };
        expect(r.ok).toBe(true);
        expect(calls).toEqual(["transition-policy", "preflight", "apply-reconciliation", "status-write"]);
    });

    it("revalidates against its OWN preflight, not the one the client echoed back", async () => {
        const serverPreflight = { ...REQUIRED_PREFLIGHT, work: [{ work_id: "w-server", title: "x", status: "open" }] };
        preflightReconciliation.mockResolvedValue(serverPreflight);
        validatePayload.mockReturnValue({ ok: true, reconciliation: { work: [] } });
        await run({ reconciliation: { work: [{ work_id: "w-client-made-up", resolution: "completed" }] } });
        // First argument to the validator is the preflight the server computed.
        expect(validatePayload.mock.calls[0]?.[0]).toEqual(serverPreflight);
    });

    it("fails closed on an invalid disposition payload, writing nothing", async () => {
        preflightReconciliation.mockResolvedValue(REQUIRED_PREFLIGHT);
        validatePayload.mockReturnValue({ ok: false, message: "unknown work item" });
        const r = (await run({ reconciliation: { work: [{ work_id: "nope", resolution: "completed" }] } })) as { ok: boolean; error?: string };
        expect(r.ok).toBe(false);
        expect(r.error).toContain("unknown work item");
        expect(calls).toEqual(["transition-policy", "preflight"]);
        expect(caseStatusWrite).not.toHaveBeenCalled();
    });

    it("surfaces an apply failure instead of proceeding to the status write", async () => {
        preflightReconciliation.mockResolvedValue(REQUIRED_PREFLIGHT);
        validatePayload.mockReturnValue({ ok: true, reconciliation: { work: [] } });
        applyReconciliation.mockResolvedValue({ errors: ["could not carry work forward"] });
        const r = (await run({ reconciliation: {} })) as { ok: boolean; error?: string };
        expect(r.ok).toBe(false);
        expect(r.error).toContain("could not carry work forward");
        expect(caseStatusWrite).not.toHaveBeenCalled();
    });

    it("leaves a transition with nothing to reconcile completely unchanged", async () => {
        preflightReconciliation.mockResolvedValue({ required: false, work: [], attention: null });
        const r = (await run()) as { ok: boolean };
        expect(r.ok).toBe(true);
        expect(calls).toEqual(["transition-policy", "preflight", "status-write"]);
        expect(applyReconciliation).not.toHaveBeenCalled();
    });
});

describe("one transition-policy gate governs every lifecycle status change (D-BP4)", () => {
    it("validates the transition BEFORE asking the operator to reconcile", () => {
        /*
         * Order matters for the human, not just the machine. Asking someone to decide what happens to
         * the work they are leaving and only then refusing the move wastes the decision and makes the
         * dialog look like it did nothing.
         */
        preflightReconciliation.mockResolvedValue(REQUIRED_PREFLIGHT);
        return run().then(() => {
            expect(calls[0]).toBe("transition-policy");
            expect(calls.indexOf("transition-policy")).toBeLessThan(calls.indexOf("preflight"));
        });
    });

    it("refuses a blocked transition and writes nothing", async () => {
        validateTransition.mockResolvedValue({ ok: false, message: "lead cannot go straight to enrolled" });
        const r = (await run()) as { ok: boolean; error?: string };
        expect(r.ok).toBe(false);
        expect(r.error).toContain("lead cannot go straight to enrolled");
        expect(calls).toEqual(["transition-policy"]);
        expect(caseStatusWrite).not.toHaveBeenCalled();
        expect(applyReconciliation).not.toHaveBeenCalled();
    });

    it("carries a policy refusal that names no reason with a safe default message", async () => {
        validateTransition.mockResolvedValue({ ok: false });
        const r = (await run()) as { ok: boolean; error?: string };
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/not permitted/i);
    });

    it("governs the CASE grain against opportunities", async () => {
        preflightReconciliation.mockResolvedValue({ required: false, work: [], attention: null });
        await run();
        expect(validateTransition.mock.calls[0]?.[0]).toMatchObject({
            entityType: "opportunities",
            entityId: "opp-1",
            toStatusKey: "closed",
        });
    });

    it("reuses the invariant owner rather than re-deriving policy", () => {
        /*
         * The gate must be `validateStatusTransition` — the function that owns `status_transition_rules`.
         * A second validator is the failure this asserts against: two implementations drift, and the one
         * an outcome happens to call becomes the real policy.
         */
        const src = read("web/lib/admin/enrollmentStatus/executeEnrollmentStatusTransition.ts");
        expect(src).toMatch(/from "@\/lib\/admin\/statusTransitionRules"/);
        // No inline re-query of the rules table: the gate is the imported function, not a second reader.
        expect(src).not.toMatch(/from\("status_transition_rules"\)/);
    });
});
