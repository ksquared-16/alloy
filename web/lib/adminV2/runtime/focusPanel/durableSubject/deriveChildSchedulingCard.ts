/**
 * The `scheduling` card MODEL at child grain.
 *
 * This is a MODEL, not a card. The card is `SchedulingCard.tsx`, unchanged and shared with the case
 * panel: same renderer, same canonical assignment actions, same `context.truth._scheduling_projection`
 * contract. Nothing about assignments is decided here.
 *
 * ── IT SUPPLIES ONLY WHAT THE CARD ACTUALLY READS ──
 *
 * `SchedulingCard` composes its OWN insight from the child evidence — "1 child" / "3 children" /
 * "No children to assign" — and never reads `model.insight` or `model.secondaryInsight`. It reads
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

export function deriveChildSchedulingCard(): FocusPanelCardModel {
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
