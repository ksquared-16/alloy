"use client";

/**
 * The participant's conversational Enrollment surface.
 *
 * Rendered INSIDE the existing public token page using the existing `ParentIntakeShell` primitives.
 * There is no second participant application, no new route and no new visual language — a parent
 * opens the same link they already had.
 *
 * ## What this component may and may not decide
 *
 * It sends the participant's WORDS and nothing else. It never names a field, a requirement, a
 * semantic key, a stage or an instruction: the server resolves the current turn from session state,
 * so a tampered browser can at most answer a question the platform already chose to ask.
 *
 * ## The provider is invisible here
 *
 * There is no provider branch in this file. Every turn renders from the deterministic prompt and a
 * field-appropriate control, so the screen behaves identically whether interpretation is enabled,
 * disabled, or failing. When the runtime could not read a free-text answer it says so in product
 * language and leaves the controls in place — enhancement, never a dependency.
 *
 * ## Why it is a thread
 *
 * The previous surface stacked question, answer, question, answer, six filled buttons and an input
 * at roughly one weight. A parent had to parse it. The conversation now has a viewport of its own:
 * history recedes upward, the current exchange owns the eye, and the composer is anchored at the
 * bottom where a reply belongs. See `ParticipantThread.tsx` and `ParticipantComposer.tsx`.
 */

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";

import type { ParticipantObjectiveWire } from "@/lib/enrollment/participantRuntime/participantObjectiveWireModel";
import {
    controlForTurn,
    displayValue,
    optionalAffirmLabel,
    optionalSkipLabel,
    participantIntro,
    participantProgressDisplay,
    participantQuestion,
    participantQuestionSegments,
    type ParticipantValueControl,
    PARTICIPANT_CLARIFICATION_MESSAGE,
} from "@/lib/enrollment/participantRuntime/participantTurnPresentation";
import { IntakeCard, IntakeHeading } from "./ParentIntakeShell";
import {
    ConversationProgress,
    ConversationViewport,
    ThreadSaid,
    ThreadSupporting,
    ThreadTurn,
    type ThreadDepth,
} from "./ParticipantThread";
import {
    Composer,
    SuggestedReplies,
    ThinkingAffordance,
    type SuggestedReply,
} from "./ParticipantComposer";

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
     * The handoff copy points at the paperwork. Saying "review it" when there is nothing to review
     * is a lie the participant cannot act on, so the card refuses to say it.
     */
    readonly artifactRenderable?: boolean;
    /**
     * Reports a value the conversation has settled, and which artifact fields it fills.
     *
     * The paperwork must already show what the parent just said. Without this the review rendered an
     * empty box for an answer given seconds earlier — the value was in the session, and the surface
     * had not been told.
     */
    readonly onValueSettled?: (fieldIds: readonly string[], value: unknown) => void;
};

type TurnResponse = {
    ok: boolean;
    data?: {
        outcome: string;
        reason?: string;
        /** A bounded, provider-authored clarifying question — presentation only. */
        clarification?: string;
        objective: ParticipantObjectiveWire;
    };
    error?: string;
};

/** One settled exchange, held locally for this sitting only. */
type Exchange = { said: string; answered: string };

