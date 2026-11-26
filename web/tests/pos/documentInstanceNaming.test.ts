import { describe, expect, it } from "vitest";
import {
    proposeImportDisplayName,
    proposeGeneratedFormName,
    resolveDisplayNameWithCollision,
} from "@/lib/pos/documentInstanceNaming";

describe("documentInstanceNaming", () => {
    it("appends deterministic instance suffix on collision", () => {
        expect(resolveDisplayNameWithCollision("Child Medical Examination Report — Noah Smith — 2026-07-10", [
            "Child Medical Examination Report — Noah Smith — 2026-07-10",
        ])).toBe("Child Medical Examination Report — Noah Smith — 2026-07-10 (2)");
    });

    it("proposes import display name with received fallback", () => {
        const name = proposeImportDisplayName({
            fileName: "MO500_3313.pdf",
            receivedAt: "2026-07-10T12:00:00.000Z",
            existingDisplayNames: [],
        });
        expect(name.length).toBeGreaterThan(0);
        expect(name.toLowerCase()).not.toContain("mo500_3313");
    });

    it("separates generated form name from source display name", () => {
        const source = "Child Medical Examination Report — Received 2026-07-10";
        expect(proposeGeneratedFormName(source)).toBe("Child Medical Examination Report");
    });
});
