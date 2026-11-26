import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveIdentityPhotoUrlFromRaw, RESOLVED_PHOTO_URL_KEY } from "@/lib/adminV2/runtime/focusPanel/resolveIdentityPhotoUrl";
import { resolveChildDisplayImageUrl } from "@/lib/adminV2/runtime/focusPanel/children/childAvatarSessionPreview";

/**
 * R-019 — the drawer view-model must carry each child's resolved profile photo.
 *
 * Measured on Firefly, same opportunity, same children, two endpoints:
 *
 *   /api/admin/entity/opportunities/<opp>          _inquiry_children ✓  resolved_photo_url ✓ (2)
 *   /api/admin/view-models/drawer/opportunity/<opp> _inquiry_children ✓  resolved_photo_url ✗ (0)
 *
 * The Focus Panel consumes the DRAWER view-model, so every child avatar placement fell back to
 * initials while the same children resolved correctly through the entity path. Everything
 * downstream was innocent: the merge keeps the richer settled collection, the display resolver has
 * no gate, and the adapter returns `resolved_photo_url` outright — they were reading rows that
 * never received the key.
 *
 * `buildOpportunityDrawerVisiblePayload` already accepted a `documentActor` and already passed it to
 * `attachOpportunityInquiryChildrenShell`; the drawer callers simply never supplied one. After the
 * fix the drawer VM reports `resolvedCount: 6`.
 */

const WEB = process.cwd();
const src = (rel: string) =>
    readFileSync(join(WEB, rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

describe("every drawer entry point supplies the document actor", () => {
    it.each([
        ["drawer VM composer", "lib/adminV2/viewModel/drawer/opportunity/sharedCanonicalDeps.ts"],
        ["operational bootstrap", "lib/admin/loadOpportunityDrawerOperationalBootstrap.ts"],
    ])("%s passes documentActor into the visible payload", (_label, rel) => {
        const code = src(rel);
        expect(code).toContain("buildOpportunityDrawerVisiblePayload");
        expect(code).toContain("documentActor: documentActorFromAdminGate(gate)");
    });

    it("keeps the actor guard at the projection, so a denied actor yields no URL rather than an error", () => {
        const code = src("lib/documents/projectPersonProfilePhotos.ts");
        // `if (!actor?.ok || rows.length === 0) return rows;` — rows pass through untouched.
        expect(code).toMatch(/if \(!actor\?\.ok \|\| rows\.length === 0\) return rows;/);
    });

    it("never persists the minted URL — it is request-scoped presentation data", () => {
        const code = src("lib/documents/projectPersonProfilePhotos.ts");
        expect(code).not.toMatch(/\.update\(|\.upsert\(|\.insert\(/);
    });
});

describe("a child row carrying the resolved photo reaches the avatar renderer", () => {
    const child = (over: Record<string, unknown> = {}) => ({
        customer_member_id: "member-lennon",
        person_id: "794b4bfe",
        display_name: "Lennon Kurzman",
        ...over,
    });

    it("returns the resolved URL from the projected row", () => {
        const url = "https://example.test/storage/v1/object/sign/IMG_1438.jpeg?token=abc";
        expect(resolveIdentityPhotoUrlFromRaw(child({ [RESOLVED_PHOTO_URL_KEY]: url }))).toBe(url);
    });

    it("carries that URL through the display resolver to the avatar", () => {
        const url = "https://example.test/storage/v1/object/sign/IMG_1438.jpeg?token=abc";
        expect(
            resolveChildDisplayImageUrl({
                imageUrl: resolveIdentityPhotoUrlFromRaw(child({ [RESOLVED_PHOTO_URL_KEY]: url })),
                childId: "child-1",
                personId: "794b4bfe",
                customerMemberId: "member-lennon",
            }),
        ).toBe(url);
    });

    it("falls back to initials when no photo resolves", () => {
        expect(resolveIdentityPhotoUrlFromRaw(child())).toBeNull();
        expect(
            resolveChildDisplayImageUrl({
                imageUrl: null,
                childId: "child-1",
                personId: "794b4bfe",
                customerMemberId: "member-lennon",
            }),
        ).toBeNull();
    });

    it("does not hand one child another child's photo", () => {
        const lennon = child({ [RESOLVED_PHOTO_URL_KEY]: "https://example.test/IMG_1438.jpeg" });
        const wrigley = child({
            customer_member_id: "member-wrigley",
            person_id: "c256182e",
            display_name: "Wrigley Kurzman",
            [RESOLVED_PHOTO_URL_KEY]: "https://example.test/IMG_5380.jpeg",
        });
        expect(resolveIdentityPhotoUrlFromRaw(lennon)).not.toBe(resolveIdentityPhotoUrlFromRaw(wrigley));
        // Each row answers only for itself — resolution is per row, never keyed off a shared cache.
        expect(resolveIdentityPhotoUrlFromRaw(lennon)).toContain("IMG_1438");
        expect(resolveIdentityPhotoUrlFromRaw(wrigley)).toContain("IMG_5380");
    });

    it("treats the signed URL as presentation data, not durable truth", () => {
        // Durable truth is the document reference on the person; the adapter only ever reads a
        // per-request key. Nothing here writes back.
        const code = src("lib/adminV2/runtime/focusPanel/resolveIdentityPhotoUrl.ts");
        expect(code).toContain(`export const RESOLVED_PHOTO_URL_KEY = "resolved_photo_url"`);
        expect(code).not.toMatch(/\.update\(|\.upsert\(|\.insert\(/);
    });
});
