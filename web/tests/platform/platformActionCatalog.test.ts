import { describe, expect, it } from "vitest";
import {
    getPlatformAction,
    listPlatformActions,
    isPlatformActionKey,
} from "@/lib/platform/actions/platformActionCatalog";

describe("getPlatformAction", () => {
    it("returns entry for known action keys", () => {
        expect(getPlatformAction("waitlist_child")).not.toBeNull();
        expect(getPlatformAction("enroll_child")).not.toBeNull();
        expect(getPlatformAction("close_lead")).not.toBeNull();
        expect(getPlatformAction("update_lead_status")).not.toBeNull();
        expect(getPlatformAction("update_child_enrollment_status")).not.toBeNull();
    });

    it("returns null for unknown keys", () => {
        expect(getPlatformAction("nonexistent_action")).toBeNull();
        expect(getPlatformAction("")).toBeNull();
    });

    it("assigns correct grain to OCM-grain actions", () => {
        expect(getPlatformAction("waitlist_child")?.grain).toBe("opportunity_customer_member");
        expect(getPlatformAction("enroll_child")?.grain).toBe("opportunity_customer_member");
        expect(getPlatformAction("update_child_enrollment_status")?.grain).toBe("opportunity_customer_member");
    });

    it("assigns correct grain to case-grain actions", () => {
        expect(getPlatformAction("close_lead")?.grain).toBe("opportunity");
        expect(getPlatformAction("update_lead_status")?.grain).toBe("opportunity");
    });

    it("sets runtimeCommandKey for semantic aliases", () => {
        expect(getPlatformAction("waitlist_child")?.runtimeCommandKey).toBe("waitlist_child");
        expect(getPlatformAction("close_lead")?.runtimeCommandKey).toBe("close_lead");
        expect(getPlatformAction("enroll_child")?.runtimeCommandKey).toBe("enroll_child");
    });
});

describe("listPlatformActions", () => {
    it("returns all actions when no filter", () => {
        expect(listPlatformActions().length).toBeGreaterThan(0);
    });

    it("filters by grain", () => {
        const ocmActions = listPlatformActions({ grain: "opportunity_customer_member" });
        expect(ocmActions.every((a) => a.grain === "opportunity_customer_member")).toBe(true);
        expect(ocmActions.length).toBeGreaterThan(0);
    });

    it("filters by category", () => {
        const statusActions = listPlatformActions({ category: "status_lifecycle" });
        expect(statusActions.every((a) => a.category === "status_lifecycle")).toBe(true);
    });
});

describe("isPlatformActionKey", () => {
    it("returns true for known keys", () => {
        expect(isPlatformActionKey("waitlist_child")).toBe(true);
        expect(isPlatformActionKey("close_lead")).toBe(true);
    });

    it("returns false for unknown keys", () => {
        expect(isPlatformActionKey("random_unknown")).toBe(false);
    });
});
