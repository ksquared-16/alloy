import { describe, expect, it } from "vitest";
import {
    CONFIGURATION_ASSIGNMENT_RUNTIME_KEY,
    classifyOrganizationDomainPrimitive,
    wouldRequireSecondAssignmentEngine,
} from "@/lib/configPublication/configurationAssignmentRuntime";

describe("configurationAssignmentRuntime certification", () => {
    it("names the platform runtime key", () => {
        expect(CONFIGURATION_ASSIGNMENT_RUNTIME_KEY).toBe("configuration.assignment.runtime.v1");
    });

    it("keeps Programs on assignment and Tuition on value inheritance", () => {
        expect(classifyOrganizationDomainPrimitive("programs")).toBe("assignment_availability");
        expect(classifyOrganizationDomainPrimitive("tuition")).toBe("value_inheritance_override");
        expect(classifyOrganizationDomainPrimitive("access")).toBe("authorization_assignment");
        expect(classifyOrganizationDomainPrimitive("surfaces")).toBe("surface_process_binding");
    });

    it("flags Tuition as a second-assignment-engine smell if forced through Assignment", () => {
        expect(wouldRequireSecondAssignmentEngine("tuition")).toBe(true);
        expect(wouldRequireSecondAssignmentEngine("programs")).toBe(false);
    });
});
