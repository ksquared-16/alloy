/**
 * Phase 0 commit 6E — avatar read-path migration.
 *
 * Exercises the single compatibility adapter every photo consumer funnels
 * through, plus the injection helper that restores avatars from the batch
 * resolver.
 *
 * The claim under test: a stale internal signed URL sitting in historical
 * `persons.metadata` can never reach a view model, while genuine external
 * images and freshly-resolved actor-scoped URLs still render.
 */
import { describe, expect, it } from "vitest";

import {
    resolveIdentityPhotoUrlFromRaw,
    resolveIdentityPhotoUrlFromMetadata,
    isPresentablePhotoUrl,
    applyResolvedPhotoUrls,
    RESOLVED_PHOTO_URL_KEY,
} from "@/lib/adminV2/runtime/focusPanel/resolveIdentityPhotoUrl";

const SIGNED = "https://x.supabase.co/storage/v1/object/sign/org_documents/a/b.png?token=eyJhbG";
const EXTERNAL = "https://cdn.example.com/avatars/abc.png";
const RESOLVED = "https://x.supabase.co/storage/v1/object/sign/org_documents/a/b.png?token=FRESH";

const PERSON_A = "11111111-0000-4000-8000-00000000000a";
const PERSON_B = "11111111-0000-4000-8000-00000000000b";

describe("6E — stale internal signed URLs never reach a view model", () => {
    it("drops a signed URL stored at the top level", () => {
        expect(resolveIdentityPhotoUrlFromRaw({ photo_url: SIGNED })).toBeNull();
    });

    it("drops a signed URL stored in metadata", () => {
        expect(resolveIdentityPhotoUrlFromMetadata({ photo_url: SIGNED })).toBeNull();
        expect(resolveIdentityPhotoUrlFromRaw({ metadata: { photo_url: SIGNED } })).toBeNull();
    });

    it("drops a signed URL stored in custom_fields", () => {
        expect(resolveIdentityPhotoUrlFromRaw({ custom_fields: { avatar_url: SIGNED } })).toBeNull();
    });

    it("drops a signed URL under every legacy key name", () => {
        for (const key of ["photo_url", "avatar_url", "profile_photo_url", "profile_image_url", "image_url"]) {
            expect(resolveIdentityPhotoUrlFromRaw({ [key]: SIGNED }), key).toBeNull();
        }
    });

    it("refuses an ambiguous value rather than guessing", () => {
        // An unrecognized shape may be a credential we failed to classify.
        expect(resolveIdentityPhotoUrlFromRaw({ photo_url: "/relative/x.png" })).toBeNull();
        expect(resolveIdentityPhotoUrlFromRaw({ photo_url: "http://insecure.example.com/a.png" })).toBeNull();
    });

    it("degrades to null so the avatar shows initials, never a broken credential", () => {
        expect(resolveIdentityPhotoUrlFromRaw({ photo_url: SIGNED })).toBeNull();
        expect(resolveIdentityPhotoUrlFromRaw({})).toBeNull();
        expect(resolveIdentityPhotoUrlFromRaw(null)).toBeNull();
    });
});

describe("6E — approved external images survive", () => {
    it("retains a stable external URL", () => {
        expect(resolveIdentityPhotoUrlFromRaw({ photo_url: EXTERNAL })).toBe(EXTERNAL);
        expect(resolveIdentityPhotoUrlFromMetadata({ avatar_url: EXTERNAL })).toBe(EXTERNAL);
    });

    it("classifies presentability consistently", () => {
        expect(isPresentablePhotoUrl(EXTERNAL)).toBe(true);
        expect(isPresentablePhotoUrl(SIGNED)).toBe(false);
    });

    it("prefers a top-level value over metadata", () => {
        const row = { photo_url: EXTERNAL, metadata: { photo_url: "https://cdn.example.com/old.png" } };
        expect(resolveIdentityPhotoUrlFromRaw(row)).toBe(EXTERNAL);
    });
});

describe("6E — resolver injection restores avatars", () => {
    it("injects an actor-scoped URL that the adapter then returns", () => {
        const rows: Record<string, unknown>[] = [{ id: PERSON_A, metadata: { photo_url: SIGNED } }];
        const resolved = new Map([[PERSON_A, { photoUrl: RESOLVED }]]);

        const [injected] = applyResolvedPhotoUrls(rows, resolved);

        // The stale metadata value is still present but is no longer what wins.
        expect(injected[RESOLVED_PHOTO_URL_KEY]).toBe(RESOLVED);
        expect(resolveIdentityPhotoUrlFromRaw(injected as Record<string, unknown>)).toBe(RESOLVED);
    });

    it("leaves a row untouched when the actor was not authorized", () => {
        const rows: Record<string, unknown>[] = [{ id: PERSON_A, metadata: { photo_url: SIGNED } }];
        const resolved = new Map([[PERSON_A, { photoUrl: null }]]);

        const [injected] = applyResolvedPhotoUrls(rows, resolved);

        expect(injected[RESOLVED_PHOTO_URL_KEY]).toBeUndefined();
        // And the stale metadata credential still does not leak through.
        expect(resolveIdentityPhotoUrlFromRaw(injected as Record<string, unknown>)).toBeNull();
    });

    it("resolves per person, so one authorization does not cover another", () => {
        const rows: Record<string, unknown>[] = [
            { id: PERSON_A, metadata: {} },
            { id: PERSON_B, metadata: {} },
        ];
        const resolved = new Map([
            [PERSON_A, { photoUrl: RESOLVED }],
            [PERSON_B, { photoUrl: null }],
        ]);

        const out = applyResolvedPhotoUrls(rows, resolved);

        expect(out[0][RESOLVED_PHOTO_URL_KEY]).toBe(RESOLVED);
        expect(out[1][RESOLVED_PHOTO_URL_KEY]).toBeUndefined();
    });

    it("does not mutate the input rows", () => {
        const rows: Record<string, unknown>[] = [{ id: PERSON_A, metadata: {} }];
        applyResolvedPhotoUrls(rows, new Map([[PERSON_A, { photoUrl: RESOLVED }]]));
        expect((rows[0] as Record<string, unknown>)[RESOLVED_PHOTO_URL_KEY]).toBeUndefined();
    });

    it("is a per-request projection — nothing is persisted", () => {
        // applyResolvedPhotoUrls returns new objects and performs no writes.
        // Refreshing simply means calling it again on the next request.
        const rows: Record<string, unknown>[] = [{ id: PERSON_A, metadata: {} }];
        const first = applyResolvedPhotoUrls(rows, new Map([[PERSON_A, { photoUrl: "u1" }]]));
        const second = applyResolvedPhotoUrls(rows, new Map([[PERSON_A, { photoUrl: "u2" }]]));
        expect(first[0][RESOLVED_PHOTO_URL_KEY]).toBe("u1");
        expect(second[0][RESOLVED_PHOTO_URL_KEY]).toBe("u2");
    });

    it("tolerates a row with no person id", () => {
        const rows: Record<string, unknown>[] = [{ metadata: {} } as Record<string, unknown>];
        expect(() => applyResolvedPhotoUrls(rows, new Map())).not.toThrow();
    });
});
