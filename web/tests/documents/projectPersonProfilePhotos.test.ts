/**
 * Profile-photo projection onto person-keyed inquiry / household rows.
 * Ensures person_id (not OCM/inquiry-child id) is the map key — wrong key is a silent no-op.
 */
import { describe, expect, it, vi } from "vitest";

import {
    applyResolvedPhotoUrls,
    RESOLVED_PHOTO_URL_KEY,
    resolveIdentityPhotoUrlFromRaw,
} from "@/lib/adminV2/runtime/focusPanel/resolveIdentityPhotoUrl";
import { resolveChildPhotoUrlFromRaw } from "@/lib/adminV2/runtime/focusPanel/children/resolveChildPhotoUrl";
import {
    documentActorFromAdminParts,
    projectResolvedProfilePhotosOntoRows,
} from "@/lib/documents/projectPersonProfilePhotos";
import { PROFILE_PHOTO_DOCUMENT_ID_KEY } from "@/lib/documents/profilePhotoPresentation";

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const DOC = "dddddddd-0000-4000-8000-000000000001";
const PERSON_A = "11111111-0000-4000-8000-00000000000a";
const OCM_ID = "cccccccc-0000-4000-8000-0000000000oc";
const RESOLVED = "https://x.supabase.co/storage/v1/object/sign/org_documents/a/b.png?token=FRESH";

const privileged = documentActorFromAdminParts({
    ok: true,
    userId: "user-1",
    orgId: ORG,
    role: "admin",
    roleKeys: ["admin"],
    permissionKeys: ["documents.read"],
});

function mockSupabaseForPhoto() {
    const createSignedUrl = vi.fn(async () => ({
        data: { signedUrl: RESOLVED },
        error: null,
    }));
    // Same chain shape as profilePhotoPresentation tests — assertDocumentAccess uses
    // documents.select.eq.eq.maybeSingle; persons projection uses select.eq.in.
    const client = {
        from: (table: string) => {
            if (table === "persons") {
                return {
                    select: () => ({
                        eq: () => ({
                            in: async () => ({
                                data: [
                                    {
                                        id: PERSON_A,
                                        metadata: { [PROFILE_PHOTO_DOCUMENT_ID_KEY]: DOC },
                                    },
                                ],
                                error: null,
                            }),
                        }),
                    }),
                };
            }
            return {
                select: () => ({
                    eq: () => ({
                        eq: () => ({
                            maybeSingle: async () => ({
                                data: {
                                    id: DOC,
                                    org_id: ORG,
                                    bucket: "org_documents",
                                    storage_path: "a/b.png",
                                    entity_type: "persons",
                                    entity_id: PERSON_A,
                                    status: null,
                                },
                                error: null,
                            }),
                        }),
                    }),
                }),
            };
        },
        storage: {
            from: () => ({ createSignedUrl }),
        },
    };
    return { client, createSignedUrl };
}

describe("projectResolvedProfilePhotosOntoRows", () => {
    it("injects resolved_photo_url keyed by person_id (not inquiry-child id)", async () => {
        const { client } = mockSupabaseForPhoto();
        const rows = [
            {
                id: OCM_ID,
                person_id: PERSON_A,
                display_name: "Lennon",
            },
        ];

        const out = await projectResolvedProfilePhotosOntoRows({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            supabase: client as any,
            orgId: ORG,
            actor: privileged,
            rows,
            personIdKey: "person_id",
        });

        expect(out[0]![RESOLVED_PHOTO_URL_KEY]).toBe(RESOLVED);
        expect(resolveIdentityPhotoUrlFromRaw(out[0]!)).toBe(RESOLVED);
        expect(resolveChildPhotoUrlFromRaw(out[0]!)).toBe(RESOLVED);
    });

    it("is a silent no-op when mapped with inquiry-child id instead of person_id", () => {
        const resolved = new Map([[PERSON_A, { photoUrl: RESOLVED }]]);
        const rows = [{ id: OCM_ID, person_id: PERSON_A }];
        // Wrong key (default "id" = OCM id) → no injection
        const wrong = applyResolvedPhotoUrls(rows, resolved);
        expect(wrong[0]![RESOLVED_PHOTO_URL_KEY]).toBeUndefined();
        expect(resolveChildPhotoUrlFromRaw(wrong[0]! as Record<string, unknown>)).toBeNull();

        const right = applyResolvedPhotoUrls(rows, resolved, "person_id");
        expect(right[0]![RESOLVED_PHOTO_URL_KEY]).toBe(RESOLVED);
        expect(resolveChildPhotoUrlFromRaw(right[0]! as Record<string, unknown>)).toBe(RESOLVED);
    });

    it("skips when actor is missing (initials fallback)", async () => {
        const { client, createSignedUrl } = mockSupabaseForPhoto();
        const rows = [{ id: OCM_ID, person_id: PERSON_A }];
        const out = await projectResolvedProfilePhotosOntoRows({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            supabase: client as any,
            orgId: ORG,
            actor: null,
            rows,
            personIdKey: "person_id",
        });
        expect(out[0]![RESOLVED_PHOTO_URL_KEY]).toBeUndefined();
        expect(createSignedUrl).not.toHaveBeenCalled();
    });
});
