// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
    addProcessingFolder,
    getProcessingFoldersSnapshot,
    reorderProcessingFolders,
    resetProcessingFolders,
} from "@/lib/pos/processingFolderStore";
import { sortFolders } from "@/lib/pos/processingFolderModel";

const ORG = "org-reorder-test";

const orderedIds = () => sortFolders(getProcessingFoldersSnapshot(ORG)).map((f) => f.id);

describe("reorderProcessingFolders (drag-and-drop)", () => {
    beforeEach(() => {
        window.localStorage.clear();
        resetProcessingFolders(ORG); // real default folder set (incl. system folders)
    });

    it("moves a custom folder past the block of system folders in one gesture", () => {
        addProcessingFolder({ label: "Custom Z", scopes: ["form", "category"] }, ORG);
        const before = orderedIds();
        expect(before[before.length - 1]).toBe("custom_z"); // starts last (max order)

        // Drag custom_z to the front of the whole sequence.
        reorderProcessingFolders(["custom_z", ...before.filter((id) => id !== "custom_z")], ORG);
        expect(orderedIds()[0]).toBe("custom_z");
    });

    it("reuses the same set of order slots (a pure permutation)", () => {
        const before = sortFolders(getProcessingFoldersSnapshot(ORG));
        const slots = before.map((f) => f.order).sort((a, b) => a - b);
        // Reverse the whole sequence.
        reorderProcessingFolders([...before].map((f) => f.id).reverse(), ORG);
        const after = sortFolders(getProcessingFoldersSnapshot(ORG));
        expect(after.map((f) => f.order).sort((a, b) => a - b)).toEqual(slots);
        expect(after[0]!.id).toBe(before[before.length - 1]!.id);
    });

    it("refuses a mismatched id set (no-op)", () => {
        const before = orderedIds();
        reorderProcessingFolders(["does-not-exist", before[0]!], ORG);
        expect(orderedIds()).toEqual(before);
    });
});
