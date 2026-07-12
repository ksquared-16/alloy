/**
 * Processing Identity Resolution feature flags (local defaults off).
 * Enable in tests or pilot org config only — never remote-promoted from this sprint branch.
 */

function envFlag(name: string, defaultValue = false): boolean {
    const raw = process.env[name];
    if (raw == null || raw === "") return defaultValue;
    return raw === "1" || raw.toLowerCase() === "true";
}

export function isProcessingPersistFactsEnabled(orgId?: string | null): boolean {
    void orgId;
    return envFlag("PROCESSING_PERSIST_FACTS", false);
}

export function isProcessingRealResolverEnabled(orgId?: string | null): boolean {
    void orgId;
    return envFlag("PROCESSING_REAL_RESOLVER", false);
}

export function isProcessingShadowFormsEnabled(orgId?: string | null): boolean {
    void orgId;
    return envFlag("PROCESSING_SHADOW_FORMS", false);
}
