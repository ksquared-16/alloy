import { describe, expect, it } from "vitest";

import {
    actionCompetesWithCurrentWorkCompletion,
    actionCompetesWithCurrentWorkOnRail,
    isManageOnlyRecordHeaderAction,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkActionSurfacePolicy";

describe("currentWorkActionSurfacePolicy", () => {
    it("treats legacy manage keys as administrative", () => {
        expect(isManageOnlyRecordHeaderAction("archive_lead")).toBe(true);
        expect(isManageOnlyRecordHeaderAction("schedule_tour")).toBe(false);
    });

    it("uses status_lifecycle category for completion competition (cross-domain)", () => {
        expect(actionCompetesWithCurrentWorkCompletion("close_lead")).toBe(true);
        expect(actionCompetesWithCurrentWorkCompletion("update_lead_status")).toBe(true);
        expect(actionCompetesWithCurrentWorkCompletion("schedule_tour")).toBe(false);
    });

    it("demotes communication and status_lifecycle from rail when Current Work owns completion", () => {
        expect(actionCompetesWithCurrentWorkOnRail("quick_message")).toBe(true);
        expect(actionCompetesWithCurrentWorkOnRail("close_lead")).toBe(true);
        expect(actionCompetesWithCurrentWorkOnRail("add_child")).toBe(false);
        expect(actionCompetesWithCurrentWorkOnRail("schedule_tour")).toBe(false);
    });

    it("includes legacy contact-attempt keys not yet in canonical catalog", () => {
        expect(actionCompetesWithCurrentWorkCompletion("contact_attempted")).toBe(true);
    });
});
