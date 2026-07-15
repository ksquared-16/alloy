/**
 * Feature flag `oe.ledger.author` (P1 · Wave B) — gates the Operational
 * Expectations authoring intake. Mirrors the repository's per-feature flag idiom
 * (a local `readFlag` over `process.env`, optionally org-scoped via
 * `org_settings.metadata.feature_flags`). It is a ROLLOUT control, not a second
 * permanent runtime mode.
 *
 *   OFF (default) → Facts-only compatibility: no Operational Expectation authoring,
 *                   no partial row written, the intake returns a typed disabled
 *                   result.
 *   ON            → the intake may proceed to validation.
 *
 * Env var:  OE_LEDGER_AUTHOR_ENABLED   (server-only; default OFF)
 * Org key:  org_settings.metadata.feature_flags["oe.ledger.author"]  (opt-out)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** The org_settings.metadata.feature_flags key for the ledger authoring path. */
export const OE_LEDGER_AUTHOR_FLAG = "oe.ledger.author";

/** Parse a boolean-ish env value; unset/unknown → default. */
function readFlag(raw: string | undefined, defaultValue: boolean): boolean {
    if (raw == null) return defaultValue;
    const v = raw.trim().toLowerCase();
    if (["1", "true", "on", "yes"].includes(v)) return true;
    if (["0", "false", "off", "no"].includes(v)) return false;
    return defaultValue;
}

/** Env gate — default OFF. When OFF, no org can author regardless of org metadata. */
export function isOeLedgerAuthorEnvEnabled(): boolean {
    return readFlag(process.env.OE_LEDGER_AUTHOR_ENABLED, false);
}

/**
 * Pure org-metadata check: enabled iff the env gate is ON and the org has not
 * explicitly opted out via `feature_flags["oe.ledger.author"]` = false/0.
 */
export function isOeLedgerAuthorEnabledForOrgMetadata(
    metadata: Record<string, unknown> | null | undefined,
): boolean {
    if (!isOeLedgerAuthorEnvEnabled()) return false;
    const flags = metadata?.feature_flags;
    if (flags != null && typeof flags === "object" && !Array.isArray(flags)) {
        const entry = (flags as Record<string, unknown>)[OE_LEDGER_AUTHOR_FLAG];
        if (entry === false || entry === "false" || entry === 0 || entry === "0") return false;
    }
    return true;
}

/**
 * Resolve the flag for an org (server-side). Reads `org_settings.metadata`. On any
 * read error, fails CLOSED (returns false) — a flag read failure never authorizes
 * authoring.
 */
export async function isOeLedgerAuthorEnabledForOrg(
    supabase: SupabaseClient,
    orgId: string,
): Promise<boolean> {
    if (!isOeLedgerAuthorEnvEnabled()) return false;
    const { data, error } = await supabase
        .from("org_settings")
        .select("metadata")
        .eq("org_id", orgId)
        .maybeSingle();
    if (error) {
        console.warn("[oe.ledger.author] org_settings feature-flag read failed", error.message);
        return false;
    }
    const metadata = (data as { metadata?: Record<string, unknown> } | null)?.metadata;
    return isOeLedgerAuthorEnabledForOrgMetadata(metadata);
}
