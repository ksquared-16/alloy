import { describe, expect, it } from "vitest";
import {
    destinationIdFromResolvedRoute,
    resolveOperationalDestinationFromSlug,
    type OperationalDestinationCatalog,
} from "@/lib/runtime/graph/resolveOperationalDestination";
import { destinationIdKey } from "@/lib/runtime/graph/destinationId";
import { RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2 } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";

/** Department metadata carrying process-level Work Views (`work_views_v1`), default = first visible. */
function deptMetadata(): unknown {
    return {
        lifecycle_builder_v1: {
            version: 1,
            active_process_id: "proc-1",
            processes: [
                {
                    id: "proc-1",
                    key: "enrollment",
                    name: "Enrollment",
                    is_active: true,
                    stages: [],
                    work_views_v1: [
                        { id: "new_leads", label: "New Leads", display_order: 1, visible_in_runtime: true },
                        { id: "tours", label: "Tours", display_order: 2, visible_in_runtime: true },
                    ],
                },
            ],
        },
    };
}

const CATALOG: OperationalDestinationCatalog = {
    workUnits: [
        {
            id: "wu-enroll",
            department_id: "dept-enroll",
            key: "enrollment_pipeline",
            name: "Enrollment Pipeline",
            queue_definition: RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2,
        },
    ],
    departments: [{ id: "dept-enroll", key: "enrollment", name: "Enrollment", metadata: deptMetadata() }],
};

describe("resolveOperationalDestination — the collapse guarantee", () => {
    it("collapses the three URL forms of a default view to ONE identical DestinationId", () => {
        // (a) bare work-unit key → implicit default view
        const fromUnitKey = resolveOperationalDestinationFromSlug({ slug: "enrollment-pipeline", catalog: CATALOG });
        // (b) the default view's own slug (label-derived) → its host unit + that view
        const fromViewSlug = resolveOperationalDestinationFromSlug({ slug: "new-leads", catalog: CATALOG });
        // (c) bare unit + an explicit ?work_view_id= naming the default view
        const fromExplicit = resolveOperationalDestinationFromSlug({
            slug: "enrollment-pipeline",
            explicitWorkViewId: "new_leads",
            catalog: CATALOG,
        });

        expect(fromUnitKey).not.toBeNull();
        expect(fromUnitKey).toEqual({
            workUnitId: "wu-enroll",
            workViewId: "new_leads",
            subjectId: null,
            focusMode: null,
        });
        // THE GUARANTEE: three different URLs → one byte-identical runtime identity.
        expect(destinationIdKey(fromViewSlug!)).toBe(destinationIdKey(fromUnitKey!));
        expect(destinationIdKey(fromExplicit!)).toBe(destinationIdKey(fromUnitKey!));
    });

    it("keeps a NON-default view distinct from the default", () => {
        const dflt = resolveOperationalDestinationFromSlug({ slug: "enrollment-pipeline", catalog: CATALOG });
        const tours = resolveOperationalDestinationFromSlug({
            slug: "enrollment-pipeline",
            explicitWorkViewId: "tours",
            catalog: CATALOG,
        });
        expect(destinationIdKey(tours!)).not.toBe(destinationIdKey(dflt!));
        expect(tours!.workViewId).toBe("tours");
    });

    it("resolves an implicit default via department metadata (firstVisibleWorkView)", () => {
        const id = destinationIdFromResolvedRoute({
            workUnitId: "wu-enroll",
            initialWorkViewId: null,
            departmentMetadata: deptMetadata(),
        });
        expect(id).toEqual({ workUnitId: "wu-enroll", workViewId: "new_leads", subjectId: null, focusMode: null });
    });

    it("returns null for a slug that resolves to no work unit (no false identity)", () => {
        expect(
            resolveOperationalDestinationFromSlug({ slug: "does-not-exist", catalog: CATALOG }),
        ).toBeNull();
    });

    it("returns null when a unit has no configured view (not an operational destination)", () => {
        expect(
            destinationIdFromResolvedRoute({
                workUnitId: "wu-enroll",
                initialWorkViewId: null,
                departmentMetadata: undefined,
            }),
        ).toBeNull();
    });
});
