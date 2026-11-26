/**
 * Communications V2 — deferred provider adapters (PKG-06).
 * Google Workspace + Microsoft 365 are part of the architecture but OFF the V1 critical path
 * (V1.5). They are declared so the registry + UI speak in channels, not providers, and so adding
 * them later needs adapter code only — no schema or UX change. Methods throw until V1.5.
 */
import type { ProviderAdapter, ProviderName } from "./types";

function deferred(provider: ProviderName): ProviderAdapter {
    const msg = `Communications V2.5: ${provider} adapter is not implemented (off the V1 critical path).`;
    return {
        provider,
        channel: "email",
        mapStatusEvent(): never {
            throw new Error(msg);
        },
    };
}

export const googleWorkspaceAdapter: ProviderAdapter = deferred("google");
export const microsoft365Adapter: ProviderAdapter = deferred("microsoft");
