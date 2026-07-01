import { describe, expect, it } from "vitest";

import {
    EDITABLE_CARD_INITIAL_STATE,
    editableCardBlocksExit,
    editableCardReducer,
    editableCardStatusLabel,
    runEditableCardSaveLifecycle,
    type EditableCardEvent,
    type EditableCardState,
} from "@/lib/experience/editing/editableCardRuntime";

/**
 * Behavioral contract for the canonical Editable Card Runtime.
 * Validates the operating-system editing model — not any component's implementation strings.
 * One test per lifecycle event the convergence brief enumerates.
 */
function reduce(state: EditableCardState, ...events: Parameters<typeof editableCardReducer>[1][]) {
    return events.reduce(editableCardReducer, state);
}

describe("editableCardRuntime", () => {
    it("starts in viewing, clean, no error", () => {
        expect(EDITABLE_CARD_INITIAL_STATE).toEqual({ phase: "viewing", dirty: false, error: null });
    });

    it("entering edit mode: focus → focused (still clean)", () => {
        const s = reduce(EDITABLE_CARD_INITIAL_STATE, { type: "focus" });
        expect(s.phase).toBe("focused");
        expect(s.dirty).toBe(false);
    });

    it("dirty state: a change that differs from baseline → dirty", () => {
        const s = reduce(EDITABLE_CARD_INITIAL_STATE, { type: "focus" }, { type: "change", dirty: true });
        expect(s.phase).toBe("dirty");
        expect(s.dirty).toBe(true);
        expect(editableCardStatusLabel(s)).toBe("unsaved");
    });

    it("a change back to baseline → editing, not dirty", () => {
        const s = reduce(EDITABLE_CARD_INITIAL_STATE, { type: "change", dirty: true }, { type: "change", dirty: false });
        expect(s.phase).toBe("editing");
        expect(s.dirty).toBe(false);
    });

    it("save start: dirty → saving (and is a no-op when clean)", () => {
        const dirty = reduce(EDITABLE_CARD_INITIAL_STATE, { type: "change", dirty: true });
        const saving = reduce(dirty, { type: "saveStart" });
        expect(saving.phase).toBe("saving");
        expect(editableCardStatusLabel(saving)).toBe("saving");

        // idempotent: no save when nothing is dirty
        const noop = reduce(EDITABLE_CARD_INITIAL_STATE, { type: "saveStart" });
        expect(noop.phase).toBe("viewing");
    });

    it("save success: saving → saved (clean), then acknowledged → viewing", () => {
        const s = reduce(
            EDITABLE_CARD_INITIAL_STATE,
            { type: "change", dirty: true },
            { type: "saveStart" },
            { type: "saveSuccess" },
        );
        expect(s.phase).toBe("saved");
        expect(s.dirty).toBe(false);
        expect(editableCardStatusLabel(s)).toBe("saved");

        const settled = reduce(s, { type: "acknowledged" });
        expect(settled).toEqual(EDITABLE_CARD_INITIAL_STATE);
    });

    it("save failure / rollback: saving → dirty with legible error, changes retained (never silent loss)", () => {
        const s = reduce(
            EDITABLE_CARD_INITIAL_STATE,
            { type: "change", dirty: true },
            { type: "saveStart" },
            { type: "saveFailure", error: "network" },
        );
        expect(s.phase).toBe("dirty");
        expect(s.dirty).toBe(true);
        expect(s.error).toBe("network");
        expect(editableCardStatusLabel(s)).toBe("error");
    });

    it("unsaved-change guard: blocks exit while dirty or mid-save, allows it when clean/settled", () => {
        const dirty = reduce(EDITABLE_CARD_INITIAL_STATE, { type: "change", dirty: true });
        expect(editableCardBlocksExit(dirty)).toBe(true);

        const saving = reduce(dirty, { type: "saveStart" });
        expect(editableCardBlocksExit(saving)).toBe(true);

        const settled = reduce(saving, { type: "saveSuccess" }, { type: "acknowledged" });
        expect(editableCardBlocksExit(settled)).toBe(false);
    });

    it("acknowledgement is the single shared status vocabulary (saving/saved/error/unsaved)", () => {
        expect(editableCardStatusLabel(EDITABLE_CARD_INITIAL_STATE)).toBeNull();
        expect(editableCardStatusLabel({ phase: "saving", dirty: true, error: null })).toBe("saving");
        expect(editableCardStatusLabel({ phase: "saved", dirty: false, error: null })).toBe("saved");
        expect(editableCardStatusLabel({ phase: "dirty", dirty: true, error: "x" })).toBe("error");
        expect(editableCardStatusLabel({ phase: "dirty", dirty: true, error: null })).toBe("unsaved");
    });

    it("focus never interrupts an in-flight save", () => {
        const saving = reduce(EDITABLE_CARD_INITIAL_STATE, { type: "change", dirty: true }, { type: "saveStart" });
        expect(reduce(saving, { type: "focus" })).toEqual(saving);
        expect(reduce(saving, { type: "blur" })).toEqual(saving);
    });
});

describe("runEditableCardSaveLifecycle", () => {
    it("applies optimistic before the save, then emits success; final state is saved+clean", async () => {
        const order: string[] = [];
        const events: EditableCardEvent[] = [];
        await runEditableCardSaveLifecycle({
            dirty: true,
            applyOptimistic: () => order.push("optimistic"),
            save: async () => {
                order.push("save");
                return { ok: true };
            },
            emit: (e) => events.push(e),
        });
        expect(order).toEqual(["optimistic", "save"]);
        expect(events.map((e) => e.type)).toEqual(["saveStart", "saveSuccess"]);
        const final = events.reduce(editableCardReducer, EDITABLE_CARD_INITIAL_STATE);
        expect(final.phase).toBe("saved");
        expect(final.dirty).toBe(false);
    });

    it("rolls back and emits a legible failure when the save rejects (no silent loss)", async () => {
        const events: EditableCardEvent[] = [];
        let rolledBack = false;
        await runEditableCardSaveLifecycle({
            dirty: true,
            applyOptimistic: () => undefined,
            rollbackOptimistic: () => {
                rolledBack = true;
            },
            save: async () => {
                throw new Error("network");
            },
            emit: (e) => events.push(e),
        });
        expect(rolledBack).toBe(true);
        expect(events.map((e) => e.type)).toEqual(["saveStart", "saveFailure"]);
        const final = events.reduce(editableCardReducer, EDITABLE_CARD_INITIAL_STATE);
        expect(final.phase).toBe("dirty");
        expect(final.error).toBe("network");
    });

    it("is a no-op when not dirty (nothing to save)", async () => {
        const events: EditableCardEvent[] = [];
        await runEditableCardSaveLifecycle({ dirty: false, save: async () => ({ ok: true }), emit: (e) => events.push(e) });
        expect(events).toEqual([]);
    });
});
