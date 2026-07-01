"use client";

/**
 * Command Surface controller — platform-owned command lifecycle (Command Surface V2).
 *
 * Owns the operator-facing lifecycle of a command surface: holds operator input edits and the
 * idle → executing → success/failure phase, and re-derives the surface state on every change.
 *
 * Crucially, **execution is injected** (`execute`). The controller never calls a mutation API
 * directly — the caller wires `execute` to the existing registered-action path (e.g. the
 * create_lead execute route used by the modal/BOS today). This is how BOS, manual UI, and
 * Work Unit Actions converge on ONE command lifecycle without forking execution.
 *
 * Command-agnostic: `deriveSnapshot` produces a {@link GenericCommandSnapshot} from current
 * inputs/phase, so Create Lead (and later Update Status) reuse the same controller.
 *
 * @see docs/sprints/06_2026/command_surface_v2.md
 */

import { useCallback, useMemo, useState } from "react";
import type { CommandPhase } from "@/lib/platform/commands/commandState";
import type { ActionResultOk } from "@/lib/adminV2/actions/actionTypes";
import {
    deriveCommandSurfaceStateFromSnapshot,
    type CommandSurfaceAdapterOptions,
    type GenericCommandSnapshot,
} from "@/lib/platform/commands/surface/commandSurfaceModel";
import type {
    CommandSurfaceConfigInfluence,
    CommandSurfaceState,
} from "@/lib/platform/commands/surface/commandSurfaceTypes";

export type DeriveSnapshotArgs = {
    inputs: Record<string, string>;
    phase: CommandPhase;
    result: ActionResultOk | null;
    errorMessage: string | null;
};

export type UseCommandSurfaceControllerArgs = {
    /** Inputs known up front (e.g. BOS-parsed values). Empty for a cold Work Unit start. */
    initialInputs?: Record<string, string>;
    /** Build a command snapshot from current inputs + phase. Command-specific; injected. */
    deriveSnapshot: (args: DeriveSnapshotArgs) => GenericCommandSnapshot;
    /**
     * Execute the command. MUST route through the existing registered-action path; the
     * controller never mutates directly. Returns the success result on success, throws on error.
     */
    execute: (inputs: Record<string, string>) => Promise<ActionResultOk>;
    surfaceOptions?: CommandSurfaceAdapterOptions;
    config?: CommandSurfaceConfigInfluence;
    onSuccess?: (result: ActionResultOk) => void;
};

export type CommandSurfaceController = {
    surfaceState: CommandSurfaceState;
    inputValues: Record<string, string>;
    phase: CommandPhase;
    setInput: (field: string, value: string) => void;
    /** Run the command via the injected `execute`. No-op unless the primary action is ready. */
    submit: () => Promise<void>;
    reset: () => void;
};

export function useCommandSurfaceController(
    args: UseCommandSurfaceControllerArgs
): CommandSurfaceController {
    const [inputValues, setInputValues] = useState<Record<string, string>>(args.initialInputs ?? {});
    const [phase, setPhase] = useState<CommandPhase>("idle");
    const [result, setResult] = useState<ActionResultOk | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const snapshot = useMemo(
        () => args.deriveSnapshot({ inputs: inputValues, phase, result, errorMessage }),
        [args, inputValues, phase, result, errorMessage]
    );

    const surfaceState = useMemo(
        () => deriveCommandSurfaceStateFromSnapshot(snapshot, args.surfaceOptions, args.config),
        [snapshot, args.surfaceOptions, args.config]
    );

    const setInput = useCallback((field: string, value: string) => {
        setInputValues((prev) => ({ ...prev, [field]: value }));
    }, []);

    const submit = useCallback(async () => {
        // Platform-fixed gate: only run when the surface presents an executable primary action.
        if (surfaceState.footer.primary.kind !== "execute" || !surfaceState.footer.primary.enabled) {
            return;
        }
        setPhase("executing");
        setErrorMessage(null);
        try {
            const ok = await args.execute(inputValues);
            setResult(ok);
            setPhase("success");
            args.onSuccess?.(ok);
        } catch (err) {
            setResult(null);
            setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
            setPhase("failure");
        }
    }, [args, inputValues, surfaceState.footer.primary.kind, surfaceState.footer.primary.enabled]);

    const reset = useCallback(() => {
        setPhase("idle");
        setResult(null);
        setErrorMessage(null);
    }, []);

    return { surfaceState, inputValues, phase, setInput, submit, reset };
}
