import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    isSimulationDepartmentRow,
    PROTECTED_DEPARTMENT_KEYS,
    simulationLifecycleDisplayName,
    SIMULATION_DEPARTMENT_NAME_PREFIX,
} from "@/lib/lifecycle/lifecycleSimulationMarkers";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("lifecycleSimulationMarkers", () => {
    it("never marks protected platform departments as simulation", () => {
        for (const key of PROTECTED_DEPARTMENT_KEYS) {
            expect(isSimulationDepartmentRow({ key, name: key })).toBe(false);
        }
    });

    it("detects E2E and pre-fix simulation names", () => {
        expect(isSimulationDepartmentRow({ key: "e2e_admissions_ab12", name: "E2E Admissions (pre-fix sim)" })).toBe(
            true
        );
        expect(isSimulationDepartmentRow({ key: "foo", name: "Verify Lifecycle abc1" })).toBe(true);
    });

    it("prefixes simulation display names", () => {
        expect(simulationLifecycleDisplayName("E2E Admissions")).toBe(
            `${SIMULATION_DEPARTMENT_NAME_PREFIX}E2E Admissions`
        );
    });
});

describe("simulation script guardrails", () => {
    it("simulate script requires ALLOW_SIMULATION_WRITES", () => {
        expect(read("scripts/simulatePreFixLifecycleE2E.ts")).toContain("requireSimulationWrites");
        expect(read("scripts/simulatePreFixLifecycleE2E.ts")).toContain("SIMULATION_ORG_ID");
    });

    it("cleanup requires CONFIRM_SIMULATION_CLEANUP", () => {
        expect(read("scripts/cleanupLifecycleSimulationDepartments.ts")).toContain("CONFIRM_SIMULATION_CLEANUP");
        expect(read("scripts/cleanupLifecycleSimulationDepartments.ts")).toContain("isSimulationDepartmentRow");
    });

    it("real create uses canonical metadata not simulation names", () => {
        expect(read("lib/lifecycle/clientCreateLifecycleViaBuilder.ts")).toContain(
            "newBuilderOwnedDepartmentMetadata"
        );
        expect(read("lib/lifecycle/clientCreateLifecycleViaBuilder.ts")).not.toContain("E2E Admissions");
    });

    it("dev verify uses SIM prefix", () => {
        expect(read("components/adminV2/settings/lifecycle/LifecycleDevCreateVerifyButton.tsx")).toContain(
            "simulationLifecycleDisplayName"
        );
    });
});
