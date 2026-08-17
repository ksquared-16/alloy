import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.join(__dirname, "../../..");

function read(rel: string): string {
    return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Workspace expand + BOS stacking", () => {
    it("WorkspaceShell uses shared expand control (not Assignment-only CSS)", () => {
        const shell = read("components/workspace/WorkspaceShell.tsx");
        expect(shell).toContain("WorkspaceExpandControl");
        expect(shell).toContain("data-workspace-expanded");
    });

    it("BosModalShell owns expand state and keeps BOS above expanded workspace", () => {
        const bos = read("app/adminV2/components/AdminV2WorkspaceBosModalShell.tsx");
        expect(bos).toContain("WorkspaceExpandProvider");
        expect(bos).toContain("data-workspace-expanded");
        expect(bos).toContain("ADMINV2_COMMAND_SURFACE_Z");
        expect(bos).toMatch(/Escape/);
    });

    it("Operations / Processing / Communications / Work Items share BosModalShell", () => {
        for (const rel of [
            "app/adminV2/components/OperationsModal.tsx",
            "app/adminV2/processing/ProcessingModal.tsx",
            "app/adminV2/components/InboxModal.tsx",
            "app/adminV2/components/MyTasksModal.tsx",
        ]) {
            expect(read(rel)).toContain("AdminV2WorkspaceBosModalShell");
        }
    });
});

describe("Operations Studio runtime", () => {
    /**
     * Studio loads ON DEMAND, and this replaces the opposite assertion.
     *
     * The Assignments workspace preloaded Studio as part of a site-wide bootstrap so entering Studio
     * never cold-started — correct for a workspace whose whole purpose was the ledger and its
     * configuration. Operations is not that workspace: WORK is where an operator lands and by far
     * where they stay, and paying four configuration reads on every Roster open to make an
     * occasional Studio visit faster is the wrong trade.
     *
     * So the invariant inverted deliberately, and the test says so rather than being deleted —
     * a removed assertion would leave no record that the behaviour was chosen.
     */
    it("loads configuration when Studio is entered, not on every Operations open", () => {
        const studio = read("components/adminV2/operations/OperationsStudio.tsx");
        expect(studio).toContain("/api/admin/assignment-types");
        expect(studio).toContain("view=studio_config");
        expect(studio).toContain("schedule-patterns");
        expect(studio).toContain("view=calculations");
        // Mounted only in Studio mode — the gate that makes "on demand" true.
        const ws = read("components/adminV2/roster/RosterWorkspace.tsx");
        expect(ws).toContain('mode === "studio" ? (');
        expect(ws).toContain("<OperationsStudio");
    });

    /**
     * Patterns remain SHARED with Locations → Schedule. Placement moved; ownership did not.
     */
    it("reads patterns from the shared endpoint, with no Operations-specific store", () => {
        const studio = read("components/adminV2/operations/OperationsStudio.tsx");
        expect(studio).toContain("/api/admin/schedule-patterns");
        expect(studio).toContain("mapRawPattern");
    });

    it("Assignment Categories consume snapshot operationalRooms", () => {
        const studio = read("components/adminV2/scheduling/screens/SchedulingStudio.tsx");
        expect(studio).toContain("operationalRooms={editorConfig.operationalRooms}");
        const panel = read("components/adminV2/scheduling/screens/AssignmentTypesStudioPanel.tsx");
        expect(panel).toContain("if (operationalRooms)");
    });
});

describe("Room Board implicit daily/weekly scope", () => {
    it("does not render Daily/Weekly roster toggles", () => {
        const roster = read("components/adminV2/scheduling/screens/SchedulingRoster.tsx");
        expect(roster).not.toMatch(/Daily Roster/);
        expect(roster).not.toMatch(/Weekly Roster/);
        expect(roster).toContain('data-room-week-header');
        expect(roster).toContain('data-room-day-header');
        expect(roster).toContain('scope: "daily" | "weekly"');
    });
});

describe("Pattern canonical source", () => {
    it("Documents Locations and Studio share schedule_patterns via the same API", () => {
        const patterns = read("components/adminV2/scheduling/screens/SchedulingPatterns.tsx");
        expect(patterns).toContain("/api/admin/schedule-patterns");
        expect(patterns).toContain("Canonical `schedule_patterns`");
        const locations = read(
            "components/adminV2/settings/locations/LocationScheduleTemplateDetailPanel.tsx",
        );
        expect(locations).toContain("patchSchedulePattern");
        expect(locations).toContain("data-testid=\"locations-schedule-save\"");
        expect(locations).toContain("data-locations-schedule-header-actions");
        expect(locations).toContain("Save schedule");
    });
});

describe("Roster report future seam", () => {
    it("documents extension point without a coming-soon UI action", () => {
        const panel = read("components/adminV2/scheduling/screens/AssignmentRosterPanel.tsx");
        expect(panel).not.toMatch(/coming soon/i);
        expect(panel).not.toMatch(/Generate Roster Report/i);
        // Extension seam: same projection subjects power future report command.
        expect(panel).toContain("AssignmentRosterSubject");
    });
});
