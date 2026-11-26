/** @vitest-environment node */

/**
 * Guard: Participation is NOT its own nav item in V1 — it's a compact process-definition card at the
 * top of the Stages pane. This inverts the earlier (wrong) direction where Participation was a
 * standalone nav section. It must never become a top-level nav item again.
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

describe("Participation lives in the Stages pane, not the nav", () => {
    it("is NOT a configuration process queue section, in no group", () => {
        expect(CONFIGURATION_PROCESS_QUEUE_SECTIONS as readonly string[]).not.toContain("participation");
        for (const group of CONFIGURATION_PROCESS_QUEUE_GROUPS) {
            expect(group.sections as readonly string[]).not.toContain("participation");
        }
    });

    it("the LIVE nav (BusinessProcessConfigurationNav) has no Participation item", () => {
        const nav = src("components/adminV2/settings/businessProcess/BusinessProcessConfigurationNav.tsx");
        expect(nav).not.toContain("participation:");
        expect(nav).not.toContain("business-process-nav-participation");
        expect(nav).not.toContain("BUSINESS_PROCESS_NAV_PARTICIPATION");
    });

    it("the board mounts the compact Participation card inside the Stages branch", () => {
        const board = src("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        // card mounted, standalone participation section removed
        expect(board).toContain("BusinessProcessParticipationCard");
        expect(board).not.toContain("BusinessProcessParticipationWorkspace");
        expect(board).not.toContain('processSection === "participation"');
        // the card component exists, is read-only, and locks stage inheritance as platform-managed
        const card = src("components/adminV2/settings/businessProcess/BusinessProcessParticipationCard.tsx");
        expect(card).toContain("participation-stage-behavior");
        expect(card).toContain("Platform managed");
        expect(card).not.toContain("participation-inherit-stage");
    });
});
