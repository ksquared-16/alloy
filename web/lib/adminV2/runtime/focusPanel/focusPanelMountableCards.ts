/**
 * MOUNTABILITY REGISTRY — the adjacent contract to commit-critical CONTENT.
 *
 * `COMMIT_CRITICAL_CARD_SPECS` answers one question: is this card's first operational CONTENT
 * derivable from commit truth? A card that fetches its own data can never answer yes, so it stayed
 * reserved until Settlement — even when the answer already carried the identity it would have used to
 * ask. Bending `isKnowable` to mean "identity" would corrupt the contract that keeps `ready` honest,
 * so mountability is declared HERE instead, beside it rather than inside it.
 *
 * This registry answers the other question:
 *
 *   Does this card have enough canonical identity at commit to MOUNT and begin its own read?
 *
 * A card admitted here resolves to `self_loading`: the component mounts, its existing card-owned
 * request starts, and its content stays honestly pending. It is never counted ready — the runtime and
 * telemetry both test `=== "ready"` — so this buys earlier work without weakening any readiness claim.
 *
 * TWO LAWS THIS REGISTRY KEEPS, both learned from reverted attempts:
 *   CONTENT stays in the other registry. Nothing here may assert a card's content is knowable.
 *   PARTICIPATION is still required. A card that no composition places must not consume commit work,
 *   so entries are guarded against the CODE-OWNED COMPOSITION FAMILY — every grain, not the
 *   `opportunity` member alone — exactly as commit-critical specs are.
 */
