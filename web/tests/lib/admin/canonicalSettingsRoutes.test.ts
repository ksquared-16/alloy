import { describe, expect, it } from "vitest";
import {
    adminSettingsSubpathHref,
    CANONICAL_ADMIN_CONFIG_LANDING,
    CANONICAL_SETTINGS_BASE,
    normalizeToCanonicalAdminPath,
    normalizeToCanonicalSettingsPath,
} from "@/lib/admin/canonicalAdminRoutes";
import { CONFIGURATION_WORKSPACE_DOMAINS } from "@/lib/adminV2/configurationWorkspaceDomains";

describe("canonical settings routes — Configuration Runtime Phase 2A", () => {
    it("uses /settings as configuration landing", () => {
        expect(CANONICAL_ADMIN_CONFIG_LANDING).toBe("/settings");
        expect(CANONICAL_SETTINGS_BASE).toBe("/settings");
    });

    it("builds product nav hrefs under /settings", () => {
        expect(adminSettingsSubpathHref("processes")).toBe("/settings/processes");
        expect(adminSettingsSubpathHref("business-processes")).toBe("/settings/business-processes");
        expect(adminSettingsSubpathHref("layouts")).toBe("/settings/layouts");
        expect(adminSettingsSubpathHref("")).toBe("/settings");
    });

    it("normalizes legacy /admin/settings paths to /settings", () => {
        expect(normalizeToCanonicalSettingsPath("/admin/settings/statuses")).toBe("/settings/statuses");
        expect(normalizeToCanonicalSettingsPath("/admin")).toBe("/settings");
        expect(normalizeToCanonicalAdminPath("/admin/settings/fields")).toBe("/settings/fields");
        expect(normalizeToCanonicalAdminPath("/adminV2/settings/layouts")).toBe("/settings/layouts");
    });

    it("configuration workspace domain links prefer /settings", () => {
        const hrefs = CONFIGURATION_WORKSPACE_DOMAINS.flatMap((d) => d.items.map((i) => i.href));
        expect(hrefs.every((h) => h.startsWith("/settings") || h.startsWith("/admin/forms") || h.startsWith("/admin/workflows"))).toBe(
            true,
        );
        expect(hrefs).toContain("/settings/processes");
        expect(hrefs).toContain("/settings/surfaces");
    });
});
