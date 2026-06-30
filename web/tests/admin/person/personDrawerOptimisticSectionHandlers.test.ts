import { describe, expect, it, vi } from "vitest";

import { createPersonDrawerOptimisticSectionHandlers } from "@/lib/admin/person/personDrawerOptimisticSectionHandlers";

/**
 * Failure contract for the shared person-drawer Save-All handlers (the Family-B blocker fix):
 * the record/server baseline is never mutated before confirm, so a failed Save-All retains the
 * operator's draft and leaves the section dirty — no silent data loss.
 */
function makeSection(opts: { failSave?: boolean } = {}) {
    // record = server truth; draft = operator's working copy (already edited "old" → "X").
    let record = { first_name: "old" };
    let draft = { first_name: "X" };

    const applyRecordPatch = vi.fn((patch: Record<string, unknown>) => {
        record = { ...record, ...patch };
        draft = { ...record }; // post-confirm: sync draft to confirmed server truth
    });
    const confirmSave = vi.fn(async (_patch: Record<string, unknown>) => {
        if (opts.failSave) throw new Error("server boom");
    });

    const handlers = createPersonDrawerOptimisticSectionHandlers({
        isDirty: () => draft.first_name !== record.first_name,
        buildPatch: () => ({ first_name: draft.first_name }),
        applyRecordPatch,
        confirmSave,
    });

    return {
        handlers,
        applyRecordPatch,
        confirmSave,
        get record() {
            return record;
        },
        get draft() {
            return draft;
        },
        isDirty: () => draft.first_name !== record.first_name,
    };
}

describe("createPersonDrawerOptimisticSectionHandlers", () => {
    it("does NOT mutate the record before the server confirms (apply only captures the patch)", () => {
        const s = makeSection();
        s.handlers.applyOptimistic();
        expect(s.applyRecordPatch).not.toHaveBeenCalled();
        expect(s.record.first_name).toBe("old"); // baseline untouched
        expect(s.draft.first_name).toBe("X"); // operator edit present
        expect(s.isDirty()).toBe(true);
    });

    it("successful Save-All propagates the confirmed patch and clears dirty", async () => {
        const s = makeSection();
        s.handlers.applyOptimistic();
        await s.handlers.save({ confirmOnly: true });
        expect(s.confirmSave).toHaveBeenCalledTimes(1);
        expect(s.applyRecordPatch).toHaveBeenCalledTimes(1); // propagated AFTER confirm
        expect(s.record.first_name).toBe("X");
        expect(s.isDirty()).toBe(false);
    });

    it("failed Save-All restores baseline + RETAINS the operator draft (no silent loss)", async () => {
        const s = makeSection({ failSave: true });
        s.handlers.applyOptimistic();
        await expect(s.handlers.save({ confirmOnly: true })).rejects.toThrow("server boom");
        s.handlers.rollbackOptimistic();
        expect(s.applyRecordPatch).not.toHaveBeenCalled(); // never propagated an unconfirmed value
        expect(s.record.first_name).toBe("old"); // server baseline intact
        expect(s.draft.first_name).toBe("X"); // operator edit retained
        expect(s.isDirty()).toBe(true); // still dirty → operator can retry
    });

    it("empty patch (clean section) is a no-op — no confirm call", async () => {
        let record = { first_name: "same" };
        const draft = { first_name: "same" };
        const confirmSave = vi.fn();
        const handlers = createPersonDrawerOptimisticSectionHandlers({
            isDirty: () => draft.first_name !== record.first_name,
            buildPatch: () => ({}),
            applyRecordPatch: vi.fn((patch: Record<string, unknown>) => {
                record = { ...record, ...patch };
            }),
            confirmSave,
        });
        handlers.applyOptimistic();
        await handlers.save();
        expect(confirmSave).not.toHaveBeenCalled();
    });
});
