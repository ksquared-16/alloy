/**
 * THE resolved values of one participant artifact. One authority, several consumers.
 *
 * ## Why this had to be extracted
 *
 * The assembly lived inside `renderParticipantEnrollmentDocument`, so only the renderer could see
 * its result. The review LIST beside the document therefore compiled from the draft form payload —
 * an earlier, thinner view of the same artifact — and the two disagreed in the one place it matters
 * most: the document correctly showed "Guardian: Sylvie Bergeron" while the list beside it showed
 * that destination blank, because canonical party projection happens during resolution and the
 * draft payload has never heard of it.
 *
 * A parent reading a filled document next to a summary that says the field is empty has been given
 * two answers to one question. So there is now one resolver, and every surface that describes an
 * artifact reads its output:
 *
 * ```
 *   draft values                    the artifact's own current state, and it WINS
 *     -> shared-value prefill       what the conversation settled, filling only what is absent
 *     -> derived stamps             execution dates, never over a recorded value
 *     -> canonical party projection AUTHORITATIVE for party-owned destinations
 *          = resolved values  ->  document renderer
 *                             ->  review list
 * ```
 *
 * ## The order is the contract
 *
 * The draft wins over prefill because a correction the parent just made at review must not be
 * overwritten by the conversation's older answer — that defect was real and invisible, the worst of
 * the three outcomes. Party projection goes last and CLEARS its destinations first, because no
 * earlier step can know that six destinations declaring one canonical key belong to six different
 * people. Nothing here is renderer-specific; the renderer branch happens after this returns.
 *
 * Pure. No I/O — every input is resolved by the caller.
 */

import { resolveFormDerivedValues } from "@/lib/forms/derived/resolveFormDerivedValues";
import type { FormSchemaV1 } from "@/lib/forms/schema";
import {
    applyPartyArtifactValues,
    projectPartyArtifactValues,
} from "@/lib/enrollment/participantRuntime/projectPartyArtifactValues";
import type { ChildParty } from "@/lib/enrollment/participantRuntime/childPartyRuntime";

export type ResolveArtifactValuesInput = {
    readonly schema: FormSchemaV1;
    /** The artifact's own draft payload values. Highest precedence. */
    readonly draftValues: Readonly<Record<string, unknown>>;
    /** Shared/process-scoped answers already mapped to this artifact's field ids. */
    readonly prefilled: Readonly<Record<string, unknown>>;
    /** Canonical people around this child, for party-owned destinations. */
    readonly parties: readonly ChildParty[];
    readonly nowIso: string;
    readonly timeZone?: string;
    readonly signatures?: Readonly<Record<string, unknown>> | null;
};

export type ResolvedArtifactValues = {
    readonly values: Readonly<Record<string, unknown>>;
    /** Destinations owned by a canonical party — filled from people, or deliberately blank. */
    readonly partyOwnedFieldIds: ReadonlySet<string>;
    /** Canonical parties an artifact had no room to print. Retained, never dropped. */
    readonly unplacedParties: readonly { readonly role: string; readonly party_id: string }[];
};

export function resolveArtifactValues(input: ResolveArtifactValuesInput): ResolvedArtifactValues {
    const values: Record<string, unknown> = { ...input.draftValues };

    // Prefill fills what the artifact does not have; where it holds a value, that value is the
    // answer, because it is the one the parent last gave.
    for (const [fieldId, value] of Object.entries(input.prefilled)) {
        const held = values[fieldId];
        const alreadyAnswered = typeof held === "string" ? held.trim().length > 0 : held != null;
        if (!alreadyAnswered) values[fieldId] = value;
    }

    /*
     * Derived destinations are filled at resolution — but never OVER a value already recorded.
     * Before submission today's date is the honest preview; after it, the submitted payload holds
     * the day the family actually signed, and recomputing would restamp a completed document.
     */
    const derived = resolveFormDerivedValues(input.schema, values, {
        executedAtIso: input.nowIso,
        timeZone: input.timeZone ?? "UTC",
        signatures: (input.signatures ?? null) as Record<string, unknown> | null,
    });
    for (const [fieldId, value] of Object.entries(derived)) {
        const held = values[fieldId];
        if (typeof held === "string" && held.trim()) continue;
        values[fieldId] = value;
    }

    // Party destinations are authoritative and go last: cleared, then filled from the canonical
    // graph, so a stale draft or shared value can never survive on someone's box.
    const partyFill = projectPartyArtifactValues(input.schema, input.parties, []);
    return {
        values: applyPartyArtifactValues(values, partyFill),
        partyOwnedFieldIds: partyFill.ownedFieldIds,
        unplacedParties: partyFill.unplaced,
    };
}
