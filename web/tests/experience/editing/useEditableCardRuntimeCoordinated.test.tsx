// @vitest-environment jsdom
import { useState } from "react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useEditableCardRuntime } from "@/lib/experience/editing/useEditableCardRuntime";
import {
    clearDrawerOperatingEditSectionsForTests,
    drawerOperatingIsDirty,
    drawerOperatingSaveAll,
} from "@/lib/admin/drawer/drawerOperatingSaveCoordinator";
import { mountCard } from "./editableCardContractHarness";

vi.mock("@/lib/perf/perfNamespaceLog", () => ({ perfSave: vi.fn() }));

/**
 * Coordinated mode: the card owns edit state, but Save-All owns commit timing.
 * Verified by driving the real `drawerOperatingSaveAll()` against a card rendered through the hook.
 */
function CoordinatedCard(props: {
    save: () => Promise<{ ok: boolean; error?: string }>;
    applyOptimistic?: () => void;
    rollbackOptimistic?: () => void;
    coordinated?: boolean;
}) {
    const [dirty, setDirty] = useState(false);
    const edit = useEditableCardRuntime({
        dirty,
        coordinated: props.coordinated ?? true,
        sectionId: "coord_test_section",
        save: props.save,
        applyOptimistic: props.applyOptimistic,
        rollbackOptimistic: props.rollbackOptimistic,
    });
    return (
        <div data-phase={edit.state.phase} data-error={edit.state.error ?? ""}>
            <button
                type="button"
                onClick={() => {
                    setDirty(true);
                    edit.notifyChange(true);
                }}
            >
                edit
            </button>
        </div>
    );
}

const phaseOf = (c: HTMLElement) => c.firstElementChild!.getAttribute("data-phase");
const errorOf = (c: HTMLElement) => c.firstElementChild!.getAttribute("data-error");
const makeDirty = (c: HTMLElement) => act(() => c.querySelector("button")!.click());

async function runSaveAll(): Promise<unknown> {
    let caught: unknown = null;
    await act(async () => {
        try {
            await drawerOperatingSaveAll();
        } catch (e) {
            caught = e;
        }
    });
    return caught;
}

afterEach(() => clearDrawerOperatingEditSectionsForTests());

describe("useEditableCardRuntime — coordinated mode (Save-All driven)", () => {
    it("registers dirty with the one coordinator; Save-All drives saving → saved", async () => {
        const save = vi.fn().mockResolvedValue({ ok: true });
        const applyOptimistic = vi.fn();
        const card = mountCard(<CoordinatedCard save={save} applyOptimistic={applyOptimistic} />);
        try {
            expect(drawerOperatingIsDirty()).toBe(false);
            makeDirty(card.container);
            expect(drawerOperatingIsDirty()).toBe(true);

            const err = await runSaveAll();
            expect(err).toBeNull();
            expect(applyOptimistic).toHaveBeenCalledTimes(1);
            expect(save).toHaveBeenCalledTimes(1);
            expect(phaseOf(card.container)).toBe("saved");
        } finally {
            card.unmount();
        }
    });

    it("failed Save-All rolls back → retains dirty + legible error (no silent loss)", async () => {
        const save = vi.fn().mockResolvedValue({ ok: false, error: "coord boom" });
        const rollbackOptimistic = vi.fn();
        const card = mountCard(<CoordinatedCard save={save} rollbackOptimistic={rollbackOptimistic} />);
        try {
            makeDirty(card.container);
            const err = await runSaveAll();
            expect((err as Error)?.message).toContain("coord boom");
            expect(rollbackOptimistic).toHaveBeenCalledTimes(1);
            expect(phaseOf(card.container)).toBe("dirty");
            expect(errorOf(card.container)).toBe("coord boom");
            expect(drawerOperatingIsDirty()).toBe(true);
        } finally {
            card.unmount();
        }
    });

    it("FIX: a failed save throws so the coordinator rolls back (was silently swallowed)", async () => {
        // Even a self-saving registration (coordinated:false) must surface its failure to Save-All.
        const save = vi.fn().mockResolvedValue({ ok: false, error: "swallowed-no-more" });
        const rollbackOptimistic = vi.fn();
        const card = mountCard(
            <CoordinatedCard save={save} rollbackOptimistic={rollbackOptimistic} coordinated={false} />,
        );
        try {
            makeDirty(card.container);
            const err = await runSaveAll();
            expect((err as Error)?.message).toContain("swallowed-no-more");
            expect(rollbackOptimistic).toHaveBeenCalledTimes(1);
        } finally {
            card.unmount();
        }
    });

    it("clean (not dirty) card is skipped by Save-All entirely", async () => {
        const save = vi.fn().mockResolvedValue({ ok: true });
        const card = mountCard(<CoordinatedCard save={save} />);
        try {
            const err = await runSaveAll();
            expect(err).toBeNull();
            expect(save).not.toHaveBeenCalled();
            expect(phaseOf(card.container)).toBe("viewing");
        } finally {
            card.unmount();
        }
    });
});
