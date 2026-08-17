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
    progressLine,
    PARTICIPANT_CLARIFICATION_MESSAGE,
} from "@/lib/enrollment/participantRuntime/participantTurnPresentation";
import { IntakeCard, IntakeHeading } from "./ParentIntakeShell";

export type EnrollmentConversationCardProps = {
    readonly token: string;
    readonly initialObjective: ParticipantObjectiveWire;
    /** Called when the turn becomes artifact work, so the host hands off to the packet flow. */
    readonly onArtifactHandoff?: () => void;
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
        async (payload: { text?: string; value?: string }) => {
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
                if (json.data.objective.next_turn.kind === "complete_artifact") onArtifactHandoff?.();
            } catch {
                setNotice(PARTICIPANT_CLARIFICATION_MESSAGE);
            } finally {
                inFlight.current = false;
                setBusy(false);
            }
        },
        [token, onArtifactHandoff],
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
        return (
            <IntakeCard>
                <IntakeHeading
                    title="Your details are saved."
                    subtitle="Next, please review and complete the remaining form below."
                />
                <p className="text-[13px] text-alloy-midnight/55">{progressLine(objective)}</p>
            </IntakeCard>
        );
    }

    return (
        <IntakeCard>
            <IntakeHeading title={turn.prompt} subtitle={progressLine(objective)} />

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
            ) : (
                <div className="flex flex-col gap-3">
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
                <button
                    type="button"
                    disabled={busy || !text.trim()}
                    onClick={() =>
                        void submit(control.kind === "choice_or_text" ? { text } : { value: text })
                    }
                    className="rounded-xl bg-alloy-midnight px-4 py-2.5 text-[14px] font-medium text-white disabled:opacity-50"
                >
                    {busy ? "Saving…" : "Continue"}
                </button>
                {busy ? (
                    <span aria-live="polite" className="text-[13px] text-alloy-midnight/55">
                        Saving your answer…
                    </span>
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
