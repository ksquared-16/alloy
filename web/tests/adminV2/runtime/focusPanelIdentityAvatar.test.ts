import { describe, expect, it } from "vitest";

import {
    avatarToneForName,
    initialsFromName,
    resolveIdentityAvatar,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelIdentityAvatar";

describe("identity avatar evidence model", () => {
    it("derives initials from full, single, and messy names", () => {
        expect(initialsFromName("Sarah Johnson")).toBe("SJ");
        expect(initialsFromName("Emma")).toBe("EM");
        expect(initialsFromName("  Mary Jane  Watson ")).toBe("MW");
        expect(initialsFromName("")).toBe("?");
        expect(initialsFromName("   ")).toBe("?");
    });

    it("resolves an image when present, else falls back to initials", () => {
        const withImage = resolveIdentityAvatar("Sarah Johnson", "https://cdn/x.jpg");
        expect(withImage.imageUrl).toBe("https://cdn/x.jpg");
        expect(withImage.initials).toBe("SJ");

        const noImage = resolveIdentityAvatar("Liam Johnson", "   ");
        expect(noImage.imageUrl).toBeNull(); // blank URL → fallback
        expect(noImage.initials).toBe("LJ");

        const blankName = resolveIdentityAvatar("", null);
        expect(blankName.name).toBe("Unknown");
        expect(blankName.initials).toBe("UN");
    });

    it("assigns a stable, deterministic tone per name (no randomness)", () => {
        const a = avatarToneForName("Sarah Johnson");
        const b = avatarToneForName("Sarah Johnson");
        expect(a).toBe(b);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThan(6);
        // Semantic contact role uses the neutral token; name hash remains available for children.
        expect(resolveIdentityAvatar("Sarah Johnson").role).toBe("contact");
        expect(resolveIdentityAvatar("Sarah Johnson", null, { role: "child", recordId: "x" }).tone).toBe(
            resolveIdentityAvatar("Sarah Johnson", null, { role: "child", recordId: "x" }).tone,
        );
    });
});
