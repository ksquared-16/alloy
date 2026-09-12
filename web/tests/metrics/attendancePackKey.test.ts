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
import { PACK_TO_BUSINESS_PROCESS } from "@/lib/analytics/calculations/types";
import type { MetricPackKey } from "@/lib/metrics/types";

describe("attendance is a legitimate pack key", () => {
    it("type-checks as a MetricPackKey", () => {
        // Compile-time proof: this assignment does not build unless the union
        // contains the member. The runtime assertion is incidental.
        const key: MetricPackKey = "attendance";
        expect(key).toBe("attendance");
    });

    it("has an owning business process, and it is its own", () => {
        // Not `capacity` (how many a room holds) and not `operational_health`
        // (platform reliability). Attendance is a process an org runs daily.
        expect(PACK_TO_BUSINESS_PROCESS.attendance).toBe("attendance");
    });

    it("is declared in the pack registry", () => {
        expect(getMetricPack("attendance")).toBeDefined();
    });
});

describe("existing pack behaviour is unchanged", () => {
    it("every pack metric key still resolves in the registry", () => {
        expect(validateMetricPackRegistry()).toEqual([]);
    });

    it("packs with no metrics are still excluded from the available set", () => {
        const available = listAvailableMetricPacks().map((p) => p.key);
        // attendance is registered but still empty at Phase A, so it must NOT
        // appear as available — an empty pack on a surface is a broken promise.
        expect(available).not.toContain("attendance");
        expect(available).not.toContain("staffing");
        expect(available).not.toContain("capacity");
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
