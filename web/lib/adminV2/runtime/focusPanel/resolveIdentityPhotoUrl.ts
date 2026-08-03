/**
 * THE single profile-image compatibility adapter.
 *
 * Every photo-reading path in the platform funnels through here, directly or
 * via resolveChildPhotoUrl, so this is where the safe-model rule is enforced —
 * rather than in each of the twelve view-model builders.
 *
 * ORDER (per the Phase 0 contract):
 *   1. canonical document reference  -> resolved server-side, injected as
 *                                       `photo_url` by the batch resolver
 *   2. approved stable external URL  -> retained as a legacy external source
 *   3. otherwise                     -> null (avatar degrades to initials)
 *
 * An INTERNAL SIGNED URL is never returned. Persisted signed URLs no longer get
 * written to `persons.metadata.photo_url`, but historical rows still contain
 * them, and returning one would hand a caller a stale bearer credential that
 * outlives the authorization it was minted under. They are classified and
 * dropped here.
 *
 * DELETION CONDITION: this adapter may be removed once
 *   (a) no `persons.metadata` row still carries a legacy photo URL — verified
 *       by the coordinated data migration, AND
 *   (b) every consumer reads a VM field populated by
 *       `resolveProfilePhotosForActor`.
 * Until both hold, this is what keeps stale credentials out of view models.
 */

import { classifyLegacyPhotoUrl } from "@/lib/documents/profilePhotoPresentation";

/**
 * The one key the batch resolver writes, and nothing else may.
 *
 * Trust here is by PROVENANCE, not by shape: a resolver-produced URL is a
 * signed URL too, so shape-filtering it would reject exactly the value we just
 * authorized. Keeping it on a distinct key means "authorized for this actor,
 * this request" is structurally distinguishable from "found in storage".
 */
export const RESOLVED_PHOTO_URL_KEY = "resolved_photo_url";

const PHOTO_KEYS = [
    "photo_url",
    "avatar_url",
    "profile_photo_url",
    "profile_image_url",
    "image_url",
] as const;

function trimUrl(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

/**
 * Admit a value only when it is safe to display.
 *
 * `external_stable_url` is the one legacy class that survives. `ambiguous` is
 * deliberately refused rather than guessed at: an unrecognized shape may be a
 * credential we failed to classify, and the cost of being wrong is leaking one.
 */
export function isPresentablePhotoUrl(value: string): boolean {
    return classifyLegacyPhotoUrl(value) === "external_stable_url";
}

function readFromRecord(row: Record<string, unknown>): string | null {
    for (const key of PHOTO_KEYS) {
        const direct = trimUrl(row[key]);
        if (direct && isPresentablePhotoUrl(direct)) return direct;
    }
    return null;
}

function readFromBag(bag: unknown): string | null {
    if (!bag || typeof bag !== "object") return null;
    return readFromRecord(bag as Record<string, unknown>);
}

/**
 * Prefer top-level keys, then `custom_fields`, then `metadata`.
 *
 * Top-level wins because that is where the server-side batch resolver injects a
 * freshly authorized, short-lived URL for the current actor. Metadata is last,
 * and now yields only approved external images.
 */
export function resolveIdentityPhotoUrlFromRaw(row: Record<string, unknown> | null | undefined): string | null {
    if (!row) return null;

    // Resolver output wins outright — its provenance is known.
    const resolved = trimUrl(row[RESOLVED_PHOTO_URL_KEY]);
    if (resolved) return resolved;

    return (
        readFromRecord(row)
        ?? readFromBag(row.custom_fields)
        ?? readFromBag(row.metadata)
        ?? null
    );
}

/** Extract a presentable photo URL from a persons.metadata jsonb value. */
export function resolveIdentityPhotoUrlFromMetadata(metadata: unknown): string | null {
    return readFromBag(metadata);
}

/**
 * Inject server-resolved, actor-scoped URLs into record projections.
 *
 * This is how avatars are restored: the batch resolver authorizes each document
 * for the current actor, and the result is written to the top-level `photo_url`
 * the adapter reads first. Nothing is persisted — the injected value lives only
 * for this request.
 */
export function applyResolvedPhotoUrls<T extends Record<string, unknown>>(
    rows: T[],
    resolved: Map<string, { photoUrl: string | null }>,
    personIdKey: keyof T & string = "id"
): T[] {
    return rows.map((row) => {
        const personId = typeof row[personIdKey] === "string" ? (row[personIdKey] as string) : null;
        if (!personId) return row;
        const hit = resolved.get(personId);
        if (!hit?.photoUrl) return row;
        return { ...row, [RESOLVED_PHOTO_URL_KEY]: hit.photoUrl };
    });
}
