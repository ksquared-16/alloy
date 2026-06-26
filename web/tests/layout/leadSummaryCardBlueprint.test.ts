import { describe, expect, it } from "vitest";
import {
    applyLeadSummarySlotConfigs,
    defaultLeadSummarySlotConfigs,
    readLeadSummarySlotConfigs,
    seedLeadSummaryBlueprintLayoutDoc,
} from "@/lib/layout/cardBlueprint/leadSummaryCardBlueprint";

describe("leadSummaryCardBlueprint", () => {
    it("seeds lead summary section with default widget slots", () => {
        const doc = seedLeadSummaryBlueprintLayoutDoc();
        const section = doc.sections.find((s) => s.key === "lead_summary");
        expect(section).toBeTruthy();
        expect(section?.rows[0]?.columns.length).toBeGreaterThan(0);
    });

    it("round-trips slot configs through apply and read", () => {
        const doc = seedLeadSummaryBlueprintLayoutDoc();
        const slots = defaultLeadSummarySlotConfigs().map((slot) =>
            slot.key === "children_list" ? { ...slot, enabled: false } : slot,
        );
        const next = applyLeadSummarySlotConfigs(doc, slots);
        const read = readLeadSummarySlotConfigs(next);
        expect(read.find((s) => s.key === "children_list")?.enabled).toBe(false);
        expect(read.filter((s) => s.enabled).length).toBe(slots.filter((s) => s.enabled).length);
    });
});
