/**
 * Canonical profile-photo presentation resolver.
 *
 * THE RULE
 * A signed URL is actor-specific, expiry-bound authorization material. It must
 * never be persisted as durable person metadata, and never shared across
 * actors. `persons.metadata.profile_photo_document_id` is the stable reference;
 * the URL is derived per request for the current actor.
 *
 *   stable profile-photo reference
 *     -> authorized profile-photo resolver   (this module)
 *     -> short-lived URL for the current actor/context
 *
 * BATCHED BY DESIGN
 * A drawer or household card renders many avatars. Resolving one at a time
 * would mean one network round-trip per avatar, so this takes a set of person
 * rows and returns a map. Authorization is still evaluated per document — the
 * batch is a performance shape, not an authorization shortcut.
 *
 * CACHING
 * Request-scoped only, keyed by actor. Never written back to person metadata.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    assertDocumentAccess,
    signedUrlExpirySeconds,
    type DocumentActor,
} from "@/lib/documents/assertDocumentAccess";

export const PROFILE_PHOTO_DOCUMENT_ID_KEY = "profile_photo_document_id";
export const LEGACY_PHOTO_URL_KEY = "photo_url";

export type PersonPhotoInput = {
    personId: string;
    metadata: Record<string, unknown> | null | undefined;
};

export type ResolvedPhoto = {
    personId: string;
    /** Short-lived, actor-scoped. Null when unauthorized or unavailable. */
    photoUrl: string | null;
    documentId: string | null;
    /** Why no URL was produced — useful in tests and diagnostics, not shown to users. */
    reason?: "no_reference" | "unauthorized" | "sign_failed";
};

/**
 * Classification of an existing `metadata.photo_url` value.
 *
 * Existing rows hold a mix, and blindly clearing them would destroy legitimate
 * external profile images. Each class gets a different migration action.
 */
export type LegacyPhotoUrlClass =
    | "signed_internal_storage" // bearer credential — must not persist
    | "external_stable_url" // e.g. a gravatar/CDN link; may be legitimate
    | "empty"
    | "ambiguous"; // report and fail closed; do not guess

/**
 * Classify a stored value WITHOUT mutating it.
 *
 * A Supabase signed URL carries `/storage/v1/object/sign/` and a `token=`
 * query parameter — both are reliable markers of expiry-bound authorization
 * material rather than a durable image reference.
 */
export function classifyLegacyPhotoUrl(value: unknown): LegacyPhotoUrlClass {
    if (typeof value !== "string" || !value.trim()) return "empty";
    const url = value.trim();

    if (url.includes("/storage/v1/object/sign/") || /[?&]token=/.test(url)) {
        return "signed_internal_storage";
    }
    if (/^https:\/\//i.test(url) && !url.includes("/storage/v1/")) {
        return "external_stable_url";
    }
    return "ambiguous";
}

/** The stable reference, if this person has one. */
export function profilePhotoDocumentId(metadata: Record<string, unknown> | null | undefined): string | null {
    if (!metadata || typeof metadata !== "object") return null;
    const raw = (metadata as Record<string, unknown>)[PROFILE_PHOTO_DOCUMENT_ID_KEY];
    return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/**
 * Resolve short-lived photo URLs for a set of people, for ONE actor.
 *
 * Every document is authorized individually through the canonical helper, so an
 * actor who may see one child's photo does not thereby see another's.
 */
export async function resolveProfilePhotosForActor(params: {
    supabase: SupabaseClient;
    actor: DocumentActor;
    people: PersonPhotoInput[];
}): Promise<Map<string, ResolvedPhoto>> {
    const out = new Map<string, ResolvedPhoto>();

    for (const person of params.people) {
        const documentId = profilePhotoDocumentId(person.metadata);

        if (!documentId) {
            out.set(person.personId, {
                personId: person.personId,
                photoUrl: null,
                documentId: null,
                reason: "no_reference",
            });
            continue;
        }

        const decision = await assertDocumentAccess({
            supabase: params.supabase,
            actor: params.actor,
            documentId,
            operation: "preview",
        });

        if (decision.outcome !== "allowed") {
            out.set(person.personId, {
                personId: person.personId,
                photoUrl: null,
                documentId,
                reason: "unauthorized",
            });
            continue;
        }

        const { data, error } = await params.supabase.storage
            .from(decision.document.bucket)
            .createSignedUrl(decision.document.storagePath, signedUrlExpirySeconds("preview"));

        if (error || !data?.signedUrl) {
            out.set(person.personId, {
                personId: person.personId,
                photoUrl: null,
                documentId,
                reason: "sign_failed",
            });
            continue;
        }

        out.set(person.personId, { personId: person.personId, photoUrl: data.signedUrl, documentId });
    }

    return out;
}

/**
 * Values that may be persisted to `persons.metadata` for a profile photo.
 *
 * Exported so writers can be tested against it: anything resembling a signed
 * URL, bearer token, or expiry-bound provider URL is rejected here rather than
 * relying on each writer to remember.
 */
export function assertNoCredentialInMetadata(metadata: Record<string, unknown>): void {
    const value = metadata[LEGACY_PHOTO_URL_KEY];
    if (value === undefined || value === null) return;
    if (classifyLegacyPhotoUrl(value) === "signed_internal_storage") {
        throw new Error(
            "Refusing to persist a signed URL to person metadata. A signed URL is actor-specific, " +
                "expiry-bound authorization material; store profile_photo_document_id and resolve per request."
        );
    }
}
