import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    inferAvatarRoleFromSectionKey,
    resolveIdentityAvatar,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelIdentityAvatar";

describe("semantic identity avatar resolver", () => {
    it("maps Primary Contact to Alloy blue role (not a sex attribute)", () => {
        const avatar = resolveIdentityAvatar("Jordan Lee", null, { role: "primary_contact" });
        expect(avatar.role).toBe("primary_contact");
        expect(inferAvatarRoleFromSectionKey("primary_contact")).toBe("primary_contact");
    });

    it("maps Other Parent / Guardian to Bend Pine role", () => {
        const avatar = resolveIdentityAvatar("Kristi Lee", null, { role: "other_parent_guardian" });
        expect(avatar.role).toBe("other_parent_guardian");
    });

    it("uses deterministic record-id palette for children (no gender rule)", () => {
        const a = resolveIdentityAvatar("Lennon", null, { role: "child", recordId: "child-1" });
        const b = resolveIdentityAvatar("Lennon", null, { role: "child", recordId: "child-1" });
        const c = resolveIdentityAvatar("Alex", null, { role: "child", recordId: "child-2" });
        expect(a.tone).toBe(b.tone);
        expect(a.role).toBe("child");
        expect(c.role).toBe("child");
    });

    it("contains no sex-attribute avatar coloring rule in resolver or cards", () => {
        const root = join(process.cwd());
        const files = [
            "lib/adminV2/runtime/focusPanel/focusPanelIdentityAvatar.ts",
            "components/admin/focusPanel/CardAvatar.tsx",
            "components/admin/focusPanel/cards/HouseholdCard.tsx",
            "components/admin/focusPanel/cards/ChildrenCard.tsx",
        ];
        for (const rel of files) {
            const src = readFileSync(join(root, rel), "utf8");
            expect(src).not.toMatch(/gender\s*===|avatarToneForGender|sex\s*===\s*["']male/i);
            expect(src.toLowerCase()).not.toMatch(/\bmale\b|\bfemale\b/);
        }
    });

    it("Builder VM and runtime share the same resolver + role inference", () => {
        const vm = readFileSync(
            join(process.cwd(), "lib/adminV2/runtime/focusPanel/identity/buildIdentityCardVM.ts"),
            "utf8",
        );
        expect(vm).toContain("inferAvatarRoleFromSectionKey");
        expect(vm).toContain('role: "child"');
    });
});
