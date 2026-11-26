import { describe, expect, it } from "vitest";
import { pathnameMatchesNavHref } from "@/lib/admin/adminNavMatch";

describe("pathnameMatchesNavHref", () => {
    it("matches exact paths", () => {
        expect(pathnameMatchesNavHref("/adminV2/forms", "/adminV2/forms")).toBe(true);
        expect(pathnameMatchesNavHref("/admin/forms", "/admin/forms")).toBe(true);
        expect(pathnameMatchesNavHref("/admin/dashboard", "/admin/dashboard")).toBe(true);
    });

    // The standalone Forms hub was retired (Forms now live in the Digital Mailroom), so the
    // former "/admin/forms hub children stay active" behavior was intentionally removed.

    it("does not match unrelated prefixes", () => {
        expect(pathnameMatchesNavHref("/adminV2/forms", "/admin/dashboard")).toBe(false);
        expect(pathnameMatchesNavHref("/adminV2/forms", "/admin/form")).toBe(false);
        expect(pathnameMatchesNavHref("/admin/forms", "/admin/dashboard")).toBe(false);
        expect(pathnameMatchesNavHref("/admin/forms", "/admin/form")).toBe(false);
    });
});
