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
    participantUnreadableAnswerMessage,
    type ParticipantValueControl,
    PARTICIPANT_CLARIFICATION_MESSAGE,
} from "@/lib/enrollment/participantRuntime/participantTurnPresentation";
import {
    composeAddress,
    type AddressParts,
    type SemanticEditor,
} from "@/lib/enrollment/participantRuntime/semanticValueEditor";
import { IntakeCard, IntakeHeading } from "./ParentIntakeShell";
import { ParticipantUploads } from "./ParticipantUploads";
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


/**
 * One topic, with the questions it asks.
 *
 * A cluster is a conversation about a subject, not a card full of fields. So the topic is spoken
 * once, the question being answered right now is the prominent one, the questions already answered
 * recede beneath their own answers, and what is still to come is listed quietly so a parent can see
 * where the topic ends. Only the active question has an answer surface — the composer below — which
 * is what keeps "which question am I answering?" from ever being ambiguous.
 *
 * Deliberately NOT three inputs with three buttons. That is the shape this whole slice replaced.
 */
function ConversationTopic({
    cluster,
}: {
    cluster: NonNullable<ParticipantObjectiveWire["next_turn"]["cluster"]>;
}) {
    const settled = cluster.questions.filter((q) => q.state === "settled");
    const upcoming = cluster.questions.filter((q) => q.state === "upcoming");
    return (
        <div className="mb-3" data-participant-topic={cluster.title ?? "topic"}>
            {cluster.title ? (
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/40">
                    {cluster.title}
                </p>
            ) : null}
            {settled.length > 0 ? (
                <ul className="mb-2 space-y-1" data-participant-topic-settled={settled.length}>
                    {settled.map((q) => (
                        <li key={q.need_key} className="flex gap-2 text-[13px] leading-snug text-alloy-midnight/45">
                            <span aria-hidden className="text-alloy-bend-pine">✓</span>
                            <span>
                                {q.question}
                                {q.answer ? <span className="text-alloy-midnight/60"> — {q.answer}</span> : null}
                            </span>
                        </li>
                    ))}
                </ul>
            ) : null}
            {upcoming.length > 0 ? (
                <p className="text-[12px] leading-snug text-alloy-midnight/35" data-participant-topic-upcoming={upcoming.length}>
                    {upcoming.length === 1 ? "Then: " : `Then ${upcoming.length} more: `}
                    {upcoming.map((q) => q.question.replace(/\?$/, "")).join(" · ")}
                </p>
            ) : null}
        </div>
    );
}

/**
 * What a screen reader says about a grouped confirmation.
 *
 * The heading and every fact, in the order they are drawn, so the announcement carries the same
 * information as the card rather than a summary of it.
 */
function groupAnnouncement(
    group: NonNullable<ParticipantObjectiveWire["next_turn"]["confirmation_group"]>,
): string {
    const facts = group.facts
        .filter((f) => !f.in_headline)
        .map((f) => `${f.label}: ${f.value}`)
        .join(". ");
    return [group.title, group.headline, facts].filter(Boolean).join(" ");
}

/**
 * One semantic subject's known facts, confirmed together.
 *
 * ## Why this is a card and not three questions
 *
 * Alloy knows these things. Asking about them one at a time is technically ask-once and still reads
 * as a form: eight turns to establish that nothing has changed. Shown together they are what they
 * actually are — a summary a parent scans in a second and nods at.
 *
 * ## What "together" does NOT mean
 *
 * Every row is its own semantic need with its own canonical identity, and it is confirmed, stored,
 * validated and evidenced entirely on its own. `Make a change` exposes exactly that: the individual
 * values, each with its own control, each saved by itself. Two facts sharing a card is a courtesy to
 * the parent, never a merge — which is also why two PEOPLE never share one, however the source form
 * printed them.
 *
 * ## Absence is never displayed as knowledge
 *
 * Only facts the platform holds are here. A missing middle name is not a blank row on this card; it
 * is a question, asked afterwards, on its own.
 */
