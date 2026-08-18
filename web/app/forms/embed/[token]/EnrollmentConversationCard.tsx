"use client";

/**
 * The participant's conversational Enrollment surface (V1.2).
 *
 * Rendered INSIDE the existing public token page, above the packet flow, using the existing
 * `ParentIntakeShell` primitives. There is no second participant application, no new route and no
 * new visual language — a parent opens the same link they already had.
 *
 * ## What this component may and may not decide
 *
 * It sends the participant's WORDS and nothing else. It never names a field, a requirement, a
 * semantic key, a stage or a command: the server resolves the current turn from session state, so a
 * tampered browser can at most answer a question the platform already chose to ask.
 *
 * ## The provider is invisible here
 *
 * There is no provider branch in this file. Every turn renders from the deterministic prompt and a
 * field-appropriate control, so the screen behaves identically whether interpretation is enabled,
 * disabled, or failing. When the runtime could not read a free-text answer it says so in product
 * language and leaves the controls in place — enhancement, never a dependency.
 */

import { useCallback, useMemo, useRef, useState } from "react";

import type { ParticipantObjectiveWire } from "@/lib/enrollment/participantRuntime/participantObjectiveWireModel";
import {
    controlForTurn,
    optionalSkipLabel,
    participantIntro,
    participantQuestion,
    progressLine,
    PARTICIPANT_CLARIFICATION_MESSAGE,
} from "@/lib/enrollment/participantRuntime/participantTurnPresentation";
import { IntakeCard, IntakeHeading } from "./ParentIntakeShell";

export type EnrollmentConversationCardProps = {
    readonly token: string;
    readonly initialObjective: ParticipantObjectiveWire;
    /** Called when the turn becomes artifact work, so the host hands off to the packet flow. */
    readonly onArtifactHandoff?: () => void;
    /**
     * Reports the runtime phase after every turn.
     *
     * The host defers the packet Form while shared facts remain, and the parent crosses into
     * artifact review MID-conversation — without this the Form would stay hidden until a reload.
     */
    readonly onPhaseChange?: (phase: ParticipantObjectiveWire["phase"]) => void;
};

type TurnResponse = {
    ok: boolean;
    data?: { outcome: string; reason?: string; objective: ParticipantObjectiveWire };
    error?: string;
};

