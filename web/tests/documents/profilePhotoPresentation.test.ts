/**
 * Phase 0 commit 6 — profile-photo signed-URL cache correction.
 *
 * The defect: a signed URL was persisted to `persons.metadata.photo_url`,
 * making one actor's expiry-bound credential durable metadata shared with every
 * other actor — and requiring a seven-day expiry to stay useful.
 */
import { describe, expect, it, vi } from "vitest";

import {
    assertNoCredentialInMetadata,
    classifyLegacyPhotoUrl,
    profilePhotoDocumentId,
    resolveProfilePhotosForActor,
    PROFILE_PHOTO_DOCUMENT_ID_KEY,
} from "@/lib/documents/profilePhotoPresentation";
import { signedUrlExpirySeconds } from "@/lib/documents/assertDocumentAccess";

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const DOC = "dddddddd-0000-4000-8000-000000000001";
const PERSON_A = "11111111-0000-4000-8000-00000000000a";
const PERSON_B = "11111111-0000-4000-8000-00000000000b";

const SIGNED = "https://x.supabase.co/storage/v1/object/sign/org_documents/a/b.png?token=eyJhbG";
const EXTERNAL = "https://cdn.example.com/avatars/abc.png";

function supa(opts: { row?: Record<string, unknown> | null; signAs?: string } = {}) {
    const signCalls: Array<{ path: string; expires: number }> = [];
    const client = {
        from: () => ({
            select: () => ({
                eq: () => ({
                    eq: () => ({
                        maybeSingle: async () => ({
                            data:
                                opts.row === undefined
                                    ? { id: DOC, org_id: ORG, bucket: "org_documents", storage_path: "p/x.png", entity_type: "persons", entity_id: PERSON_A, status: null }
                                    : opts.row,
                            error: null,
                        }),
                    }),
                }),
            }),
        }),
        storage: {
            from: () => ({
                createSignedUrl: async (path: string, expires: number) => {
                    signCalls.push({ path, expires });
                    return { data: { signedUrl: `${opts.signAs ?? "https://storage.invalid/sig"}?t=${Date.now()}` }, error: null };
                },
            }),
        },
    };
    return { client, signCalls };
}

const privileged = { ok: true, orgId: ORG, role: "admin", roleKeys: ["admin"] };
const viewer = { ok: true, orgId: ORG, role: "viewer", roleKeys: ["viewer"] };

describe("no signed URL is persisted to person metadata", () => {
    it("rejects a signed URL in a metadata payload", () => {
        expect(() => assertNoCredentialInMetadata({ photo_url: SIGNED })).toThrow(/Refusing to persist a signed URL/);
    });

    it("permits a stable external image URL", () => {
        expect(() => assertNoCredentialInMetadata({ photo_url: EXTERNAL })).not.toThrow();
    });

    it("permits metadata carrying only the stable document reference", () => {
        expect(() => assertNoCredentialInMetadata({ [PROFILE_PHOTO_DOCUMENT_ID_KEY]: DOC })).not.toThrow();
    });
});

describe("legacy value classification — do not blindly erase valid images", () => {
    it("identifies a signed internal storage URL", () => {
        expect(classifyLegacyPhotoUrl(SIGNED)).toBe("signed_internal_storage");
        expect(classifyLegacyPhotoUrl("https://x/storage/v1/object/sign/b/p.png")).toBe("signed_internal_storage");
        expect(classifyLegacyPhotoUrl("https://cdn.example.com/a.png?token=abc")).toBe("signed_internal_storage");
    });

    it("preserves a stable external URL as a distinct class", () => {
        expect(classifyLegacyPhotoUrl(EXTERNAL)).toBe("external_stable_url");
    });

    it("treats empty and non-string values as empty", () => {
        for (const v of ["", "   ", null, undefined, 42, {}]) {
            expect(classifyLegacyPhotoUrl(v)).toBe("empty");
        }
    });

    it("reports anything else as ambiguous rather than guessing", () => {
        expect(classifyLegacyPhotoUrl("/relative/path.png")).toBe("ambiguous");
        expect(classifyLegacyPhotoUrl("http://insecure.example.com/a.png")).toBe("ambiguous");
    });
});

describe("stable reference", () => {
    it("reads the document id from metadata", () => {
        expect(profilePhotoDocumentId({ [PROFILE_PHOTO_DOCUMENT_ID_KEY]: DOC })).toBe(DOC);
        expect(profilePhotoDocumentId({ photo_url: SIGNED })).toBeNull();
        expect(profilePhotoDocumentId(null)).toBeNull();
    });
});

