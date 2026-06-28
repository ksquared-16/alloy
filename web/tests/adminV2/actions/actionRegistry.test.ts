import { describe, expect, it } from "vitest";
import {
    assertRegisteredActionKey,
    getRegisteredAction,
    hasRegisteredHandler,
    isKnownActionKey,
    listRegisteredActionKeys,
    resolveActionKey,
} from "@/lib/adminV2/actions/actionRegistry";
import {
    assertConfiguredActionKeys,
    partitionConfiguredActionKeys,
    validateConfiguredActionKey,
} from "@/lib/adminV2/actions/configValidation";

describe("action registry", () => {
    it("registers update_status and create_lead with executable handlers", () => {
        expect(hasRegisteredHandler("update_status")).toBe(true);
        expect(hasRegisteredHandler("create_lead")).toBe(true);
        expect(listRegisteredActionKeys().sort()).toContain("update_status");
        const action = getRegisteredAction("create_lead");
        expect(action?.actionKey).toBe("create_lead");
        expect(typeof action?.execute).toBe("function");
        expect(typeof action?.resolveEligibility).toBe("function");
        expect(typeof action?.buildPreview).toBe("function");
    });

    it("rejects unknown action keys", () => {
        expect(getRegisteredAction("not_a_real_action")).toBeNull();
        expect(hasRegisteredHandler("not_a_real_action")).toBe(false);
        expect(isKnownActionKey("not_a_real_action")).toBe(false);
        expect(resolveActionKey("not_a_real_action").status).toBe("unknown");
        expect(() => assertRegisteredActionKey("not_a_real_action")).toThrow(/Unknown action key/);
    });

    it("treats canonical catalog keys as known even without an executable handler", () => {
        // update_enrollment_status exists in the canonical metadata catalog.
        expect(isKnownActionKey("update_enrollment_status")).toBe(true);
        expect(resolveActionKey("update_enrollment_status").status).toBe("known_metadata_only");
    });

    it("maps a configured action to a registered handler", () => {
        const registered = validateConfiguredActionKey("update_status");
        expect(registered.ok).toBe(true);
        expect(registered.resolution).toBe("registered");
    });
});

describe("configured action validation", () => {
    it("flags unknown configured keys", () => {
        const result = validateConfiguredActionKey("totally_made_up");
        expect(result.ok).toBe(false);
        expect(result.resolution).toBe("unknown");
    });

    it("throws in dev/test when configured keys are unknown", () => {
        expect(() => assertConfiguredActionKeys(["update_status", "totally_made_up"])).toThrow(
            /unknown keys/
        );
    });

    it("does not throw when all configured keys are known", () => {
        expect(() => assertConfiguredActionKeys(["update_status", "create_lead"])).not.toThrow();
    });

    it("partitions configured keys into renderable vs disabled", () => {
        const { renderable, disabled } = partitionConfiguredActionKeys([
            "update_status",
            "create_lead",
            "totally_made_up",
        ]);
        expect(renderable.sort()).toEqual(["create_lead", "update_status"]);
        expect(disabled).toEqual(["totally_made_up"]);
    });
});
