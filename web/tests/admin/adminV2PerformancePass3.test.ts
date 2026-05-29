import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
    adminV2BootstrapBreakdownEnabled,
    logDeptBootstrapBreakdown,
    logDrawerComposedBreakdown,
    logWorkUnitBootstrapBreakdown,
} from "@/lib/perf/adminV2BootstrapBreakdown";
import {
    attachBootstrapServerPerf,
    peelBootstrapServerPerf,
} from "@/lib/workspace/bootstrapServerPerfEnvelope";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("AdminV2 performance pass 3 — bootstrap breakdown instrumentation", () => {
    it("strips __server_perf in production attach helper", () => {
        const prev = process.env.NODE_ENV;
        process.env.NODE_ENV = "production";
        try {
            const out = attachBootstrapServerPerf({ ok: true }, { route_gate_ms: 12 });
            expect(out).toEqual({ ok: true });
            expect("__server_perf" in out).toBe(false);
        } finally {
            process.env.NODE_ENV = prev;
        }
    });

    it("peels __server_perf for client breakdown logging", () => {
        const body = attachBootstrapServerPerf(
            { department: { id: "d1" } },
            { route_gate_ms: 5, loader_ms: 100, phases: { dept_fetch_ms: 40 } }
        );
        const { payload, serverPerf } = peelBootstrapServerPerf(body);
        expect(payload).toEqual({ department: { id: "d1" } });
        expect(serverPerf?.route_gate_ms).toBe(5);
        expect(serverPerf?.loader_ms).toBe(100);
    });

    it("breakdown helpers are no-ops in production", () => {
        const prev = process.env.NODE_ENV;
        process.env.NODE_ENV = "production";
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        try {
            expect(adminV2BootstrapBreakdownEnabled()).toBe(false);
            logWorkUnitBootstrapBreakdown({ departmentId: "d", workUnitId: "w" });
            logDeptBootstrapBreakdown({ departmentId: "d" });
            logDrawerComposedBreakdown({
                opportunityId: "o",
                bootstrap_ms: 1,
                drawer_primary_ms: 1,
                header_actions_ms: 1,
                anti_flicker_ms: 0,
                wait_for_composed_ms: 3,
                prefetch_hit: false,
                bootstrap_warm: false,
                primary_warm: false,
            });
            expect(warn).not.toHaveBeenCalled();
        } finally {
            warn.mockRestore();
            process.env.NODE_ENV = prev;
        }
    });

    it("WU page logs bootstrap breakdown after operational-bootstrap apply", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain("logWorkUnitBootstrapBreakdown");
        expect(page).toContain("peelBootstrapServerPerf");
        expect(page).toContain("enrollmentActionsSettledRef");
    });

    it("dept page logs bootstrap breakdown and guards duplicate KPI fetch", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        expect(page).toContain("logDeptBootstrapBreakdown");
        expect(page).toContain("logAdminV2DuplicateFetchSuppressed");
        expect(page).toMatch(/deptCommit && !b\.kpi_placements/);
    });

    it("drawer coordinator emits composed breakdown on commit", () => {
        const perf = read("lib/perf/adminV2DrawerPerf.ts");
        const breakdown = read("lib/perf/adminV2BootstrapBreakdown.ts");
        expect(perf).toContain("logDrawerComposedBreakdown");
        expect(breakdown).toContain("[perf.drawer.composed.breakdown]");
    });

    it("operational-bootstrap routes attach server perf envelope in dev", () => {
        const wuRoute = read("app/api/admin/work-units/[id]/operational-bootstrap/route.ts");
        const deptRoute = read("app/api/admin/departments/[departmentId]/operational-bootstrap/route.ts");
        expect(wuRoute).toContain("attachBootstrapServerPerf");
        expect(deptRoute).toContain("attachBootstrapServerPerf");
    });

    it("WU deferred supplement skips right rail when bootstrap settled enrollment rail", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain("!enrollmentActionsSettledRef.current");
        expect(page).toContain("bootstrap_hydrated_enrollment_rail");
    });
});
