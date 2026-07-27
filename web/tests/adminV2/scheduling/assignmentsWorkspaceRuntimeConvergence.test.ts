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

    it("Scheduling / Processing / Communications / Work Items share BosModalShell", () => {
        for (const rel of [
            "app/adminV2/components/SchedulingModal.tsx",
            "app/adminV2/processing/ProcessingModal.tsx",
            "app/adminV2/components/InboxModal.tsx",
            "app/adminV2/components/MyTasksModal.tsx",
        ]) {
            expect(read(rel)).toContain("AdminV2WorkspaceBosModalShell");
        }
    });
});

describe("Assignments Workspace shared runtime", () => {
    it("preloads studio + work data in one site bootstrap (no Studio-only cold load)", () => {
        const ws = read("components/adminV2/scheduling/SchedulingWorkspace.tsx");
        expect(ws).toContain("coreSnapshotReady");
        expect(ws).toContain("siteBootstrapSeqRef");
        expect(ws).toContain("view=assignment_roster");
        expect(ws).toContain("view=studio_config");
        expect(ws).toContain("schedule-patterns");
        expect(ws).toContain("data-assignments-ws-timings");
        // Must not reload studio solely because mode flipped to studio when snapshot exists.
        expect(ws).toMatch(/Entering Studio no longer cold-loads/);
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