describe("resolver — actor-scoped, short-lived, per-document authorization", () => {
    it("resolves a URL for an authorized actor", async () => {
        const { client, signCalls } = supa();
        const out = await resolveProfilePhotosForActor({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            supabase: client as any,
            actor: privileged,
            people: [{ personId: PERSON_A, metadata: { [PROFILE_PHOTO_DOCUMENT_ID_KEY]: DOC } }],
        });

        expect(out.get(PERSON_A)?.photoUrl).toBeTruthy();
        expect(signCalls[0].expires).toBe(signedUrlExpirySeconds("preview"));
        expect(signCalls[0].expires).toBeLessThanOrEqual(60 * 15);
    });

    it("refuses an unauthorized actor", async () => {
        const { client, signCalls } = supa();
        const out = await resolveProfilePhotosForActor({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            supabase: client as any,
            actor: viewer,
            people: [{ personId: PERSON_A, metadata: { [PROFILE_PHOTO_DOCUMENT_ID_KEY]: DOC } }],
        });

        expect(out.get(PERSON_A)?.photoUrl).toBeNull();
        expect(out.get(PERSON_A)?.reason).toBe("unauthorized");
        expect(signCalls).toHaveLength(0);
    });

    it("never reuses actor A's URL for actor B", async () => {
        const person = [{ personId: PERSON_A, metadata: { [PROFILE_PHOTO_DOCUMENT_ID_KEY]: DOC } }];

        const a = supa();
        const forA = await resolveProfilePhotosForActor({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            supabase: a.client as any,
            actor: privileged,
            people: person,
        });

        const b = supa();
        const forB = await resolveProfilePhotosForActor({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            supabase: b.client as any,
            actor: viewer,
            people: person,
        });

        expect(forA.get(PERSON_A)?.photoUrl).toBeTruthy();
        expect(forB.get(PERSON_A)?.photoUrl).toBeNull();
        // Nothing is shared between the two resolutions.
        expect(b.signCalls).toHaveLength(0);
    });

    it("is re-resolvable, so an expired URL refreshes without editing the person", async () => {
        const person = [{ personId: PERSON_A, metadata: { [PROFILE_PHOTO_DOCUMENT_ID_KEY]: DOC } }];
        const first = supa();
        const second = supa();

        const one = await resolveProfilePhotosForActor({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            supabase: first.client as any,
            actor: privileged,
            people: person,
        });
        const two = await resolveProfilePhotosForActor({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            supabase: second.client as any,
            actor: privileged,
            people: person,
        });

        expect(one.get(PERSON_A)?.photoUrl).toBeTruthy();
        expect(two.get(PERSON_A)?.photoUrl).toBeTruthy();
        // A fresh signature each time — no persisted value was reused.
        expect(second.signCalls).toHaveLength(1);
    });

    it("returns no_reference when the person has no stable reference", async () => {
        const { client, signCalls } = supa();
        const out = await resolveProfilePhotosForActor({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            supabase: client as any,
            actor: privileged,
            people: [{ personId: PERSON_B, metadata: { photo_url: SIGNED } }],
        });

        expect(out.get(PERSON_B)?.photoUrl).toBeNull();
        expect(out.get(PERSON_B)?.reason).toBe("no_reference");
        expect(signCalls).toHaveLength(0);
    });

    it("fails closed for a cross-org document", async () => {
        const { client, signCalls } = supa({ row: null }); // org-scoped query finds nothing
        const out = await resolveProfilePhotosForActor({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            supabase: client as any,
            actor: privileged,
            people: [{ personId: PERSON_A, metadata: { [PROFILE_PHOTO_DOCUMENT_ID_KEY]: DOC } }],
        });

        expect(out.get(PERSON_A)?.photoUrl).toBeNull();
        expect(signCalls).toHaveLength(0);
    });

    it("authorizes each person independently in a batch", async () => {
        // Batching is a performance shape, never an authorization shortcut.
        const { client } = supa();
        const out = await resolveProfilePhotosForActor({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            supabase: client as any,
            actor: viewer,
            people: [
                { personId: PERSON_A, metadata: { [PROFILE_PHOTO_DOCUMENT_ID_KEY]: DOC } },
                { personId: PERSON_B, metadata: { [PROFILE_PHOTO_DOCUMENT_ID_KEY]: DOC } },
            ],
        });

        expect(out.size).toBe(2);
        expect(out.get(PERSON_A)?.reason).toBe("unauthorized");
        expect(out.get(PERSON_B)?.reason).toBe("unauthorized");
    });
});

describe("no seven-day signer remains", () => {
    it("caps every operation at 15 minutes", () => {
        for (const op of ["preview", "download", "attachment"] as const) {
            expect(signedUrlExpirySeconds(op)).toBeLessThanOrEqual(60 * 15);
        }
        // The prior value.
        expect(60 * 60 * 24 * 7).toBeGreaterThan(signedUrlExpirySeconds("preview"));
    });
});
