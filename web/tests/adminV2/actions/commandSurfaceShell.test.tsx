// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import CommandSurfaceShell from "@/components/adminV2/actions/surface/CommandSurfaceShell";
import { useCommandSurfaceController } from "@/lib/adminV2/actions/surface/useCommandSurfaceController";
import {
    deriveCreateLeadCommandFromBosProposal,
    deriveCreateLeadCommandState,
} from "@/lib/adminV2/actions/createLead/createLeadCommandModel";
import { deriveCreateLeadSurfaceState } from "@/lib/adminV2/actions/surface/commandSurfaceModel";
import type { CommandPhase } from "@/lib/adminV2/actions/commandState";
import type { ActionResultOk } from "@/lib/adminV2/actions/actionTypes";

const complete = { first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" };

const okResult: ActionResultOk = {
    ok: true,
    correlationId: "c1",
    result: {
        actionKey: "create_lead",
        entityType: "opportunity",
        entityId: "opp-7",
        affectedId: "opp-7",
        detail: { kind: "create_lead", opportunity_id: "opp-7" },
    },
};

function mount(ui: ReactNode) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
        root.render(ui);
    });
    return {
        container,
        unmount: () => act(() => root.unmount()),
    };
}

describe("CommandSurfaceShell (presentational)", () => {
    it("renders human labels for missing inputs — never raw payload keys", () => {
        const state = deriveCreateLeadSurfaceState(
            deriveCreateLeadCommandState({ knownInputs: {}, entryPoint: "work_unit_actions" })
        );
        const { container, unmount } = mount(createElement(CommandSurfaceShell, { state }));
        const text = container.textContent ?? "";
        expect(text).toContain("First name");
        expect(text).toContain("Last name");
        expect(text).not.toMatch(/first_name|last_name/);
        // Primary action shows operator copy and is disabled until inputs are satisfied.
        const primary = container.querySelector("[data-command-surface-primary]") as HTMLButtonElement;
        expect(primary.disabled).toBe(true);
        unmount();
    });

    it("renders the confirm action for a complete BOS proposal", () => {
        const state = deriveCreateLeadSurfaceState(deriveCreateLeadCommandFromBosProposal({ parsedValues: complete }));
        const { container, unmount } = mount(createElement(CommandSurfaceShell, { state }));
        const primary = container.querySelector("[data-command-surface-primary]") as HTMLButtonElement;
        expect(primary.disabled).toBe(false);
        expect(primary.getAttribute("data-command-surface-primary-kind")).toBe("execute");
        const surface = container.querySelector("[data-command-surface]") as HTMLElement;
        expect(surface.getAttribute("data-command-surface-variant")).toBe("bos");
        unmount();
    });
});

describe("useCommandSurfaceController (platform lifecycle, injected execution)", () => {
    function ControlledCreateLead(props: {
        initialInputs?: Record<string, string>;
        entryPoint: "manual" | "bos" | "work_unit_actions";
        execute: (inputs: Record<string, string>) => Promise<ActionResultOk>;
    }) {
        const controller = useCommandSurfaceController({
            initialInputs: props.initialInputs,
            deriveSnapshot: ({ inputs, phase, result, errorMessage }) =>
                deriveCreateLeadCommandState({
                    knownInputs: inputs,
                    entryPoint: props.entryPoint,
                    phase: phase as CommandPhase,
                    result,
                    errorMessage,
                }),
            execute: props.execute,
        });
        return createElement(CommandSurfaceShell, {
            state: controller.surfaceState,
            inputValues: controller.inputValues,
            onChangeInput: controller.setInput,
            onPrimary: controller.submit,
        });
    }

    it("confirm executes through the injected path and transitions to success", async () => {
        const execute = vi.fn(async () => okResult);
        const { container, unmount } = mount(
            createElement(ControlledCreateLead, { initialInputs: complete, entryPoint: "bos", execute })
        );
        const primary = () => container.querySelector("[data-command-surface-primary]") as HTMLButtonElement;
        expect(primary().disabled).toBe(false);

        await act(async () => {
            primary().click();
        });

        expect(execute).toHaveBeenCalledTimes(1);
        expect(execute).toHaveBeenCalledWith(complete);
        const text = container.textContent ?? "";
        expect(text).toMatch(/Lead created|Created lead/i);
        expect(container.querySelector('[data-command-surface-section="success"]')).not.toBeNull();
        unmount();
    });

    it("does not execute while required inputs are missing", async () => {
        const execute = vi.fn(async () => okResult);
        const { container, unmount } = mount(
            createElement(ControlledCreateLead, { initialInputs: { first_name: "Ada" }, entryPoint: "work_unit_actions", execute })
        );
        await act(async () => {
            (container.querySelector("[data-command-surface-primary]") as HTMLButtonElement).click();
        });
        expect(execute).not.toHaveBeenCalled();
        unmount();
    });
});