export function EnrollmentConversationCard({
    token,
    initialObjective,
    onArtifactHandoff,
    onPhaseChange,
    artifactRenderable = true,
    onValueSettled,
}: EnrollmentConversationCardProps) {
    const [objective, setObjective] = useState(initialObjective);
    /**
     * What the parent has already settled, newest last.
     *
     * The surface used to REPLACE itself on every turn, which made a short conversation feel like an
     * interrogation: each answer erased the evidence that anything had happened. Settled exchanges
     * now stay in the thread and recede.
     */
    const [settled, setSettled] = useState<Exchange[]>([]);
    /** Whether the parent has asked to correct the value currently being confirmed. */
    const [correcting, setCorrecting] = useState(false);
    /** The parent said yes to an optional question and is now telling us the detail. */
    const [elaborating, setElaborating] = useState(false);
    const [text, setText] = useState("");
    const [notice, setNotice] = useState<string | null>(null);
    /**
     * The provider's clarifying question, spoken in Alloy's voice while the SAME deterministic
     * turn and controls stand. Presentation only — clearing it changes nothing durable.
     */
    const [clarification, setClarification] = useState<string | null>(null);
    /** A free-text reply is being interpreted — the honest "thinking" state. */
    const [interpreting, setInterpreting] = useState(false);
    const [busy, setBusy] = useState(false);
    /**
     * True from the instant the parent answers until the next turn arrives.
     *
     * The answered exchange is already in the thread, so the outgoing question must not also render
     * as the current one — that is the double-question a chat surface must never show.
     */
    const [awaitingTurn, setAwaitingTurn] = useState(false);
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
             * IMMEDIATE acknowledgement. The exchange lands in the thread the moment the parent
             * acts; the request continues behind it.
             *
             * This is presentation, not a claim of persistence: nothing here says "saved". If the
             * server refuses, the entry is rolled back below and the question returns — so the
             * optimism can never outlive the truth.
             */
            const optimistic = payload.settledAs?.trim();
            const asked = participantQuestion(objective);
            setClarification(null);
            // Words need interpreting; button answers do not. The thinking state is shown only
            // while interpretation is actually running — never as decoration.
            const isFreeText = typeof payload.text === "string" && payload.text !== "yes";
            if (isFreeText) setInterpreting(true);
            // Same instant as the thread entry: the artifact shows the answer as it is given.
            if (payload.value !== undefined && objective.next_turn.field_ids.length > 0) {
                onValueSettled?.(objective.next_turn.field_ids, payload.value);
            }
            if (payload.text === "yes" && objective.next_turn.field_ids.length > 0) {
                onValueSettled?.(objective.next_turn.field_ids, objective.next_turn.proposed_value);
            }
            if (optimistic) {
                setSettled((prev) => [...prev, { said: asked, answered: optimistic }]);
                setAwaitingTurn(true);
            }
            setCorrecting(false);
            setElaborating(false);
            setText("");
            try {
                const res = await fetch(
                    `/api/public/forms/${encodeURIComponent(token)}/enrollment-turn`,
                    {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        // WORDS ONLY. No identifier of any kind — the server owns every one of
                        // those and reads them from the session's current turn.
                        body: JSON.stringify(payload),
                    },
                );
                const json = (await res.json()) as TurnResponse;
                if (!json.ok || !json.data) {
                    if (optimistic) setSettled((prev) => prev.slice(0, -1));
                    setNotice(PARTICIPANT_CLARIFICATION_MESSAGE);
                    return;
                }

                setObjective(json.data.objective);
                setText("");

                // `refused` and `no_change` both mean the platform did not accept the answer. The
                // participant is told plainly and the controls stay — never an internal code.
                if (json.data.outcome === "refused" || json.data.outcome === "no_change") {
                    if (optimistic) setSettled((prev) => prev.slice(0, -1));
                    // The provider's own clarifying question beats the generic ask-again — same
                    // voice, same turn, no new authority.
                    if (json.data.clarification) {
                        setClarification(json.data.clarification);
                    } else {
                        setNotice(PARTICIPANT_CLARIFICATION_MESSAGE);
                    }
                }
                onPhaseChange?.(json.data.objective.phase);
                if (json.data.objective.next_turn.kind === "complete_artifact") onArtifactHandoff?.();
            } catch {
                // Roll the optimistic entry back rather than leave a resolved-looking exchange for
                // something the platform never accepted.
                if (optimistic) setSettled((prev) => prev.slice(0, -1));
                setNotice(PARTICIPANT_CLARIFICATION_MESSAGE);
            } finally {
                inFlight.current = false;
                setBusy(false);
                setInterpreting(false);
                setAwaitingTurn(false);
            }
        },
        [token, onArtifactHandoff, onPhaseChange, onValueSettled, objective],
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
        /**
         * The conversation is over. It ENDS — it does not scroll on into the document.
         *
         * The transcript stays above so the parent can see what was agreed, Alloy says what it did,
         * and the host renders [Review paperwork] beneath. The signature prompt is NOT spoken here:
         * it belongs beside the signature itself, at the end of the review.
         */
        return (
            <IntakeCard>
                <div className="flex flex-col gap-5" data-participant-settled="true">
                    {settled.map((entry, i) => (
                        <ThreadExchange
                            key={i}
                            exchange={entry}
                            depth={i === settled.length - 1 ? "recent" : "history"}
                        />
                    ))}
                    <ThreadTurn who="alloy" depth="current">
                        <ThreadSaid who="alloy" depth="current">
                            {participantQuestion(objective)}
                        </ThreadSaid>
                    </ThreadTurn>
                </div>
            </IntakeCard>
        );
    }

    const intro = participantIntro(objective);
    // Offered only where the authored Form permits it — never invented by the runtime.
    const skipLabel = optionalSkipLabel(objective);
    const affirmLabel = optionalAffirmLabel(objective);
    /**
     * An OPTIONAL question is asked as a question first.
     *
     * "Does Test Process have any allergies?" gets two answers, and only the affirmative one needs a
     * field. Presenting the text input up front turns a yes/no question into homework — and forces
     * the parent who has nothing to say to type something untrue.
     */
    const optionalUnanswered = affirmLabel != null && !elaborating;
    const progress = participantProgressDisplay(objective);

    /**
     * THE SHORTCUTS, DEMOTED.
     *
     * Convenience beside a conversation, not the conversation itself: at most two quiet pills, and
     * only where the platform genuinely has a shortcut to offer. Everything they do is also sayable
     * in the composer, so nothing is reachable only by pressing one.
     */
    const suggestions: SuggestedReply[] = [];
    /** Which authored control the pills stand for — see `SuggestedReplies`. */
    let suggestionKind: string | undefined;
    if (objective.pending_clarification && !correcting) {
        /**
         * A question is outstanding, so it owns the replies.
         *
         * "Yes" sends the word and nothing else — the server knows what it referred to. "No" opens
         * the authored control so the parent supplies the value themselves. Neither path lets the
         * browser name a value, and neither has persisted anything yet.
         */
        suggestionKind = "clarification";
        suggestions.push({
            label: "Yes, that's right",
            emphasis: true,
            onSelect: () => void submit({ text: "yes", settledAs: "Yes" }),
        });
        suggestions.push({ label: "No, let me change it", onSelect: () => setCorrecting(true) });
    } else if (control.kind === "choice_or_text" && !correcting) {
        suggestionKind = "confirm";
        suggestions.push({
            label: control.affirm,
            emphasis: true,
            onSelect: () => void submit({ text: "yes", settledAs: displayValue(turn.proposed_value) }),
        });
        suggestions.push({
            // Correcting is a UI transition, not a turn: it reveals the typed control the authored
            // Form uses. No round trip, and nothing is claimed to the platform.
            label: control.deny,
            onSelect: () => setCorrecting(true),
        });
    } else if (optionalUnanswered && skipLabel && affirmLabel) {
        suggestionKind = "optional";
        suggestions.push({
            label: skipLabel,
            emphasis: true,
            // Resolves the turn outright — no redundant Continue after a binary answer. The label IS
            // the answer. Writing null would leave the need unmet and the question would come back
            // forever; "No known allergies" is both true and what a specialist would write down.
            onSelect: () => void submit({ value: skipLabel, settledAs: skipLabel }),
        });
        suggestions.push({
            // Local: reveals the authored control for the parent who does have something to tell us.
            label: affirmLabel,
            onSelect: () => setElaborating(true),
        });
    } else if (control.kind === "boolean") {
        suggestionKind = "boolean";
        suggestions.push({ label: control.affirm, emphasis: true, onSelect: () => void submit({ value: true, settledAs: control.affirm }) });
        suggestions.push({ label: control.deny, onSelect: () => void submit({ value: false, settledAs: control.deny }) });
    } else if (control.kind === "options") {
        suggestionKind = "options";
        for (const option of control.options) {
            suggestions.push({ label: option, onSelect: () => void submit({ value: option, settledAs: option }) });
        }
    } else if (skipLabel && elaborating) {
        suggestions.push({ label: skipLabel, onSelect: () => void submit({ value: skipLabel, settledAs: skipLabel }) });
    }

    /**
     * The typed control, shown only when a keyboard answer alone would not do.
     *
     * A date is the reference case: the deterministic path has to work with the provider disabled,
     * so a date of birth gets a real date picker beside the composer rather than instructions about
     * how to phrase one.
     */
    const typed: ParticipantValueControl | null =
        control.kind === "choice_or_text"
            ? correcting
                ? control.correction
                : null
            : control.kind === "value" && !optionalUnanswered
              ? control
              : null;

    return (
        <ConversationViewport
            followSignal={`${settled.length}:${participantQuestion(objective)}:${clarification ?? ""}`}
            progress={progress ? <ConversationProgress label={progress.label} percent={progress.percent} /> : null}
            thread={
                <>
                    {/* Alloy's opening line, spoken once and then left in the transcript above. */}
                    {intro && settled.length === 0 ? (
                        // The opening line and the first question are both Alloy — one eyebrow.
                        <ThreadTurn who="alloy" depth="recent" showSpeaker={false}>
                            <ThreadSaid who="alloy" depth="recent">{intro}</ThreadSaid>
                        </ThreadTurn>
                    ) : null}

                    {settled.map((entry, i) => (
                        <ThreadExchange
                            key={i}
                            exchange={entry}
                            depth={
                                // The exchange in flight reads as the live one; otherwise the newest
                                // settled exchange stays legible and everything older recedes.
                                awaitingTurn && i === settled.length - 1
                                    ? "current"
                                    : i === settled.length - 1
                                      ? "recent"
                                      : "history"
                            }
                        />
                    ))}

                    {/* THE CURRENT QUESTION — the largest thing on the screen, and never rendered
                        while its own answer is still in flight above it. */}
                    {awaitingTurn ? null : (
                        <ThreadTurn who="alloy" depth="current">
                            <ThreadSaid who="alloy" depth="current">
                                {participantQuestionSegments(objective).map((segment, i) =>
                                    segment.emphasis ? (
                                        <strong key={i} className="font-semibold">{segment.text}</strong>
                                    ) : (
                                        <span key={i}>{segment.text}</span>
                                    ),
                                )}
                            </ThreadSaid>
                            {objective.pending_clarification ? (
                                /* THE PLATFORM'S OWN QUESTION — deterministic, not the provider's.
                                   It replaces nothing: the same turn and its controls stand
                                   beneath, and no value has been written while it is open. */
                                <span data-participant-needs-clarification="true">
                                    <ThreadSupporting tone="speaking">
                                        {objective.pending_clarification.question}
                                    </ThreadSupporting>
                                </span>
                            ) : null}
                            {clarification ? (
                                // The provider's bounded clarifying question, in Alloy's voice. The
                                // turn and its deterministic controls are UNCHANGED beneath it.
                                <span data-participant-clarification="true">
                                    <ThreadSupporting tone="speaking">{clarification}</ThreadSupporting>
                                </span>
                            ) : null}
                            {/* The ask-once promise, said the way a specialist would say it. A
                                parent should hear the reassurance, not the ratio. */}
                            {turn.resolves_occurrences > 1 ? (
                                <ThreadSupporting>
                                    I&rsquo;ll use it everywhere it&rsquo;s needed, so you only tell me once.
                                </ThreadSupporting>
                            ) : null}
                            {notice ? <ThreadSupporting>{notice}</ThreadSupporting> : null}
                        </ThreadTurn>
                    )}

                    {interpreting ? (
                        <ThreadTurn who="alloy" depth="current">
                            <ThinkingAffordance />
                        </ThreadTurn>
                    ) : null}
                </>
            }
            dock={
                <>
                    {/*
                      * THE LIVE REGION, always mounted.
                      *
                      * A screen reader announces changes to a region that already exists; one that
                      * appears with its own message is frequently missed. So the current question
                      * and any notice are announced from here, and the visual thread above stays
                      * free of duplicate assistive markup.
                      */}
                    <p className="sr-only" aria-live="polite" role="status">
                        {notice ?? clarification ?? participantQuestion(objective)}
                    </p>
                    {typed ? (
                        <TypedAnswer
                            control={typed}
                            busy={busy}
                            text={text}
                            setText={setText}
                            onSubmit={(value, shown) => void submit({ value, settledAs: shown })}
                        />
                    ) : null}
                    <SuggestedReplies replies={suggestions} busy={busy} controlKind={suggestionKind} />
                    <Composer
                        busy={busy}
                        placeholder="Message Alloy…"
                        focusSignal={participantQuestion(objective)}
                        onSend={(words) => void submit({ text: words, settledAs: words })}
                    />
                </>
            }
        />
    );
}

