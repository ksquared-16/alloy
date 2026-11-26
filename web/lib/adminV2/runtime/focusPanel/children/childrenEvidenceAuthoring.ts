/**
 * Children card — which evidence the builder may OFFER.
 *
 * ── WHY THIS FILE EXISTS ──
 *
 * The picker assembled the Children catalogue from the canonical provider
 * registry filtered by entity namespace (`child`, `inquiry_child`) and nothing
 * else. Namespace is not a contract: it says which entity a field belongs to,
 * never that THIS card can resolve it. So the builder offered 25 options of
 * which 10 were dead — household aggregates on a per-child card, canonical
 * enrollment refs whose only resolvers were their `child.*` aliases, and four
 * placeholders whose resolvers are `() => null`. An operator could author any of
 * them, publish, and get a permanently blank row.
 *
 * The gate below is derived, not another hand-kept list: a ref is offerable when
 * the Children card can actually resolve it (`childFieldRefHasResolver`), minus
 * the two things resolution cannot judge — wrong GRAIN, and DUPLICATES. Those
 * two are declared here with their reasons, because a bare exclusion list decays
 * into folklore.
 */

import {
    CHILD_UNBACKED_FIELD_REFS,
    childFieldRefHasResolver,
} from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceCompose";
import { childFieldRefOffersHealthLink } from "@/lib/adminV2/runtime/focusPanel/identity/identityFieldLinkContract";

/**
 * Refs a resolver cannot rule out but the Children card must not offer.
 *
 * Each entry keeps the reason beside the key so a later reader can disagree with
 * the judgement instead of guessing at it.
 */
const WITHHELD_FROM_CHILDREN_AUTHORING: Readonly<Record<string, string>> = {
    /* ── Wrong grain: household aggregates on a per-child card ── */
    "children.count":
        "Household aggregate. The Children card answers \"what is true for THIS child\"; a count "
        + "of the family's children is Household truth and belongs on the Household card.",
    "children.names":
        "Household aggregate — the roster of the family, not a field of one child.",
    "children.summary":
        "Household aggregate — a family-level line, not per-child evidence.",

    /* ── Duplicate: same value, same operator label, two refs ── */
    "child.notes_summary":
        "Resolves the same note as `inquiry_child.notes` and is labelled \"Notes\" too. Two "
        + "identical choices in one picker is a coin flip, not a decision.",
};

/** Why a ref is withheld from the Children picker, or null when it is offerable. PURE. */
export function childrenEvidenceWithholdReason(ref: string): string | null {
    const key = ref.trim();
    const declared = WITHHELD_FROM_CHILDREN_AUTHORING[key];
    if (declared) return declared;
    if (!childFieldRefHasResolver(key)) {
        return "No resolver on the Children card — the option would render blank at runtime.";
    }
    if (CHILD_UNBACKED_FIELD_REFS.has(key) && !childFieldRefOffersHealthLink(key)) {
        return "Registered as a provider with nothing behind it — its resolver can only answer null.";
    }
    return null;
}

/** True when the Children builder may offer this evidence ref. PURE. */
export function childrenEvidenceRefIsOfferable(ref: string): boolean {
    return childrenEvidenceWithholdReason(ref) === null;
}
