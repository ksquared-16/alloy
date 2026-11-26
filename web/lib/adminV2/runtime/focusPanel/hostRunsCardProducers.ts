import type { FocusPanelOperationalProjection } from "@/lib/adminV2/runtime/focusPanel/focusPanelOperationalProjectionContract";

/**
 * ── DOES THIS HOST RUN THE FOCUS PANEL CARD PRODUCERS AT ALL? ─────────────────────────────────
 *
 * A self-fetching card has to know whether anybody is going to hand it a produced answer. Asking
 * "did the host supply an operational projection?" is the wrong question, and asking it is what
 * left the Focus Panel's Financials card pulsing forever.
 *
 * Measured on deployed staging, four mounts out of four: the card mounted, sat at
 * `data-financials-empty="loading"`, and issued ZERO requests for the whole observation, while
 * Enrollment, Household and Children hydrated beside it. The host's projection was present and
 * non-null and read exactly:
 *
 *     { businessProcess, currentWork }
 *
 * — no `cards` key. `projectFocusPanelOperational` composes those two fields and nothing else, so
 * on that path the key is absent BY CONSTRUCTION, not transiently. The `cards` key appears only
 * when a caller states producer results through `firstOrderProducerCardsOwned`, which is the RSC
 * provisioning-answer path. Whichever path hydrated a given mount decided whether Financials ever
 * read its own account — which is the whole of the intermittency.
 *
 * So the question is answered at the right GRAIN: not "is there a projection" but "does this
 * projection carry producer results". The three states are genuinely different:
 *
 *   · no projection at all        → no pipeline here; bootstrap yourself (the workspace host)
 *   · projection WITHOUT `cards`  → no producers run on this path, ever; bootstrap yourself
 *   · projection WITH `cards`     → producers run here; wait for yours rather than racing them
 *
 * The key's PRESENCE is the discriminator, not its value. `firstOrderProducerCardsOwned` writes
 * `cards` whenever a caller states them — including as `null`, which honestly means "the producers
 * belong to this path and have not answered yet". A composer that never runs them omits the key
 * entirely. That distinction survives JSON, which is where this is read.
 */
export function hostRunsCardProducers(
    projection: FocusPanelOperationalProjection | null | undefined,
): boolean {
    if (projection == null) return false;
    return Object.prototype.hasOwnProperty.call(projection, "cards");
}
