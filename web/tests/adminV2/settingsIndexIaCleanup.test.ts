import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CONFIGURATION_WORKSPACE_DOMAINS } from "@/lib/adminV2/configurationWorkspaceDomains";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Settings index IA — Configuration Runtime domains", () => {
    it("/settings renders configuration hub tiles in Configuration Mode", () => {
        const page = read("app/adminV2/settings/page.tsx");
        expect(page).toContain("SettingsConfigurationHub");
        expect(page).not.toContain("SettingsIndexRedirect");
        const domains = CONFIGURATION_WORKSPACE_DOMAINS.map((d) => d.label);
        expect(domains).toContain("Organization");
        expect(domains).toContain("Operations");
        expect(domains).toContain("Experience");
    });

    it("Processes tile lives under Operations with editable mode", () => {
        const operations = CONFIGURATION_WORKSPACE_DOMAINS.find((d) => d.id === "operations");
        const processes = operations?.items.find((i) => i.href === "/settings/processes");
        expect(processes?.label).toBe("Processes");
        expect(processes?.emphasis).toBe(true);
    });

    it("Surfaces tile lives under Experience as Layouts", () => {
        const experience = CONFIGURATION_WORKSPACE_DOMAINS.find((d) => d.id === "experience");
        expect(experience?.items.some((i) => i.href === "/settings/surfaces" && i.label === "Surfaces")).toBe(true);
    });

    it("journey guide links to Processes not Business Processes", () => {
        const guide = read("components/adminV2/settings/ConfigurationJourneyGuide.tsx");
        expect(guide).toContain("Processes");
        expect(guide).not.toContain("Business Processes");
    });
});
