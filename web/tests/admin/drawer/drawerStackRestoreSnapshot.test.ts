import { describe, expect, it } from "vitest";
import {
    peekDrawerStackRestoreSnapshot,
    putDrawerStackRestoreSnapshot,
    __clearDrawerStackRestoreSnapshotsForTests,
} from "@/lib/admin/drawer/drawerStackRestoreSnapshot";

describe("drawerStackRestoreSnapshot", () => {
    it("stores and retrieves opportunity shell snapshot", () => {
        __clearDrawerStackRestoreSnapshotsForTests();
        putDrawerStackRestoreSnapshot("opportunities", "opp-1", {
            drawerTab: "related",
            opportunityBootstrapAppliedId: "opp-1",
            opportunityDrawerBelowFoldRevealed: true,
            opportunityDrawerSecondaryReady: true,
            opportunityDrawerEnrichmentHeld: false,
            opportunityDrawerFirstPaintPreloaded: true,
        });
        const shell = peekDrawerStackRestoreSnapshot("opportunities", "opp-1");
        expect(shell?.drawerTab).toBe("related");
        expect(shell?.opportunityDrawerBelowFoldRevealed).toBe(true);
    });
});
