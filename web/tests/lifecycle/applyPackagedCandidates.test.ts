/**
 * Applying several answers from one response — and the two ways I got it wrong.
 *
 * Both failures were silent, and both would have told a parent their answers were saved:
 *   · reading a disposition shape that does not exist made every outcome look `settled` while
 *     nothing had been written;
 *   · omitting `current` made the apply layer answer ITS OWN next turn, so the second answer of a
 *     package landed on an unrelated need — wrong data, not missing data.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const applySpy = vi.fn();
const resolveSpy = vi.fn();
vi.mock("@/lib/enrollment/participantRuntime/applyParticipantTurnResponse", () => ({
    applyParticipantTurnResponse: (...args: unknown[]) => applySpy(...args),
}));
vi.mock("@/lib/enrollment/participantRuntime/resolveParticipantEnrollmentObjective", () => ({
    resolveParticipantEnrollmentObjectiveWithContext: (...args: unknown[]) => resolveSpy(...args),
}));
vi.mock("@/lib/enrollment/participantRuntime/resolveAuthoredFieldForTurn", () => ({
    resolveAuthoredFieldForTurn: () => null,
}));
vi.mock("@/lib/enrollment/participantRuntime/selectNextParticipantTurn", () => ({
    deterministicPrompt: () => "prompt",
}));

const { applyPackagedCandidates } = await import("@/lib/enrollment/participantRuntime/applyPackagedCandidates");

const need = (key: string) => ({
    identity: { key }, state: "missing", requires_participant_action: true,
    occurrence_count: 1, occurrences: [{ form_field_id: "f", label: key }], current_value: null,
});
const objectiveOf = (keys: string[]) => ({ needs: { needs: keys.map(need) }, next_turn: { kind: "collect_missing_value", need: need("UNRELATED") } });
const ctx = { needsContext: {} };
const call = (accepted: { need_key: string; candidate: unknown }[], keys = ["a", "b", "c"]) =>
    applyPackagedCandidates({} as never, {
        orgId: "org", processInstanceId: "pi", accepted: accepted as never,
        current: { objective: objectiveOf(keys) as never, context: ctx as never },
        nowIso: "2026-08-26T00:00:00.000Z",
    });

beforeEach(() => {
    applySpy.mockReset(); resolveSpy.mockReset();
    resolveSpy.mockImplementation(async () => ({ ok: true, value: objectiveOf(["a", "b", "c"]), context: ctx }));
});

const ok = (action: string, extra: Record<string, unknown> = {}) => ({
    ok: true, disposition: { action, ...extra }, objective: objectiveOf(["a", "b", "c"]),
});

describe("each answer is applied through the single-need path", () => {
    it("reports the platform's REAL verdict, never an assumed one", async () => {
        applySpy
            .mockResolvedValueOnce(ok("write_shared_value", { value: "x" }))
            .mockResolvedValueOnce(ok("refused", { reason: "That does not look like an email address." }))
            .mockResolvedValueOnce(ok("no_change", { reason: "clarification_needed" }));
        const r = await call([{ need_key: "a", candidate: {} }, { need_key: "b", candidate: {} }, { need_key: "c", candidate: {} }]);
        expect(r.outcomes.map((o) => o.result)).toEqual(["settled", "refused", "no_change"]);
        expect(r.outcomes[1]!.detail).toMatch(/email address/);
    });

    it("surfaces a clarification instead of pretending the value was saved", async () => {
        applySpy.mockResolvedValueOnce(ok("clarify", { question: "Did you mean August 8, 2021?", pending: "2021-08-08" }));
        const r = await call([{ need_key: "a", candidate: {} }]);
        expect(r.outcomes[0]!.result).toBe("clarify");
        expect(r.outcomes[0]!.clarification).toBe("Did you mean August 8, 2021?");
    });

    it("ALWAYS names the turn being answered — never lets apply pick its own", async () => {
        // The corruption this pins: without `current`, the second answer lands on whatever need the
        // objective thinks is next, and a parent's answer is written into a different question.
        applySpy.mockResolvedValue(ok("write_shared_value", { value: "x" }));
        await call([{ need_key: "a", candidate: {} }, { need_key: "b", candidate: {} }]);
        for (const [, arg] of applySpy.mock.calls as [unknown, { current?: { objective?: { next_turn?: { need?: { identity?: { key?: string } } } } } }][]) {
            expect(arg.current, "every apply must carry the staged turn").toBeDefined();
        }
        expect((applySpy.mock.calls[0]![1] as never as { current: { objective: { next_turn: { need: { identity: { key: string } } } } } }).current.objective.next_turn.need.identity.key).toBe("a");
        expect((applySpy.mock.calls[1]![1] as never as { current: { objective: { next_turn: { need: { identity: { key: string } } } } } }).current.objective.next_turn.need.identity.key).toBe("b");
    });

    it("re-reads context before every answer after the first", async () => {
        // A stale session row makes the second write clobber the first.
        applySpy.mockResolvedValue(ok("write_shared_value", { value: "x" }));
        await call([{ need_key: "a", candidate: {} }, { need_key: "b", candidate: {} }, { need_key: "c", candidate: {} }]);
        expect(resolveSpy).toHaveBeenCalledTimes(2);
    });

    it("skips a need an earlier answer already settled", async () => {
        applySpy.mockResolvedValue(ok("write_shared_value", { value: "x" }));
        resolveSpy.mockImplementation(async () => ({
            ok: true,
            value: { needs: { needs: [{ ...need("b"), requires_participant_action: false, state: "known" }] }, next_turn: {} },
            context: ctx,
        }));
        const r = await call([{ need_key: "a", candidate: {} }, { need_key: "b", candidate: {} }]);
        expect(r.outcomes[1]!.result).toBe("need_not_outstanding");
        expect(applySpy).toHaveBeenCalledTimes(1);
    });

    it("one refusal does not stop the answers around it", async () => {
        applySpy
            .mockResolvedValueOnce(ok("refused", { reason: "no" }))
            .mockResolvedValueOnce(ok("write_shared_value", { value: "x" }));
        const r = await call([{ need_key: "a", candidate: {} }, { need_key: "b", candidate: {} }]);
        expect(r.outcomes.map((o) => o.result)).toEqual(["refused", "settled"]);
    });

    it("treats a hard failure as a refusal, not a crash", async () => {
        applySpy.mockResolvedValueOnce({ ok: false, refusal: { code: "write_failed", detail: "boom" } });
        const r = await call([{ need_key: "a", candidate: {} }]);
        expect(r.outcomes[0]).toMatchObject({ result: "refused", detail: "write_failed" });
    });
});
