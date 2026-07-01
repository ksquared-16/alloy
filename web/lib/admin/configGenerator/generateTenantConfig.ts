import { CLEANING_TENANT_BOOTSTRAP_V1 } from "@/lib/admin/configGenerator/cleaningTenantBootstrapV1";
import { CHILDCARE_TENANT_BOOTSTRAP_V1 } from "@/lib/admin/tenantBootstrap/childcareTenantBootstrapV1";
import type { TenantBootstrapPayloadV1 } from "@/lib/admin/tenantBootstrap/types";

/**
 * Normalize free-text for deterministic keyword routing (future: swap for LLM output).
 */
export function normalizePrompt(prompt?: string): string {
    if (prompt == null || typeof prompt !== "string") {
        return "";
    }
    return prompt.trim().toLowerCase();
}

/**
 * Deterministic mapping from a simple description → `TenantBootstrapPayloadV1`.
 * Returns a deep clone so callers can mutate safely; originals stay immutable.
 *
 * Reserved for later: `inferredData` from datasets or structured inference.
 */
export function generateTenantConfig(input: {
    prompt?: string;
    inferredData?: unknown;
}): TenantBootstrapPayloadV1 {
    const p = normalizePrompt(input.prompt);
    void input.inferredData;

    if (p.includes("childcare")) {
        return JSON.parse(JSON.stringify(CHILDCARE_TENANT_BOOTSTRAP_V1)) as TenantBootstrapPayloadV1;
    }

    if (p.includes("cleaning") || p.includes("house cleaning")) {
        return JSON.parse(JSON.stringify(CLEANING_TENANT_BOOTSTRAP_V1)) as TenantBootstrapPayloadV1;
    }

    throw new Error(
        'generateTenantConfig: unsupported prompt — include an industry keyword such as "childcare" or "cleaning"'
    );
}
