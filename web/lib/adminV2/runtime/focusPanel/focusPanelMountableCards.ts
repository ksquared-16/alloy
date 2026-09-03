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
 *   so entries are guarded against the default composition exactly as commit-critical specs are.
 */
import { buildSelfFetchingCardShell } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import type { FocusPanelCardKey, FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

export type MountableCardSpec = {
    key: FocusPanelCardKey;
    /** Is the identity this card needs to ADDRESS its own read present in commit truth? */
    identityKnowable: (context: OperationalContext) => boolean;
    /** The content-free shell it mounts as. Never fabricates content. */
    build: (context: OperationalContext) => FocusPanelCardModel;
};

/** The answer named the participant this surface is about — enough to address a card-owned read. */
function hasParticipantIdentity(context: OperationalContext): boolean {
    const id = context.truth["child.customer_member_id"];
    return typeof id === "string" && id.trim() !== "";
}

export const MOUNTABLE_CARD_SPECS: readonly MountableCardSpec[] = [
    /*
     * Attendance reads a scoped child's day; the case record knows nothing about it, so its content is
     * not commit-knowable. Its IDENTITY is: `child.customer_member_id` is in the answer. Measured on
     * document entry, that identity exists at ~1150ms while the card's own request was not issued
     * until ~3428ms, and the request itself costs ~200-220ms.
     *
     * Health & Safety is the identical shape and is deliberately ABSENT here: it participates in no
     * default composition, so admitting it would break the participation law — the same law that
     * refused `scheduling`. Placing it, or reconciling the default composition against the tenant doc
     * that clearly renders it, is a separate decision and is not smuggled in here.
     */
    {
        key: "attendance",
        identityKnowable: hasParticipantIdentity,
        build: () => buildSelfFetchingCardShell("attendance", "Attendance"),
    },
];
