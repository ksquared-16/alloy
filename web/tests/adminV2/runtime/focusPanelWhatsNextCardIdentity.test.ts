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
        // The identity is now carried by its successor. Still exactly ONE catalog entry — that is
        // the invariant this suite guards, and it is unchanged by the rename.
        expect(matches[0]?.cardKey).toBe("business_process");
    });

    it("normalizes legacy stored keys and labels to canonical business_process", () => {
        // `current_work` joins the legacy spellings: the card identity is superseded, the Current
        // Work CONCEPT is not (it remains the data owner the successor consumes).
        expect(normalizeFocusPanelCardKey("current_work")).toBe("business_process");
        expect(normalizeFocusPanelCardKey("whats_next")).toBe("business_process");
        expect(normalizeFocusPanelCardKey("whats-next")).toBe("business_process");
        expect(normalizeFocusPanelCardKey("current-work")).toBe("business_process");
        expect(normalizeFocusPanelCardKey("Current Work")).toBe("business_process");
        expect(normalizeFocusPanelCardKey("What's Next")).toBe("business_process");
        expect(normalizeFocusPanelCardKey("unknown_card")).toBeNull();
    });

    it("builder label, search, and reset identity use What's Next", () => {
        expect(focusPanelCardCatalogLabel("current_work")).toBe("What's Next");
        expect(findFocusPanelCatalogEntryByQuery("Current Work")?.label).toBe("What's Next");
        expect(findFocusPanelCatalogEntryByQuery("What's Next")?.cardKey).toBe("business_process");
        expect(findFocusPanelCatalogEntryByQuery("whats_next")?.cardKey).toBe("business_process");
    });
});
