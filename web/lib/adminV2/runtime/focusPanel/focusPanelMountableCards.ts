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

function hasParticipantIdentity(context: OperationalContext): boolean {
    return hasAnyTruthKey(context, PARTICIPANT_IDENTITY_TRUTH_KEYS);
}

/**
 * The answer named the ACCOUNT this surface bills against.
 *
 * Read through the same key preference an account-scoped card already uses, so the identity this
 * registry admits on is the identity the card will address its request with. Admitting on one key
 * and reading another is how a card mounts and then sits still.
 */
export const HOUSEHOLD_IDENTITY_TRUTH_KEYS = [
    "customer.id",
    "household.id",
    "child.family_customer_id",
    "customer_id",
] as const;

function hasHouseholdIdentity(context: OperationalContext): boolean {
    return hasAnyTruthKey(context, HOUSEHOLD_IDENTITY_TRUTH_KEYS);
}

/** Present means a non-blank value. A key carrying `""` is an absent identity, not an empty one. */
function hasAnyTruthKey(context: OperationalContext, keys: readonly string[]): boolean {
    return keys.some((key) => {
        const value = context.truth[key];
        return value != null && String(value).trim() !== "";
    });
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
];
