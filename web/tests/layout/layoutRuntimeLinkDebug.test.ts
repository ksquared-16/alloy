import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
    buildLayoutRuntimeLinkDebugKey,
    classifyLayoutRuntimeLinkTargetIdType,
    formatLayoutRuntimeLinkClickResult,
    getLayoutRuntimeLinkDebugEntry,
    registerLayoutRuntimeLinkDebug,
    reportLayoutRuntimeLinkDebugProgress,
    setActiveLayoutRuntimeLinkDebugKey,
} from "@/lib/layout/runtime/layoutRuntimeLinkDebug";

describe("layoutRuntimeLinkDebug", () => {
    const originalEnv = process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_LINK_DEBUG;

    beforeEach(() => {
        process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_LINK_DEBUG = "1";
    });

    afterEach(() => {
        process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_LINK_DEBUG = originalEnv;
    });

    it("builds stable debug keys", () => {
        expect(
            buildLayoutRuntimeLinkDebugKey({
                surface: "queue",
                entityType: "child",
                rowKey: "row-1",
                componentName: "RelatedRecordChip",
            }),
        ).toBe("queue:child:row-1:RelatedRecordChip");
    });

    it("classifies child person id vs missing", () => {
        expect(
            classifyLayoutRuntimeLinkTargetIdType({
                entityType: "child",
                targetId: "person-9",
                childOpenTarget: {
                    personId: "person-9",
                    customerMemberId: null,
                    rowId: "row-1",
                    ocmId: null,
                    resolvedFrom: "child.id",
                },
            }),
        ).toBe("person_id");
        expect(
            classifyLayoutRuntimeLinkTargetIdType({
                entityType: "child",
                targetId: null,
                childOpenTarget: {
                    personId: null,
                    customerMemberId: "cm-1",
                    rowId: "row-1",
                    ocmId: null,
                    resolvedFrom: null,
                },
            }),
        ).toBe("customer_member_id");
    });

    it("tracks click progress for active debug key", () => {
        const debugKey = "queue:child:row-1:Test";
        registerLayoutRuntimeLinkDebug({
            debugKey,
            surface: "queue",
            entityType: "child",
            linkable: true,
            handlerAttached: true,
            targetId: "person-9",
            targetIdType: "person_id",
            routeMethod: "test-route",
            componentName: "Test",
            rowKey: "row-1",
            childRowSummary: null,
        });
        setActiveLayoutRuntimeLinkDebugKey(debugKey);
        reportLayoutRuntimeLinkDebugProgress("clicked", null, debugKey);
        reportLayoutRuntimeLinkDebugProgress("drawer_state_updated", null, debugKey);
        reportLayoutRuntimeLinkDebugProgress("rendered", null, debugKey);

        const entry = getLayoutRuntimeLinkDebugEntry(debugKey);
        expect(entry?.lastClickResult).toBe("rendered");
        expect(formatLayoutRuntimeLinkClickResult(entry!)).toBe("rendered");
    });
});
