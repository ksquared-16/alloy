import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.join(__dirname, "../../..");

function read(rel: string): string {
    return fs.readFileSync(path.join(root, rel), "utf8");
}

/**
 * EXPAND IS GONE, AND THIS IS THE RECORD OF IT.
 *
 * These assertions previously required the shared expand control, the provider and the
 * expanded z-order. Expand gave every operational workspace a SECOND chrome — a different
 * height cap, a different stacking order against the BOS command surface, a different
 * Escape meaning — that nothing outside the shell reasoned about, and it put a control in
 * the header rail whose label ("Expand Workspace") was the widest thing in the band.
 *
 * The assertions are inverted rather than deleted, so the removal stays enforced: a future
 * shell cannot quietly reintroduce a second layout of the same workspace.
 */
describe("Workspace chrome — one layout, one header line", () => {
    it("WorkspaceShell renders no expand control and no expanded state", () => {
        const shell = read("components/workspace/WorkspaceShell.tsx");
        expect(shell).not.toContain("WorkspaceExpandControl");
        expect(shell).not.toContain("data-workspace-expanded");
        // The module's own secondary actions reach the header unwrapped.
        expect(shell).toContain("secondaryActions={header.secondaryActions}");
    });

    it("the shared expand primitives no longer exist", () => {
        for (const rel of [
            "components/workspace/WorkspaceExpandControl.tsx",
            "components/workspace/WorkspaceExpandContext.tsx",
        ]) {
            expect(fs.existsSync(path.join(root, rel))).toBe(false);
        }
    });

    it("BosModalShell has one geometry, one z-order, and Escape closes", () => {
        const bos = read("app/adminV2/components/AdminV2WorkspaceBosModalShell.tsx");
        expect(bos).not.toContain("WorkspaceExpandProvider");
        expect(bos).not.toContain("data-workspace-expanded");
        expect(bos).not.toContain("ADMINV2_COMMAND_SURFACE_Z");
        expect(bos).toMatch(/Escape/);
    });

    /**
     * The header band is one line in every workspace. The rail never wraps and never
     * shrinks; the title truncates instead. Close carries its own `shrink-0` so the exit
     * cannot be compressed away.
     */
    it("the shared header rail cannot wrap onto a second control row", () => {
        const header = read("app/adminV2/components/OperationalModalHeader.tsx");
        expect(header).toContain("flex-nowrap");
        expect(header).toContain("whitespace-nowrap");
        expect(header).toMatch(/ml-auto flex shrink-0 flex-nowrap items-center gap-1\.5 whitespace-nowrap/);
        expect(header).toMatch(/inline-flex shrink-0 items-center gap-1 whitespace-nowrap/);
    });

    /**
     * The site filter is a select in that rail. The primitive's base `width: 100%` collapses
     * in a shrink-to-fit parent, so the header placement gets a content floor — shared, by
     * data attribute, so every workspace inherits it.
     */
    it("the site selector holds one line inside the header rail", () => {
        const css = read("components/workspace/alloySelect.css");
        expect(css).toContain('[data-operational-modal-header-actions="true"] .alloy-select');
        expect(css).toMatch(/min-width:\s*11rem/);
        expect(css).toMatch(/max-width:\s*18rem/);
        // The value still ellipsises past the ceiling rather than wrapping. `[\s\S]` rather
        // than the `s` flag: this file compiles under an ES2017 target.
        expect(css).toMatch(/\.alloy-select__value \{[\s\S]*?white-space: nowrap/);
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