function ConfirmationGroupCard({
    group,
    changing,
    editingRef,
    busy,
    onEdit,
    onSave,
    onCancel,
}: {
    group: NonNullable<ParticipantObjectiveWire["next_turn"]["confirmation_group"]>;
    changing: boolean;
    editingRef: string | null;
    busy: boolean;
    onEdit: (ref: string) => void;
    onSave: (ref: string, value: unknown) => void;
    onCancel: () => void;
}) {
    // In the summary the identity facts ARE the heading; opening the values shows every one of them.
    const rows = changing ? group.facts : group.facts.filter((f) => !f.in_headline);
    return (
        <div
            className="mb-3 rounded-2xl border border-alloy-midnight/10 bg-alloy-midnight/[0.02] px-4 py-3"
            data-participant-confirmation-group={group.facts.length}
            data-participant-group-mode={changing ? "individual" : "summary"}
        >
            {group.headline && !changing ? (
                <p
                    className="mb-2 text-[15px] font-semibold leading-snug text-alloy-midnight"
                    data-participant-group-headline="true"
                >
                    {group.headline}
                </p>
            ) : null}
            <dl className="space-y-1.5">
                {rows.map((fact) => (
                    <div
                        key={fact.ref}
                        className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"
                        data-participant-fact={fact.ref}
                    >
                        <dt className="text-[12px] uppercase tracking-[0.08em] text-alloy-midnight/40">
                            {fact.label}
                        </dt>
                        {editingRef === fact.ref ? (
                            <dd className="w-full">
                                <StructuredFactEditor
                                    editor={fact.editor}
                                    label={fact.label}
                                    initial={fact.value}
                                    busy={busy}
                                    onSave={(value) => onSave(fact.ref, value)}
                                    onCancel={onCancel}
                                />
                            </dd>
                        ) : (
                            <dd className="flex items-baseline gap-3 text-[14px] text-alloy-midnight/80">
                                <span data-participant-fact-value={fact.ref}>{fact.value || "—"}</span>
                                {changing ? (
                                    <button
                                        type="button"
                                        onClick={() => onEdit(fact.ref)}
                                        disabled={busy}
                                        className="text-[12px] font-medium text-alloy-bend-pine underline underline-offset-2 disabled:opacity-50"
                                    >
                                        Change
                                    </button>
                                ) : null}
                            </dd>
                        )}
                    </div>
                ))}
            </dl>
        </div>
    );
}

/**
 * The editor for ONE semantic fact — street/city/state/ZIP, a date, an email, a choice.
 *
 * Chosen by the platform (`semanticValueEditor.ts`) and delivered on the wire, so the component
 * never reads a canonical key to decide what kind of thing it is showing. Used in three places —
 * the active card, the settled record, and Change on a standalone confirmation — because a parent
 * correcting their address should meet the same four boxes wherever they reached them from.
 */
