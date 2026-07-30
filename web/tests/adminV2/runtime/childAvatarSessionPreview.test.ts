import { describe, expect, it, beforeEach } from "vitest";

import {
    clearChildAvatarSessionPreviewMatchingUrl,
    clearChildAvatarSessionPreviews,
    getChildAvatarSessionPreview,
    seedChildAvatarSessionPreviewForTests,
    setChildAvatarSessionPreview,
} from "@/lib/adminV2/runtime/focusPanel/children/childAvatarSessionPreview";

describe("childAvatarSessionPreview", () => {
    beforeEach(() => {
        clearChildAvatarSessionPreviews();
    });

    it("stores durable remote URLs for remount recovery", () => {
        setChildAvatarSessionPreview("child-1", "https://cdn.example/lennon.jpg");
        expect(getChildAvatarSessionPreview("child-1")).toBe("https://cdn.example/lennon.jpg");
    });

    it("refuses to store blob: object URLs", () => {
        setChildAvatarSessionPreview("child-1", "blob:https://localhost/dead-object");
        expect(getChildAvatarSessionPreview("child-1")).toBeNull();
    });

    it("drops stale blob entries left by older builds on read", () => {
        seedChildAvatarSessionPreviewForTests("child-1", "blob:https://localhost/legacy");
        expect(getChildAvatarSessionPreview("child-1")).toBeNull();
        // Scrubbed from the map — a second read stays empty.
        expect(getChildAvatarSessionPreview("child-1")).toBeNull();
    });

    it("clears session keys matching a revoked URL", () => {
        setChildAvatarSessionPreview("child-1", "https://cdn.example/ok.jpg");
        setChildAvatarSessionPreview("person-1", "https://cdn.example/ok.jpg");
        clearChildAvatarSessionPreviewMatchingUrl("https://cdn.example/ok.jpg");
        expect(getChildAvatarSessionPreview("child-1")).toBeNull();
        expect(getChildAvatarSessionPreview("person-1")).toBeNull();
    });

    it("clears null / empty without writing", () => {
        setChildAvatarSessionPreview("child-1", "https://cdn.example/ok.jpg");
        setChildAvatarSessionPreview("child-1", null);
        expect(getChildAvatarSessionPreview("child-1")).toBeNull();
    });
});
