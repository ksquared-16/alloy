/**
 * Participant Runtime productization — the conversation as a finished product.
 *
 * Five properties, each of which was a defect in manual QA:
 *
 *   1. progress is the PARTICIPANT's, not the requirement rollup's
 *   2. a parent-visible date follows Alloy's date doctrine, never a database string
 *   3. a participant-visible label is not the authoring tool's casing
 *   4. the surface is a THREAD with an anchored composer, not a stack of buttons
 *   5. none of the above moved any authority
 *
 * The pure layers are tested directly. The component is asserted by source inspection for the
 * structural properties that must hold however it is styled — the same narrow technique the V1.2
 * surface controls already use, and for the same reason: "the composer cannot leave the dock" is a
 * claim about the code, not about one rendered interaction.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import {
    displayValue,
    isIsoDateString,
    naturalFieldLabel,
    participantControlLabel,
    participantProgressDisplay,
    participantQuestionSegments,
    valueControlForTurn,
} from "@/lib/enrollment/participantRuntime/participantTurnPresentation";
import { projectParticipantWorkProgress } from "@/lib/enrollment/participantRuntime/participantWorkProgress";
import type { ParticipantObjectiveWire } from "@/lib/enrollment/participantRuntime/participantObjectiveWireModel";
import type { EnrollmentInformationNeed } from "@/lib/enrollment/informationNeeds/enrollmentInformationNeedsTypes";

const source = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
/** Comments removed: a doc comment explaining a boundary is not a crossing of it. */
const stripComments = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const CARD = stripComments(source("app/forms/embed/[token]/EnrollmentConversationCard.tsx"));
const THREAD = stripComments(source("app/forms/embed/[token]/ParticipantThread.tsx"));
const COMPOSER = stripComments(source("app/forms/embed/[token]/ParticipantComposer.tsx"));

function need(overrides: Partial<EnrollmentInformationNeed> = {}): EnrollmentInformationNeed {
    return {
        identity: { key: "k", shared_value_key: "k", canonical_key: null, scope: "child", subject_id: null, artifact_specific: false } as never,
        scope: "child" as never,
        subject_id: null,
        state: "known_requires_confirmation",
        occurrence_count: 1,
        occurrences: [],
        requirement_ids: [],
        has_value: true,
        current_value: "x",
        value_source: "session_shared_value",
        requires_participant_action: true,
        ...overrides,
    } as EnrollmentInformationNeed;
}

