import { describe, expect, it } from "vitest";
import { isCanonicalSettingsPath } from "@/lib/admin/canonicalAdminRoutes";

describe("canonical admin config landing", () => {
    it("treats /admin as settings/config shell route", () => {
        expect(isCanonicalSettingsPath("/admin")).toBe(true);
        expect(isCanonicalSettingsPath("/admin/settings/lifecycle")).toBe(true);
        expect(isCanonicalSettingsPath("/workspace")).toBe(false);
    });
});
