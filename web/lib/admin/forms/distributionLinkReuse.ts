/**
 * Distribution-link reuse — make "Create distribution link(s)" idempotent, retrievable, and self-healing.
 *
 * Two long-standing bugs this addresses:
 *  - Bug A (no re-reveal): the plaintext token was returned once and never persisted, so operators could
 *    not copy a link again after minting. We now persist the reconstructable embed PATH in link metadata
 *    (`share_embed_path`) so any operator can re-copy it later. These are public marketing links, not
 *    secrets — the retrievable posture is intentional.
 *  - Bug B (duplicate minting): every click minted a new row. Distribution-mode create now reuses the
 *    existing active link for a scope (org-wide vs a specific location) and collapses duplicates.
 *
 * Pure helpers only — no DB access here so the reuse/dedup decision is unit-testable.
 */

import { isProcessingIntakeLink } from "@/lib/pos/processingPublicLinkMetadata";
import { readUuid } from "@/lib/forms/locationSpecificPublicLinkMetadata";
import type { FormPublicLinkSafeRow } from "./formsAdminDb";

/** Metadata key holding the reconstructable embed path (contains the plaintext token). */
export const SHARE_EMBED_PATH_META_KEY = "share_embed_path";

/** Read the persisted, retrievable embed path from link metadata (null if legacy / not persisted). */
export function readShareEmbedPath(metadata: unknown): string | null {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    const raw = (metadata as Record<string, unknown>)[SHARE_EMBED_PATH_META_KEY];
    return typeof raw === "string" && raw.trim().startsWith("/forms/embed/") ? raw.trim() : null;
}

/** Recover the plaintext token from a persisted embed path (`/forms/embed/<token>`). */
export function plaintextTokenFromEmbedPath(embedPath: string): string | null {
    const marker = "/forms/embed/";
    if (!embedPath.startsWith(marker)) return null;
    const raw = embedPath.slice(marker.length);
    if (!raw) return null;
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

/** The location a distribution link targets, or null for an org-wide link. */
export function linkScopeLocationId(metadata: unknown): string | null {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    return readUuid((metadata as Record<string, unknown>).default_location_id);
}

/** Does this link belong to the requested distribution scope? (null locationId === org-wide). */
export function matchesDistributionScope(metadata: unknown, locationId: string | null): boolean {
    return linkScopeLocationId(metadata) === (locationId ?? null);
}

/**
 * Given all links for a form, decide what a distribution-mode create should do for one scope.
 *
 * Behavior (converges to exactly one active, retrievable link per scope):
 *  - `regenerate: false` (default): if a retrievable active link already exists for the scope, REUSE the
 *    newest one and deactivate the rest (`deactivateIds`). If none of the active scope links are
 *    retrievable (legacy, hashed-only), deactivate them all and signal a fresh mint (`mintNew: true`).
 *  - `regenerate: true`: always deactivate every active scope link and mint a fresh retrievable one.
 */
export function planDistributionLink(args: {
    links: FormPublicLinkSafeRow[];
    locationId: string | null;
    regenerate: boolean;
}): { reuse: FormPublicLinkSafeRow | null; deactivateIds: string[]; mintNew: boolean } {
    const scopeMatches = args.links.filter(
        (l) => l.is_active && isProcessingIntakeLink(l.metadata) && matchesDistributionScope(l.metadata, args.locationId)
    );

    if (!args.regenerate) {
        const retrievable = scopeMatches
            .filter((l) => readShareEmbedPath(l.metadata) !== null)
            .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
        const keep = retrievable[0] ?? null;
        if (keep) {
            return {
                reuse: keep,
                deactivateIds: scopeMatches.filter((l) => l.id !== keep.id).map((l) => l.id),
                mintNew: false,
            };
        }
    }

    // Regenerate, or no retrievable link exists for this scope: clean slate + mint fresh.
    return { reuse: null, deactivateIds: scopeMatches.map((l) => l.id), mintNew: true };
}
