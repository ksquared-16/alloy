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
    it("uses /organization as the configuration landing while retaining /settings subpaths", () => {
        expect(CANONICAL_ADMIN_CONFIG_LANDING).toBe("/organization");
        expect(CANONICAL_SETTINGS_BASE).toBe("/settings");
    });

    it("builds product nav hrefs — completed domains under /organization, others under /settings", () => {
        expect(adminSettingsSubpathHref("processes")).toBe("/organization/processes");
        expect(adminSettingsSubpathHref("business-processes")).toBe("/organization/processes");
        expect(adminSettingsSubpathHref("surfaces")).toBe("/organization/surfaces");
        expect(adminSettingsSubpathHref("layouts")).toBe("/settings/layouts");
        expect(adminSettingsSubpathHref("")).toBe("/organization");
        expect(adminSettingsSubpathHref("organization")).toBe("/organization");
    });

    it("normalizes legacy /admin/settings paths to /settings", () => {
        expect(normalizeToCanonicalSettingsPath("/admin/settings/statuses")).toBe("/settings/statuses");
        expect(normalizeToCanonicalSettingsPath("/admin")).toBe("/organization");
        expect(normalizeToCanonicalSettingsPath("/settings")).toBe("/organization");
        expect(normalizeToCanonicalSettingsPath("/settings/organization")).toBe("/organization");
        expect(normalizeToCanonicalAdminPath("/admin/settings/fields")).toBe("/settings/fields");
        expect(normalizeToCanonicalAdminPath("/adminV2/settings/layouts")).toBe("/settings/layouts");
    });

    it("normalizes organization product paths and rewrite destinations", () => {
        expect(normalizeToCanonicalSettingsPath("/settings/organization/processes")).toBe(
            "/organization/processes",
        );
        expect(normalizeToCanonicalSettingsPath("/organization/processes")).toBe(
            "/organization/processes",
        );
        expect(normalizeToCanonicalAdminPath("/adminV2/settings/organization/processes")).toBe(
            "/organization/processes",
        );
        expect(normalizeToCanonicalAdminPath("/organization/surfaces")).toBe("/organization/surfaces");
        expect(normalizeToCanonicalAdminPath("/organization/access")).toBe("/organization/access");
    });

    it("configuration workspace domain links prefer /settings or Organization product routes", () => {
        const hrefs = CONFIGURATION_WORKSPACE_DOMAINS.flatMap((d) => d.items.map((i) => i.href));
        expect(
            hrefs.every(
                (h) =>
                    h.startsWith("/settings")
                    || h.startsWith("/organization/")
                    || h.startsWith("/admin/forms")
                    || h.startsWith("/admin/workflows"),
            ),
        ).toBe(true);
        expect(hrefs).toContain("/organization/processes");
        expect(hrefs).toContain("/organization/surfaces");
        expect(hrefs).toContain("/organization/financials");
        expect(hrefs).not.toContain("/organization/programs");
    });
});
