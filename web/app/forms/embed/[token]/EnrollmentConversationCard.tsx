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
    displayValue,
    naturalFieldLabel,
    optionalSkipLabel,
    participantIntro,
    participantQuestion,
    progressLine,
    type ParticipantValueControl,
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
    /**
     * Whether the host actually has an artifact to render beneath this card.
     *
     * The handoff copy points DOWN the page. Saying "review it below" when there is nothing below
     * is a lie the participant cannot act on, so the card refuses to say it.
     */
    readonly artifactRenderable?: boolean;
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
    artifactRenderable = true,
}: EnrollmentConversationCardProps) {
    const [objective, setObjective] = useState(initialObjective);
    /**
     * What the parent has already settled, newest last.
     *
     * The surface used to REPLACE itself on every turn, which made a short conversation feel like an
     * interrogation: each answer erased the evidence that anything had happened. Settled facts now
     * stay on screen and the next question appears beneath them.
     */
    const [settled, setSettled] = useState<{ label: string; value: string }[]>([]);
    /** Whether the parent has asked to correct the value currently being confirmed. */
    const [correcting, setCorrecting] = useState(false);
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
        async (payload: { text?: string; value?: unknown; settledAs?: string }) => {
            if (inFlight.current) return;
            inFlight.current = true;
            setBusy(true);
            setNotice(null);

            /**
             * IMMEDIATE acknowledgement. The section resolves the moment the parent clicks; the
             * request continues behind it.
             *
             * This is presentation, not a claim of persistence: nothing here says "saved". If the
             * server refuses, the entry is rolled back below and the question returns — so the
             * optimism can never outlive the truth.
             */
            const optimistic = payload.settledAs?.trim();
            const settledLabel = naturalFieldLabel(objective.next_turn.label);
            if (optimistic) setSettled((prev) => [...prev, { label: settledLabel, value: optimistic }]);
            setCorrecting(false);
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
                    if (optimistic) setSettled((prev) => prev.slice(0, -1));
                    setNotice(PARTICIPANT_CLARIFICATION_MESSAGE);
                }
                onPhaseChange?.(json.data.objective.phase);
                if (json.data.objective.next_turn.kind === "complete_artifact") onArtifactHandoff?.();
            } catch {
                // Roll the optimistic entry back rather than leave a resolved-looking section for
                // something the platform never accepted.
                if (optimistic) setSettled((prev) => prev.slice(0, -1));
                setNotice(PARTICIPANT_CLARIFICATION_MESSAGE);
            } finally {
                inFlight.current = false;
                setBusy(false);
            }
        },
        [token, onArtifactHandoff, onPhaseChange, objective.next_turn.label],
    );

    const turn = objective.next_turn;

    if (control.kind === "done") {
        return (
            <IntakeCard>
                <IntakeHeading title="Everything we need is complete." subtitle="Thank you." />
            </IntakeCard>
        );
    }

    if (control.kind === "handoff" && !artifactRenderable) {
        // Truthful and recoverable, never an empty completion screen: the shared facts ARE settled,
        // and the paperwork this journey points at cannot be shown. That is a configuration problem
        // the tenant can fix, and saying so beats a blank page under a cheerful heading.
        return (
            <IntakeCard>
                <IntakeHeading
                    title="Your details are saved."
                    subtitle="There is no paperwork to complete here yet — the centre has been notified."
                />
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
            {/* Settled sections stay on screen — the conversation reads as a growing record of what
                has been agreed, not a sequence of screens that erase each other. */}
            {settled.length > 0 ? (
                <ul className="mb-5 flex flex-col gap-2" data-participant-settled="true">
                    {settled.map((entry, i) => (
                        <li
                            key={`${entry.label}-${i}`}
                            className="flex items-baseline gap-2 text-[13px] text-alloy-midnight/70"
                        >
                            <span aria-hidden className="text-emerald-600">✓</span>
                            <span className="font-medium text-alloy-midnight">{entry.value}</span>
                            <span className="text-alloy-midnight/45">{entry.label}</span>
                        </li>
                    ))}
                </ul>
            ) : null}

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
                correcting ? (
                    <ValueControl
                        control={control.correction}
                        busy={busy}
                        text={text}
                        setText={setText}
                        onSubmit={(value, shown) => void submit({ value, settledAs: shown })}
                    />
                ) : (
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                            void submit({ text: "yes", settledAs: displayValue(turn.proposed_value) })
                        }
                        className="rounded-xl bg-alloy-midnight px-4 py-2.5 text-[14px] font-medium text-white disabled:opacity-50"
                    >
                        {control.affirm}
                    </button>
                    <button
                        type="button"
                        disabled={busy}
                        // Correcting is a UI transition, not a turn: it reveals the typed control the
                        // authored Form uses. No round trip, and nothing is claimed to the platform.
                        onClick={() => setCorrecting(true)}
                        className="rounded-xl border border-alloy-midnight/15 px-4 py-2.5 text-[14px] font-medium text-alloy-midnight disabled:opacity-50"
                    >
                        {control.deny}
                    </button>
                </div>
                )
            ) : (
                <ValueControl
                    control={control}
                    busy={busy}
                    text={text}
                    setText={setText}
                    onSubmit={(value, shown) => void submit({ value, settledAs: shown })}
                />
            )}

            <div className="mt-4 flex items-center gap-3">
                {/* No "Saving…" — persistence is the platform's business, not a participant-facing
                    step. Confirming resolves the section immediately and the request follows it;
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

/**
 * The typed control for one value — the SAME component whether the parent is supplying a missing
 * fact or correcting a known one.
 *
 * Every branch is driven by the AUTHORED field type. A date is a date input with the browser's own
 * date guardrails plus an explicit ISO check, so an impossible date cannot be submitted; a boolean
 * is two buttons; a closed choice is its options. There is no generic text fallback for a typed
 * field — that fallback was the defect.
 */
function ValueControl({
    control,
    busy,
    text,
    setText,
    onSubmit,
}: {
    control: ParticipantValueControl;
    busy: boolean;
    text: string;
    setText: (next: string) => void;
    /** `shown` is what the settled section displays — the value as a parent reads it. */
    onSubmit: (value: unknown, shown: string) => void;
}) {
    if (control.kind === "boolean") {
        return (
            <div className="flex flex-wrap gap-2" data-participant-control="boolean">
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => onSubmit(true, control.affirm)}
                    className="rounded-xl bg-alloy-midnight px-4 py-2.5 text-[14px] font-medium text-white disabled:opacity-50"
                >
                    {control.affirm}
                </button>
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => onSubmit(false, control.deny)}
                    className="rounded-xl border border-alloy-midnight/15 px-4 py-2.5 text-[14px] font-medium text-alloy-midnight disabled:opacity-50"
                >
                    {control.deny}
                </button>
            </div>
        );
    }

    if (control.kind === "options") {
        return (
            <div className="flex flex-wrap gap-2" data-participant-control="options">
                {control.options.map((option) => (
                    <button
                        key={option}
                        type="button"
                        disabled={busy}
                        onClick={() => onSubmit(option, option)}
                        className="rounded-xl border border-alloy-midnight/15 px-4 py-2.5 text-[14px] font-medium text-alloy-midnight disabled:opacity-50"
                    >
                        {option}
                    </button>
                ))}
            </div>
        );
    }

    // A date must BE a date. The input type gives the picker and the browser's own validation; the
    // ISO check refuses anything that reaches the handler anyway, so "31 February" cannot be sent.
    const isDate = control.inputType === "date";
    const validDate = (raw: string) => {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
        if (!m) return false;
        const d = new Date(`${raw}T00:00:00Z`);
        return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === raw.trim();
    };
    const ready = isDate ? validDate(text) : text.trim().length > 0;
    const shown = isDate ? displayValue(text) : text.trim();

    return (
        <div className="flex flex-col gap-3" data-participant-control={control.inputType}>
            <label className="text-[13px] text-alloy-midnight/60" htmlFor="enrollment-turn-value">
                {control.label}
            </label>
            {control.multiline ? (
                <textarea
                    id="enrollment-turn-value"
                    value={text}
                    disabled={busy}
                    rows={3}
                    onChange={(e) => setText(e.target.value)}
                    className="rounded-xl border border-alloy-midnight/15 px-3 py-2.5 text-[14px]"
                />
            ) : (
                <input
                    id="enrollment-turn-value"
                    type={control.inputType}
                    value={text}
                    disabled={busy}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && ready) onSubmit(text.trim(), shown);
                    }}
                    className="rounded-xl border border-alloy-midnight/15 px-3 py-2.5 text-[14px]"
                />
            )}
            <div>
                <button
                    type="button"
                    disabled={busy || !ready}
                    onClick={() => onSubmit(text.trim(), shown)}
                    className="rounded-xl bg-alloy-midnight px-4 py-2.5 text-[14px] font-medium text-white disabled:opacity-50"
                >
                    Continue
                </button>
            </div>
        </div>
    );
}