import { buildSelfFetchingCardShell } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import { focusPanelCardCatalogLabel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardCatalog";
import type { FocusPanelCardKey, FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import {
    HOUSEHOLD_IDENTITY_TRUTH_KEYS,
    hasFinancialSubject,
} from "@/lib/adminV2/runtime/focusPanel/financialSubjectIdentity";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

export type MountableCardSpec = {
    key: FocusPanelCardKey;
    /**
     * The commit-truth keys this card's identity is read from — declared so the contract can be
     * tested GENERICALLY, without a fixture that names a card. A guard asserts the predicate agrees
     * with this list in both directions, so the declaration cannot drift from what actually decides.
     */
    identityTruthKeys: readonly string[];
    /** Is the identity this card needs to ADDRESS its own read present in commit truth? */
    identityKnowable: (context: OperationalContext) => boolean;
    /** The content-free shell it mounts as. Never fabricates content. */
    build: (context: OperationalContext) => FocusPanelCardModel;
};

/** The answer named the participant this surface is about — enough to address a card-owned read. */
export const PARTICIPANT_IDENTITY_TRUTH_KEYS = ["child.customer_member_id"] as const;

/**
 * IS THE PARTICIPANT KNOWN? — asked of both places the answer legitimately lives.
 *
 * This read only `child.customer_member_id` from truth, which is how a CHILD-grain answer names
 * its subject. A family-grain opportunity never carries that key, so on the canonical shape the
 * predicate was always false and Attendance and Health reserved until the drawer settled.
 *
 * Measured on deployed ad4f0f6d7, after the participant was transported to the browser: the
 * document had resolved the participant, the browser had it in `participantScope`, the producers
 * had already computed both cards' content — and both cells stayed reserved for a further ~3s,
 * because the predicate that decides mountability never consulted the scope. The transport was
 * correct and inert.
 *
 * The scope IS the authoritative answer to this question: it comes from the one OCM-backed
 * resolver, and it is null unless exactly one member was resolved. So the predicate consults it
 * directly rather than a `child.*` truth key being fabricated to satisfy it — that would put a
 * child-grain binding on a family-grain subject, which every other reader of that key would then
 * see.
 *
 * The truth-key path is KEPT, not replaced: a child-grain frame is told its subject directly and
 * has no scope to resolve. Either representation answers the same question; neither invents one.
 */
function hasParticipantIdentity(context: OperationalContext): boolean {
    const scoped = context.participantScope?.customerMemberId;
    if (typeof scoped === "string" && scoped.trim()) return true;
    return hasAnyTruthKey(context, PARTICIPANT_IDENTITY_TRUTH_KEYS);
}

/**
 * The answer named the ACCOUNT this surface bills against.
 *
 * Re-exported from the shared rule rather than re-listed here. Mounting, settlement and the card
 * itself must not be able to compute different answers to "does this subject have an account" —
 * that disagreement is what let Financials be refused at commit, placed at settlement, and then
 * render terminally beside siblings that had resolved the same family.
 */
export { HOUSEHOLD_IDENTITY_TRUTH_KEYS };

function hasHouseholdIdentity(context: OperationalContext): boolean {
    return hasFinancialSubject(context);
}

/** Present means a non-blank value. A key carrying `""` is an absent identity, not an empty one. */
function hasAnyTruthKey(context: OperationalContext, keys: readonly string[]): boolean {
    return keys.some((key) => {
        const value = context.truth[key];
        return value != null && String(value).trim() !== "";
    });
}


/** The subject's own id, as the commit-critical context states it (`truth.id`). */
export const SUBJECT_IDENTITY_TRUTH_KEYS = ["id"] as const;

/**
 * Billing Preview addresses an OPPORTUNITY, and it is the only thing it needs.
 *
 * `AssignmentTuitionCard` reads exactly `context.subject.type` and `context.subject.id`, then issues
 * its own authenticated `loadFinancialConfig(opportunityId)`. It consumes no children, entity,
 * shell, scheduling or activity output — so the drawer VM it currently waits for supplies it
 * nothing. Measured: its dependency on settlement is accidental, caused solely by its absence here.
 *
 * THE GRAIN NARROWING IS NOT OPTIONAL. The card resolves `opportunityId` only when the subject IS an
 * opportunity; on any other grain it holds null, never issues the request, and falls through to
 * "No assignment on this record to price." Admitting it there would mount a card that cannot load
 * and would state an authoritative-sounding empty as its first frame. That state exists today at
 * settlement; mounting earlier must not make it arrive sooner or last longer.
 *
 * A context with no subject at all is admitted: the registry guard exercises predicates against a
 * truth-only fixture by design, and the narrowing is a REFUSAL of a known-wrong grain, not a second
 * identity requirement.
 */
function hasOpportunitySubjectIdentity(context: OperationalContext): boolean {
    if (!hasAnyTruthKey(context, SUBJECT_IDENTITY_TRUTH_KEYS)) return false;
    const subjectType = (context as { subject?: { type?: unknown } }).subject?.type;
    return subjectType == null || subjectType === "opportunity";
}

export const MOUNTABLE_CARD_SPECS: readonly MountableCardSpec[] = [
    /*
     * Attendance reads a scoped child's day; the case record knows nothing about it, so its content is
     * not commit-knowable. Its IDENTITY is: `child.customer_member_id` is in the answer. Measured on
     * document entry, that identity exists at ~1150ms while the card's own request was not issued
     * until ~3428ms, and the request itself costs ~200-220ms.
     *
     * Health & Safety is the IDENTICAL shape and joins on the identical binding — it reads
     * `participantScope.customerMemberId` and nothing else. It was previously held out on the belief
     * that it "participates in no default composition"; that was the guard reading the `opportunity`
     * member of the composition family and reporting a platform answer. The child-with-family
     * composition places it deliberately, and the case composition omits it just as deliberately — a
     * panel covering several children has no single health subject. Both statements are true at once
     * now that participation is asked of the family rather than of one member.
     */
    {
        key: "attendance",
        identityTruthKeys: PARTICIPANT_IDENTITY_TRUTH_KEYS,
        identityKnowable: hasParticipantIdentity,
        build: () => buildSelfFetchingCardShell("attendance", focusPanelCardCatalogLabel("attendance")),
    },
    {
        key: "health_safety",
        identityTruthKeys: PARTICIPANT_IDENTITY_TRUTH_KEYS,
        identityKnowable: hasParticipantIdentity,
        build: () => buildSelfFetchingCardShell("health_safety", focusPanelCardCatalogLabel("health_safety")),
    },
    /*
     * Financials is the OTHER identity, and the reason this registry takes a predicate per card rather
     * than one shared flag: it addresses an ACCOUNT, not a participant. Its content is no more
     * commit-knowable than the two above — a balance is the ledger's answer — but the account is:
     * `customers.id` reaches the composer as `opportunities.customer_id`, a column the population
     * query already selects. Where it does not — a child participation with no family case — this
     * yields false and the card reserves exactly as before.
     */
    {
        key: "financials",
        identityTruthKeys: HOUSEHOLD_IDENTITY_TRUTH_KEYS,
        identityKnowable: hasHouseholdIdentity,
        build: () => buildSelfFetchingCardShell("financials", focusPanelCardCatalogLabel("financials")),
    },
    /*
     * Billing Preview — identity only, exactly like the three above. It mounts as its existing
     * self-fetching shell and its own request begins; the card stays honestly pending until that
     * request answers. Nothing about billing content is asserted here.
     */
    {
        key: "billing_preview",
        identityTruthKeys: SUBJECT_IDENTITY_TRUTH_KEYS,
        identityKnowable: hasOpportunitySubjectIdentity,
        build: () => buildSelfFetchingCardShell("billing_preview", focusPanelCardCatalogLabel("billing_preview")),
    },
];
