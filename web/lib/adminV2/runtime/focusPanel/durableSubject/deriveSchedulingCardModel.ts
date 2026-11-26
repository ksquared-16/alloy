/**
 * The `scheduling` card MODEL on a durable host — for ANY subject the card admits.
 *
 * This is a MODEL, not a card. The card is `SchedulingCard.tsx`, shared with the case panel: same
 * renderer, same canonical assignment actions, same `context.truth._scheduling_projection` contract.
 * Nothing about assignments is decided here.
 *
 * ── IT TAKES NO SUBJECT, AND THAT IS THE POINT ──
 *
 * Nothing in this model varies by subject: title, icon, archetype and tier come from the platform
 * helpers keyed by CARD, and the insight is composed by the card from its own evidence. A child-grain
 * and a person-grain Assignments card are the same model because they are the same card. If this
 * function ever needed a subject parameter, that would be the signal that the two hosts had begun
 * drifting into two assignment experiences.
 *
 * ── IT SUPPLIES ONLY WHAT THE CARD ACTUALLY READS ──
 *
 * `SchedulingCard` composes its OWN insight from its subject evidence — "1 child" / "3 children" /
 * "Staff assignments" — and never reads `model.insight` or `model.secondaryInsight`. It reads
 * `title`, `iconName`, `tier`, `archetype`, `statusChip` and `statusTone`.
 *
 * A first version of this module computed a careful child-grain insight ("2 assignments",
 * "1 proposed") and the browser showed the card's own text instead. That phrasing was never wrong —
 * it was UNREAD, which is worse than wrong, because the next person to change assignment phrasing
 * would have edited it and seen nothing happen. So it is gone rather than left in place, and the
 * reason is recorded here.
 *
 * Presentation is not invented either: `cardTitle`, `system5ArchetypeForCard` and
 * `system5IconForCard` are the same platform helpers the case derivation uses, keyed by card. The
 * Assignments card must look like itself on both surfaces.
 */

import { cardTitle } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardRegistry";
import { system5ArchetypeForCard } from "@/lib/adminV2/runtime/focusPanel/system5CardArchetypes";
import { system5IconForCard } from "@/lib/adminV2/runtime/focusPanel/system5OperationalSurfaceSpec";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

export function deriveSchedulingCardModel(): FocusPanelCardModel {
    return {
        key: "scheduling",
        archetype: system5ArchetypeForCard("scheduling"),
        iconName: system5IconForCard("scheduling"),
        title: cardTitle("scheduling") ?? "Assignments",
        // Read by the card only when no child is active, and it composes that itself. Present because
        // the model contract requires it; deliberately not a second opinion about the same sentence.
        insight: "",
        tier: "reference",
        span: 2,
        density: "compact",
        statusChip: null,
        statusTone: "neutral",
        // The card owns its actions — create / edit / set primary / archive / promote / delete all
        // execute inside it through the canonical RegisteredActions. A card-level primary action here
        // would be a seventh way to start the same work.
        primaryAction: null,
        // Always visible. A child with no assignments is precisely the child an operator opens this
        // card to fix; hiding it would remove the only surface that can create one.
        visible: true,
    };
}
