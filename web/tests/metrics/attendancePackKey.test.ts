/**
 * The Attendance pack was declared but unassignable.
 *
 * `packs.ts` has carried an `attendance` entry since before Thread 9, but
 * `MetricPackDefinition.key` is typed `string` while `MetricDefinition.pack` is
 * typed `MetricPackKey` — and that union did not contain `attendance`. So the
 * pack could be listed, described and rendered, and no metric could ever be
 * filed under it. The gap was invisible because the pack was empty.
 *
 * These pin the smallest correction: `attendance` is expressible as a pack key,
 * and nothing else about pack behaviour moved.
 */

import { describe, expect, it } from "vitest";
import {
    getMetricPack,
    listMetricPacks,
    listAvailableMetricPacks,
    validateMetricPackRegistry,
} from "@/lib/metrics/packs";
import { listMetricDefinitions } from "@/lib/metrics/registry";
import {
    PACK_TO_BUSINESS_PROCESS,
    businessProcessForMetricPack,
} from "@/lib/analytics/calculations/types";
import {
    WORKSPACE_SIGNAL_BUSINESS_PROCESSES,
    businessProcessForProcessKey,
} from "@/lib/presentation/runtime/workspaceProcessSignal";
import type { MetricPackKey } from "@/lib/metrics/types";

describe("attendance is a legitimate pack key", () => {
    it("type-checks as a MetricPackKey", () => {
        // Compile-time proof: this assignment does not build unless the union
        // contains the member. The runtime assertion is incidental.
        const key: MetricPackKey = "attendance";
        expect(key).toBe("attendance");
    });

    it("has NO Business Process owner, and that is the point", () => {
        /*
         * Attendance is operational fact authoring on a roster, not a process an
         * organization runs. The first implementation gave it Business Process
         * identity purely to satisfy an exhaustive Record, which is inventing a
         * concept to satisfy a compiler. The mapping is now partial, so "this
         * measurement domain is not a business process" is expressible.
         */
        expect(PACK_TO_BUSINESS_PROCESS.attendance).toBeUndefined();
        expect(businessProcessForMetricPack("attendance")).toBeNull();
    });

    it("does not appear as a selectable Business Process anywhere", () => {
        // A fake process in the selector would be the same error wearing a
        // different hat: the operator would be offered an Attendance "process"
        // that does not exist.
        expect(
            WORKSPACE_SIGNAL_BUSINESS_PROCESSES.map((b) => String(b.businessProcess)),
        ).not.toContain("attendance");
        expect(businessProcessForProcessKey("attendance_daily")).toBeNull();
    });

    it("is declared in the pack registry", () => {
        expect(getMetricPack("attendance")).toBeDefined();
    });
});

describe("packs that DO own a business process still map to it", () => {
    it("keeps every pre-existing mapping intact", () => {
        expect(businessProcessForMetricPack("enrollment")).toBe("enrollment");
        expect(businessProcessForMetricPack("communications")).toBe("communications");
        expect(businessProcessForMetricPack("forms")).toBe("forms");
        expect(businessProcessForMetricPack("operational_health")).toBe("operational_health");
        expect(businessProcessForMetricPack("capacity")).toBe("capacity");
        expect(businessProcessForMetricPack("financials")).toBe("financial");
        // trust was already non-identity, and stays mapped rather than absent.
        expect(businessProcessForMetricPack("trust")).toBe("operational_health");
    });
});

describe("existing pack behaviour is unchanged", () => {
    it("every pack metric key still resolves in the registry", () => {
        expect(validateMetricPackRegistry()).toEqual([]);
    });

    it("packs with no metrics are still excluded from the available set", () => {
        const available = listAvailableMetricPacks().map((p) => p.key);
        // An empty pack on a surface is a broken promise. staffing and capacity
        // stay empty by decision — supervision grouping has no canonical owner,
        // so no ratio metric may ship (Thread 9 section 11).
        expect(available).not.toContain("staffing");
        expect(available).not.toContain("capacity");
    });

    it("attendance IS available now that it carries metrics", () => {
        // The reverse of the rule above: a pack with real metrics must surface,
        // or the metrics are unreachable.
        const available = listAvailableMetricPacks().map((p) => p.key);
        expect(available).toContain("attendance");
        expect(getMetricPack("attendance")?.metricKeys.length).toBeGreaterThan(0);
    });

    it("keeps the packs that were already available", () => {
        const available = listAvailableMetricPacks().map((p) => p.key);
        for (const key of ["operational_health", "enrollment", "communications", "forms", "financials"]) {
            expect(available).toContain(key);
        }
    });

    it("no metric is filed under a pack the registry does not declare", () => {
        const declared = new Set(listMetricPacks().map((p) => p.key));
        for (const def of listMetricDefinitions()) {
            expect(declared, `${def.key} is filed under undeclared pack ${def.pack}`).toContain(def.pack);
        }
    });
});
