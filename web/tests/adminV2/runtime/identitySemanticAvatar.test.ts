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

    it("maps Other Parent / Guardian to Alloy blue avatar tokens (same as primary contact)", () => {
        const avatar = resolveIdentityAvatar("Kristi Lee", null, { role: "other_parent_guardian" });
        const primary = resolveIdentityAvatar("Jordan Lee", null, { role: "primary_contact" });
        expect(avatar.role).toBe("other_parent_guardian");
        expect(avatar.tone).toBe(primary.tone);
        const css = readFileSync(join(process.cwd(), "app/adminV2/components/alloyOsRuntime.css"), "utf8");
        const primaryBlock = css.match(
            /\.alloy-os-card-avatar\[data-avatar-role="primary_contact"\][\s\S]*?\}/,
        )?.[0];
        const otherBlock = css.match(
            /\.alloy-os-card-avatar\[data-avatar-role="other_parent_guardian"\][\s\S]*?\}/,
        )?.[0];
        expect(primaryBlock).toBeTruthy();
        expect(otherBlock).toBeTruthy();
        expect(primaryBlock).toContain("--color-alloy-blue");
        expect(otherBlock).toContain("--color-alloy-blue");
        expect(otherBlock).not.toContain("--alloy-os-bend-pine");
        expect(otherBlock).not.toContain("#00a283");
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

    it("IdentityRecordSummary forwards semantic avatar role through IdentityAvatar", () => {
        const summary = readFileSync(
            join(process.cwd(), "components/admin/focusPanel/identity/IdentityRecordSummary.tsx"),
            "utf8",
        );
        const avatar = readFileSync(
            join(process.cwd(), "components/admin/focusPanel/identity/IdentityAvatar.tsx"),
            "utf8",
        );
        const cardAvatar = readFileSync(
            join(process.cwd(), "components/admin/focusPanel/CardAvatar.tsx"),
            "utf8",
        );
        expect(summary).toContain("IdentityAvatar");
        expect(summary).toContain("record.avatar?.role");
        expect(avatar).toContain("CardAvatar");
        expect(cardAvatar).toContain('data-avatar-role={avatar.role}');
        const css = readFileSync(join(process.cwd(), "app/adminV2/components/alloyOsRuntime.css"), "utf8");
        expect(css).toContain('[data-avatar-role="other_parent_guardian"]');
        expect(css).toContain('[data-avatar-tone][data-avatar-role="other_parent_guardian"]');
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
