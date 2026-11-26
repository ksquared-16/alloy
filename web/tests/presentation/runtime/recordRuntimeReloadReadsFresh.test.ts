/**
 * E2E-15 / E2E-23 — after a relationship mutation the record runtime's reload must reach the server.
 *
 * Measured on deployed 50affaee: Add Person succeeded and no request to the drawer view-model route
 * followed — the forced reload was answered from the session cache, because the runtime invalidated
 * the VM-workspace scope (`_:<dept>:<wu>:`) while it reads through its transport scope
 * (`_:_:_:<attention>`). The Household card kept the pre-mutation contacts until a cold load.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import {
    clearDrawerViewModelSessionCacheForTests,
    invalidateDrawerViewModelCacheForEntity,
    peekDrawerViewModelCacheEntry,
    putDrawerViewModelCacheEntry,
} from "@/lib/adminV2/viewModel/drawer/drawerViewModelSessionCache";
import { resolveOpportunityDrawerVmCacheKey } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerVmCacheScope";
import { invalidateRecordRuntimeVmCache } from "@/lib/presentation/runtime/invalidateRecordRuntimeVmCache";

const OPP = "fac77131-2f79-49fc-8fa4-aafa517f9c15";
const CHILD = "ba106302-ff42-4742-b248-b77b7d70d7a2";
const VM_WORKSPACE = { department_id: "dept-enrollment", work_unit_id: "wu-lifecycle" };

/** The transport context exactly as `useRecordWorkRuntime` builds it. */
const transport = (attention: string | null) =>
    attention ? { work_unit_id: "", department_id: "", attention_subject_id: attention } : null;

const entry = { entityType: "opportunities", entityId: OPP, surface: "opportunity", preload: { stale: true } as never, generation: "g", cachedAt: Date.now() } as const;

/** File the entry where the loader reads it for this transport — the loader's own resolver. */
function fileWhereTheReaderLooks(attention: string | null) {
    const { context } = resolveOpportunityDrawerVmCacheKey({ opportunityId: OPP, workspaceContext: transport(attention), context: null });
    putDrawerViewModelCacheEntry(entry, context);
    return () => peekDrawerViewModelCacheEntry({ entityType: "opportunities", entityId: OPP, surface: "opportunity", context });
}

describe("the record runtime's forced reload is not answered by the entry it meant to drop", () => {
    beforeEach(() => clearDrawerViewModelSessionCacheForTests());

    it("the VM-workspace scope alone leaves the reader's entry alive (the deployed defect)", () => {
        const peek = fileWhereTheReaderLooks(CHILD);
        invalidateDrawerViewModelCacheForEntity("opportunities", OPP, { departmentId: VM_WORKSPACE.department_id, workUnitId: VM_WORKSPACE.work_unit_id });
        expect(peek()).not.toBeNull();
    });

    for (const attention of [CHILD, null]) {
        it(`drops the entry the runtime reads through (attention: ${attention ?? "none"})`, () => {
            const peek = fileWhereTheReaderLooks(attention);
            invalidateRecordRuntimeVmCache({ opportunityId: OPP, readContext: transport(attention), vmWorkspace: VM_WORKSPACE });
            expect(peek()).toBeNull();
        });
    }

    it("still drops the VM-workspace entry `applyVm` files", () => {
        const ctx = { departmentId: VM_WORKSPACE.department_id, workUnitId: VM_WORKSPACE.work_unit_id, attentionSubjectId: CHILD };
        putDrawerViewModelCacheEntry(entry, ctx);
        invalidateRecordRuntimeVmCache({ opportunityId: OPP, readContext: transport(CHILD), vmWorkspace: VM_WORKSPACE });
        expect(peekDrawerViewModelCacheEntry({ entityType: "opportunities", entityId: OPP, surface: "opportunity", context: ctx })).toBeNull();
    });

    it("useRecordWorkRuntime invalidates through its own transport scope", () => {
        const src = readFileSync(resolve(process.cwd(), "lib/presentation/runtime/useRecordWorkRuntime.ts"), "utf8");
        const fn = src.slice(src.indexOf("const invalidateVmCachesForSubject"), src.indexOf("const reloadDisplayVm"));
        expect(fn).toContain("invalidateRecordRuntimeVmCache({");
        expect(fn).toContain("readContext: transportContext");
        expect(fn).not.toContain("invalidateDrawerViewModelCacheForEntity(");
    });
});
