/**
 * Queue layout variant resolution — Phase 0 tests.
 */

import { describe, expect, it } from "vitest";
import {
    ENROLLMENT_PIPELINE_CASE_QUEUE_CONTEXT,
    ENROLLMENT_WAITLIST_CANDIDATE_QUEUE_CONTEXT,
    resolveBuiltinQueueLayoutVariant,
} from "@/lib/layout/defaultQueueLayoutVariants";
import { buildEnrollmentWaitlistQueueDoc, buildLeadQueueDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { resolveLayout } from "@/lib/layout/layoutResolver";
import { layoutDocFromRegistry } from "@/lib/layout/migrateFromRegistry";
import { buildLayoutRuntimePlan } from "@/lib/layout/runtime";
import {
    extractQueueContextFromRecord,
    queueContextDescriptorMatchesRequest,
} from "@/lib/layout/queueLayoutContext";
import { resolveQueueLayoutVariantFromRecords } from "@/lib/layout/resolveQueueLayoutVariant";
import type { EntityLayoutRecord, LayoutDoc } from "@/lib/layout/layoutV2";
import { LAYOUT_DOC_FORMAT_VERSION } from "@/lib/layout/layoutV2";

function mockRecord(
    partial: Partial<EntityLayoutRecord> & { doc: LayoutDoc; layoutKey: string },
): EntityLayoutRecord {
    return {
        id: partial.id ?? "rec-1",
        orgId: partial.orgId ?? "org-1",
        industryKey: null,
        entityType: partial.entityType ?? "opportunities",
        surface: partial.surface ?? "queue",
        layoutKey: partial.layoutKey,
        name: partial.name ?? partial.layoutKey,
        version: partial.version ?? 1,
        status: partial.status ?? "published",
        isSystemDefault: partial.isSystemDefault ?? false,
        doc: partial.doc,
        metadata: partial.metadata ?? { queue_context: partial.doc.metadata?.queue_context },
        createdBy: null,
        createdAt: new Date().toISOString(),
        updatedAt: null,
        publishedAt: new Date().toISOString(),
    };
}

describe("queueContextDescriptorMatchesRequest", () => {
    it("matches when request satisfies all descriptor keys", () => {
        expect(
            queueContextDescriptorMatchesRequest(
                { lifecycle_key: "enrollment", queue_type: "waitlist", grain: "candidate" },
                { lifecycle_key: "enrollment", queue_type: "waitlist", grain: "candidate", stage_key: "waitlist" },
            ),
        ).toBe(true);
    });

    it("rejects when a descriptor key disagrees with request", () => {
        expect(
            queueContextDescriptorMatchesRequest(
                { queue_type: "waitlist" },
                { queue_type: "pipeline" },
            ),
        ).toBe(false);
    });
});

describe("resolveQueueLayoutVariantFromRecords", () => {
    it("selects waitlist variant over pipeline when queue_type matches", () => {
        const pipelineDoc = buildLeadQueueDefaultDoc();
        const waitlistDoc = buildEnrollmentWaitlistQueueDoc();

        const pipelineRecord = mockRecord({
            layoutKey: "enrollment_pipeline_case_row",
            doc: pipelineDoc,
        });
        const waitlistRecord = mockRecord({
            id: "rec-waitlist",
            layoutKey: "enrollment_waitlist_candidate_row",
            doc: waitlistDoc,
        });

        const match = resolveQueueLayoutVariantFromRecords(
            [pipelineRecord, waitlistRecord],
            [],
            { lifecycle_key: "enrollment", queue_type: "waitlist", grain: "candidate" },
        );

        expect(match?.record.layoutKey).toBe("enrollment_waitlist_candidate_row");
        expect(match?.tier).toBe("queue_type");
    });

    it("selects pipeline variant for case-grain pipeline context", () => {
        const pipelineDoc = buildLeadQueueDefaultDoc();
        const waitlistDoc = buildEnrollmentWaitlistQueueDoc();

        const pipelineRecord = mockRecord({ layoutKey: "pipeline", doc: pipelineDoc });
        const waitlistRecord = mockRecord({
            id: "rec-wl",
            layoutKey: "waitlist",
            doc: waitlistDoc,
        });

        const match = resolveQueueLayoutVariantFromRecords(
            [pipelineRecord, waitlistRecord],
            [],
            { lifecycle_key: "enrollment", queue_type: "pipeline", grain: "case" },
        );

        expect(match?.record.layoutKey).toBe("pipeline");
    });
});

describe("resolveLayout queue builtin fallback", () => {
    it("resolves waitlist builtin variant when no DB records match", () => {
        const r = resolveLayout({
            entityType: "opportunities",
            surface: "queue",
            queueContext: ENROLLMENT_WAITLIST_CANDIDATE_QUEUE_CONTEXT,
        });

        expect(r.source).toBe("builtin");
        expect(r.layoutKey).toBe("enrollment_waitlist_candidate_row");
        expect(r.doc.metadata?.template).toBe("enrollment_waitlist_candidate_v1");
    });

    it("resolves pipeline builtin variant for case-grain context", () => {
        const r = resolveLayout({
            entityType: "opportunities",
            surface: "queue",
            queueContext: ENROLLMENT_PIPELINE_CASE_QUEUE_CONTEXT,
        });

        expect(r.source).toBe("builtin");
        expect(r.layoutKey).toBe("enrollment_pipeline_case_row");
    });

    it("waitlist layout is structurally distinct from pipeline case layout", () => {
        const pipeline = resolveBuiltinQueueLayoutVariant("opportunities", ENROLLMENT_PIPELINE_CASE_QUEUE_CONTEXT)!;
        const waitlist = resolveBuiltinQueueLayoutVariant("opportunities", ENROLLMENT_WAITLIST_CANDIDATE_QUEUE_CONTEXT)!;

        const pipelinePlan = buildLayoutRuntimePlan(pipeline.doc);
        const waitlistPlan = buildLayoutRuntimePlan(waitlist.doc);

        expect(pipelinePlan.sections.map((s) => s.key)).not.toEqual(waitlistPlan.sections.map((s) => s.key));
        expect(waitlistPlan.sections.some((s) => s.key.startsWith("waitlist_"))).toBe(true);
        expect(waitlistPlan.itemKindCounts.widget_placeholder).toBeGreaterThan(0);
    });

    it("falls back to registry when queue context empty and no DB records", () => {
        const r = resolveLayout({ entityType: "customers", surface: "queue" });
        expect(r.source).toBe("registry");
        expect(r.doc.entityType).toBe("customers");
    });

    it("drawer still falls back to registry without DB records (parity)", () => {
        const r = resolveLayout({ entityType: "opportunities", surface: "drawer" });
        expect(r.source).toBe("registry");
        const expected = layoutDocFromRegistry("opportunities", "drawer");
        expect(JSON.stringify(r.doc)).toBe(JSON.stringify(expected));
    });
});

describe("extractQueueContextFromRecord", () => {
    it("reads queue_context from record metadata", () => {
        const doc: LayoutDoc = {
            formatVersion: LAYOUT_DOC_FORMAT_VERSION,
            surface: "queue",
            entityType: "opportunities",
            sections: [],
            metadata: { queue_context: { queue_type: "waitlist", grain: "candidate" } },
        };
        const ctx = extractQueueContextFromRecord({
            metadata: { queue_context: { queue_type: "waitlist", grain: "candidate" } },
            doc,
        });
        expect(ctx.queue_type).toBe("waitlist");
        expect(ctx.grain).toBe("candidate");
    });
});
