import { describe, expect, it } from "vitest";
import { isExperienceBuilderStudioActive, isExperienceBuilderStudioPath } from "@/lib/layout/experienceBuilderStudioMode";

describe("experienceBuilderStudioMode", () => {
    it("detects layouts settings paths", () => {
        expect(isExperienceBuilderStudioPath("/admin/settings/layouts")).toBe(true);
        expect(isExperienceBuilderStudioPath("/adminV2/settings/layouts")).toBe(true);
        expect(isExperienceBuilderStudioPath("/admin/settings/fields")).toBe(false);
    });

    it("activates studio for visual editor query", () => {
        const params = new URLSearchParams("editor=1&layout=abc");
        expect(isExperienceBuilderStudioActive("/admin/settings/layouts", params)).toBe(true);
    });

    it("does not activate studio for advanced or legacy builders", () => {
        const advanced = new URLSearchParams("editor=1&layout=abc&advanced=1");
        const legacy = new URLSearchParams("editor=1&layout=abc&legacy=1");
        expect(isExperienceBuilderStudioActive("/admin/settings/layouts", advanced)).toBe(false);
        expect(isExperienceBuilderStudioActive("/admin/settings/layouts", legacy)).toBe(false);
    });
});