function StructuredFactEditor({
    editor,
    label,
    initial,
    busy,
    onSave,
    onCancel,
}: {
    editor: SemanticEditor;
    label: string;
    /** The value being corrected, as the parent reads it — the editor opens on it, not on blank. */
    initial?: string;
    busy: boolean;
    onSave: (value: unknown) => void;
    onCancel: () => void;
}) {
    const [parts, setParts] = useState<AddressParts>(() =>
        editor.kind === "address" ? editor.parts : { street: "", city: "", state: "", postal: "" },
    );
    const [draft, setDraft] = useState<string>(() => {
        const shown = (initial ?? "").trim();
        if (editor.kind === "options") {
            // The current choice, so a parent changing something else does not have to re-find it.
            return editor.options.find((o) => o.toLowerCase() === shown.toLowerCase()) ?? editor.options[0] ?? "";
        }
        if (editor.kind === "value" && editor.inputType === "date") return isoDraft(shown);
        return shown;
    });

    const field = "w-full min-w-0 rounded-lg border border-alloy-midnight/20 bg-white px-2.5 py-1.5 text-[14px] text-alloy-midnight";
    const caption = "mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.1em] text-alloy-midnight/40";

    let body: ReactNode;
    let value: () => unknown;
    let ready = true;

    if (editor.kind === "address") {
        // FOUR BOXES OVER ONE CANONICAL VALUE. The parts are recomposed on save; no component of an
        // address ever becomes a fact of its own.
        value = () => composeAddress(parts);
        ready = parts.street.trim().length > 0 || parts.city.trim().length > 0;
        body = (
            <div className="grid w-full gap-2 sm:grid-cols-2" data-participant-address-editor="true">
                <label className="sm:col-span-2">
                    <span className={caption}>Street</span>
                    <input className={field} value={parts.street} aria-label="Street"
                        onChange={(e) => setParts((p) => ({ ...p, street: e.target.value }))} />
                </label>
                <label>
                    <span className={caption}>City</span>
                    <input className={field} value={parts.city} aria-label="City"
                        onChange={(e) => setParts((p) => ({ ...p, city: e.target.value }))} />
                </label>
                <label>
                    <span className={caption}>State</span>
                    <input className={field} value={parts.state} aria-label="State" maxLength={2}
                        onChange={(e) => setParts((p) => ({ ...p, state: e.target.value }))} />
                </label>
                <label>
                    <span className={caption}>ZIP</span>
                    <input className={field} value={parts.postal} aria-label="ZIP" inputMode="numeric"
                        onChange={(e) => setParts((p) => ({ ...p, postal: e.target.value }))} />
                </label>
            </div>
        );
    } else if (editor.kind === "options") {
        value = () => draft;
        body = (
            <select className={field} value={draft} aria-label={label} onChange={(e) => setDraft(e.target.value)}>
                {editor.options.map((option) => (
                    <option key={option} value={option}>{option}</option>
                ))}
            </select>
        );
    } else {
        value = () => draft;
        ready = draft.trim().length > 0;
        body = (
            <input
                className={field}
                type={editor.inputType}
                aria-label={label}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
            />
        );
    }

    return (
        <div className="flex w-full flex-col gap-2" data-participant-fact-editor={editor.kind}>
            {body}
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    disabled={busy || !ready}
                    onClick={() => onSave(value())}
                    className="rounded-lg bg-alloy-bend-pine px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
                >
                    Save
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={busy}
                    className="text-[13px] text-alloy-midnight/50 underline underline-offset-2 disabled:opacity-50"
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}

/**
 * What the parent has already settled — a semantic record, not a button transcript.
 *
 * The thread used to keep every exchange that produced a settled fact, so a grouped confirmation
 * was remembered as "Let's make sure I have Chidinma's details right." / "Yes, that's right" and
 * what was actually agreed to was gone. Worse, it lived in component state, so it was gone for good
 * on reload — which would make any Edit affordance here a promise the surface could not keep.
 *
 * This renders the platform's own projection of settled needs instead. It survives a reload, it
 * cannot drift from what is stored, and every row stays addressable: a conversation moving on is
 * not a reason for an answer to become immutable.
 */
const SETTLED_ROWS_VISIBLE = 4;

function SettledRecord({
    settled,
    busy,
    editingRef,
    justUpdated,
    onEdit,
    onCancel,
    onSave,
}: {
    settled: ParticipantObjectiveWire["settled"];
    busy: boolean;
    editingRef: string | null;
    justUpdated: ReadonlySet<string>;
    onEdit: (ref: string) => void;
    onCancel: () => void;
    onSave: (ref: string, value: unknown) => void;
}) {
    if (settled.length === 0) return null;
    return (
        <div className="flex flex-col gap-2" data-participant-settled-record={settled.length}>
            {settled.map((group) => (
                <SettledGroup
                    key={group.heading + (group.headline ?? "")}
                    group={group}
                    busy={busy}
                    editingRef={editingRef}
                    justUpdated={justUpdated}
                    onEdit={onEdit}
                    onCancel={onCancel}
                    onSave={onSave}
                />
            ))}
        </div>
    );
}

/**
 * What the parent told us in this session — collected, and never labelled Confirmed.
 *
 * These are settled and evidenced exactly like a confirmation, and they are not one: a parent who
 * has just described their child's sleep routine has verified nothing. Kept out of the confirmation
 * cards entirely, flat rather than grouped by subject, and folded by default — this is conversation
 * history that recedes, not a summary of what the platform holds about a person.
 */
const COLLECTED_ROWS_VISIBLE = 3;

function CollectedAnswers({
    collected,
    busy,
    editingRef,
    justUpdated,
    onEdit,
    onCancel,
    onSave,
}: {
    collected: ParticipantObjectiveWire["collected"];
    busy: boolean;
    editingRef: string | null;
    justUpdated: ReadonlySet<string>;
    onEdit: (ref: string) => void;
    onCancel: () => void;
    onSave: (ref: string, value: unknown) => void;
}) {
    const [open, setOpen] = useState(false);
    if (collected.length === 0) return null;
    const editingHere = collected.some((f) => f.ref === editingRef);
    const rows = open || editingHere ? collected : collected.slice(0, COLLECTED_ROWS_VISIBLE);
    const hidden = collected.length - rows.length;
    return (
        <section className="px-0.5" data-participant-collected={collected.length}>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-alloy-midnight/25">
                What you told us
            </p>
            <dl className="mt-1.5 space-y-1">
                {rows.map((fact) => (
                    <div key={fact.ref} className="flex flex-wrap items-baseline gap-x-2 gap-y-1" data-participant-collected-fact={fact.ref}>
                        <dt className="text-[12px] text-alloy-midnight/30">{fact.label}</dt>
                        <span aria-hidden className="text-alloy-midnight/15">·</span>
                        {editingRef === fact.ref ? (
                            <dd className="w-full">
                                <StructuredFactEditor
                                    editor={fact.editor}
                                    label={fact.label}
                                    initial={fact.value}
                                    busy={busy}
                                    onSave={(value) => onSave(fact.ref, value)}
                                    onCancel={onCancel}
                                />
                            </dd>
                        ) : (
                            <dd className="flex items-baseline gap-2 text-[13px] text-alloy-midnight/50">
                                <span data-participant-collected-value={fact.ref}>{fact.value || "—"}</span>
                                {justUpdated.has(fact.ref) ? (
                                    <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-alloy-bend-pine/70">
                                        Updated
                                    </span>
                                ) : null}
                                <button
                                    type="button"
                                    onClick={() => onEdit(fact.ref)}
                                    disabled={busy}
                                    className="text-[12px] text-alloy-midnight/35 underline underline-offset-2 hover:text-alloy-bend-pine disabled:opacity-50"
                                >
                                    Edit
                                </button>
                            </dd>
                        )}
                    </div>
                ))}
            </dl>
            {hidden > 0 ? (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="mt-1.5 text-[12px] text-alloy-midnight/35 underline underline-offset-2"
                >
                    Show {hidden} more
                </button>
            ) : null}
        </section>
    );
}

function SettledGroup({
    group,
    busy,
    editingRef,
    justUpdated,
    onEdit,
    onCancel,
    onSave,
}: {
    group: ParticipantObjectiveWire["settled"][number];
    busy: boolean;
    editingRef: string | null;
    justUpdated: ReadonlySet<string>;
    onEdit: (ref: string) => void;
    onCancel: () => void;
    onSave: (ref: string, value: unknown) => void;
}) {
    /*
     * Compact by default. A settled subject can accumulate a great many facts over a long
     * enrolment, and a history pane that grows without bound stops being a summary. The rows are
     * never DROPPED — the count says exactly how many are folded away, and opening is one tap.
     */
    const [open, setOpen] = useState(false);
    const editingHere = group.facts.some((f) => f.ref === editingRef);
    const rows = open || editingHere ? group.facts : group.facts.slice(0, SETTLED_ROWS_VISIBLE);
    const hidden = group.facts.length - rows.length;

    return (
        <section
            className="rounded-xl border border-alloy-midnight/8 bg-alloy-midnight/[0.015] px-3.5 py-2.5"
            data-participant-settled-group={group.heading}
        >
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-alloy-bend-pine/70">
                {group.heading}
            </p>
            {group.headline ? (
                <p className="mt-0.5 text-[13.5px] font-medium text-alloy-midnight/70" data-participant-settled-headline="true">
                    {group.headline}
                </p>
            ) : null}
            <dl className="mt-1.5 space-y-1">
                {rows.map((fact) => (
                    <div key={fact.ref} className="flex flex-wrap items-baseline gap-x-2 gap-y-1" data-participant-settled-fact={fact.ref}>
                        <dt className="text-[12px] text-alloy-midnight/35">{fact.label}</dt>
                        <span aria-hidden className="text-alloy-midnight/20">·</span>
                        {editingRef === fact.ref ? (
                            <dd className="w-full">
                                <StructuredFactEditor
                                    editor={fact.editor}
                                    label={fact.label}
                                    busy={busy}
                                    onSave={(value) => onSave(fact.ref, value)}
                                    onCancel={onCancel}
                                />
                            </dd>
                        ) : (
                            <dd className="flex items-baseline gap-2 text-[13px] text-alloy-midnight/60">
                                <span data-participant-settled-value={fact.ref}>{fact.value || "—"}</span>
                                {justUpdated.has(fact.ref) ? (
                                    <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-alloy-bend-pine/70">
                                        Updated
                                    </span>
                                ) : null}
                                <button
                                    type="button"
                                    onClick={() => onEdit(fact.ref)}
                                    disabled={busy}
                                    className="text-[12px] text-alloy-midnight/40 underline underline-offset-2 hover:text-alloy-bend-pine disabled:opacity-50"
                                >
                                    Edit
                                </button>
                            </dd>
                        )}
                    </div>
                ))}
            </dl>
            {hidden > 0 ? (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="mt-1.5 text-[12px] text-alloy-midnight/40 underline underline-offset-2"
                >
                    Show {hidden} more
                </button>
            ) : null}
            <p className="mt-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-alloy-midnight/25">
                Confirmed
            </p>
        </section>
    );
}

/**
 * A displayed date back into the `yyyy-mm-dd` a date input needs.
 *
 * The card shows "Apr 2, 2021" because that is what a parent reads; the control that edits it needs
 * the storage grain. Anything unparseable is handed over unchanged rather than guessed at.
 */
function isoDraft(shown: string): string {
    const parsed = new Date(`${shown} UTC`);
    if (Number.isNaN(parsed.getTime())) return shown;
    return parsed.toISOString().slice(0, 10);
}

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
    /**
     * The parent chose "Make a change" on a grouped confirmation, and which fact is open.
     *
     * Both are local: opening the individual values claims nothing to the platform and writes
     * nothing. Only saving one fact is a turn — and it is a turn about THAT fact alone.
     */
    const [changingGroup, setChangingGroup] = useState(false);
    const [editingRef, setEditingRef] = useState<string | null>(null);
    /**
     * Facts corrected in THIS sitting, so the record can say "Updated" beside them.
     *
     * Presentation, and deliberately local: the platform records that a value was confirmed, not
     * that it was once something else. Claiming a durable "updated" state would mean inventing an
     * edit history the session does not keep.
     */
    const [justUpdated, setJustUpdated] = useState<ReadonlySet<string>>(() => new Set());
    /** Documents attached in this sitting, by field id — the upload row's own done-state. */
    const [attachedEvidence, setAttachedEvidence] = useState<
        Record<string, { document_id: string; filename: string } | undefined>
    >({});

    /**
     * Re-read the objective after evidence lands.
     *
     * The platform decides whether the obligation is satisfied and what comes next — the surface
     * asks, exactly as it does after a turn. Attaching a file is not a claim that the requirement
     * is met; the recomputed objective is.
     */
    const refreshObjective = useCallback(async () => {
        try {
            const res = await fetch(`/api/public/forms/${encodeURIComponent(token)}/enrollment-objective`);
            const json = (await res.json()) as { ok: boolean; data?: ParticipantObjectiveWire };
            if (json.ok && json.data) {
                setObjective(json.data);
                onPhaseChange?.(json.data.phase);
                if (json.data.next_turn.kind === "complete_artifact") onArtifactHandoff?.();
            }
        } catch {
            // Left as it was; the parent can attach again or reload.
        }
    }, [token, onPhaseChange, onArtifactHandoff]);

    /** Send one document to the token-scoped route. The server derives everything about it. */
    const uploadEvidence = useCallback(
        async (fieldId: string, file: File) => {
            try {
                const buffer = new Uint8Array(await file.arrayBuffer());
                // Chunked, matching the review surface's own encoder: spreading a whole megabyte
                // into `String.fromCharCode` overflows the argument limit on real photographs.
                let binary = "";
                for (let i = 0; i < buffer.length; i += 8192) {
                    binary += String.fromCharCode(...buffer.subarray(i, i + 8192));
                }
                const res = await fetch(`/api/public/forms/${encodeURIComponent(token)}/enrollment-upload`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ field_id: fieldId, filename: file.name, file_base64: btoa(binary) }),
                });
                const json = (await res.json()) as {
                    ok?: boolean;
                    error?: string;
                    data?: { document_id?: string; filename?: string };
                };
                if (!json.ok || !json.data?.document_id) {
                    return { error: json.error ?? "That file could not be attached." };
                }
                return { document_id: json.data.document_id, filename: json.data.filename ?? file.name };
            } catch {
                return { error: "That file could not be attached." };
            }
        },
        [token],
    );
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
        async (payload: {
            text?: string;
            value?: unknown;
            settledAs?: string;
            decline?: boolean;
            /** Settle every confirmation on the current card — as N independent confirmations. */
            confirmGroup?: boolean;
            /** Correct ONE fact of the card. `ref` is the opaque handle the server issued. */
            editFact?: { ref: string; value: unknown };
        }) => {
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
            /*
             * What the thread records as having been ASKED.
             *
             * A grouped confirmation asked one thing — "let's make sure I have Solene's details
             * right" — so the transcript must say that, not the single-need sentence the runtime
             * would have used had it asked them one at a time.
             */
            const groupCard = objective.next_turn.confirmation_group ?? null;
            const asked =
                groupCard && (payload.confirmGroup || payload.editFact)
                    ? groupCard.title
                    : participantQuestion(objective);
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
            /*
             * CORRECTING ONE FACT LEAVES THE PARENT WHERE THEY WERE.
             *
             * A parent who chose "Make a change" and fixed the birthday is still looking at the
             * card, very possibly to fix something else. Collapsing back to the summary after each
             * save made them re-open the values every time. Only the OPEN EDITOR closes here; the
             * mode itself ends when the turn moves on, which the objective decides.
             */
            if (!payload.editFact) setChangingGroup(false);
            setEditingRef(null);
            setText("");
            try {
                const res = await fetch(
                    `/api/public/forms/${encodeURIComponent(token)}/enrollment-turn`,
                    {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        /*
                         * WORDS ONLY. No identifier of any kind — the server owns every one of
                         * those and reads them from the session's current turn.
                         *
                         * `settledAs` stays behind deliberately: it is the thread's own echo of what
                         * the parent chose, and a shortcut's label must never travel as an answer.
                         */
                        body: JSON.stringify({
                            ...(payload.text !== undefined ? { text: payload.text } : {}),
                            ...(payload.value !== undefined ? { value: payload.value } : {}),
                            ...(payload.decline ? { decline: true } : {}),
                            ...(payload.confirmGroup ? { confirm_group: true } : {}),
                            ...(payload.editFact ? { edit_fact: payload.editFact } : {}),
                        }),
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
                if (payload.editFact) {
                    const ref = payload.editFact.ref;
                    setJustUpdated((prev) => new Set([...prev, ref]));
                }

                // `refused` and `no_change` both mean the platform did not accept the answer. The
                // participant is told plainly and the controls stay — never an internal code.
                if (json.data.outcome === "refused" || json.data.outcome === "no_change") {
                    if (optimistic) setSettled((prev) => prev.slice(0, -1));
                    // The provider's own clarifying question beats the generic ask-again — same
                    // voice, same turn, no new authority.
                    if (json.data.clarification) {
                        setClarification(json.data.clarification);
                    } else {
                        /*
                         * NOT A DEAD END.
                         *
                         * "Sorry — I didn't catch that" was the whole answer, so a parent who said
                         * "it's Bend" had no way forward but to retype an address they had not
                         * meant to change. Where the fact has a structured editor the runtime says
                         * what it CAN do and opens it. Nothing about what may be interpreted moves.
                         */
                        setNotice(participantUnreadableAnswerMessage(json.data.objective));
                        if (json.data.objective.next_turn.editor) setCorrecting(true);
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
    /**
     * The grouped confirmation for this turn, when the subject has more than one known fact.
     *
     * Composed entirely by the server from canonical identity. The component decides nothing about
     * membership — it could not, and that is the point: a surface that grouped by what looked
     * related would be inventing a relationship the packet never evidenced.
     */
    const group = turn.confirmation_group ?? null;

    if (control.kind === "done") {
        return (
            <IntakeCard>
                <IntakeHeading title="Everything we need is complete." subtitle="Thank you." />
            </IntakeCard>
        );
    }

    if (control.kind === "evidence") {
        /*
         * REQUIRED DOCUMENTS, BEFORE THE PAPERWORK IS PREPARED.
         *
         * The conversation does not hand off yet and no artifact is shown — the phase is still
         * collection, so the host keeps the packet Form deferred and [Review paperwork] is not
         * reachable. Attaching a document creates canonical evidence; it does not tell Alloy what
         * the document says, and nothing here fills a vaccine grid.
         */
        return (
            <IntakeCard>
                <div className="flex flex-col gap-5">
                    <SettledRecord
                        settled={objective.settled}
                        busy={busy}
                        editingRef={editingRef}
                        justUpdated={justUpdated}
                        onEdit={setEditingRef}
                        onCancel={() => setEditingRef(null)}
                        onSave={(ref, value) =>
                            void submit({ editFact: { ref, value }, settledAs: displayValue(value) })
                        }
                    />
                    <ThreadTurn who="alloy" depth="current">
                        <ThreadSaid who="alloy" depth="current">{participantQuestion(objective)}</ThreadSaid>
                    </ThreadTurn>
                    <div data-participant-evidence-turn={turn.evidence.length}>
                        <ParticipantUploads
                            requests={turn.evidence.map((e) => ({
                                field_id: e.field_id,
                                title: e.title,
                                description: e.description,
                                required: true,
                                docType: "",
                            }))}
                            attached={attachedEvidence}
                            onAttached={(fieldId, doc) => {
                                setAttachedEvidence((prev) => ({ ...prev, [fieldId]: doc }));
                                void refreshObjective();
                            }}
                            onUpload={uploadEvidence}
                        />
                    </div>
                </div>
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
                    <SettledRecord
                        settled={objective.settled}
                        busy={busy}
                        editingRef={editingRef}
                        justUpdated={justUpdated}
                        onEdit={setEditingRef}
                        onCancel={() => setEditingRef(null)}
                        onSave={(ref, value) =>
                            void submit({ editFact: { ref, value }, settledAs: displayValue(value) })
                        }
                    />
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
    } else if (group && !correcting) {
        /*
         * ONE gesture for the whole card — and, in change mode, a way back to it.
         *
         * "Make a change" is a local transition: it reveals the individual semantic values and
         * claims nothing to the platform. Only saving one of them is a turn, and it is a turn about
         * that one fact.
         */
        suggestionKind = "confirm_group";
        if (changingGroup) {
            suggestions.push({
                label: "That's everything",
                emphasis: true,
                onSelect: () => void submit({ confirmGroup: true, settledAs: "Yes, that's right" }),
            });
            suggestions.push({ label: "Back", onSelect: () => { setChangingGroup(false); setEditingRef(null); } });
        } else {
            suggestions.push({
                label: "Yes, that's right",
                emphasis: true,
                onSelect: () => void submit({ confirmGroup: true, settledAs: "Yes, that's right" }),
            });
            suggestions.push({ label: "Make a change", onSelect: () => setChangingGroup(true) });
        }
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
    } else if (control.kind === "options") {
        /*
         * THE CHOICES COME FIRST, INCLUDING WHEN THE QUESTION IS OPTIONAL.
         *
         * The optional branch used to be tested ahead of this one, so a question with a closed
         * option set and `optional: true` offered "Nothing to add" and "Yes — I'll tell you" and
         * never its own choices. A parent asked "How would you describe Mateo's gender?" — a
         * question the school authored with three answers — had to volunteer to tell us, and was
         * then handed a text box for a closed set. Optionality is about whether an answer is
         * REQUIRED, never about whether the answers are shown.
         */
        suggestionKind = "options";
        for (const option of control.options) {
            suggestions.push({ label: option, onSelect: () => void submit({ value: option, settledAs: option }) });
        }
        // Leaving it blank stays available, beside the choices rather than instead of them.
        if (optionalUnanswered && skipLabel) {
            suggestions.push({ label: skipLabel, onSelect: () => void submit({ decline: true, settledAs: skipLabel }) });
        }
    } else if (optionalUnanswered && skipLabel && affirmLabel) {
        suggestionKind = "optional";
        suggestions.push({
            label: skipLabel,
            emphasis: true,
            /*
             * Resolves the turn outright — and records SETTLEMENT, not the button's own words.
             *
             * The label describes what the parent did; it is not their answer. Sending it as a value
             * is what printed "Middle name: Nothing to add" on a signed Oregon health form. The
             * thread still echoes the label, because that is what the parent chose.
             */
            onSelect: () => void submit({ decline: true, settledAs: skipLabel }),
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
    } else if (skipLabel && elaborating) {
        suggestions.push({ label: skipLabel, onSelect: () => void submit({ decline: true, settledAs: skipLabel }) });
    }

    /**
     * The typed control — shown ONLY where a keyboard answer alone genuinely would not do.
     *
     * A date is the reference case: the deterministic path has to work with the provider disabled,
     * so a date of birth gets a real date picker rather than instructions about how to phrase one.
     *
     * ORDINARY TEXT NO LONGER GETS ONE. The parent used to face three ways to answer the same
     * question at once — a generic text box with a "Use this" button, quiet reply pills, and a
     * composer saying "Message Alloy…" — and had to work out which of them Alloy was listening to.
     * There is one conversation: for text, the composer IS the answer surface, and a second text box
     * above it was never a control, only a competing paradigm.
     */
    const typedCandidate: ParticipantValueControl | null =
        control.kind === "choice_or_text"
            ? correcting
                ? control.correction
                : null
            : control.kind === "value" && !optionalUnanswered
              ? control
              : null;
    /** Input types whose answer a keyboard alone cannot supply well: a picker earns its place. */
    const NEEDS_ITS_OWN_CONTROL = new Set(["date", "number"]);
    const typed: ParticipantValueControl | null =
        // The structured editor above OWNS the correction once Change has been pressed. Rendering
        // the dock's typed control beside it would put two answer surfaces on one question.
        correcting && turn.editor
            ? null
            : typedCandidate && typedCandidate.kind === "value" && NEEDS_ITS_OWN_CONTROL.has(typedCandidate.inputType)
              ? typedCandidate
              : null;

    return (
        <ConversationViewport
            followSignal={`${settled.length}:${objective.settled.length}:${participantQuestion(objective)}:${clarification ?? ""}:${changingGroup ? "individual" : "summary"}:${editingRef ?? ""}`}
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

                    {/*
                      * HISTORY IS A SEMANTIC RECORD, NOT A BUTTON TRANSCRIPT.
                      *
                      * What a parent wants to see above the current question is what they have
                      * settled — the values — not the sequence of taps that settled them. The
                      * mechanical exchanges are still shown, but only the one in flight: it is the
                      * acknowledgement that their answer was received, and it stops being useful the
                      * moment the record below it reflects the answer.
                      */}
                    <SettledRecord
                        settled={objective.settled}
                        busy={busy}
                        editingRef={editingRef}
                        justUpdated={justUpdated}
                        onEdit={setEditingRef}
                        onCancel={() => setEditingRef(null)}
                        onSave={(ref, value) =>
                            void submit({ editFact: { ref, value }, settledAs: displayValue(value) })
                        }
                    />
                    <CollectedAnswers
                        collected={objective.collected}
                        busy={busy}
                        editingRef={editingRef}
                        justUpdated={justUpdated}
                        onEdit={setEditingRef}
                        onCancel={() => setEditingRef(null)}
                        onSave={(ref, value) =>
                            void submit({ editFact: { ref, value }, settledAs: displayValue(value) })
                        }
                    />
                    {settled.slice(-1).map((entry, i) => (
                        <ThreadExchange key={`live-${i}`} exchange={entry} depth={awaitingTurn ? "current" : "recent"} />
                    ))}

                    {/* THE CURRENT QUESTION — the largest thing on the screen, and never rendered
                        while its own answer is still in flight above it. */}
                    {awaitingTurn ? null : (
                        <ThreadTurn who="alloy" depth="current">
                            {objective.next_turn.cluster ? (
                                <ConversationTopic cluster={objective.next_turn.cluster} />
                            ) : null}
                            {group ? (
                                /* THE GROUPED CONFIRMATION. Alloy says one sentence about the
                                   subject and shows what it holds; the single-need question is
                                   deliberately not also rendered, or the parent would be asked the
                                   same thing twice in two shapes. */
                                <>
                                    <ThreadSaid who="alloy" depth="current">{group.title}</ThreadSaid>
                                    <ConfirmationGroupCard
                                        group={group}
                                        changing={changingGroup}
                                        editingRef={editingRef}
                                        busy={busy}
                                        onEdit={setEditingRef}
                                        onCancel={() => setEditingRef(null)}
                                        onSave={(ref, value) =>
                                            void submit({
                                                editFact: { ref, value },
                                                /*
                                                 * What the THREAD echoes is what the parent would
                                                 * say, not what the column stores. `2021-04-03` is
                                                 * a database string; the parent corrected a
                                                 * birthday to Apr 3, 2021.
                                                 */
                                                settledAs: displayValue(value),
                                            })
                                        }
                                    />
                                </>
                            ) : (
                                <>
                                    <ThreadSaid who="alloy" depth="current">
                                        {participantQuestionSegments(objective).map((segment, i) =>
                                            segment.emphasis ? (
                                                <strong key={i} className="font-semibold">{segment.text}</strong>
                                            ) : (
                                                <span key={i}>{segment.text}</span>
                                            ),
                                        )}
                                    </ThreadSaid>
                                    {correcting && turn.editor ? (
                                        /*
                                         * CHANGE OPENS AN EDITOR, NOT A WAITING COMPOSER.
                                         *
                                         * Pressing Change used to reveal the authored control, and
                                         * for a plain text field the surface renders no second text
                                         * box — so the parent had just said "let me correct this"
                                         * and was handed a prompt saying "Message Alloy…". For a
                                         * whole address it was worse: the only way to fix a city was
                                         * to retype the street and ZIP from memory.
                                         *
                                         * The composer stays available beneath for anyone who would
                                         * rather say it in words; this is the deterministic path.
                                         */
                                        <div className="mt-3">
                                            <StructuredFactEditor
                                                editor={turn.editor}
                                                label={turn.label ?? "Your answer"}
                                                initial={displayValue(turn.proposed_value)}
                                                busy={busy}
                                                onSave={(value) =>
                                                    void submit({ value, settledAs: displayValue(value) })
                                                }
                                                onCancel={() => setCorrecting(false)}
                                            />
                                        </div>
                                    ) : null}
                                </>
                            )}
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
                            {turn.resolves_occurrences > 1 && !group ? (
                                <ThreadSupporting>
                                    I&rsquo;ll use it everywhere it&rsquo;s needed, so you only tell me once.
                                </ThreadSupporting>
                            ) : null}
                            {group && !changingGroup ? (
                                <ThreadSupporting>
                                    I&rsquo;ll use these everywhere they&rsquo;re needed, so you only tell me once.
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
                        {/*
                          * The announcement must describe the interaction ON SCREEN.
                          *
                          * With a grouped confirmation showing, `participantQuestion` returns the
                          * single-need sentence the runtime would have asked — "I have Chidinma's
                          * last name as Okonkwo. Is that still right?" — so a parent using a screen
                          * reader was told about one fact while the card in front of them held four.
                          */}
                        {notice ?? clarification ?? (group ? groupAnnouncement(group) : participantQuestion(objective))}
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
                        placeholder={typed ? "Or tell me in your own words…" : "Type your answer…"}
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
                className="min-h-[44px] rounded-xl bg-alloy-bend-pine px-4 text-[14px] font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-alloy-bend-pine disabled:opacity-40"
            >
                Done
            </button>
        </div>
    );
}
