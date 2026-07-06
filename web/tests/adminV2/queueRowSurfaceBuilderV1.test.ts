/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import {
    LEGACY_PIPELINE_QUEUE_ROW_SURFACE_ID,
    LEGACY_WAITLIST_QUEUE_ROW_SURFACE_ID,
    catalogIdFromQueueRowSurfaceId,
    defaultQueueRowSurfaceName,
    isLegacyQueueRowSurfaceId,
    queueRowLayoutKeyForProcessKey,
    queueRowSurfaceId,
    resolveQueueRowCatalogIds,
    surfaceObjectForQueueRowCatalogEntry,
} from "@/lib/adminV2/settings/surfaces/queueRowProcessCatalog";
import {
    buildDefaultQueueRowSurfaceEnvelope,
    createQueueRowVariant,
    normalizeQueueRowSurfaceEnvelope,
} from "@/lib/presentation/runtime/queueRowSurfaceMetadata";
import { defaultEnrollmentQueueRowLayoutWithVariantsV1, emptyQueueRowLayoutV3 } from "@/lib/layout/queueRecordLayoutDefaults";
import { resolveQueueRowVariant } from "@/lib/presentation/runtime/resolveQueueRowVariant";
import { SURFACE_OBJECTS } from "@/components/adminV2/settings/surfaces/useSurfacesConfigurationSettings";

const catalogEntry = {
    id: "dept-1:proc-1",
    lifecycle_name: "Enrollment",
    process_key: "enrollment",
    department_id: "dept-1",
    process_id: "proc-1",
    workspace: {
        user_has_access: true,
        department_is_active: true,
        visible_in_workspace_api: true,
        runtime_status: "visible" as const,
    },
} as const;

describe("queueRowProcessCatalog", () => {
    it("queue row nav uses one surface per visible business process", () => {
        expect(SURFACE_OBJECTS["queue-rows"]).toEqual([]);
        const ids = resolveQueueRowCatalogIds([catalogEntry as never]);
        expect(ids).toEqual(["dept-1:proc-1"]);
        const surface = surfaceObjectForQueueRowCatalogEntry(catalogEntry as never);
        expect(surface.id).toBe("queue-row-dept-1-proc-1");
        expect(surface.title).toBe("Enrollment Queue Row");
        expect(surface.editor).toBe("queue-row-builder");
    });

    it("legacy pipeline/waitlist ids are not in static nav objects", () => {
        const staticIds = Object.values(SURFACE_OBJECTS).flat().map((o) => o.id);
        expect(staticIds).not.toContain(LEGACY_PIPELINE_QUEUE_ROW_SURFACE_ID);
        expect(staticIds).not.toContain(LEGACY_WAITLIST_QUEUE_ROW_SURFACE_ID);
        expect(isLegacyQueueRowSurfaceId("pipeline-queue-row")).toBe(true);
    });

    it("round-trips catalog id from surface id", () => {
        const catalogId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
        expect(catalogIdFromQueueRowSurfaceId(queueRowSurfaceId(catalogId))).toBe(catalogId);
    });

    it("layout key is derived from process key", () => {
        expect(queueRowLayoutKeyForProcessKey("enrollment")).toBe("queue_row_enrollment");
    });

    it("default surface name is editable metadata", () => {
        expect(defaultQueueRowSurfaceName("Enrollment")).toBe("Enrollment Queue Row");
    });
});

describe("queueRowSurfaceMetadata + runtime matching", () => {
    it("new default envelope is blank — starter template is opt-in", () => {
        const envelope = buildDefaultQueueRowSurfaceEnvelope({
            catalogId: "dept-1:proc-1",
            processKey: "enrollment",
            processName: "Enrollment",
        });
        expect(envelope.layout.columns).toEqual([]);
        const starter = defaultEnrollmentQueueRowLayoutWithVariantsV1();
        expect(starter.variants?.map((v) => v.label)).toEqual(["Tour", "Waitlist", "Enrolling"]);
    });

    it("empty layout has no columns until operator configures", () => {
        expect(emptyQueueRowLayoutV3().columns).toEqual([]);
    });

    it("starter enrollment layout includes optional template variants", () => {
        const layout = defaultEnrollmentQueueRowLayoutWithVariantsV1();
        expect(layout.variants?.map((v) => v.label)).toEqual(["Tour", "Waitlist", "Enrolling"]);
    });

    it("variant matching uses configured stage rules — one family two children", () => {
        const layout = defaultEnrollmentQueueRowLayoutWithVariantsV1();
        const tour = resolveQueueRowVariant(layout.variants, { stageKey: "tour_scheduled", grain: "child" });
        const waitlist = resolveQueueRowVariant(layout.variants, { stageKey: "waitlist", grain: "child" });
        expect(tour?.label).toBe("Tour");
        expect(waitlist?.label).toBe("Waitlist");
    });

    it("falls back to Default when no variant matches", () => {
        const layout = defaultEnrollmentQueueRowLayoutWithVariantsV1();
        expect(resolveQueueRowVariant(layout.variants, { stageKey: "unknown_stage" })).toBeNull();
        expect(layout.columns.length).toBeGreaterThan(0);
    });

    it("publish envelope normalizes and preserves variants", () => {
        const envelope = buildDefaultQueueRowSurfaceEnvelope({
            catalogId: "dept-1:proc-1",
            processKey: "enrollment",
            processName: "Enrollment",
        });
        const variant = createQueueRowVariant({ label: "Custom", priority: 5, seedFrom: envelope.layout });
        envelope.layout.variants = [...(envelope.layout.variants ?? []), variant];
        const normalized = normalizeQueueRowSurfaceEnvelope(envelope);
        expect(normalized?.layout.variants?.some((v) => v.label === "Custom")).toBe(true);
    });
});
