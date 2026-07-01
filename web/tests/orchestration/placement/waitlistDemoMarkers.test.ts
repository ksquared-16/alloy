import { describe, expect, it } from "vitest";
import { isWaitlistDemoMetadata, waitlistDemoMetadata, WAITLIST_DEMO_BATCH_KEY } from "@/lib/orchestration/placement/waitlistDemoMarkers";
import {
    WAITLIST_DEMO_SCENARIO_ORDER,
    WAITLIST_DEMO_SCENARIO_SEED_KEYS,
} from "@/lib/orchestration/placement/waitlistDemoScenarios";

describe("waitlistDemoMarkers", () => {
    it("tags metadata with demo_batch_key and demo_seed_package", () => {
        const meta = waitlistDemoMetadata("waitlist_demo_employee_parent");
        expect(meta.demo_batch_key).toBe(WAITLIST_DEMO_BATCH_KEY);
        expect(meta.demo_seed_package).toBe(WAITLIST_DEMO_BATCH_KEY);
        expect(meta.seed_key).toBe("waitlist_demo_employee_parent");
        expect(isWaitlistDemoMetadata(meta)).toBe(true);
    });

    it("matches either batch key field", () => {
        expect(isWaitlistDemoMetadata({ demo_batch_key: WAITLIST_DEMO_BATCH_KEY })).toBe(true);
        expect(isWaitlistDemoMetadata({ demo_seed_package: WAITLIST_DEMO_BATCH_KEY })).toBe(true);
        expect(isWaitlistDemoMetadata({ seed_key: "other" })).toBe(false);
    });
});

describe("waitlistDemoScenarios", () => {
    it("defines eight stable scenario seed keys", () => {
        expect(WAITLIST_DEMO_SCENARIO_ORDER).toHaveLength(8);
        for (const id of WAITLIST_DEMO_SCENARIO_ORDER) {
            expect(WAITLIST_DEMO_SCENARIO_SEED_KEYS[id]).toMatch(/^waitlist_demo_/);
        }
    });
});
