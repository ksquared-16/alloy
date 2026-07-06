/** @vitest-environment node */

/**
 * Guard: Participation must be reachable through the REAL Process Builder nav. This regression
 * (Participation was added to a dead nav component, not the live one) must not recur.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
    CONFIGURATION_PROCESS_QUEUE_SECTIONS,
    CONFIGURATION_PROCESS_QUEUE_GROUPS,
} from "@/lib/adminV2/configurationModeDoctrine";

function src(rel: string): string {
    return readFileSync(fileURLToPath(new URL(`../../../${rel}`, import.meta.url)), "utf8");
}

describe("Participation is reachable in the live Process Builder nav", () => {
    it("is a configuration process queue section, in the Configure group", () => {
        expect(CONFIGURATION_PROCESS_QUEUE_SECTIONS).toContain("participation");
        const configure = CONFIGURATION_PROCESS_QUEUE_GROUPS.find((g) => g.label === "Configure");
        expect(configure?.sections as readonly string[]).toContain("participation");
    });

    it("the LIVE nav (BusinessProcessConfigurationNav) has a Participation icon + label", () => {
        // This is the component BusinessProcessConfigurationShell actually renders.
        const nav = src("components/adminV2/settings/businessProcess/BusinessProcessConfigurationNav.tsx");
        expect(nav).toContain("participation:");
        expect(nav).toContain("BUSINESS_PROCESS_NAV_PARTICIPATION");
    });

    it("the board renders the Participation workspace when the section is active", () => {
        const board = src("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain('processSection === "participation"');
        expect(board).toContain("BusinessProcessParticipationWorkspace");
        // and the shell wires nav selection to setProcessSection
        expect(board).toContain("onSelectSection={setProcessSection}");
    });
});
