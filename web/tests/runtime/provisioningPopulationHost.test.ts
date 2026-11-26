import { describe, expect, it } from "vitest";
import {
    resolveProvisioningPopulationWorkUnitId,
    type SettlementLocators,
} from "@/lib/runtime/provisioning/settlementLocators";

/**
 * Staging defect: Waitlist shell + All/Tours pills showed count=1 / rows=0 because Settlement
 * counted on the New Leads host while Operational Commit projected the Waitlist population.
 */
describe("resolveProvisioningPopulationWorkUnitId", () => {
    const surface = "wu-waitlist";
    const host = "wu-lead";

    it("uses the active lens count host when Settlement resolved it (cross-host All/Tours)", () => {
        const settlement: SettlementLocators = {
            status: "resolved",
            workViewCountTargets: [
                { workViewId: "new_work_view_6", hostWorkUnitId: host, baseQueueKey: "lifecycle_lead" },
                { workViewId: "new_work_view_4", hostWorkUnitId: surface, baseQueueKey: "lifecycle_waitlist" },
            ],
            queueTotalTarget: {
                workViewId: "new_work_view_6",
                hostWorkUnitId: host,
                baseQueueKey: "lifecycle_lead",
            },
            rightRailTarget: { departmentId: "dept", workUnitId: surface },
        };
        expect(resolveProvisioningPopulationWorkUnitId({ surfaceWorkUnitId: surface, settlement })).toBe(host);
    });

    it("keeps the surface host when the active lens is counted there (Waitlist)", () => {
        const settlement: SettlementLocators = {
            status: "resolved",
            workViewCountTargets: [
                { workViewId: "new_work_view_4", hostWorkUnitId: surface, baseQueueKey: "lifecycle_waitlist" },
            ],
            queueTotalTarget: {
                workViewId: "new_work_view_4",
                hostWorkUnitId: surface,
                baseQueueKey: "lifecycle_waitlist",
            },
            rightRailTarget: null,
        };
        expect(resolveProvisioningPopulationWorkUnitId({ surfaceWorkUnitId: surface, settlement })).toBe(surface);
    });

    it("falls back to the surface when Settlement is unavailable", () => {
        expect(
            resolveProvisioningPopulationWorkUnitId({
                surfaceWorkUnitId: surface,
                settlement: {
                    status: "unavailable",
                    workViewCountTargets: [],
                    queueTotalTarget: null,
                    rightRailTarget: null,
                },
            }),
        ).toBe(surface);
    });
});
