/**
 * Commands route — internal capability diagnostics (not operator org configuration).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { adminSettingsSubpathHref } from "@/lib/admin/canonicalAdminRoutes";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Command capability diagnostics route", () => {
    it("resolves commands organization subpath to /organization/commands", () => {
        expect(adminSettingsSubpathHref("commands")).toBe("/organization/commands");
    });

    it("ships diagnostics shell — not organization configuration copy", () => {
        const page = read("app/adminV2/settings/organization/commands/page.tsx");
        expect(page).toContain("CommandsConfigurationPage");
        expect(page).toMatch(/diagnostics/i);
        expect(page).not.toContain("Organization Commands");
        const client = read("components/adminV2/settings/commands/CommandsConfigurationPage.tsx");
        expect(client).toContain("Command capability diagnostics");
        expect(client).toContain("settings-commands-page");
        expect(client).toContain("commands-diagnostics-banner");
        expect(client).toContain("commands-catalog-list");
        expect(client).not.toContain("Action Buttons");
        expect(client).not.toContain("commands-org-enabled-toggle");
        expect(client).not.toContain("Save label");
    });

    it("keeps detail API for inspection without editable org controls", () => {
        const client = read("components/adminV2/settings/commands/CommandsConfigurationPage.tsx");
        expect(client).toContain("/api/admin/commands/");
        expect(client).toContain("commands-process-usage");
        expect(client).toContain("commands-operational-exposure");
        expect(client).toContain("commands-safety");
    });

    it("rewrites diagnostics route and sends /settings/actions to developer CRUD", () => {
        const cfg = read("next.config.ts");
        expect(cfg).toContain('source: "/organization/commands"');
        expect(cfg).toContain('destination: "/adminV2/settings/organization/commands"');
        expect(cfg).toContain(
            '{ source: "/settings/actions", destination: "/adminV2/settings/actions", permanent: false }'
        );
        expect(cfg).not.toContain(
            '{ source: "/settings/actions", destination: "/organization/commands", permanent: false }'
        );
        expect(cfg).toContain('source: "/configuration/commands"');
    });
});
