import { describe, expect, it } from "vitest";
import {
    getOperationalIntent,
    intentsForCapability,
    isIntentExecutable,
    listOperationalIntents,
    resolveIntentDefaultCapability,
} from "@/lib/adminV2/actions/operationalIntent";

describe("operational intent layer", () => {
    it("separates human intent from technical capability", () => {
        const moveForward = getOperationalIntent("move_forward");
        expect(moveForward?.title).toBe("Move Forward");
        // The operator-facing intent resolves to a technical capability.
        expect(moveForward?.defaultCapability).toBe("update_status");
    });

    it("resolves an intent to its default capability", () => {
        expect(resolveIntentDefaultCapability("schedule_tour")).toBe("schedule_tour");
        expect(resolveIntentDefaultCapability("nope")).toBeNull();
    });

    it("models a fan-out intent (one intent → many capabilities)", () => {
        const enroll = getOperationalIntent("enroll_child");
        expect(enroll?.maturity).toBe("planned");
        expect(enroll?.supportedCapabilities.length).toBeGreaterThan(1);
        expect(enroll?.supportedCapabilities).toContain("assign_room");
        expect(enroll?.supportedCapabilities).toContain("create_contract");
    });

    it("reverse-maps a capability to the intents that use it", () => {
        const intents = intentsForCapability("update_status").map((i) => i.intentKey);
        expect(intents).toContain("update_status");
        expect(intents).toContain("move_forward");
    });

    it("marks current intents executable and planned intents not", () => {
        // confirm_tour, update_status, create_lead are registered capabilities.
        expect(isIntentExecutable("update_status")).toBe(true);
        expect(isIntentExecutable("confirm_tour")).toBe(true);
        // planned intents are modeled to validate the runtime, not executable yet.
        expect(isIntentExecutable("enroll_child")).toBe(false);
        expect(isIntentExecutable("generate_invoice")).toBe(false);
    });

    it("includes the validation set of current commands", () => {
        const current = listOperationalIntents().filter((i) => i.maturity === "current").map((i) => i.intentKey);
        for (const key of ["create_lead", "update_status", "schedule_tour", "confirm_tour", "send_message", "generate_document"]) {
            expect(current).toContain(key);
        }
    });
});
