import { afterEach, describe, expect, it, vi } from "vitest";

import {
    coerceAdminV2VmDrawerRoute,
    resolveVmDrawerRuntimeRoute,
} from "@/lib/adminV2/viewModel/drawer/vmRuntime/vmDrawerRuntimeRoute";
import {
    shouldAllowColdOpenLoading,
    shouldHoldPriorDrawerContent,
} from "@/lib/adminV2/viewModel/drawer/drawerRuntimePhase";

describe("vmDrawerRuntimeRoute", () => {
    const prevKill = process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH;
    const prevVm = process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM;
    const prevPersonKill = process.env.NEXT_PUBLIC_ADMINV2_PERSON_DRAWER_VM_KILL_SWITCH;
    const prevChildKill = process.env.NEXT_PUBLIC_ADMINV2_CHILD_DRAWER_VM_KILL_SWITCH;

    afterEach(() => {
        process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH = prevKill;
        process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM = prevVm;
        process.env.NEXT_PUBLIC_ADMINV2_PERSON_DRAWER_VM_KILL_SWITCH = prevPersonKill;
        process.env.NEXT_PUBLIC_ADMINV2_CHILD_DRAWER_VM_KILL_SWITCH = prevChildKill;
        vi.unstubAllEnvs();
    });

    const adminV2Wu =
        "/adminV2/workspace/dept/3933ac47-077a-4de8-aaac-8aed48d80413/work-unit/a428520f-b6a1-4913-8209-2d45a9affcd9";

    it("routes adminV2 opportunities to opportunity runtime by default", () => {
        delete process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM;
        delete process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH;
        expect(
            resolveVmDrawerRuntimeRoute({ type: "opportunities", id: "opp-1" }, adminV2Wu)
        ).toBe("opportunity");
    });

    it("does not require NEXT_PUBLIC_ADMINV2_DRAWER_VM for opportunity VM route", () => {
        process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM = "0";
        delete process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH;
        expect(
            resolveVmDrawerRuntimeRoute({ type: "opportunities", id: "opp-1" }, adminV2Wu)
        ).toBe("opportunity");
    });

    it("keeps VM route when kill switch env is set (permanent cutover)", () => {
        delete process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM;
        process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH = "1";
        expect(
            resolveVmDrawerRuntimeRoute({ type: "opportunities", id: "opp-1" }, adminV2Wu)
        ).toBe("opportunity");
    });

    it("keeps legacy for non-adminV2 surfaces", () => {
        delete process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH;
        expect(
            resolveVmDrawerRuntimeRoute({ type: "opportunities", id: "opp-1" }, "/admin/legacy")
        ).toBe("legacy");
    });

    it("keeps legacy for non-VM entity types", () => {
        expect(
            resolveVmDrawerRuntimeRoute({ type: "jobs", id: "job-1" }, "/adminV2/workspace")
        ).toBe("legacy");
    });

    it("routes adminV2 persons to person runtime by default", () => {
        delete process.env.NEXT_PUBLIC_ADMINV2_PERSON_DRAWER_VM_KILL_SWITCH;
        expect(
            resolveVmDrawerRuntimeRoute(
                { type: "persons", id: "person-1", openSource: "opportunity_primary_contact" },
                adminV2Wu
            )
        ).toBe("person");
    });

    it("keeps persons on VM when person kill switch env is set (permanent cutover)", () => {
        vi.stubEnv("NEXT_PUBLIC_ADMINV2_PERSON_DRAWER_VM_KILL_SWITCH", "1");
        expect(
            resolveVmDrawerRuntimeRoute(
                { type: "persons", id: "person-1", openSource: "opportunity_primary_contact" },
                adminV2Wu
            )
        ).toBe("person");
    });

    it("routes adminV2 child inquiry to child runtime by default", () => {
        delete process.env.NEXT_PUBLIC_ADMINV2_CHILD_DRAWER_VM_KILL_SWITCH;
        expect(
            resolveVmDrawerRuntimeRoute(
                {
                    type: "persons",
                    id: "child-1",
                    openSource: "opportunity_inquiry_child",
                },
                adminV2Wu
            )
        ).toBe("child");
    });

    it("coerceAdminV2VmDrawerRoute keeps VM route when cutover is on", () => {
        delete process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH;
        expect(
            coerceAdminV2VmDrawerRoute(
                "legacy",
                { type: "opportunities", id: "opp-1" },
                adminV2Wu
            )
        ).toBe("opportunity");
    });

    it("coerceAdminV2VmDrawerRoute keeps VM route when kill switch env is set", () => {
        process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH = "1";
        expect(
            coerceAdminV2VmDrawerRoute(
                "legacy",
                { type: "opportunities", id: "opp-1" },
                adminV2Wu
            )
        ).toBe("opportunity");
    });
});

describe("VM drawer runtime wiring", () => {

    it("swap phases suppress full loading shell", () => {
        expect(shouldHoldPriorDrawerContent("swap_preparing")).toBe(true);
        expect(
            shouldAllowColdOpenLoading({ phase: "swap_preparing", hasVisibleDrawerContent: true })
        ).toBe(false);
    });

});
