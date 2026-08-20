/** @vitest-environment node */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST } from "@/lib/fields/customerMemberFieldRegistry";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

function readPage(relativePath: string): string {
    return readFileSync(`${repoRoot}/${relativePath}`, "utf8");
}

function readConfig(): string {
    return readFileSync(`${repoRoot}/next.config.ts`, "utf8");
}

describe("settings legacy field alignment", () => {
    it("fields page redirects into the Data Model Fields category", () => {
        const page = readPage("app/adminV2/settings/fields/page.tsx");
        expect(page).toContain("dataModelSectionHref");
        expect(page).toContain('"fields"');
        expect(page).not.toContain("ConfigurationPatternPlaceholder");
        expect(page).not.toContain("SettingsFieldsHubClient");
    });

    it("entity label aliases redirect into Data Model Entities", () => {
        for (const path of [
            "app/adminV2/settings/entity-labels/page.tsx",
            "app/adminV2/settings/label-entities/page.tsx",
            "app/legacy-admin/system/entity-labels/page.tsx",
        ]) {
            const src = readPage(path);
            expect(src).toMatch(/redirect\("\/(settings\/entities|organization\/data-model)/);
        }
        expect(readConfig()).toContain("/organization/data-model?section=entities");
    });

    it("legacy per-entity field routes redirect into Data Model Fields", () => {
        const config = readConfig();
        expect(config).toContain("/organization/data-model?section=fields&entity=person");
        expect(config).toContain("/organization/data-model?section=fields&entity=customer");
        expect(config).toContain("/organization/data-model?section=fields&entity=opportunity");
    });

    it("legacy statuses and layouts redirect to modern configuration pages", () => {
        expect(readPage("app/legacy-admin/system/statuses/page.tsx")).toContain(
            'redirect("/settings/statuses")',
        );
        expect(readPage("app/legacy-admin/system/layouts/page.tsx")).toContain(
            'redirect("/settings/surfaces")',
        );
        expect(readConfig()).toContain("/organization/data-model?section=statuses");
    });

    it("child gender exists in customer_member field registry", () => {
        const gender = CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST.find((entry) => entry.field_key === "gender");
        expect(gender).toBeDefined();
        expect(gender?.label).toBe("Gender");
        expect(gender?.config?.option_set_key).toBe("person_gender");
    });
});

describe("settings legacy closeout", () => {
    it("priority hybrid pages use Platform Configuration shell, not rollout placeholders", () => {
        for (const [path, component] of [
            // IA-8: one renderer for the Access workspace. `/settings/users-roles` redirects here.
            ["app/adminV2/settings/organization/access/page.tsx", "UsersRolesConfigurationPage"],
            ["app/adminV2/settings/organization/communications/page.tsx", "OrganizationCommunicationsPage"],
            ["app/adminV2/settings/entities/page.tsx", "dataModelSectionHref"],
            ["app/adminV2/settings/actions/page.tsx", "SettingsConfigurationSurfaceShell"],
        ] as const) {
            const src = readPage(path);
            expect(src).toContain(component);
            expect(src).not.toContain("ConfigurationPatternPlaceholder");
        }
    });

    it("superseded legacy-admin system routes redirect to Platform Configuration", () => {
        // `access-control` and `roles` are absent by design, not oversight: W-59 deleted those two
        // page.tsx files with the surfaces behind them, and their redirect moved into
        // `next.config.ts`, which Next evaluates BEFORE the filesystem. The destination an operator
        // reaches is unchanged and is asserted in the browser
        // (`certification/playwright/access-role-surface-reachability.cert.spec.ts`) and over the
        // redirect table (`tests/access/roleEditorSingleSurface.test.ts`). A page-level redirect is
        // one mechanism for this invariant, not the invariant itself.
        const redirects: Array<[string, string]> = [
            ["app/legacy-admin/system/page.tsx", 'redirect("/settings")'],
            ["app/legacy-admin/system/departments/page.tsx", 'redirect("/settings/departments")'],
            ["app/legacy-admin/system/work-units/page.tsx", 'redirect("/settings/work-units")'],
            ["app/legacy-admin/system/pipelines/page.tsx", 'redirect("/settings/processes")'],
            ["app/legacy-admin/system/customer-person-roles/page.tsx", 'redirect("/settings/relationships'],
            ["app/legacy-admin/system/person-relationship-types/page.tsx", 'redirect("/settings/relationships?tab=person-relationships")'],
        ];
        for (const [path, target] of redirects) {
            expect(readPage(path)).toContain(target);
        }
    });

    it("diagnostic legacy routes declare canonical destination banners", () => {
        for (const path of [
            "app/legacy-admin/system/db-relationships/page.tsx",
            "app/legacy-admin/system/payouts/page.tsx",
            "app/legacy-admin/system/verticals-industries/page.tsx",
            "app/adminV2/settings/work-units/page.tsx",
            "app/adminV2/settings/layouts/effective/page.tsx",
        ]) {
            expect(readPage(path)).toContain("SettingsDiagnosticSurfaceBanner");
        }
    });

    it("next.config redirects legacy admin and /admin/system aliases to settings", () => {
        const config = readConfig();
        expect(config).toContain('source: "/legacy-admin/system/access-control"');
        expect(config).toContain('destination: "/organization/access"');
        expect(config).toContain('source: "/admin/system/person-fields"');
        expect(config).toContain('destination: "/organization/data-model?section=fields&entity=person"');
        expect(config).toContain('source: "/legacy-admin/system/pipelines"');
        expect(config).toContain('destination: "/organization/processes"');
    });

    it("legacy admin layout points data model links at /settings", () => {
        const layout = readPage("components/admin/AdminLayout.tsx");
        expect(layout).toContain('href: "/settings/fields?entity=person"');
        expect(layout).toContain('href: "/settings/users-roles"');
        expect(layout).not.toContain('href: "/legacy-admin/system/person-fields"');
        expect(layout).not.toContain('href: "/legacy-admin/system/access-control"');
    });
});
