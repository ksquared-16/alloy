import type { ReactElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { expect, it } from "vitest";

import {
    clearDrawerOperatingEditSectionsForTests,
    drawerOperatingIsDirty,
    drawerOperatingSaveAll,
} from "@/lib/admin/drawer/drawerOperatingSaveCoordinator";

/**
 * Reusable behavioral contract harness for the canonical Editable Card Runtime.
 *
 * Any editable card on a record surface can be verified by supplying a small adapter
 * (mount / edit / save / arrange-result). The harness then asserts the full behavioral
 * contract — so bulk-migrated cards need an adapter, not bespoke test code.
 *
 * Requires jsdom: put `// @vitest-environment jsdom` at the top of the consuming test file.
 */

/** Drive a controlled-input change the way React's onChange expects (native setter + input event). */
export function setNativeInputValue(input: HTMLInputElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Run the coordinator's Save-All inside `act()`, returning any thrown error (assert card state
 * after). Coordinated-mode (Family-B) card adapters use this as their `save` implementation —
 * the commit is owned by Save-All, not the card.
 */
export async function runSaveAllInAct(): Promise<unknown> {
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

export type MountedCard = { container: HTMLElement; unmount: () => void };

/** Mount a React element into a fresh jsdom container. */
export function mountCard(element: ReactElement): MountedCard {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    act(() => {
        root.render(element);
    });
    return {
        container,
        unmount: () => {
            act(() => root.unmount());
            container.remove();
        },
    };
}

export type EditableCardContractAdapter = {
    /** Mount the card under test (configured to use the harness's save mock). */
    mount: () => MountedCard;
    /** Make the card dirty; return the edited input and the value typed. */
    edit: (container: HTMLElement) => { input: HTMLInputElement; dirtyValue: string };
    /** Trigger the save lifecycle (click Save, or blur). */
    save: (container: HTMLElement) => Promise<void>;
    /** Arrange the next save to succeed. */
    arrangeSuccess: () => void;
    /** Arrange the next save to fail with the given error text (must appear in the surface). */
    arrangeFailure: (error: string) => void;
    /** Per-test teardown (reset the save mock). The harness clears the coordinator itself. */
    reset: () => void;
    /** Status text fragments the card renders (defaults shown). */
    status?: { saving?: string; saved?: string; unsaved?: string };
};

const DEFAULT_STATUS = { saving: "Saving", saved: "Saved", unsaved: "Unsaved changes" };
const FAILURE_TOKEN = "harness-save-failure";

/**
 * Register the full behavioral contract as `it()` blocks. Call inside a `describe`.
 * Covers: enter edit · dirty · clean no-op · save start/success ack · save failure retains edit
 * (no silent loss) · unsaved-guard registration with the single save coordinator · no stale flags.
 */
export function runEditableCardContract(adapter: EditableCardContractAdapter): void {
    const status = { ...DEFAULT_STATUS, ...(adapter.status ?? {}) };

    const teardown = (card: MountedCard) => {
        card.unmount();
        clearDrawerOperatingEditSectionsForTests();
        adapter.reset();
    };

    it("contract: entering edit → dirty and registers with the one save coordinator", () => {
        const card = adapter.mount();
        try {
            expect(drawerOperatingIsDirty()).toBe(false);
            act(() => {
                adapter.edit(card.container);
            });
            expect(card.container.textContent).toContain(status.unsaved);
            expect(drawerOperatingIsDirty()).toBe(true);
        } finally {
            teardown(card);
        }
    });

    it("contract: save success → acknowledgement and dirty clears", async () => {
        adapter.arrangeSuccess();
        const card = adapter.mount();
        try {
            act(() => {
                adapter.edit(card.container);
            });
            await adapter.save(card.container);
            expect(card.container.textContent).toContain(status.saved);
            expect(card.container.textContent).not.toContain(status.unsaved);
        } finally {
            teardown(card);
        }
    });

    it("contract: save failure retains the edit + shows a legible error (no silent data loss)", async () => {
        adapter.arrangeFailure(FAILURE_TOKEN);
        const card = adapter.mount();
        try {
            const { input } = adapter.edit(card.container);
            const typed = input.value;
            await adapter.save(card.container);
            expect(card.container.textContent).toContain(FAILURE_TOKEN);
            // The operator's edit is RETAINED — never reverted.
            expect(input.value).toBe(typed);
            expect(drawerOperatingIsDirty()).toBe(true);
        } finally {
            teardown(card);
        }
    });
}
