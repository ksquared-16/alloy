/**
 * Answer a participant's question from the objective the runtime already resolved.
 *
 * ## Grounded, and deterministic where it counts
 *
 * The parent asks; the platform answers from state it already holds — remaining requirements, what
 * is known, the current need, the packet's own steps. Nothing here reads configuration, invents a
 * requirement, or names a Business Process stage: a hand-launched packet has none, and saying
 * otherwise would be the fiction this thread has been removing everywhere else.
 *
 * A provider may later phrase these better. It may not decide them — the counts and the "what is
 * left" come from the same objective that drives the UI, so the answer and the screen cannot
 * disagree.
 *
 * ## Why the fallback is a real answer and not an apology
 *
 * A parent who asks something unanticipated gets the same summary they would have got from "what do
 * I still need to do" — which is almost always what they wanted, and is never wrong.
 *
 * Pure. No I/O.
 */

import type { ParticipantEnrollmentObjective } from "@/lib/enrollment/participantRuntime/resolveParticipantEnrollmentObjective";

export type ParticipantQuestionAnswer = {
    /** What the parent is told. Plain sentences, no ids, no internal vocabulary. */
    readonly text: string;
    /** Which shape of question this was read as — for tests and telemetry, never shown. */
    readonly topic:
        | "remaining"
        | "known"
        | "why_needed"
        | "signatures"
        | "finished"
        | "current"
        | "general";
};

const RE = {
    remaining: /\b(what|anything)\b.*\b(left|remain|still|to do|need to do|next)\b|\bwhat'?s next\b/i,
    known: /\b(already have|already know|what do you (have|know)|on file|information you have)\b/i,
    why: /\bwhy\b|\bwhat for\b|\bdo you need\b|\bwhat does this mean\b/i,
    signed: /\bsign(ed|ature)?\b/i,
    done: /\b(am i (done|finished)|is that (it|all)|are we done|finished\?)\b/i,
    current: /\b(this|current) (question|field|one)\b|\bwhat is this\b/i,
};

function sentenceList(items: readonly string[]): string {
    if (items.length === 0) return "";
    if (items.length === 1) return items[0];
    return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** How many artifacts remain, said the way a parent counts them. */
function remainingSentence(objective: ParticipantEnrollmentObjective): string {
    const total = objective.progress?.total_requirements ?? 0;
    const satisfied = objective.progress?.satisfied_requirements ?? 0;
    const remaining = Math.max(0, total - satisfied);
    if (total === 0) return "There is nothing outstanding right now.";
    if (remaining === 0) return "Everything is complete — there is nothing left for you to do.";
    const forms = remaining === 1 ? "form" : "forms";
    return `You have ${remaining} of ${total} ${forms} left to complete.`;
}

/**
 * The one thing being asked for right now, in the words the parent is seeing.
 *
 * Read from the need's first OCCURRENCE — the authored control's own label — which is the same
 * string the turn puts on screen. Deriving it anywhere else would let the answer and the question
 * drift apart.
 */
function currentAsk(objective: ParticipantEnrollmentObjective): string | null {
    const label = (objective.next_turn?.need?.occurrences?.[0]?.label ?? "").trim();
    return label || null;
}

export function answerParticipantQuestion(input: {
    readonly question: string;
    readonly objective: ParticipantEnrollmentObjective;
    /** Facts already on file, by their operator-facing label. */
    readonly knownLabels?: readonly string[];
    readonly subjectDisplayName?: string | null;
}): ParticipantQuestionAnswer {
    const q = (input.question ?? "").trim();
    const objective = input.objective;
    const child = (input.subjectDisplayName ?? "").trim();
    const ask = currentAsk(objective);
    const remaining = remainingSentence(objective);

    if (RE.done.test(q)) {
        const done = (objective.progress?.satisfied_requirements ?? 0) >= (objective.progress?.total_requirements ?? 0);
        return {
            topic: "finished",
            text: done
                ? "Yes — everything is complete. You can close this window."
                : `Not quite. ${remaining}${ask ? ` Right now I need ${ask}.` : ""}`,
        };
    }

    if (RE.signed.test(q)) {
        return {
            topic: "signatures",
            text: `${remaining} Each form asks you to review it and sign at the end, so anything still outstanding has not been signed yet.`,
        };
    }

    if (RE.known.test(q)) {
        /*
         * When the objective can name the facts it holds, name them. When it cannot, say something
         * TRUE instead of something convenient: an earlier draft claimed "I do not have anything on
         * file" to a parent whose child's name and date of birth were already prefilled on screen,
         * because the needs list at that moment happened to be empty. A confident wrong answer
         * about what a school holds is worse than a modest right one.
         */
        const known = input.knownLabels ?? [];
        if (known.length > 0) {
            return {
                topic: "known",
                text: `I already have ${sentenceList([...known].slice(0, 6))}${known.length > 6 ? ", and a few more details" : ""}. I will only ask for what is missing.`,
            };
        }
        return {
            topic: "known",
            text: `Anything already filled in below is what we have on file for ${child || "your child"} — I will only ask you for what is missing.`,
        };
    }

    if (RE.why.test(q)) {
        return {
            topic: "why_needed",
            text: ask
                ? `${ask} is one of the details this paperwork asks for, so the school has it on file. If you do not have it to hand you can leave it and come back.`
                : "These are the details the school's paperwork asks for. If you do not have something to hand you can come back to it.",
        };
    }

    if (RE.current.test(q) && ask) {
        return { topic: "current", text: `Right now I am asking for ${ask}.` };
    }

    if (RE.remaining.test(q)) {
        return {
            topic: "remaining",
            text: `${remaining}${ask ? ` Right now I need ${ask}.` : ""}`,
        };
    }

    return {
        topic: "general",
        text: `${remaining}${ask ? ` Right now I need ${ask}.` : ""}`,
    };
}
