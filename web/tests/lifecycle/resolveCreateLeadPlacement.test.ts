import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ONE PLACEMENT FOR EVERY ENTRY SOURCE.
 *
 * Ravi Smith, submitted on a public form and approved in Processing, committed with
 * `work_unit_id` NULL; a lead created in BOS committed with its Enrollment work unit. Same lead,
 * different downstream truth — invisible to location-scoped operators, Open Lead fell back to the
 * workspace home. Both paths now resolve placement through resolveCreateLeadPlacement.
 */

const m = vi.hoisted(() => ({
    defs: vi.fn(),
    defaultKey: vi.fn(),
    binding: vi.fn(),
    entry: vi.fn(),
}));
vi.mock("@/lib/admin/statusDefinitionsResolve", () => ({
    fetchEffectiveStatusDefinitions: m.defs,
    resolveConfiguredDefaultCreateStatusKey: m.defaultKey,
}));
vi.mock("@/lib/lifecycle/lifecycleRuntimeBinding", () => ({ resolveLifecycleCreateLeadBinding: m.binding }));
vi.mock("@/lib/lifecycle/resolveCreateLeadEntryDepartment", () => ({ resolveCreateLeadEntryDepartmentForOrg: m.entry }));

import { resolveCreateLeadPlacement } from "@/lib/lifecycle/resolveCreateLeadPlacement";

const sb = {} as SupabaseClient;
const ORG = "org-1";

beforeEach(() => {
    for (const f of Object.values(m)) f.mockReset();
    m.defs.mockResolvedValue([]);
    m.defaultKey.mockReturnValue("new");
    m.binding.mockResolvedValue({ work_unit_id: null, status_key: null });
    m.entry.mockResolvedValue({ state: "none" });
});

describe("resolveCreateLeadPlacement", () => {
    it("uses the department binding's work unit and entry status", async () => {
        m.binding.mockResolvedValue({ work_unit_id: "wu-dept", status_key: "new_inquiry" });
        await expect(resolveCreateLeadPlacement(sb, ORG, { departmentId: "dept-1" })).resolves.toEqual({
            ok: true,
            workUnitId: "wu-dept",
            statusKey: "new_inquiry",
        });
    });

    it("an explicit work unit is kept over the binding's", async () => {
        m.binding.mockResolvedValue({ work_unit_id: "wu-dept", status_key: null });
        await expect(
            resolveCreateLeadPlacement(sb, ORG, { departmentId: "dept-1", workUnitId: "wu-explicit" }),
        ).resolves.toEqual({ ok: true, workUnitId: "wu-explicit", statusKey: "new" });
    });

    it("with no department (a public form, BOS from workspace home) resolves the org's entry department", async () => {
        m.entry.mockResolvedValue({ state: "resolved", departmentId: "dept-enroll", workUnitId: "wu-enroll" });
        m.binding.mockResolvedValue({ work_unit_id: "wu-enroll", status_key: "new" });
        await expect(resolveCreateLeadPlacement(sb, ORG, {})).resolves.toEqual({
            ok: true,
            workUnitId: "wu-enroll",
            statusKey: "new",
        });
        expect(m.entry).toHaveBeenCalledWith(sb, ORG, null);
    });

    it("refuses an ambiguous entry rather than guessing", async () => {
        m.entry.mockResolvedValue({ state: "ambiguous" });
        await expect(resolveCreateLeadPlacement(sb, ORG, {})).resolves.toMatchObject({ ok: false, reason: "ambiguous" });
    });

    it("fails closed when nothing places the lead", async () => {
        await expect(resolveCreateLeadPlacement(sb, ORG, {})).resolves.toEqual({
            ok: false,
            reason: "unconfigured",
            message: "Create Lead is not configured for this process/location.",
        });
    });

    it("a status-configuration read failure does not block a valid create", async () => {
        m.defs.mockRejectedValue(new Error("boom"));
        await expect(resolveCreateLeadPlacement(sb, ORG, { workUnitId: "wu-1" })).resolves.toEqual({
            ok: true,
            workUnitId: "wu-1",
            statusKey: "open",
        });
    });
});

describe("single placement owner — BOS and the Processing plan builder both call it", () => {
    const root = resolve(__dirname, "../..");
    const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

    it("BOS Create Lead resolves placement only through resolveCreateLeadPlacement", () => {
        const src = read("lib/admin/actions/entryLifecycleActions.ts");
        expect(src).toContain("resolveCreateLeadPlacement(");
        expect(src).not.toContain("resolveCreateLeadEntryDepartmentForOrg(");
        expect(src).not.toContain("resolveLifecycleCreateLeadBinding(");
    });

    it("the Processing plan builder resolves an un-placed public-form lead through the same owner", () => {
        const src = read("lib/pos/processingIdentity/operator/operatorReviewService.ts");
        expect(src).toContain("resolveCreateLeadPlacement(");
        expect(src).not.toContain("resolveCreateLeadEntryDepartmentForOrg(");
    });
});
