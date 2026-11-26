/**
 * Focus Panel card CAPABILITY AVAILABILITY — separate from readiness, participation, and business meaning.
 *
 * Some cards answer a business question only when an authoritative PROVIDER is wired (registered adapters
 * that settle facts onto the operational truth). Until such a provider exists, the capability is
 * **provider-unavailable**: the card is excluded from production participation. It is NOT a readiness state
 * (`unresolved`) — a provider-unavailable card cannot advance to `unresolved`/`provisional`/`settled` through
 * loading or enrichment; it becomes available only when product implementation registers a provider.
 *
 * Platform law (Card Readiness capture §4b): the runtime must never substitute an unresolved/unavailable
 * runtime state with a business conclusion. A provider-unavailable card therefore renders NOTHING to
 * operators (no "not yet available", no "No X yet") — it simply does not occupy a production slot. The
 * scaffold/blueprint is retained and remains discoverable in dev/diagnostics; the card participates
 * AUTOMATICALLY once a valid provider is registered.
 *
 * See `docs/runtime/CARD-READINESS-LIFECYCLE.md`.
 */

import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

/**
 * Cards that require an authoritative fact provider to answer their business question, mapped to the
 * set of registered providers for that capability. A card is available iff ≥1 provider is registered.
 * Cards absent from this map do not require a provider (they compose from the operational context that
 * the runtime always resolves) and are therefore always capability-available.
 */
const CARD_CAPABILITY_PROVIDERS: Partial<Record<FocusPanelCardKey, readonly string[]>> = {
    // Milestones summarizes meaningful completed/committed operational FACTS, produced by registered
    // adapters (process outcomes, tours, forms, agreements, placements, schedules, billing setup,
    // documents) settling `MilestoneFact`s onto `truth.milestones`. No adapter is registered yet →
    // the registry is empty → provider-unavailable. Wiring an adapter here makes it participate again.
    milestones: [],
};

/** Does this card require an authoritative fact provider to answer its business question? */
export function cardRequiresProvider(key: FocusPanelCardKey): boolean {
    return Object.prototype.hasOwnProperty.call(CARD_CAPABILITY_PROVIDERS, key);
}

/** Is the card's capability available (no provider required, or ≥1 provider registered)? */
export function isCardCapabilityAvailable(key: FocusPanelCardKey): boolean {
    const providers = CARD_CAPABILITY_PROVIDERS[key];
    if (providers === undefined) return true; // no provider requirement → always available
    return providers.length > 0;
}

/** A card whose required provider is not registered — excluded from production participation. */
export function isCardProviderUnavailable(key: FocusPanelCardKey): boolean {
    return !isCardCapabilityAvailable(key);
}

/** Card keys that require a provider (for completeness certification of production participation). */
export function providerRequiringCardKeys(): FocusPanelCardKey[] {
    return Object.keys(CARD_CAPABILITY_PROVIDERS) as FocusPanelCardKey[];
}
