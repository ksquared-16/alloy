import { describe, expect, it } from "vitest";
import { pathnameMatchesNavHref } from "@/lib/admin/adminNavMatch";

describe("pathnameMatchesNavHref", () => {
    it("matches exact paths", () => {
        expect(pathnameMatchesNavHref("/admin/forms", "/admin/forms")).toBe(true);
        expect(pathnameMatchesNavHref("/admin/dashboard", "/admin/dashboard")).toBe(true);
    });

    it("treats forms hub children as active", () => {
        expect(pathnameMatchesNavHref("/admin/forms", "/admin/forms/abc-123/submissions")).toBe(true);
        expect(pathnameMatchesNavHref("/admin/forms", "/admin/forms/not-a-uuid")).toBe(true);
    });

    it("does not match unrelated prefixes", () => {
        expect(pathnameMatchesNavHref("/admin/forms", "/admin/dashboard")).toBe(false);
        expect(pathnameMatchesNavHref("/admin/forms", "/admin/form")).toBe(false);
    });
});
