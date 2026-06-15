import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "crypto";
import {
    catalogEntriesFromDepartmentRows,
    buildLifecycleCatalog,
} from "@/lib/lifecycle/lifecycleCatalog";
import { emptyLifecycleBuilderV1, mergeLifecycleBuilderIntoMetadata } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("lifecycle catalog explicit config only", () => {
    it("empty lifecycle_builder_v1.processes returns empty catalog", () => {
        const deptId = randomUUID();
        const entries = catalogEntriesFromDepartmentRows(
            [
                {
                    id: deptId,
                    key: "enrollment",
                    name: "Enrollment",
                    is_active: true,
                    metadata: mergeLifecycleBuilderIntoMetadata({}, emptyLifecycleBuilderV1()),
                },
            ],
            {
                workspaceById: new Map([[deptId, { name: "Enrollment" }]]),
                wuCountByDept: new Map([[deptId, 1]]),
                departmentIdAllowed: () => true,
            }
        );
        expect(entries).toEqual([]);
    });

    it("does not synthesize Enrollment when processes array is empty", () => {
        const catalogTs = read("lib/lifecycle/lifecycleCatalog.ts");
        expect(catalogTs).not.toContain("defaultLifecycleBuilderV1");
        expect(catalogTs).not.toContain("emptyLifecycleBuilderV1");
        const builderConfig = read("lib/lifecycle/lifecycleBuilderConfig.ts");
        expect(catalogTs).toContain("lifecycleBuilderFromDepartmentMetadata");
        expect(builderConfig).toContain("export function defaultLifecycleBuilderV1");
        expect(catalogTs).not.toContain("defaultLifecycleBuilderV1()");
    });

    it("lists only explicit active processes from metadata", () => {
        const deptId = randomUUID();
        const processId = randomUUID();
        const config = {
            version: 1 as const,
            active_process_id: processId,
            processes: [
                {
                    id: processId,
                    key: ENROLLMENT_PROCESS_KEY,
                    name: "Enrollment",
                    primary_entity: "opportunity" as const,
                    sort_order: 0,
                    is_active: true,
                    stages: [
                        {
                            id: randomUUID(),
                            key: "lead",
                            label: "Lead",
                            sort_order: 0,
                            is_active: true,
                        },
                    ],
                },
            ],
        };
        const entries = catalogEntriesFromDepartmentRows(
            [
                {
                    id: deptId,
                    key: "enrollment",
                    name: "Enrollment",
                    is_active: true,
                    metadata: mergeLifecycleBuilderIntoMetadata({}, config),
                },
            ],
            {
                workspaceById: new Map(),
                wuCountByDept: new Map(),
                departmentIdAllowed: () => true,
            }
        );
        expect(entries).toHaveLength(1);
        expect(entries[0]!.lifecycle_name).toBe("Enrollment");
        expect(entries[0]!.config_source).toBe("departments.metadata.lifecycle_builder_v1");
        expect(entries[0]!.process_id).toBe(processId);
    });

    it("UI shows empty state and create button when catalog is empty", () => {
        const cards = read("components/adminV2/settings/lifecycle/LifecycleProcessCatalogCards.tsx");
        expect(cards).toContain("lifecycle-catalog-empty");
        expect(cards).toContain("BUSINESS_PROCESS_CATALOG_EMPTY");
        expect(cards).toContain("lifecycle-catalog-create-new");
    });

    it("primary builder clears stale identity and hides board without catalog row", () => {
        const primary = read("components/adminV2/settings/lifecycle/LifecycleBuilderPrimary.tsx");
        expect(primary).toContain("lifecycleCatalogFetchInit");
        expect(primary).toContain("findCatalogEntryForIdentity(catalog, identity)");
        expect(primary).toContain("setIdentity(null)");
        expect(primary).toContain("creatingNew || selectedCatalogEntry");
        expect(primary).not.toMatch(/creatingNew \|\| identity \?/);
    });

    it("catalog API disables caching", () => {
        expect(read("app/api/admin/lifecycle-catalog/route.ts")).toContain("Cache-Control");
        expect(read("lib/workspace/workspaceDataFetch.ts")).toContain("lifecycleCatalogFetchInit");
    });
});
