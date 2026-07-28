import { describe, expect, it } from "vitest";

import {
    FOCUS_PANEL_CARD_CATALOG,
    FOCUS_PANEL_WHATS_NEXT_CARD_KEY,
    FOCUS_PANEL_WHATS_NEXT_LABEL,
    findFocusPanelCatalogEntryByQuery,
    focusPanelCardCatalogLabel,
    normalizeFocusPanelCardKey,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardCatalog";

describe("Focus Panel What's Next card identity", () => {
    it("catalog has one authoritative What's Next entry (no Current Work duplicate)", () => {
        const matches = FOCUS_PANEL_CARD_CATALOG.filter(
            (e) =>
                e.cardKey === FOCUS_PANEL_WHATS_NEXT_CARD_KEY
                || e.label === "Current Work"
                || e.label === FOCUS_PANEL_WHATS_NEXT_LABEL,
        );
        expect(matches).toHaveLength(1);
        expect(matches[0]?.label).toBe(FOCUS_PANEL_WHATS_NEXT_LABEL);
        expect(matches[0]?.cardKey).toBe("current_work");
    });

    it("normalizes legacy stored keys and labels to canonical current_work", () => {
        expect(normalizeFocusPanelCardKey("current_work")).toBe("current_work");
        expect(normalizeFocusPanelCardKey("whats_next")).toBe("current_work");
        expect(normalizeFocusPanelCardKey("whats-next")).toBe("current_work");
        expect(normalizeFocusPanelCardKey("current-work")).toBe("current_work");
        expect(normalizeFocusPanelCardKey("Current Work")).toBe("current_work");
        expect(normalizeFocusPanelCardKey("What's Next")).toBe("current_work");
        expect(normalizeFocusPanelCardKey("unknown_card")).toBeNull();
    });

    it("builder label, search, and reset identity use What's Next", () => {
        expect(focusPanelCardCatalogLabel("current_work")).toBe("What's Next");
        expect(findFocusPanelCatalogEntryByQuery("Current Work")?.label).toBe("What's Next");
        expect(findFocusPanelCatalogEntryByQuery("What's Next")?.cardKey).toBe("current_work");
        expect(findFocusPanelCatalogEntryByQuery("whats_next")?.cardKey).toBe("current_work");
    });
});