export function EnrollmentConversationCard({
    token,
    initialObjective,
    onArtifactHandoff,
    onPhaseChange,
}: EnrollmentConversationCardProps) {
    const [objective, setObjective] = useState(initialObjective);
    const [text, setText] = useState("");
    const [notice, setNotice] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    /**
     * Guards the request itself, not just the button.
     *
     * A disabled button is a UI affordance; a double submit can still arrive from a keyboard repeat
     * or a fast double-tap before React re-renders. The ref is checked synchronously at the top of
     * the handler, so the second call returns before it can reach the network.
     */
    const inFlight = useRef(false);

    const control = useMemo(() => controlForTurn(objective.next_turn), [objective]);

    const submit = useCallback(
        async (payload: { text?: string; value?: unknown }) => {
            if (inFlight.current) return;
            inFlight.current = true;
            setBusy(true);
            setNotice(null);
            try {
                const res = await fetch(
                    `/api/public/forms/${encodeURIComponent(token)}/enrollment-turn`,
                    {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        // WORDS ONLY. No field key, no requirement id, no command — the server owns
                        // every one of those and reads them from the session's current turn.
                        body: JSON.stringify(payload),
                    },
                );
                const json = (await res.json()) as TurnResponse;
                if (!json.ok || !json.data) {
                    setNotice(PARTICIPANT_CLARIFICATION_MESSAGE);
                    return;
                }

                setObjective(json.data.objective);
                setText("");

                // `refused` and `no_change` both mean the platform did not accept the answer. The
                // participant is told plainly and the controls stay — never an internal code.
                if (json.data.outcome === "refused" || json.data.outcome === "no_change") {
                    setNotice(PARTICIPANT_CLARIFICATION_MESSAGE);
                }
                onPhaseChange?.(json.data.objective.phase);
                if (json.data.objective.next_turn.kind === "complete_artifact") onArtifactHandoff?.();
            } catch {
                setNotice(PARTICIPANT_CLARIFICATION_MESSAGE);
            } finally {
                inFlight.current = false;
                setBusy(false);
            }
        },
        [token, onArtifactHandoff, onPhaseChange],
    );

    const turn = objective.next_turn;

    if (control.kind === "done") {
        return (
            <IntakeCard>
                <IntakeHeading title="Everything we need is complete." subtitle="Thank you." />
            </IntakeCard>
        );
    }

    if (control.kind === "handoff") {
        // Shared collection is done. The parent is handed a POPULATED artifact to review — not a
        // blank form — and the signature/acknowledgment live down there with it, where they belong.
        return (
            <IntakeCard>
                <IntakeHeading title={participantQuestion(objective)} subtitle={progressLine(objective)} />
            </IntakeCard>
        );
    }

    const intro = participantIntro(objective);
    // Offered only where the authored Form permits it — never invented by the runtime.
    const skipLabel = optionalSkipLabel(objective);

    return (
        <IntakeCard>
            {intro ? (
                <p className="mb-4 text-[13px] leading-relaxed text-alloy-midnight/70" data-participant-intro="true">
                    {intro}
                </p>
            ) : null}

            {/* The question a PARENT reads — subject, natural label, and the value we hold. Never the
                internal prompt, which is written for the runtime and says things like "Child Dob". */}
            <IntakeHeading title={participantQuestion(objective)} subtitle={progressLine(objective)} />

            {turn.resolves_occurrences > 1 ? (
                <p className="mb-4 text-[13px] text-alloy-midnight/55">
                    Answering once covers this in {turn.resolves_occurrences} places.
                </p>
            ) : null}

            {control.kind === "choice_or_text" ? (
                <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => void submit({ text: "yes" })}
                            className="rounded-xl bg-alloy-midnight px-4 py-2.5 text-[14px] font-medium text-white disabled:opacity-50"
                        >
                            {control.affirm}
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => void submit({ text: "no" })}
                            className="rounded-xl border border-alloy-midnight/15 px-4 py-2.5 text-[14px] font-medium text-alloy-midnight disabled:opacity-50"
                        >
                            {control.deny}
                        </button>
                    </div>

                    <label className="text-[13px] text-alloy-midnight/60" htmlFor="enrollment-turn-text">
                        Or type your answer
                    </label>
                    <input
                        id="enrollment-turn-text"
                        type="text"
                        value={text}
                        disabled={busy}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && text.trim()) void submit({ text });
                        }}
                        className="rounded-xl border border-alloy-midnight/15 px-3 py-2.5 text-[14px]"
                    />
                </div>
            ) : control.kind === "boolean" ? (
                <div className="flex flex-wrap gap-2" data-participant-control="boolean">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => void submit({ value: true })}
                        className="rounded-xl bg-alloy-midnight px-4 py-2.5 text-[14px] font-medium text-white disabled:opacity-50"
                    >
                        {control.affirm}
                    </button>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => void submit({ value: false })}
                        className="rounded-xl border border-alloy-midnight/15 px-4 py-2.5 text-[14px] font-medium text-alloy-midnight disabled:opacity-50"
                    >
                        {control.deny}
                    </button>
                </div>
            ) : control.kind === "options" ? (
                <div className="flex flex-wrap gap-2" data-participant-control="options">
                    {control.options.map((option) => (
                        <button
                            key={option}
                            type="button"
                            disabled={busy}
                            onClick={() => void submit({ value: option })}
                            className="rounded-xl border border-alloy-midnight/15 px-4 py-2.5 text-[14px] font-medium text-alloy-midnight disabled:opacity-50"
                        >
                            {option}
                        </button>
                    ))}
                </div>
            ) : (
                <div className="flex flex-col gap-3" data-participant-control={control.inputType}>
                    <label className="text-[13px] text-alloy-midnight/60" htmlFor="enrollment-turn-value">
                        {control.label}
                    </label>
                    <input
                        id="enrollment-turn-value"
                        type={control.inputType}
                        value={text}
                        disabled={busy}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && text.trim()) void submit({ value: text });
                        }}
                        className="rounded-xl border border-alloy-midnight/15 px-3 py-2.5 text-[14px]"
                    />
                </div>
            )}

            <div className="mt-4 flex items-center gap-3">
                {control.kind === "boolean" || control.kind === "options" ? null : (
                <button
                    type="button"
                    disabled={busy || !text.trim()}
                    onClick={() =>
                        void submit(control.kind === "choice_or_text" ? { text } : { value: text })
                    }
                    className="rounded-xl bg-alloy-midnight px-4 py-2.5 text-[14px] font-medium text-white disabled:opacity-50"
                >
                    {"Continue"}
                </button>
                )}
                {/* No "Saving…" — persistence is the platform's business, not a participant-facing
                    step. The button stays a single Continue and simply cannot be pressed twice;
                    `inFlight` already makes a duplicate submit impossible. */}
                {skipLabel ? (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => void submit({ value: null })}
                        className="text-[13px] text-alloy-midnight/60 underline underline-offset-2 disabled:opacity-50"
                        data-participant-skip="true"
                    >
                        {skipLabel}
                    </button>
                ) : null}
            </div>

            {notice ? (
                <p aria-live="polite" className="mt-3 text-[13px] text-alloy-midnight/70">
                    {notice}
                </p>
            ) : null}
        </IntakeCard>
    );
}
