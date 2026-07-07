// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HouseholdContactEdit from "@/components/admin/focusPanel/cards/HouseholdContactEdit";
import type { FocusPanelSaveResult, PersonContactValues } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";

const INITIAL: PersonContactValues = {
    first_name: "Jordan",
    last_name: "Johnson",
    email: "jordan@example.com",
    phone: "5550001234",
};

function q(attr: string): HTMLElement | null {
    return document.querySelector(`[${attr}]`);
}

function saveBtn(): HTMLButtonElement {
    return document.querySelector('[data-testid="household-edit-save"]') as HTMLButtonElement;
}
function cancelBtn(): HTMLButtonElement {
    return document.querySelector('[data-testid="household-edit-cancel"]') as HTMLButtonElement;
}
function input(field: string): HTMLInputElement {
    return document.querySelector(`[data-testid="household-edit-${field}"]`) as HTMLInputElement;
}
function statusEl(): HTMLElement | null {
    return document.querySelector("[data-editable-card-status]");
}

function setInput(field: string, value: string): void {
    const el = input(field);
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.runAllTimers();
    vi.useRealTimers();
});

function mount(opts: {
    save: () => Promise<FocusPanelSaveResult>;
    onClose?: () => void;
    onSaved?: () => void;
}) {
    act(() => {
        root.render(
            <HouseholdContactEdit
                personId="p-1"
                personName="Jordan Johnson"
                initial={INITIAL}
                save={(_id, _patch) => opts.save()}
                onClose={opts.onClose ?? vi.fn()}
                onSaved={opts.onSaved}
            />,
        );
    });
}

describe("HouseholdContactEdit — canonical runtime behavior", () => {
    it("titles the form with the person name", () => {
        mount({ save: vi.fn().mockResolvedValue({ ok: true as const }) });
        expect(q('data-household-edit-title="true"')?.textContent).toBe("Edit Jordan Johnson");
    });

    it("save button is disabled when form is clean", () => {
        mount({ save: vi.fn().mockResolvedValue({ ok: true as const }) });
        expect(saveBtn().disabled).toBe(true);
    });

    it("save button enables after a field is changed", () => {
        mount({ save: vi.fn().mockResolvedValue({ ok: true as const }) });
        act(() => setInput("first_name", "Alex"));
        expect(saveBtn().disabled).toBe(false);
    });

    it("successful save: shows Saved, locks inputs, then calls onSaved after ack beat", async () => {
        const onSaved = vi.fn();
        const onClose = vi.fn();
        const saveFn = vi.fn().mockResolvedValue({ ok: true as const });
        mount({ save: saveFn, onSaved, onClose });

        act(() => setInput("first_name", "Alex"));
        await act(async () => { saveBtn().click(); });

        // During ack window: inputs locked, "Saved" shown
        expect(saveBtn().disabled).toBe(true);
        expect(input("first_name").disabled).toBe(true);
        expect(statusEl()?.getAttribute("data-editable-card-status")).toBe("saved");

        // After ack beat: onSaved called (not onClose)
        act(() => vi.advanceTimersByTime(900));
        expect(onSaved).toHaveBeenCalledOnce();
        expect(onClose).not.toHaveBeenCalled();
    });

    it("failed save: retains operator draft, shows error, re-enables save", async () => {
        const onSaved = vi.fn();
        const saveFn = vi.fn().mockResolvedValue({ ok: false as const, status: 500, error: "Network error" });
        mount({ save: saveFn, onSaved });

        act(() => setInput("email", "new@example.com"));
        await act(async () => { saveBtn().click(); });

        // Error shown, not saved, onSaved not called
        expect(statusEl()?.getAttribute("data-editable-card-status")).toBe("error");
        expect(saveBtn().disabled).toBe(false);
        expect(onSaved).not.toHaveBeenCalled();
        // Draft retained: input still shows the operator's value
        expect(input("email").value).toBe("new@example.com");
    });

    it("cancel exits without calling save and without stale state", () => {
        const onClose = vi.fn();
        const saveFn = vi.fn();
        mount({ save: saveFn, onClose });

        act(() => setInput("first_name", "TempName"));
        act(() => cancelBtn().click());

        expect(saveFn).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalledOnce();
    });

    it("cancel during saving is disabled", async () => {
        let resolveHold!: () => void;
        const saveFn = vi.fn().mockReturnValue(new Promise<{ ok: boolean }>((res) => { resolveHold = () => res({ ok: true }); }));
        mount({ save: saveFn });

        act(() => setInput("first_name", "Alex"));
        // Start save but don't resolve yet
        act(() => { void saveBtn().click(); });

        expect(cancelBtn().disabled).toBe(true);

        // Resolve and clean up
        await act(async () => { resolveHold(); });
        act(() => vi.runAllTimers());
    });

    it("no status shown when clean", () => {
        mount({ save: vi.fn().mockResolvedValue({ ok: true as const }) });
        expect(statusEl()).toBeNull();
    });

    it("shows unsaved-changes status while dirty", () => {
        mount({ save: vi.fn().mockResolvedValue({ ok: true as const }) });
        act(() => setInput("last_name", "Smith"));
        expect(statusEl()?.getAttribute("data-editable-card-status")).toBe("unsaved");
    });

    it("cancel during ack window clears the timer and calls onClose immediately", async () => {
        const onSaved = vi.fn();
        const onClose = vi.fn();
        const saveFn = vi.fn().mockResolvedValue({ ok: true as const });
        mount({ save: saveFn, onSaved, onClose });

        act(() => setInput("first_name", "Alex"));
        await act(async () => { saveBtn().click(); });

        // During the ack window, cancel should clear the timer and call onClose
        act(() => cancelBtn().click());
        expect(onClose).toHaveBeenCalledOnce();

        // Advancing time should NOT then call onSaved (timer was cleared)
        act(() => vi.advanceTimersByTime(900));
        expect(onSaved).not.toHaveBeenCalled();
    });

    it("falls back to onClose when onSaved is not provided", async () => {
        const onClose = vi.fn();
        const saveFn = vi.fn().mockResolvedValue({ ok: true as const });
        mount({ save: saveFn, onClose });

        act(() => setInput("first_name", "Alex"));
        await act(async () => { saveBtn().click(); });
        act(() => vi.advanceTimersByTime(900));

        expect(onClose).toHaveBeenCalledOnce();
    });
});
