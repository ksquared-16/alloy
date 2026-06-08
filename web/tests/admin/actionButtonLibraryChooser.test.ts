import { describe, expect, it } from "vitest";

import { listAddableActionLibraryEntries } from "@/lib/admin/actions/actionButtonLibraryChooser";

describe("listAddableActionLibraryEntries", () => {
    it("returns only library actions present in catalog", () => {
        const items = listAddableActionLibraryEntries([
            { id: "d1", key: "quick_message" },
            { id: "d2", key: "ask_bos" },
            { id: "d3", key: "update_status_add_note" },
        ]);
        expect(items.map((i) => i.entry.key)).toEqual(["quick_message", "ask_bos", "update_status_add_note"]);
    });

    it("hides actions not in catalog (no Not available yet rows)", () => {
        const items = listAddableActionLibraryEntries([{ id: "d1", key: "quick_message" }]);
        expect(items.some((i) => i.entry.key === "schedule_tour")).toBe(false);
        expect(items).toHaveLength(1);
    });

    it("never includes placeholder keys from catalog", () => {
        const items = listAddableActionLibraryEntries([
            { id: "x", key: "send_message_placeholder" },
            { id: "d1", key: "quick_message" },
        ]);
        expect(items.map((i) => i.entry.key)).toEqual(["quick_message"]);
    });

    it("includes Ask BOS when definition is in catalog", () => {
        const items = listAddableActionLibraryEntries([
            { id: "d1", key: "ask_bos" },
            { id: "d2", key: "quick_message" },
            { id: "d3", key: "update_status_add_note" },
        ]);
        expect(items.some((i) => i.entry.key === "ask_bos")).toBe(true);
        expect(items.find((i) => i.entry.key === "ask_bos")?.entry.label).toBe("Ask BOS");
    });
});