function wire(overrides: Partial<ParticipantObjectiveWire> = {}): ParticipantObjectiveWire {
    return {
        stage_key: "enrollment",
        subject_display_name: "Ava",
        phase: "shared_collection",
        progress: { total: 9, satisfied: 1, remaining: 8 },
        things_remaining: 2,
        work: { total: 5, settled: 3, remaining: 2, percent: 60 },
        next_turn: {
            kind: "confirm_known_value",
            prompt: "We have Child Dob as 2025-08-19. Is that correct?",
            proposed_value: "2025-08-19",
            resolves_occurrences: 5,
            input_type: "date",
            label: "Child Dob",
            options: [],
            optional: false,
            field_ids: [],
            // next_turn requires these three. editor and party are
            // nullable and evidence is a list, so the empty shape is
            // exact rather than a placeholder.
            editor: null,
            party: null,
            evidence: [],
        },
        // No question outstanding — the ordinary case.
        // ParticipantObjectiveWire requires both. They are lists, so empty is
        // the exact shape for a fixture with no settled or collected facts.
        settled: [],
        collected: [],
        pending_clarification: null,
        complete: false,
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// 1. Progress is the participant's own work
// ---------------------------------------------------------------------------

describe("participant progress", () => {
    it("counts unique semantic facts, so a document's fifteen destinations are ONE unit", () => {
        // The ask-once dedupe upstream is exactly what makes this denominator safe: the need is one
        // row however many controls resolve to it. `occurrence_count` must never reach the number.
        const progress = projectParticipantWorkProgress({
            needs: [need({ occurrence_count: 15, requires_participant_action: false }), need()],
            phase: "shared_collection",
        });
        expect(progress.total).toBe(2);
        expect(progress.settled).toBe(1);
    });

    it("does not count an optional unanswered fact as blocking", () => {
        const progress = projectParticipantWorkProgress({
            needs: [
                need({ state: "missing", optional: true, requires_participant_action: false, has_value: false }),
                need({ state: "confirmed", requires_participant_action: false }),
            ],
            phase: "shared_collection",
        });
        expect(progress.remaining).toBe(0);
    });

    it("counts the paperwork as ONE unit, not one per signature", () => {
        const progress = projectParticipantWorkProgress({
            needs: [
                need({ state: "artifact_specific", requires_participant_action: false }),
                need({ state: "artifact_specific", requires_participant_action: false }),
                need({ state: "confirmed", requires_participant_action: false }),
            ],
            phase: "artifact_review",
        });
        // One semantic fact (settled) + one paperwork unit (outstanding).
        expect(progress.total).toBe(2);
        expect(progress.remaining).toBe(1);
    });

    it("never reads 100% while anything remains, and reads 100% when nothing does", () => {
        const nearly = projectParticipantWorkProgress({
            needs: [...Array.from({ length: 200 }, () => need({ requires_participant_action: false })), need()],
            phase: "shared_collection",
        });
        expect(nearly.percent).toBe(99);

        const done = projectParticipantWorkProgress({
            needs: [need({ state: "artifact_specific", requires_participant_action: false }), need({ requires_participant_action: false })],
            phase: "complete",
        });
        expect(done.percent).toBe(100);
    });

    it("is shown over the participant denominator, never the requirement rollup", () => {
        // The requirement totals below are deliberately inconsistent with the work totals. The
        // displayed percentage must follow `work` — `progress` legitimately contains unrealized and
        // unsupported requirements, and a parent cannot see why it moved.
        const display = participantProgressDisplay(
            wire({ progress: { total: 9, satisfied: 1, remaining: 8 }, work: { total: 4, settled: 3, remaining: 1, percent: 75 } }),
        );
        expect(display?.percent).toBe(75);
    });

    it("says nothing at all when there is no honest number", () => {
        expect(participantProgressDisplay(wire({ work: { total: 0, settled: 0, remaining: 0, percent: 0 } }))).toBeNull();
    });

    it("orients rather than gamifies", () => {
        const label = participantProgressDisplay(wire({ things_remaining: 1 }))?.label ?? "";
        expect(label).toBe("One more thing");
        for (const banned of ["Step", "of 3", "streak", "Great job", "!"]) {
            expect(label).not.toContain(banned);
        }
    });
});

// ---------------------------------------------------------------------------
// 2. Date doctrine
// ---------------------------------------------------------------------------

describe("dates follow the platform doctrine", () => {
    it("uses the platform display formatter, not a Participant Runtime one", () => {
        // `formatDisplayDate` — the module the typography doctrine names. A second formatter here is
        // the defect, however good its output looks.
        const presentation = source("lib/enrollment/participantRuntime/participantTurnPresentation.ts");
        expect(presentation).toContain('from "@/lib/presentation/presentationDateFormat"');
        expect(presentation).toContain("formatDisplayDate");
        expect(presentation).not.toContain("toLocaleDateString");
    });

    it("renders a stored date the way every other Alloy surface renders it", () => {
        expect(displayValue("2025-08-19")).toBe("Aug 19, 2025");
        expect(displayValue("2022-05-15")).toBe("May 15, 2022");
    });

    it("never lets a database string reach the participant", () => {
        expect(isIsoDateString("2025-08-19")).toBe(true);
        expect(isIsoDateString("2025-08-19T00:00:00Z")).toBe(true);
        expect(isIsoDateString("Aug 19, 2025")).toBe(false);
        // The one path a raw date can take into participant copy is the confirm question.
        const asked = participantQuestionSegments(wire()).map((s) => s.text).join("");
        expect(isIsoDateString(asked)).toBe(false);
        expect(asked).not.toContain("2025-08-19");
        expect(asked).toContain("Aug 19, 2025");
    });

    it("does not shift a date-only value across a timezone", () => {
        // A birthday is a date, not an instant. Formatting it in local time is how a child born on
        // the 19th shows up as the 18th for a parent west of UTC.
        expect(displayValue("2025-01-01")).toBe("Jan 1, 2025");
        expect(displayValue("2025-12-31")).toBe("Dec 31, 2025");
    });

    it("makes the value the scannable part of the sentence", () => {
        const segments = participantQuestionSegments(wire());
        const emphasised = segments.filter((s) => s.emphasis).map((s) => s.text);
        expect(emphasised).toEqual(["Aug 19, 2025"]);
        // Not the whole sentence — that would be a heading, not a hierarchy.
        expect(segments.some((s) => !s.emphasis && s.text.trim().length > 0)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// 3. Participant-visible labels
// ---------------------------------------------------------------------------

describe("labels are participant-facing, not authoring casing", () => {
    it("uses the authored label when an operator wrote one", () => {
        // Authored participant-facing text wins. The platform must not "improve" what a centre
        // deliberately wrote for its own parents.
        expect(naturalFieldLabel("Emergency contact name")).toBe("Emergency contact name");
    });

    it("falls back to the platform's own display-label behaviour for a raw key", () => {
        // `humanizeOperatorSlug` is the existing owner of "never show raw keys in primary UI". The
        // spoken form is then lower-cased because it appears mid-sentence — "What is Ava's
        // emergency contact name?" — while the CONTROL caption keeps sentence case.
        expect(naturalFieldLabel("emergency_contact_name")).toBe("emergency contact name");
        expect(participantControlLabel("emergency_contact_name")).toBe("Emergency contact name");
        expect(participantControlLabel("child_dob")).toBe("Date of birth");
        // The underscore itself must never survive to a parent.
        expect(naturalFieldLabel("emergency_contact_name")).not.toContain("_");
    });

    it("captions a control in sentence case, never a column heading", () => {
        expect(participantControlLabel("Child Dob")).toBe("Date of birth");
        expect(participantControlLabel("Allergies")).toBe("Allergies");
        expect(participantControlLabel(null)).toBe("Your answer");
        expect(valueControlForTurn(wire().next_turn).label).toBe("Date of birth");
    });

    it("changes presentation only — the canonical key is untouched", () => {
        const presentation = source("lib/enrollment/participantRuntime/participantTurnPresentation.ts");
        // Nothing here writes; it formats. A label helper that mutated identity would be the bug.
        expect(presentation).not.toContain("shared_value_key =");
        expect(presentation).not.toContain("canonical_key =");
    });
});

// ---------------------------------------------------------------------------
// 4. The surface is a conversation
// ---------------------------------------------------------------------------

describe("the participant surface is a thread with an anchored composer", () => {
    it("gives the conversation its own viewport, so the composer is always at the bottom of it", () => {
        expect(CARD).toContain("ConversationViewport");
        expect(THREAD).toContain("overflow-y-auto");
        // The dock is a sibling of the scroll region, not inside it: it cannot scroll away.
        expect(THREAD).toMatch(/data-participant-thread[\s\S]*shrink-0[\s\S]*\{dock\}/);
    });

    it("follows the newest exchange only when the parent is already at the bottom", () => {
        expect(THREAD).toContain("atBottomRef.current");
        expect(THREAD).toMatch(/if \(!node \|\| !atBottomRef\.current\) return;/);
        // And offers a way back rather than silently stranding them.
        expect(THREAD).toContain("Jump to latest");
    });

    it("sizes itself from the visual viewport, so a mobile keyboard cannot cover the question", () => {
        expect(THREAD).toContain("visualViewport");
        expect(THREAD).toContain("--participant-conversation-height");
    });

    it("gives settled history a lighter treatment than the current turn", () => {
        /*
         * The depths remain; what carries settled history no longer does.
         *
         * History used to be a growing transcript of exchanges, receding through three depths. It is
         * now a SEMANTIC RECORD — the values themselves — so "lighter than the current turn" is a
         * property of that record, and the third depth has nothing left to render.
         */
        expect(THREAD).toContain('depth === "current"');
        expect(THREAD).toContain('depth === "recent"');
        expect(CARD).toContain("data-participant-settled-record");
        // Settled values are smaller and lower-contrast than the current question, which alone is
        // full-strength midnight.
        expect(CARD).toMatch(/text-\[13px\] text-alloy-midnight\/60[\s\S]{0,200}?data-participant-settled-value/);
        expect(THREAD).toMatch(/depth === "current"[\s\S]{0,200}?text-alloy-midnight\b/);
    });

    it("does not spend headline weight on the active question", () => {
        /*
         * The active question was 18/19px semi-bold, so every ordinary question read as a page title
         * and the answer, the record and the controls all read as footnotes to it. Hierarchy comes
         * from placement, spacing, the Bend Pine eyebrow and contrast instead.
         */
        const current = THREAD.match(/depth === "current"\s*\?\s*"([^"]+)"/g) ?? [];
        const alloyCurrent = current.find((c) => c.includes("text-alloy-midnight"));
        expect(alloyCurrent, "the current Alloy line is styled").toBeTruthy();
        expect(alloyCurrent).not.toMatch(/text-\[1[789]px\]|text-\[2\dpx\]/);
        expect(alloyCurrent).not.toContain("font-semibold");
        expect(alloyCurrent).not.toContain("font-bold");
    });

    it("has one persistent composer, with Enter to send and Shift+Enter for a newline", () => {
        /**
         * The composer is the answer surface, and now says so.
         *
         * "Message Alloy…" described a chat box sitting beside a text field and a "Use this" button,
         * which left the parent to guess which one Alloy was listening to. With the competing field
         * gone, the placeholder names what it is for — and says "or" only when a real control (a
         * date picker) is genuinely offered alongside it.
         */
        expect(CARD).toContain("Type your answer…");
        expect(CARD).toContain("Or tell me in your own words…");
        expect(COMPOSER).toMatch(/e\.key === "Enter" && !e\.shiftKey/);
        expect(COMPOSER).toContain("textarea");
        // Never the old form-input caption.
        expect(CARD).not.toContain("Or just reply here");
    });

    it("does not change the dock's geometry while a reply is in flight", () => {
        // A send button that disappears under the parent's thumb reads as a bug. It changes colour.
        expect(COMPOSER).toContain("h-9 w-9 shrink-0");
        expect(COMPOSER).not.toContain("Saving");
    });

    it("keeps typed text at 16px, so iOS does not zoom the page on focus", () => {
        expect(COMPOSER).toContain("text-[16px]");
        expect(CARD).toContain("text-[16px]");
    });

    it("demotes the shortcuts to suggested replies beneath the conversation", () => {
        expect(COMPOSER).toContain("SuggestedReplies");
        expect(COMPOSER).toContain("Suggested replies");
        // Pills, not a wall of filled primary buttons.
        expect(COMPOSER).toContain("rounded-full");
    });

    it("shows a thinking affordance only for words, never for a deterministic shortcut", () => {
        expect(CARD).toMatch(/const isFreeText = typeof payload\.text === "string" && payload\.text !== "yes";/);
        expect(CARD).toContain("if (isFreeText) setInterpreting(true)");
        expect(COMPOSER).toContain("ThinkingAffordance");
    });

    it("acknowledges the answer locally before the request finishes", () => {
        // The parent's own words land in the thread on the same tick as the click.
        expect(CARD).toMatch(/setSettled\(\(prev\) => \[\.\.\.prev, \{ said: asked, answered: optimistic \}\]\)/);
        expect(CARD).toContain("setAwaitingTurn(true)");
        // And are removed again if the platform refused, so optimism cannot outlive the truth.
        expect(CARD).toContain("setSettled((prev) => prev.slice(0, -1))");
    });

    it("never renders a question and its own in-flight answer at the same time", () => {
        expect(CARD).toContain("{awaitingTurn ? null : (");
    });

    it("keeps document review a separate mode, not more thread", () => {
        // The conversation ENDS at the handoff; the host owns [Review paperwork].
        expect(CARD).toContain('control.kind === "handoff"');
        expect(CARD).not.toContain("SignatureCaptureDialog");
        expect(CARD).not.toContain("CompiledArtifactReview");
    });
});

// ---------------------------------------------------------------------------
// 5. Accessibility and motion
// ---------------------------------------------------------------------------

describe("the conversation is operable without a mouse", () => {
    it("announces the current question from a region that is always mounted", () => {
        expect(CARD).toContain('aria-live="polite"');
        expect(CARD).toContain('role="status"');
    });

    it("labels the composer and the suggested replies for a screen reader", () => {
        expect(COMPOSER).toContain('aria-label="Send"');
        expect(COMPOSER).toContain("sr-only");
        expect(COMPOSER).toContain('aria-label="Suggested replies"');
    });

    it("shows focus, and respects a reduced-motion preference", () => {
        expect(COMPOSER).toContain("focus-visible:outline");
        expect(THREAD).toContain("motion-reduce:");
        expect(COMPOSER).toContain("motion-reduce:animate-none");
    });

    it("gives the progress rail a real progressbar role", () => {
        expect(THREAD).toContain('role="progressbar"');
        expect(THREAD).toContain("aria-valuenow");
    });
});

// ---------------------------------------------------------------------------
// 6. Gate 0 — no authority moved
// ---------------------------------------------------------------------------

describe("presentation changed; authority did not", () => {
    it("the browser still sends words, a value, or a bare intent — and nothing else", () => {
        /*
         * `decline` joined `text` and `value` when leaving a question blank stopped being a value.
         *
         * It is admitted here deliberately and on one condition: it is a BARE FLAG. It names no
         * field, no need, no target and no words — the server decides whether the current turn may
         * be declined at all. That is the same authority boundary `text` and `value` sit behind,
         * which is why widening the vocabulary does not widen what the browser can claim.
         */
        const bodyKeys = [...CARD.matchAll(/submit\(\{\s*([a-zA-Z_]+)/g)].map((m) => m[1]);
        expect(new Set(bodyKeys)).toEqual(
            new Set(["text", "value", "decline", "confirmGroup", "editFact", "party"]),
        );
        /*
         * `confirmGroup` is admitted on exactly the terms `decline` was: a BARE literal flag. It
         * says "the parent agreed to the card"; WHICH facts the card held is re-derived server-side
         * from the objective, so a stale or edited tab can only ever settle what the platform is
         * currently showing.
         */
        const groupColons = (CARD.match(/\bconfirm_group:/g) ?? []).length;
        const groupTrue = (CARD.match(/\bconfirm_group: true\b/g) ?? []).length;
        expect(groupColons).toBeGreaterThan(0);
        expect(groupTrue).toBe(groupColons);
        // The flag is sent as a literal true, never as a key, an id or a label. Counted rather
        // than matched with a lookahead, which backtracks past the space and passes vacuously.
        const declineColons = (CARD.match(/\bdecline:/g) ?? []).length;
        const declineTrue = (CARD.match(/\bdecline: true\b/g) ?? []).length;
        expect(declineColons).toBeGreaterThan(0);
        expect(declineTrue).toBe(declineColons);
    });

    it("no new participant surface names an internal identifier", () => {
        for (const file of [CARD, THREAD, COMPOSER]) {
            for (const forbidden of [
                "field_key",
                "requirement_id",
                "semantic_key",
                "stage_key",
                "process_instance_id",
                "session_id",
            ]) {
                expect(file).not.toContain(forbidden);
            }
        }
    });

    it("the thread and composer are presentation only — neither can reach the network", () => {
        for (const file of [THREAD, COMPOSER]) {
            expect(file).not.toContain("fetch(");
            expect(file).not.toContain("/api/");
        }
    });
});
