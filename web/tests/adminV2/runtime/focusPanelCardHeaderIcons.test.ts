/**
 * Every Focus Panel card key resolves to a registered UniversalCardIcon.
 */

import { describe, expect, it } from "vitest";
import { FOCUS_PANEL_CARD_KEYS } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import {
    SYSTEM5_CARD_ICON,
    system5IconForCard,
} from "@/lib/adminV2/runtime/focusPanel/system5OperationalSurfaceSpec";
import { UNIVERSAL_CARD_ICON_BY_NAME } from "@/components/admin/focusPanel/UniversalCardIcon";

describe("Focus Panel card header icons", () => {
    it("maps every card key to a Lucide name registered in UniversalCardIcon", () => {
        for (const key of FOCUS_PANEL_CARD_KEYS) {
            const iconName = system5IconForCard(key);
            expect(iconName, key).toBeTruthy();
            expect(SYSTEM5_CARD_ICON[key], key).toBe(iconName);
            expect(UNIVERSAL_CARD_ICON_BY_NAME[iconName], `${key} → ${iconName}`).toBeTruthy();
        }
    });

    it("registers CalendarDays and Receipt used by Scheduling and Billing Preview", () => {
        expect(UNIVERSAL_CARD_ICON_BY_NAME.CalendarDays).toBeTruthy();
        expect(UNIVERSAL_CARD_ICON_BY_NAME.Receipt).toBeTruthy();
        expect(system5IconForCard("scheduling")).toBe("CalendarDays");
        expect(system5IconForCard("billing_preview")).toBe("Receipt");
    });
});
