import { describe, expect, it } from "vitest";
import { resolveSurfaceAvatarRuntime } from "@/lib/adminV2/runtime/focusPanel/persistPersonProfilePhoto";

describe("resolveSurfaceAvatarRuntime", () => {
    it("hides when Surfaces Avatar is off", () => {
        expect(
            resolveSurfaceAvatarRuntime({
                showAvatar: false,
                useProfilePhotos: true,
                imageUrl: "https://cdn.example/a.jpg",
            }),
        ).toEqual({ visible: false, imageUrl: null });
    });

    it("shows photo when Avatar + Photos are on", () => {
        expect(
            resolveSurfaceAvatarRuntime({
                showAvatar: true,
                useProfilePhotos: true,
                imageUrl: "https://cdn.example/a.jpg",
            }),
        ).toEqual({ visible: true, imageUrl: "https://cdn.example/a.jpg" });
    });

    it("keeps avatar visible but initials-only when Photos are off", () => {
        expect(
            resolveSurfaceAvatarRuntime({
                showAvatar: true,
                useProfilePhotos: false,
                imageUrl: "https://cdn.example/a.jpg",
            }),
        ).toEqual({ visible: true, imageUrl: null });
    });
});
