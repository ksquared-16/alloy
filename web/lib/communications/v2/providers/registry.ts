/**
 * Communications V2 — provider registry (PKG-06).
 * The ONLY place provider names are switched. App-layer code resolves an adapter by provider
 * and then speaks the channel-agnostic interface. Keeps provider-specific branching out of the
 * application layer (enforced by commsV2ProviderLeakage.contract.test.ts).
 */
import type { ProviderAdapter, ProviderName } from "./types";
import { resendEmailAdapter } from "./resendEmailAdapter";
import { twilioSmsAdapter } from "./twilioSmsAdapter";
import { googleWorkspaceAdapter, microsoft365Adapter } from "./deferredAdapters";

/** V1 active adapters (Resend + Twilio). */
export const V1_PROVIDERS: readonly ProviderName[] = ["resend", "twilio"];

export function resolveProviderAdapter(provider: string): ProviderAdapter | null {
    switch (provider.trim().toLowerCase()) {
        case "resend":
            return resendEmailAdapter;
        case "twilio":
            return twilioSmsAdapter;
        case "google":
            return googleWorkspaceAdapter;
        case "microsoft":
            return microsoft365Adapter;
        default:
            return null;
    }
}

/** Whether a provider is active in V1 (vs declared-but-deferred to V1.5). */
export function isV1Provider(provider: string): boolean {
    return V1_PROVIDERS.includes(provider.trim().toLowerCase() as ProviderName);
}
