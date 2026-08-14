/**
 * DURABLE PERSON SUBJECT — the shape, and the one pure projection over it.
 *
 * Split from `composeDurablePersonSubject.ts` because that module is `server-only` (it reads the
 * database) while this is pure: the type is needed by the client-side producer and the projection is
 * needed by tests. Keeping them together would have forced either a server-only import into the
 * panel producer or a duplicate of the projection — and a duplicated projection is how two surfaces
 * end up disagreeing about what "is staff" means.
 */

import type { PersonEmploymentComposition } from "@/lib/employment/buildPersonEmploymentComposition";
import type { OperationalEmploymentSignal } from "@/lib/adminV2/runtime/operationalContext/types";

/** The composed durable Person subject — everything the panel producer needs, and nothing more. */
export type DurablePersonSubject = {
    personId: string;
    /** Operator-facing name. Never a bare id: an unnamed person is a data problem, not a title. */
    label: string;
    /** The person's composed record — the panel's `context.truth`. */
    truth: Record<string, unknown>;
    /**
     * Employment as the Focus Panel's signal shape, projected from the person-owned composition.
     * Null when the person has never held employment here — an ANSWER, distinct from "not composed".
     */
    employment: OperationalEmploymentSignal | null;
};

/**
 * Project the person's own composition into the panel's employment signal.
 *
 * The signal shape was designed for a CASE ("which of my linked contacts work here"), so a durable
 * person is the degenerate one-person case: `primary` and the single `people` entry are the subject.
 * That is not a workaround — the card asks "who, in what capacity, where", and on this surface the
 * answer set has exactly one member.
 *
 * Returns null — not an empty signal — when the person has never been employed. The card reads
 * `NULL_EMPLOYMENT_SIGNAL` for null and renders nothing, which is correct: an operator looking at a
 * parent should not see an Employment card asserting a relationship that does not exist.
 *
 * It decides no employment meaning. `is_staff`, `current` and `state_label` arrive already decided by
 * `lib/employment` and are carried through untouched.
 */
export function personEmploymentSignal(
    personId: string,
    label: string | null,
    composition: PersonEmploymentComposition | null,
): OperationalEmploymentSignal | null {
    if (!composition || composition.never_employed) return null;
    const person = { personId, personLabel: label, employment: composition };
    return { primary: person, people: [person], hasEmployment: composition.periods.length > 0 };
}
