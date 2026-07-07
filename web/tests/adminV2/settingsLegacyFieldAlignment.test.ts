/** @vitest-environment node */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST } from "@/lib/fields/customerMemberFieldRegistry";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

function readPage(relativePath: string): string {
    return readFileSync(`${repoRoot}/${relativePath}`, "utf8");
}

describe("settings legacy field alignment", () => {
    it("fields page uses Platform Configuration shell component", () => {
        const page = readPage("app/adminV2/settings/fields/page.tsx");
        expect(page).toContain("FieldsConfigurationPage");
        expect(page).not.toContain("ConfigurationPatternPlaceholder");
        expect(page).not.toContain("SettingsFieldsHubClient");
    });

    it("entity label aliases redirect to /settings/entities", () => {
        for (const path of [
            "app/adminV2/settings/entity-labels/page.tsx",
            "app/adminV2/settings/label-entities/page.tsx",
            "app/legacy-admin/system/entity-labels/page.tsx",
        ]) {
            const src = readPage(path);
            expect(src).toContain('redirect("/settings/entities")');
        }
    });

    it("legacy per-entity field routes redirect into /settings/fields", () => {
        expect(readPage("app/legacy-admin/system/person-fields/page.tsx")).toContain(
            'redirect("/settings/fields?entity=person")',
        );
        expect(readPage("app/legacy-admin/system/customer-fields/page.tsx")).toContain(
            'redirect("/settings/fields?entity=customer")',
        );
        expect(readPage("app/legacy-admin/system/opportunity-fields/page.tsx")).toContain(
            'redirect("/settings/fields?entity=opportunity")',
        );
    });

    it("legacy statuses and layouts redirect to modern configuration pages", () => {
        expect(readPage("app/legacy-admin/system/statuses/page.tsx")).toContain(
            'redirect("/settings/statuses")',
        );
        expect(readPage("app/legacy-admin/system/layouts/page.tsx")).toContain(
            'redirect("/settings/surfaces")',
        );
    });

    it("child gender exists in customer_member field registry", () => {
        const gender = CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST.find((entry) => entry.field_key === "gender");
        expect(gender).toBeDefined();
        expect(gender?.label).toBe("Gender");
        expect(gender?.config?.option_set_key).toBe("person_gender");
    });
});
