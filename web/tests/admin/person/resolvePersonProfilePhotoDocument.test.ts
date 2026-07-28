import { describe, expect, it } from "vitest";

import {
    profilePhotoDocumentsForPerson,
    resolvePersonPhotoReference,
    selectCanonicalProfilePhotoDocument,
    type ProfilePhotoDocumentRow,
} from "@/lib/admin/person/resolvePersonProfilePhotoDocument";

const PERSON_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_PERSON_ID = "22222222-2222-2222-2222-222222222222";

function doc(overrides: Partial<ProfilePhotoDocumentRow>): ProfilePhotoDocumentRow {
    return {
        id: "doc-1",
        entity_type: "person",
        entity_id: PERSON_ID,
        doc_type: "profile_photo",
        created_at: "2026-01-01T00:00:00Z",
        bucket: "org_documents",
        storage_path: "org/person/doc-1.jpg",
        ...overrides,
    };
}

describe("profilePhotoDocumentsForPerson", () => {
    it("filters to person + profile_photo docs, newest first", () => {
        const docs: ProfilePhotoDocumentRow[] = [
            doc({ id: "older", created_at: "2026-01-01T00:00:00Z" }),
            doc({ id: "newer", created_at: "2026-02-01T00:00:00Z" }),
            doc({ id: "other-person", entity_id: OTHER_PERSON_ID }),
            doc({ id: "wrong-type", doc_type: "id_verification" }),
            doc({ id: "wrong-entity", entity_type: "customer_member" }),
        ];

        const result = profilePhotoDocumentsForPerson(PERSON_ID, docs);
        expect(result.map((d) => d.id)).toEqual(["newer", "older"]);
    });

    it("returns an empty array for a blank person id", () => {
        expect(profilePhotoDocumentsForPerson("", [doc({})])).toEqual([]);
    });
});

describe("selectCanonicalProfilePhotoDocument", () => {
    it("selects the latest matching document as canonical", () => {
        const docs: ProfilePhotoDocumentRow[] = [
            doc({ id: "older", created_at: "2026-01-01T00:00:00Z" }),
            doc({ id: "newer", created_at: "2026-03-01T00:00:00Z" }),
        ];
        expect(selectCanonicalProfilePhotoDocument(PERSON_ID, docs)?.id).toBe("newer");
    });

    it("returns null when the person has no profile_photo documents", () => {
        expect(selectCanonicalProfilePhotoDocument(PERSON_ID, [doc({ entity_id: OTHER_PERSON_ID })])).toBeNull();
    });
});

describe("resolvePersonPhotoReference", () => {
    it("prefers an already-cached metadata.photo_url over any documents evidence", () => {
        const ref = resolvePersonPhotoReference(
            PERSON_ID,
            { profile_photo_document_id: "doc-cached", photo_url: "https://cdn.example/cached.jpg" },
            [doc({ id: "doc-latest", created_at: "2026-05-01T00:00:00Z" })],
        );
        expect(ref).toEqual({ documentId: "doc-cached", photoUrl: "https://cdn.example/cached.jpg" });
    });

    it("falls back to the latest profile_photo document id when metadata has no cached URL", () => {
        const docs: ProfilePhotoDocumentRow[] = [
            doc({ id: "older", created_at: "2026-01-01T00:00:00Z" }),
            doc({ id: "newer", created_at: "2026-04-01T00:00:00Z" }),
        ];
        const ref = resolvePersonPhotoReference(PERSON_ID, {}, docs);
        expect(ref).toEqual({ documentId: "newer", photoUrl: null });
    });

    it("returns null documentId and photoUrl when neither metadata nor documents have evidence", () => {
        const ref = resolvePersonPhotoReference(PERSON_ID, null, []);
        expect(ref).toEqual({ documentId: null, photoUrl: null });
    });

    it("reads alternate metadata photo keys (avatar_url) as a cached URL", () => {
        const ref = resolvePersonPhotoReference(PERSON_ID, { avatar_url: "https://cdn.example/avatar.png" }, []);
        expect(ref).toEqual({ documentId: null, photoUrl: "https://cdn.example/avatar.png" });
    });
});
