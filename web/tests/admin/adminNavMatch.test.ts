import { describe, expect, it } from "vitest";
import { pathnameMatchesNavHref } from "@/lib/admin/adminNavMatch";

describe("pathnameMatchesNavHref", () => {
    it("matches exact paths", () => {
        expect(pathnameMatchesNavHref("/adminV2/forms", "/adminV2/forms")).toBe(true);
        expect(pathnameMatchesNavHref("/admin/forms", "/admin/forms")).toBe(true);
        expect(pathnameMatchesNavHref("/admin/dashboard", "/admin/dashboard")).toBe(true);
    });

    it("treats AdminV2 forms hub children as active", () => {
        expect(pathnameMatchesNavHref("/adminV2/forms", "/adminV2/forms/abc-123/submissions")).toBe(true);
        expect(pathnameMatchesNavHref("/adminV2/forms", "/adminV2/forms/not-a-uuid")).toBe(true);
    });

    it("treats legacy forms hub children as active", () => {
        expect(pathnameMatchesNavHref("/admin/forms", "/admin/forms/abc-123/submissions")).toBe(true);
        expect(pathnameMatchesNavHref("/admin/forms", "/admin/forms/not-a-uuid")).toBe(true);
    });

    it("does not match unrelated prefixes", () => {
        expect(pathnameMatchesNavHref("/adminV2/forms", "/admin/dashboard")).toBe(false);
        expect(pathnameMatchesNavHref("/adminV2/forms", "/admin/form")).toBe(false);
        expect(pathnameMatchesNavHref("/admin/forms", "/admin/dashboard")).toBe(false);
        expect(pathnameMatchesNavHref("/admin/forms", "/admin/form")).toBe(false);
    });
});
