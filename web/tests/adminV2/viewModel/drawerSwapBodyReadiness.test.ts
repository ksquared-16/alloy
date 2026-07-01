import { afterEach, describe, expect, it, vi } from "vitest";

import {
    isDrawerSwapLayoutBodyWarm,
    resolveDrawerSwapLayoutBodySpec,
} from "@/lib/adminV2/viewModel/drawer/vmRuntime/drawerSwapBodyReadiness";
import {
    clearDrawerLayoutRuntimeBodySessionCacheForTests,
    putDrawerLayoutRuntimeBodyCacheEntry,
    buildDrawerLayoutRuntimeBodyCacheKey,
    serializeDrawerLayoutRuntimeBodyQueryParams,
} from "@/lib/layout/runtime/drawerLayoutRuntimeBodySessionCache";
import type { LayoutDoc } from "@/lib/layout/layoutV2";

const minimalDoc: LayoutDoc = {
    formatVersion: 1,
    surface: "drawer",
    entityType: "persons",
    metadata: {},
    sections: [
        {
            id: "main",
            key: "main",
            title: "Main",
            rows: [{ id: "row-1", columns: [{ id: "col-1", width: 12, items: [] }] }],
        },
    ],
};

describe("drawerSwapBodyReadiness", () => {
    afterEach(() => {
        clearDrawerLayoutRuntimeBodySessionCacheForTests();
        vi.unstubAllEnvs();
    });

    it("resolves opportunity body spec with workspace context", () => {
        vi.stubEnv("NEXT_PUBLIC_LAYOUT_RUNTIME_ENABLED", "true");
        const spec = resolveDrawerSwapLayoutBodySpec({
            type: "opportunities",
            id: "opp-1",
            opportunityWorkspaceContext: { department_id: "d1", work_unit_id: "w1" },
        });
        expect(spec?.apiPath).toContain("opportunity-drawer-body");
        expect(spec?.queryParams?.departmentId).toBe("d1");
    });

    it("detects warm body cache for linked person swap", () => {
        vi.stubEnv("NEXT_PUBLIC_LAYOUT_RUNTIME_ENABLED", "true");
        const spec = resolveDrawerSwapLayoutBodySpec({
            type: "persons",
            id: "person-1",
            personDrawerOpenSeed: { opportunity_id: "opp-1" },
        });
        expect(spec?.apiPath).toContain("person-drawer-body");
        const key = buildDrawerLayoutRuntimeBodyCacheKey(
            spec!.apiPath,
            "person-1",
            serializeDrawerLayoutRuntimeBodyQueryParams(spec!.queryParams)
        );
        putDrawerLayoutRuntimeBodyCacheEntry(key, {
            doc: minimalDoc,
            record: { id: "person-1" },
            layoutSource: null,
            layoutKey: null,
            layoutRecordId: null,
            layoutVersion: null,
        });
        expect(
            isDrawerSwapLayoutBodyWarm({
                type: "persons",
                id: "person-1",
                personDrawerOpenSeed: { opportunity_id: "opp-1" },
            })
        ).toBe(true);
    });
});
