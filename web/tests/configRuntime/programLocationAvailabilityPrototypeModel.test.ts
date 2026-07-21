import { describe, expect, it, beforeEach } from "vitest";
import {
    applyPrototypeAvailability,
    buildPrototypePreview,
    isProgramLocationAvailabilityPrototype,
    resetProgramLocationAvailabilityPrototypeSession,
    resolvePrototypeLocationRows,
} from "@/lib/configRuntime/programLocationAvailabilityPrototypeModel";

describe("programLocationAvailabilityPrototypeModel", () => {
    beforeEach(() => {
        resetProgramLocationAvailabilityPrototypeSession();
    });

    it("keeps Stage 1 in prototype mode", () => {
        expect(isProgramLocationAvailabilityPrototype()).toBe(true);
    });

    it("builds searchable multi-location preview with blocked and local rows", () => {
        const locations = Array.from({ length: 35 }, (_, index) => ({
            id: `loc-${index}`,
            label: `Campus ${index + 1}`,
        }));
        const rows = resolvePrototypeLocationRows({
            locations,
            programId: "prog-1",
            alreadyAssociatedIds: new Set(["loc-1", "loc-2"]),
            locallyConfiguredIds: new Set(["loc-2"]),
        });
        const selected = new Set(rows.filter((row) => row.status !== "blocked").map((row) => row.id));
        // Force-include a blocked row in selection for preview accounting
        const blocked = rows.find((row) => row.status === "blocked");
        if (blocked) selected.add(blocked.id);

        const preview = buildPrototypePreview({
            programLabel: "Summer Camp",
            rows,
            selectedIds: selected,
        });

        expect(preview.confirmationCopy).toContain("Summer Camp will be made available");
        expect(preview.unchangedLocal.length).toBeGreaterThanOrEqual(1);
        expect(preview.newAssociations.length).toBeGreaterThan(0);
        if (blocked) {
            expect(preview.blocked.some((row) => row.id === blocked.id)).toBe(true);
        }
    });

    it("applies without production mutation and is idempotent in session", () => {
        const locations = [
            { id: "north", label: "North" },
            { id: "south", label: "South" },
        ];
        const rows = resolvePrototypeLocationRows({
            locations,
            programId: "prog-summer",
            alreadyAssociatedIds: new Set(),
        });
        const first = applyPrototypeAvailability({
            programId: "prog-summer",
            programLabel: "Summer Camp",
            createdProgram: false,
            rows,
            selectedIds: new Set(["north", "south"]),
        });
        expect(first.status).toBe("committed");
        expect(first.associatedLocationIds).toEqual(["north", "south"]);
        expect(first.successCopy).toContain("available at 2 Locations");

        const rowsAfter = resolvePrototypeLocationRows({
            locations,
            programId: "prog-summer",
            alreadyAssociatedIds: new Set(),
        });
        expect(rowsAfter.every((row) => row.status.startsWith("already_associated"))).toBe(true);

        const second = applyPrototypeAvailability({
            programId: "prog-summer",
            programLabel: "Summer Camp",
            createdProgram: false,
            rows: rowsAfter,
            selectedIds: new Set(["north", "south"]),
        });
        expect(second.associatedLocationIds).toEqual(["north", "south"]);
        expect(second.status).toBe("committed");
    });
});
