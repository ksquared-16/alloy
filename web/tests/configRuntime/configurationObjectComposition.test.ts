import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Configuration Object Runtime — composition wiring", () => {
    it("exports workspace, overview, edit gate, and fixture harness without production nav mount", () => {
        const index = read("components/adminV2/settings/configurationRuntime/object/index.ts");
        const workspace = read(
            "components/adminV2/settings/configurationRuntime/object/ConfigurationObjectWorkspace.tsx",
        );
        const harness = read(
            "components/adminV2/settings/configurationRuntime/object/ConfigurationObjectRuntimeHarness.tsx",
        );
        const nav = read("lib/adminV2/configurationModeNav.ts");
        const programsPage = read("app/adminV2/settings/organization/programs/page.tsx");

        expect(index).toContain("ConfigurationObjectWorkspace");
        expect(index).toContain("ConfigurationObjectRuntimeHarness");
        expect(workspace).toContain("ConfigCollectionRail");
        expect(workspace).toContain("ConfigDetailRuntime");
        expect(workspace).toContain("ConfigObjectHeader");
        expect(workspace).toContain('data-configuration-object-runtime="true"');
        expect(harness).toContain("CONFIGURATION_OBJECT_HARNESS_DESCRIPTOR");
        expect(harness).toContain("configurationObjectEditBlocksNavigation");
        expect(harness).toContain("visibleConfigurationObjectConcerns");
        // Harness must not enter operator Configuration Mode nav.
        expect(nav).not.toContain("configuration-object-harness");
        expect(nav).not.toContain("/dev/configuration-object-harness");
        // Programs not adopted yet — still mounts ProgramsPublicationWorkspace.
        expect(programsPage).toContain("ProgramsPublicationWorkspace");
        expect(programsPage).not.toContain("ConfigurationObjectWorkspace");
    });

    it("keeps Programs adoption as a seam only", () => {
        const seam = read("lib/configRuntime/configurationObject/programsAdoptionSeam.ts");
        expect(seam).toContain("buildProgramsConfigurationObjectDescriptor");
        expect(seam).toContain("Does not wire ProgramsPublicationWorkspace");
        expect(seam).toContain("PROGRAMS_WORKSPACE_SIBLING_CHAPTERS");
    });
});
