// @vitest-environment jsdom
/**
 * S6-1 — DEPARTMENT CONFIGURATION IS RETAINED, NOT RETRANSMITTED.
 *
 * MEASURED (Slices 5/6): ~30 KB of department configuration rode every subject-scoped provisioning
 * answer. It is not dead data — `buildCurrentWorkSurfaceVM` feeds it to
 * `resolveCurrentWorkChecklistTruthFromPublishedRules`, so it participates in Current Work checklist
 * truth and could not simply be deleted. But the client ALREADY had it: `/api/admin/departments`
 * loads at workspace boot and its `items[].metadata` is byte-identical to the embedded copy. The
 * nav-tree owner was keeping those bytes in memory (and in its session snapshot) while the type
 * discarded them, so nothing could read them.
 *
 * What these tests pin is the pair of properties that make omission SAFE:
 *   SCOPE   — the owner answers per department, and an unknown department is a hard miss.
 *   PIN     — omission is refused whenever a governing revision makes this subject's copy differ
 *             from the live department record.
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    peekRetainedDepartmentConfig,
    retainedDepartmentConfigForDepartment,
    retainedDepartmentConfigIds,
    clearWorkspaceNavTreeCache,
    WORKSPACE_DEPARTMENT_CONFIG_TTL_MS,
    __seedWorkspaceNavTreeForTests,
} from "@/lib/adminV2/navigation/workspaceNavTreeCache";

const DEPT = "3933ac47-077a-4de8-aaac-8aed48d80413";
const OTHER = "5f6bba4c-0000-4000-8000-000000000000";

beforeEach(() => { clearWorkspaceNavTreeCache(); vi.useRealTimers(); });

describe("the owner answers per department, and misses are hard", () => {
    it("reports usable configuration for a department it holds", () => {
        __seedWorkspaceNavTreeForTests([{ id: DEPT, name: "Enrollment", metadata: { lifecycle_builder_v1: { x: 1 } } }], Date.now());
        const r = peekRetainedDepartmentConfig(DEPT);
        expect(r.usable).toBe(true);
        expect(retainedDepartmentConfigForDepartment(DEPT)).toEqual({ lifecycle_builder_v1: { x: 1 } });
    });

    it("is a hard miss for a department it does not hold", () => {
        __seedWorkspaceNavTreeForTests([{ id: DEPT, name: "Enrollment", metadata: { a: 1 } }], Date.now());
        expect(peekRetainedDepartmentConfig(OTHER).usable).toBe(false);
        expect(retainedDepartmentConfigForDepartment(OTHER)).toBeNull();
        // and it is never named to the server, so the server can never match it
        expect(retainedDepartmentConfigIds()).toEqual([DEPT]);
    });

    it("is a hard miss when nothing is retained at all (cold / deep link)", () => {
        expect(peekRetainedDepartmentConfig(DEPT).usable).toBe(false);
        expect(retainedDepartmentConfigIds()).toEqual([]);
    });

    it("names only departments that actually carry configuration", () => {
        __seedWorkspaceNavTreeForTests([
            { id: DEPT, name: "Enrollment", metadata: { a: 1 } },
            { id: OTHER, name: "Finance" },            // no metadata → must not be claimed
        ], Date.now());
        expect(retainedDepartmentConfigIds()).toEqual([DEPT]);
    });
});

describe("freshness is bounded, and expiry never stops the owner answering", () => {
    it("is fresh inside the TTL", () => {
        __seedWorkspaceNavTreeForTests([{ id: DEPT, name: "E", metadata: { a: 1 } }], Date.now());
        const r = peekRetainedDepartmentConfig(DEPT);
        expect(r.usable && r.fresh).toBe(true);
    });

    it("stays USABLE past the TTL — stale-while-revalidate, never a blank", () => {
        __seedWorkspaceNavTreeForTests(
            [{ id: DEPT, name: "E", metadata: { a: 1 } }],
            Date.now() - (WORKSPACE_DEPARTMENT_CONFIG_TTL_MS + 5_000),
        );
        const r = peekRetainedDepartmentConfig(DEPT);
        expect(r.usable).toBe(true);
        expect(r.usable && r.fresh).toBe(false);
        expect(retainedDepartmentConfigForDepartment(DEPT)).toEqual({ a: 1 });
    });
});

/**
 * SOURCE LOCKS. The two decisions below are server-side control flow reached only through a full
 * lifecycle-builder fixture, so they are pinned structurally rather than with a fabricated plan that
 * would prove little. Each is the exact line a future edit would have to break.
 */
describe("LOCKS — omission is refused where it would change truth", () => {
    const resolver = readFileSync(
        join(process.cwd(), "lib/adminV2/runtime/focusPanel/currentWork/resolvePublishedStageInputsForCurrentWork.ts"),
        "utf-8",
    );
    const composer = readFileSync(
        join(process.cwd(), "lib/runtime/provisioning/workUnitProvisioningAnswer.ts"),
        "utf-8",
    );
    const route = readFileSync(
        join(process.cwd(), "app/api/admin/work-units/[id]/provisioning-answer/route.ts"),
        "utf-8",
    );
    const currentWork = readFileSync(
        join(process.cwd(), "lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkSurfaceVM.ts"),
        "utf-8",
    );

    it("never omits when a pinned revision governs this subject", () => {
        // `placement` is the pinned payload. With a pin the embedded copy is live metadata with
        // lifecycle_builder_v1 REPLACED, so substituting the client's live copy would defeat the pin.
        expect(resolver).toMatch(/omitDepartmentMetadata\s*=\s*params\.clientHoldsLiveDepartmentConfig === true && !placement/);
    });

    it("carries a scope-exact reference whenever it omits", () => {
        expect(resolver).toMatch(/departmentMetadataRef:\s*\n?\s*omitDepartmentMetadata && params\.departmentId/);
    });

    it("only trusts the client's claim for the department this answer actually resolved", () => {
        expect(composer).toMatch(/departmentConfigHeldIds \?\? \[\]\)\.includes\(String\(wuRow\.department_id/);
    });

    it("parses the client's claim strictly", () => {
        expect(route).toMatch(/\/\^\[0-9a-f-\]\{36\}\$\/i/);
    });

    it("lets the embedded copy win over the retained one", () => {
        // Precedence proven from lifecycle semantics: embedded may be pin-composed and is therefore
        // authoritative for the subject; retained only fills the gap the server deliberately left.
        expect(currentWork).toMatch(/publishedStageInputs\?\.departmentMetadata\s*\n?\s*\?\?\s*retainedDepartmentConfigForDepartment/);
    });
});
