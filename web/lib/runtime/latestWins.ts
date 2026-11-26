"use client";

/**
 * LATEST INTENT WINS — the shared ordering contract for asynchronous operator intent.
 *
 * The operator clicks A, then clicks B. Two loads are now in flight. Responses are NOT ordered: A can
 * resolve after B, and if it is allowed to write, the operator ends up looking at A while B is what
 * they asked for. Every surface in this runtime that loads on intent needs the same rule, and it was
 * being re-implemented inline as `const seq = ++ref.current; … if (seq !== ref.current) return;`.
 *
 * That inline form is correct but easy to get wrong in one specific way this codebase has already
 * paid for: **two independent loads sharing ONE counter**. Each load then invalidates the other, so a
 * ledger refresh cancels itself — the action succeeds, the toast is green, and the projection is
 * stale. A gate is therefore created PER LOAD, and `createLatestWinsGate` exists so that "one gate,
 * one load" is the obvious thing to write.
 *
 * Wall-clock plays no part: ordering is decided by issue order, so the rule is deterministically
 * testable and behaves identically on a fast host and a slow one.
 */

export type LatestWinsGate = {
    /** Open a ticket for a new intent. Every earlier ticket becomes stale immediately. */
    issue: () => number;
    /** True only for the most recently issued ticket. */
    isCurrent: (ticket: number) => boolean;
    /** Run `apply` only if this ticket is still the latest. Returns whether it ran. */
    commit: <T>(ticket: number, apply: (value: T) => void, value: T) => boolean;
};

export function createLatestWinsGate(): LatestWinsGate {
    let latest = 0;
    return {
        issue: () => ++latest,
        isCurrent: (ticket) => ticket === latest,
        commit: (ticket, apply, value) => {
            if (ticket !== latest) return false;
            apply(value);
            return true;
        },
    };
}

/**
 * Subject-keyed variant, for surfaces whose intent is "show me THIS record".
 *
 * Sequence numbers alone answer "is this the newest response". A subject gate answers the question
 * the operator actually cares about: "is this response about the record I am looking at". They differ
 * when a subject is re-selected — returning to A after B makes an in-flight A response legitimate
 * again, which a pure counter would discard.
 */
export type SubjectGate<S> = {
    /** Declare the subject now being attended. */
    attend: (subject: S) => void;
    /** The subject currently attended, or null before the first `attend`. */
    current: () => S | null;
    /** True only when `subject` is the attended one. */
    isCurrent: (subject: S) => boolean;
    /** Apply only if the response is about the attended subject. Returns whether it ran. */
    commit: <T>(subject: S, apply: (value: T) => void, value: T) => boolean;
};

export function createSubjectGate<S>(initial: S | null = null): SubjectGate<S> {
    let attended: S | null = initial;
    return {
        attend: (subject) => { attended = subject; },
        current: () => attended,
        isCurrent: (subject) => attended != null && subject === attended,
        commit: (subject, apply, value) => {
            if (attended == null || subject !== attended) return false;
            apply(value);
            return true;
        },
    };
}