/** One settled exchange, rendered as the two turns it was. */
function ThreadExchange({ exchange, depth }: { exchange: Exchange; depth: ThreadDepth }): ReactNode {
    return (
        <>
            <ThreadTurn who="alloy" depth={depth}>
                <ThreadSaid who="alloy" depth={depth}>{exchange.said}</ThreadSaid>
            </ThreadTurn>
            <ThreadTurn who="parent" depth={depth}>
                <ThreadSaid who="parent" depth={depth}>{exchange.answered}</ThreadSaid>
            </ThreadTurn>
        </>
    );
}

/**
 * The typed control for one value — the SAME control whether the parent is supplying a missing fact
 * or correcting a known one.
 *
 * It sits in the dock ABOVE the composer, compact and captioned, so the conversation keeps its
 * shape while a date of birth still gets the browser's own date guardrails plus an explicit check.
 * Booleans and closed choices never reach here: those are suggested replies, which is what they are.
 */
function TypedAnswer({
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
    /** `shown` is what the thread displays — the value as a parent reads it. */
    onSubmit: (value: unknown, shown: string) => void;
}) {
    if (control.kind === "boolean" || control.kind === "options") return null;

    // A date must BE a date. The input type gives the picker and the browser's own validation; the
    // check refuses anything that reaches the handler anyway, so "31 February" cannot be sent.
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
        <div className="mb-2.5 flex flex-wrap items-end gap-2" data-participant-control={control.inputType}>
            <div className="flex min-w-[160px] flex-col gap-1">
                <label
                    className="text-[11px] font-semibold uppercase tracking-[0.1em] text-alloy-midnight/40"
                    htmlFor="enrollment-turn-value"
                >
                    {control.label}
                </label>
                {control.multiline ? (
                    <textarea
                        id="enrollment-turn-value"
                        value={text}
                        disabled={busy}
                        rows={2}
                        onChange={(e) => setText(e.target.value)}
                        className="min-h-[44px] rounded-xl border border-alloy-midnight/12 px-3 py-2 text-[16px] text-alloy-midnight outline-none focus:border-alloy-juniper/45"
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
                        className="min-h-[44px] rounded-xl border border-alloy-midnight/12 px-3 py-2 text-[16px] text-alloy-midnight outline-none focus:border-alloy-juniper/45"
                    />
                )}
            </div>
            <button
                type="button"
                disabled={busy || !ready}
                onClick={() => onSubmit(text.trim(), shown)}
                className="min-h-[44px] rounded-xl bg-alloy-midnight px-4 text-[14px] font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-alloy-juniper disabled:opacity-40"
            >
                Use this
            </button>
        </div>
    );
}
