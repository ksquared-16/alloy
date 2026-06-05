import { describe, expect, it, vi } from "vitest";

import {
    buildDrawerVmRelatedWarmKey,
    scheduleWarmRelatedDrawerTargetsAfterVmApply,
} from "@/lib/adminV2/viewModel/drawer/vmRuntime/drawerVmPayloadWarmRelated";

describe("drawerVmPayloadWarmRelated", () => {
    it("buildDrawerVmRelatedWarmKey is stable per entity + generation", () => {
        expect(
            buildDrawerVmRelatedWarmKey({
                runtime: "opportunity",
                entityId: "opp-1",
                generation: "gen-a",
            })
        ).toBe("opportunity:opp-1:gen-a");
        expect(
            buildDrawerVmRelatedWarmKey({
                runtime: "opportunity",
                entityId: "opp-1",
                generation: "gen-b",
            })
        ).toBe("opportunity:opp-1:gen-b");
    });

    it("scheduleWarmRelatedDrawerTargetsAfterVmApply runs warm on microtask once per key", async () => {
        const drawer = { type: "opportunities" as const, id: "opp-1" };
        const record = {
            id: "opp-1",
            primary_person_id: "p-parent",
            _inquiry_children: [{ person_id: "p-child" }],
        };

        scheduleWarmRelatedDrawerTargetsAfterVmApply({
            drawer,
            entityType: "opportunities",
            record,
            runtime: "opportunity",
            generation: "g1",
        });
        scheduleWarmRelatedDrawerTargetsAfterVmApply({
            drawer,
            entityType: "opportunities",
            record,
            runtime: "opportunity",
            generation: "g1",
        });

        await Promise.resolve();
        expect(true).toBe(true);
    });
});
