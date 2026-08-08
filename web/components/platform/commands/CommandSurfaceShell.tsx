"use client";

/**
 * Command Surface Shell — platform-owned, presentational (Command Surface V2).
 *
 * Renders a {@link CommandSurfaceState} into the fixed command anatomy (header · body ·
 * footer · success · failure). This component is the FIRST visible Command Surface UI. It is:
 *
 *  - **Platform-owned**: layout, stage order, and confirm/success/failure patterns are fixed
 *    here and identical for every command and every variant (Work Unit, Focus Panel, Queue
 *    Row, BOS). Configuration cannot reach this file.
 *  - **Presentational**: it holds no command state and performs NO execution. The lifecycle
 *    (input edits, submit, cancel) is delegated to injected callbacks, so BOS/manual/Work Unit
 *    all reuse the same shell while execution stays on the existing registered-action path.
 *
 * Operators only ever see human copy — never action keys, payload keys, or runtime enums.
 *
 * @see docs/sprints/06_2026/command_surface_v2.md
 */

import type { ReactNode } from "react";
import type { CommandSurfaceState } from "@/lib/platform/commands/surface/commandSurfaceTypes";
import {
    commandSurfaceSectionCaption,
    commandSurfaceStageCaption,
} from "@/lib/platform/commands/surface/commandSurfacePresentation";

export type CommandSurfaceShellProps = {
    state: CommandSurfaceState;
    /** Controlled value for a required input field (operator-supplied). */
    inputValues?: Record<string, string>;
    onChangeInput?: (field: string, value: string) => void;
    /** Primary action (confirm / open record / retry). The caller wires execution. */
    onPrimary?: () => void;
    onSecondary?: () => void;
    onCancel?: () => void;
    /** Optional subject selector slot (Work Unit commands needing a subject). */
    subjectSlot?: ReactNode;
};

function ContextChips({ chips }: { chips: string[] }) {
    if (chips.length === 0) return null;
    return (
        <div className="mt-2 flex flex-wrap gap-1.5" data-command-surface-chips>
            {chips.map((chip) => (
                <span
                    key={chip}
                    className="rounded-full bg-alloy-midnight/5 px-2 py-0.5 text-[11px] font-medium text-alloy-midnight/70"
                >
                    {chip}
                </span>
            ))}
        </div>
    );
}

function SurfaceBody(props: CommandSurfaceShellProps) {
    const { state, inputValues, onChangeInput, subjectSlot } = props;
    const { body, section } = state;

    if (section === "success") {
        return (
            <div className="space-y-1" data-command-surface-section="success">
                <p className="text-sm font-medium text-alloy-midnight">{state.success?.message}</p>
                <p className="text-xs text-alloy-midnight/60">{state.success?.nextCopy}</p>
            </div>
        );
    }
    if (section === "failure") {
        return (
            <div className="space-y-1" data-command-surface-section="failure">
                <p className="text-sm font-medium text-alloy-rust">{state.failure?.message}</p>
                <p className="text-xs text-alloy-midnight/60">{state.failure?.recovery}</p>
            </div>
        );
    }
    if (section === "executing") {
        return (
            <p className="text-sm text-alloy-midnight/70" data-command-surface-section="executing">
                {state.header.state === "executing" ? state.footer.primary.label : "Working…"}
            </p>
        );
    }
    if (section === "blocker") {
        return (
            <p className="text-sm text-alloy-midnight/80" data-command-surface-section="blocker">
                {body.blockerCopy}
            </p>
        );
    }
    if (section === "subject_selector") {
        return (
            <div className="space-y-2" data-command-surface-section="subject_selector">
                <p className="text-sm text-alloy-midnight/80">{body.missingSubject}</p>
                {subjectSlot}
            </div>
        );
    }
    if (section === "input_fields") {
        return (
            <div className="space-y-3" data-command-surface-section="input_fields">
                {body.missingInputs.map((input) => (
                    <label key={input.field} className="block text-xs">
                        <span className="mb-1 block font-medium text-alloy-midnight/70">{input.label}</span>
                        <input
                            type="text"
                            className="w-full rounded-md border border-alloy-midnight/15 px-2 py-1.5 text-sm"
                            value={inputValues?.[input.field] ?? ""}
                            onChange={(e) => onChangeInput?.(input.field, e.target.value)}
                        />
                    </label>
                ))}
            </div>
        );
    }
    // preview / confirmation
    return (
        <div className="space-y-1" data-command-surface-section={section}>
            {body.confirmationSummary?.map((line, i) => (
                <p key={i} className="text-sm text-alloy-midnight/80">
                    {line}
                </p>
            ))}
        </div>
    );
}

export default function CommandSurfaceShell(props: CommandSurfaceShellProps) {
    const { state, onPrimary, onSecondary, onCancel } = props;
    const stageCaption = commandSurfaceStageCaption(state);

    return (
        <section
            className="flex flex-col gap-4 rounded-xl border border-alloy-midnight/10 bg-white p-4"
            data-command-surface
            data-command-surface-variant={state.variant}
            aria-label={state.header.title}
        >
            <header data-command-surface-header>
                <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-alloy-midnight">{state.header.title}</h2>
                    {stageCaption ? (
                        <span className="text-[11px] font-medium text-alloy-midnight/50">{stageCaption}</span>
                    ) : null}
                </div>
                {state.header.description ? (
                    <p className="mt-0.5 text-xs text-alloy-midnight/60">{state.header.description}</p>
                ) : null}
                <ContextChips chips={state.header.contextChips} />
            </header>

            <div data-command-surface-body>
                <p className="mb-2 text-[11px] uppercase tracking-wide text-alloy-midnight/40">
                    {commandSurfaceSectionCaption(state.section)}
                </p>
                <SurfaceBody {...props} />
            </div>

            <footer className="flex items-center justify-end gap-2" data-command-surface-footer>
                {state.footer.secondary ? (
                    <button
                        type="button"
                        className="rounded-md px-3 py-1.5 text-sm text-alloy-midnight/70 hover:bg-alloy-midnight/5"
                        onClick={state.footer.secondary.kind === "cancel" ? onCancel : onSecondary}
                    >
                        {state.footer.secondary.label}
                    </button>
                ) : null}
                <button
                    type="button"
                    className="rounded-md bg-alloy-pine px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
                    disabled={!state.footer.primary.enabled}
                    onClick={onPrimary}
                    data-command-surface-primary
                    data-command-surface-primary-kind={state.footer.primary.kind}
                >
                    {state.footer.primary.label}
                </button>
            </footer>
        </section>
    );
}
