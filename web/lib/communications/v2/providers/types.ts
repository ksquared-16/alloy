/**
 * Communications V2 — provider abstraction (PKG-06).
 *
 * Channel-agnostic provider contract. Provider-specific knowledge lives ONLY in adapters
 * under this directory; the application layer references the interface + registry, never a
 * concrete provider. V1 wires Resend (email) + Twilio (sms); Google/Microsoft are declared
 * but deferred to V1.5 (off the critical path) with no schema or UX change required.
 *
 * NOTE on send(): in V1 the canonical Next path enqueues communication_messages and the Python
 * worker performs the actual send, so the V1 adapter surface is identity + event/inbound
 * normalization (pure). A direct-send method joins this interface when direct-send providers
 * (Google/Microsoft, V1.5) land — added then, behind the same abstraction.
 */

import type { DeliveryEventType } from "@/lib/communications/v2/deliveryEvents";

export type ProviderChannel = "email" | "sms";
export type ProviderName = "resend" | "twilio" | "google" | "microsoft";

/** Canonical, provider-neutral inbound shape (consumed by PKG-07 normalization). */
export interface ProviderAdapter {
    readonly provider: ProviderName;
    readonly channel: ProviderChannel;
    /** Map a provider-specific status/webhook event name to the canonical vocabulary, or null if unknown. */
    mapStatusEvent(rawEvent: string): DeliveryEventType | null;
    /** Normalize a provider-specific inbound payload to canonical shape, or null if not an inbound message. */
}
