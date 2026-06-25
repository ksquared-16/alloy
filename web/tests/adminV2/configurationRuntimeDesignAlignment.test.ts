import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    CONFIGURATION_RUNTIME_FORBIDDEN_SETTINGS_ROUTES,
    CONFIGURATION_RUNTIME_OWNERSHIP_COPY,
    CONFIGURATION_WORKSPACE_DOMAINS,
    CONFIGURATION_WORKSPACE_HUB_SUBTITLE,
} from "@/lib/adminV2/configurationWorkspaceDomains";

const root = resolve(__dirname, "../..");
const repoRoot = resolve(root, "..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

function readDoc(rel: string): string {
    return readFileSync(resolve(repoRoot, rel), "utf8");
}

function listSettingsRouteSegments(dir: string, base = ""): string[] {
    if (!existsSync(dir)) return [];
    const entries = readdirSync(dir, { withFileTypes: true });
    const routes: string[] = [];
    for (const entry of entries) {
        const segment = base ? `${base}/${entry.name}` : entry.name;
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            routes.push(...listSettingsRouteSegments(fullPath, segment));
        } else if (entry.name === "page.tsx") {
            routes.push(base.replace(/^app\/adminV2\/settings\/?/, "").replace(/\/$/, ""));
        }
    }
    return routes;
}

describe("configuration runtime design alignment — Phase 0/1", () => {
    it("registers design alignment doc with sprint dependencies and forbidden builders", () => {
        const doc = readDoc("docs/system/configuration-runtime-design-alignment.md");
        expect(doc).toContain("Design Alignment Spec");
        expect(doc).toContain("Fields & Field Formats");
        expect(doc).toContain("Statuses");
        expect(doc).toContain("Parallel sprint dependencies");
        expect(doc).toContain("No Queue Builder");
        expect(doc).toContain("No Focus Panel Builder");
        expect(doc).toContain("must not introduce fields or statuses outside");
    });

    it("ownership doctrine references configuration runtime and perspectives metadata", () => {
        const doc = readDoc("docs/system/configuration-ownership-doctrine.md");
        expect(doc).toContain("configuration-runtime-design-alignment.md");
        expect(doc).toContain("**perspectives**");
        expect(doc).toContain("Queue Builder");
        expect(doc).toContain("Focus Panel Builder");
        expect(doc).toContain("Fields & Field Formats");
    });

    it("settings hub copy reflects BP spine, Layouts presentation, and sprint dependencies", () => {
        expect(CONFIGURATION_WORKSPACE_HUB_SUBTITLE).toContain("Business Processes");
        expect(CONFIGURATION_WORKSPACE_HUB_SUBTITLE).toContain("Layouts");
        expect(CONFIGURATION_WORKSPACE_HUB_SUBTITLE).toContain("Fields");
        expect(CONFIGURATION_WORKSPACE_HUB_SUBTITLE).toContain("Statuses");

        const journey = read("components/adminV2/settings/ConfigurationJourneyGuide.tsx");
        expect(journey).toContain("perspectives");
        expect(journey).toContain("Experience Builder");
    });

    it("domain descriptions assign ownership to BP, Layouts, Fields, and Statuses", () => {
        const operations = CONFIGURATION_WORKSPACE_DOMAINS.find((d) => d.id === "operations");
        const experience = CONFIGURATION_WORKSPACE_DOMAINS.find((d) => d.id === "experience");
        const dataModel = CONFIGURATION_WORKSPACE_DOMAINS.find((d) => d.id === "data_model");

        expect(operations?.description).toContain("spine");
        expect(
            operations?.items.find((i) => i.href === "/settings/business-processes")?.description
        ).toContain("perspectives");

        const layouts = experience?.items.find((i) => i.href === "/settings/layouts");
        expect(layouts?.description).toContain("queue rows");
        expect(layouts?.description).toContain("Focus Panel");

        const fields = dataModel?.items.find((i) => i.href === "/settings/fields");
        expect(fields?.description).toBe(CONFIGURATION_RUNTIME_OWNERSHIP_COPY.fieldsCanonical);

        const statuses = operations?.items.find((i) => i.href === "/settings/statuses");
        expect(statuses?.description).toBe(CONFIGURATION_RUNTIME_OWNERSHIP_COPY.statusesCanonical);
    });

    it("does not register Queue Builder or Focus Panel Builder settings routes", () => {
        const settingsDir = resolve(root, "app/adminV2/settings");
        const routeSegments = listSettingsRouteSegments(settingsDir, "app/adminV2/settings");

        for (const forbidden of CONFIGURATION_RUNTIME_FORBIDDEN_SETTINGS_ROUTES) {
            const segment = forbidden.replace("/settings/", "");
            expect(routeSegments).not.toContain(segment);
        }

        expect(read("lib/adminV2/configurationWorkspaceDomains.ts")).toContain(
            "CONFIGURATION_RUNTIME_FORBIDDEN_SETTINGS_ROUTES"
        );
        expect(read("app/adminV2/settings/page.tsx")).not.toContain("queue-builder");
    });

    it("BP stage workspace owns perspectives metadata in Universal Card grid", () => {
        const workspace = read("components/adminV2/settings/lifecycle/LifecycleStageWorkspace.tsx");
        expect(workspace).toContain('id="perspectives"');
        expect(workspace).toContain("ConfigurationRuntimeUniversalCard");
        expect(read("components/adminV2/settings/lifecycle/LifecycleStagePerspectivesEditor.tsx")).toContain(
            "BUSINESS_PROCESS_LENS_OPERATORS_SEE",
        );
        expect(read("components/adminV2/settings/lifecycle/LifecycleStagePerspectivesEditor.tsx")).not.toContain(
            "perspectives-save-pending-note",
        );
    });

    it("perspectives ownership is registered as Business Process metadata not a separate product", () => {
        expect(CONFIGURATION_RUNTIME_OWNERSHIP_COPY.perspectivesMetadata).toContain("Business Process");
        expect(CONFIGURATION_RUNTIME_OWNERSHIP_COPY.perspectivesMetadata).not.toContain("Queue Builder");

        const workspaceDoc = readDoc("docs/system/configuration-workspace-v1-doctrine.md");
        expect(workspaceDoc).toContain("Perspectives");
        expect(workspaceDoc).toContain("not a separate settings product");
    });

    it("canonical settings routes use /settings not /admin/settings in nav config", () => {
        expect(read("lib/adminV2/configurationWorkspaceDomains.ts")).toContain('settings("business-processes")');
        expect(read("lib/admin/canonicalAdminRoutes.ts")).toContain('CANONICAL_SETTINGS_BASE = "/settings"');
    });

    it("Fields and Statuses remain canonical dependencies — not duplicated in Layouts copy", () => {
        expect(CONFIGURATION_RUNTIME_OWNERSHIP_COPY.layoutsPresentation).not.toContain("field catalog");
        expect(CONFIGURATION_RUNTIME_OWNERSHIP_COPY.businessProcessesSpine).not.toContain("field definitions");

        const layoutsGallery = read("app/adminV2/settings/layouts/LayoutsSettingsPageClient.tsx");
        expect(layoutsGallery).toContain("business-processes");
        expect(layoutsGallery).not.toContain("queue-builder");
    });
});
