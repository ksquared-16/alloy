/**
 * P7/P8 — Commands product route shell and Action Buttons transition.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { adminSettingsSubpathHref } from "@/lib/admin/canonicalAdminRoutes";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Organization Commands route foundation", () => {
    it("resolves commands organization subpath to /organization/commands", () => {
        expect(adminSettingsSubpathHref("commands")).toBe("/organization/commands");
    });

    it("ships /organization/commands page shell with Commands vocabulary", () => {
        const page = read("app/adminV2/settings/organization/commands/page.tsx");
        expect(page).toContain("CommandsConfigurationPage");
        expect(page).toContain("Organization Commands");
        const client = read("components/adminV2/settings/commands/CommandsConfigurationPage.tsx");
        expect(client).toContain('title="Commands"');
        expect(client).toContain("settings-commands-page");
        expect(client).toContain("commands-catalog-list");
        expect(client).not.toContain("Action buttons");
        expect(client).not.toContain("Action Buttons");
    });

    it("ships workspace tabs for availability, processes, variants, and safety", () => {
        const client = read("components/adminV2/settings/commands/CommandsConfigurationPage.tsx");
        expect(client).toContain('id: "availability"');
        expect(client).toContain('id: "processes"');
        expect(client).toContain('id: "variants"');
        expect(client).toContain('id: "safety"');
        expect(client).toContain("commands-tab-");
        expect(client).toContain("/api/admin/commands/");
    });

    it("rewrites /organization/commands and redirects Action Buttons + product alias", () => {
        const cfg = read("next.config.ts");
        expect(cfg).toContain('source: "/organization/commands"');
        expect(cfg).toContain('destination: "/adminV2/settings/organization/commands"');
        expect(cfg).toContain('source: "/settings/actions"');
        expect(cfg).toContain('destination: "/organization/commands"');
        expect(cfg).toContain('source: "/configuration/commands"');
    });
});
