import { describe, expect, it } from "vitest";

import {
    resolveDrill,
    resolveCalculationDrill,
    getDrillContract,
    DRILL_CONTRACTS,
    type WorkspaceQueueLocator,
} from "@/lib/analytics/runtime/drillResolver";
import { getOperationalCalculation } from "@/lib/analytics/calculations/registry";
import type { AnalyticsContext, DrillSelection } from "@/lib/analytics/runtime/types";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";

const OPEN_SCOPE: AdminAccessScopeDimensions = {
    departmentScope: "all",
    allowedDepartmentIds: null,
    siteScope: "all",
    allowedSiteLocationIds: null,
};

const RESTRICTED_SCOPE: AdminAccessScopeDimensions = {
    departmentScope: "restricted",
    allowedDepartmentIds: ["dept-allowed"],
    siteScope: "all",
    allowedSiteLocationIds: null,
};

function ctx(accessScope: AdminAccessScopeDimensions): AnalyticsContext {
    return {
        orgId: "org-1",
        accessScope,
        surfaceId: "operational",
        dateRange: { version: 1, kind: "rolling", days: 30 },
    };
}

function locator(departmentId: string, mapping: Record<string, string>): WorkspaceQueueLocator {
    return {
        workspaceBasePath: "/adminV2/workspace",
        departmentId,
        resolveWorkUnitId: (key) => mapping[key] ?? null,
    };
}

describe("DrillResolver", () => {
    const enrollmentMapping = { enrollment_pipeline: "wu-enroll", needs_attention: "wu-attn" };

    it("builds a queue href matching the workspace pattern", () => {
        const contract = getDrillContract("enrollment.leads")!;
        const intent = resolveDrill(contract, ctx(OPEN_SCOPE), locator("dept-1", enrollmentMapping));
        expect(intent).toEqual({
            kind: "href",
            destinationKind: "queue",
            label: "Open lead queue",
            href: "/adminV2/workspace/dept/dept-1/work-unit/wu-enroll",
        });
    });

    it("appends a status_keys filter from a status_key drill selection", () => {
        const contract = getDrillContract("enrollment.tours")!;
        const selection: DrillSelection = {
            destinationKind: "queue",
            target: "queue/tours",
            dimensionKey: "status_key",
            dimensionValue: "tour_completed",
        };
        const intent = resolveDrill(contract, ctx(OPEN_SCOPE), locator("dept-1", enrollmentMapping), selection);
        expect(intent.kind).toBe("href");
        if (intent.kind === "href") {
            expect(intent.href).toBe(
                "/adminV2/workspace/dept/dept-1/work-unit/wu-enroll?status_keys=tour_completed",
            );
        }
    });

    it("returns unavailable when the work unit cannot be resolved", () => {
        const contract = getDrillContract("enrollment.leads")!;
        const intent = resolveDrill(contract, ctx(OPEN_SCOPE), locator("dept-1", {}));
        expect(intent).toEqual({ kind: "unavailable", reason: "work_unit_unresolved" });
    });

    it("returns unavailable when access scope forbids the department", () => {
        const contract = getDrillContract("enrollment.leads")!;
        const intent = resolveDrill(contract, ctx(RESTRICTED_SCOPE), locator("dept-forbidden", enrollmentMapping));
        expect(intent).toEqual({ kind: "unavailable", reason: "access_denied" });
    });

    it("allows a department explicitly within a restricted scope", () => {
        const contract = getDrillContract("enrollment.leads")!;
        const intent = resolveDrill(contract, ctx(RESTRICTED_SCOPE), locator("dept-allowed", enrollmentMapping));
        expect(intent.kind).toBe("href");
    });

    it("resolves a calculation's default drill", () => {
        const calc = getOperationalCalculation("ops.needs_attention_count");
        const intent = resolveCalculationDrill(calc, ctx(OPEN_SCOPE), locator("dept-1", enrollmentMapping));
        expect(intent.kind).toBe("href");
        if (intent.kind === "href") {
            expect(intent.href).toContain("/work-unit/wu-attn");
        }
    });

    it("reports exploratory_only for calculations with no drill", () => {
        const calc = getOperationalCalculation("comms.delivery_rate");
        const intent = resolveCalculationDrill(calc, ctx(OPEN_SCOPE), locator("dept-1", enrollmentMapping));
        expect(intent).toEqual({ kind: "unavailable", reason: "exploratory_only" });
    });

    it("every registered drill contract is a queue contract with a work unit key", () => {
        for (const contract of Object.values(DRILL_CONTRACTS)) {
            expect(contract.kind).toBe("queue");
            expect(contract.workUnitKey.length).toBeGreaterThan(0);
        }
    });
});
