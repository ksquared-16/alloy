import { describe, expect, it } from "vitest";

import { resolveChildPhotoUrlFromRaw } from "@/lib/adminV2/runtime/focusPanel/children/resolveChildPhotoUrl";

describe("resolveChildPhotoUrlFromRaw", () => {
    it("reads top-level photo_url when present", () => {
        expect(resolveChildPhotoUrlFromRaw({ photo_url: "https://cdn.example/child.jpg" })).toBe(
            "https://cdn.example/child.jpg",
        );
    });

    it("reads custom_fields profile image keys", () => {
        expect(
            resolveChildPhotoUrlFromRaw({
                custom_fields: { profile_photo_url: "https://cdn.example/profile.png" },
            }),
        ).toBe("https://cdn.example/profile.png");
    });

    it("reads persons.metadata photo keys", () => {
        expect(
            resolveChildPhotoUrlFromRaw({
                metadata: { avatar_url: "https://cdn.example/meta-avatar.png" },
            }),
        ).toBe("https://cdn.example/meta-avatar.png");
    });

    it("returns null when no photo source exists", () => {
        expect(resolveChildPhotoUrlFromRaw({ custom_fields: {} })).toBeNull();
    });
});
