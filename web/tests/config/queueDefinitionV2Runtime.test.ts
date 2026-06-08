import { describe, expect, it } from "vitest";

import { CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1 } from "@/lib/config/enrollmentPipelineQueueDefinitionV1";
import {
    coerceQueueDefinitionForExecution,
    loadQueueDefinitionBundle,
    normalizeQueueDefinitionDocument,
    normalizeQueueGrain,
    parseQueueFilterStub,
    resolveQueueKeyFromDefinition,
} from "@/lib/config/queueDefinitionV2Runtime";

const V2_ENROLLMENT_FIXTURE = {
    version: 2,
    entity_type: "opportunity" as const,
    ui: {
        layout: "domain_with_attention",
        primary_total_label: "Pipeline families",
        primary_total_queue: "pipeline_total",
        sections: [
            { key: "new_leads", label: "New Leads", queue_keys: ["new_leads"] },
            { key: "waitlist", label: "Waitlist", queue_keys: ["waitlist"] },
            { key: "enrollment_offers", label: "Enrollment / Offers", queue_keys: ["enrollment_offers"] },
        ],
    },
    queues: [
        {
            key: "new_leads",
            label: "New Leads",
            domain: "new_leads",
            grain: "case",
            aliases: ["new_inquiry"],
            filters: [{ type: "case_status", operator: "in", values: ["new_inquiry", "open"] }],
        },
        {
            key: "waitlist",
            label: "Waitlist",
            domain: "waitlist",
            grain: "candidate",
            aliases: ["waitlisted"],
            filters: [
                { type: "candidate_status", operator: "in", values: ["active", "paused"] },
                { type: "child_lifecycle_status", operator: "in", values: ["waitlisted"] },
            ],
            filters_compat_v1: [{ type: "status", operator: "in", values: ["waitlisted"] }],
        },
        {
            key: "enrollment_offers",
            label: "Enrollment / Offers",
            domain: "enrollment_offers",
            grain: "child",
            aliases: ["ready_to_enroll", "enrolling"],
            filters: [{ type: "child_lifecycle_status", operator: "in", values: ["offer_pending", "enrolling"] }],
            filters_compat_v1: [{ type: "status", operator: "in", values: ["enrolling", "ready_to_enroll"] }],
        },
    ],
};

describe("normalizeQueueDefinitionDocument", () => {
    it("normalizes v1 config without grain metadata", () => {
        const doc = normalizeQueueDefinitionDocument(CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1);
        expect(doc).not.toBeNull();
        expect(doc!.isV2).toBe(false);
        expect(doc!.version).toBe(1);
        expect(doc!.queues.length).toBeGreaterThan(0);
        for (const q of doc!.queues) {
            expect(q.grain).toBe("case");
            expect(q.aliases).toEqual([]);
            expect(q.overlay).toBe(false);
            expect(q.legacy).toBe(true);
        }
    });

    it("normalizes v2 config with domain, grain, and aliases", () => {
        const doc = normalizeQueueDefinitionDocument(V2_ENROLLMENT_FIXTURE);
        expect(doc).not.toBeNull();
        expect(doc!.isV2).toBe(true);
        expect(doc!.version).toBe(2);

        const waitlist = doc!.queues.find((q) => q.key === "waitlist");
        expect(waitlist).toMatchObject({
            domain: "waitlist",
            grain: "candidate",
            aliases: ["waitlisted"],
            overlay: false,
            legacy: false,
        });

        const offers = doc!.queues.find((q) => q.key === "enrollment_offers");
        expect(offers?.grain).toBe("child");
        expect(offers?.aliases).toContain("ready_to_enroll");
    });

    it("falls back invalid grain to case", () => {
        expect(normalizeQueueGrain("candidate")).toBe("candidate");
        expect(normalizeQueueGrain("bogus")).toBe("case");
        expect(normalizeQueueGrain(null)).toBe("case");
    });
});

describe("resolveQueueKeyFromDefinition", () => {
    const queues = normalizeQueueDefinitionDocument(V2_ENROLLMENT_FIXTURE)!.queues;

    it("exact queue key wins over alias", () => {
        const withCollision = [
            ...queues,
            {
                key: "waitlisted",
                label: "Legacy waitlisted",
                grain: "case" as const,
                overlay: false,
                aliases: [],
                filters: [],
                legacy: false,
                raw: {},
            },
        ];
        const resolution = resolveQueueKeyFromDefinition("waitlisted", withCollision);
        expect(resolution.matchedBy).toBe("exact");
        expect(resolution.resolvedKey).toBe("waitlisted");
    });

    it("resolves waitlisted alias to waitlist", () => {
        const resolution = resolveQueueKeyFromDefinition("waitlisted", queues);
        expect(resolution).toMatchObject({
            requestedKey: "waitlisted",
            resolvedKey: "waitlist",
            matchedBy: "alias",
        });
        expect(resolution.queue?.key).toBe("waitlist");
    });

    it("resolves ready_to_enroll alias to enrollment_offers", () => {
        const resolution = resolveQueueKeyFromDefinition("ready_to_enroll", queues);
        expect(resolution).toMatchObject({
            requestedKey: "ready_to_enroll",
            resolvedKey: "enrollment_offers",
            matchedBy: "alias",
        });
    });

    it("preserves fallback for unknown keys", () => {
        const resolution = resolveQueueKeyFromDefinition("unknown_lane", queues);
        expect(resolution).toMatchObject({
            requestedKey: "unknown_lane",
            resolvedKey: "unknown_lane",
            matchedBy: "fallback",
            queue: null,
        });
    });
});

describe("coerceQueueDefinitionForExecution", () => {
    it("passes v1 documents through strict validation unchanged", () => {
        const def = coerceQueueDefinitionForExecution(CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1);
        expect(def.version).toBe(1);
        expect(def.queues.map((q) => q.key)).toEqual(
            CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1.queues.map((q) => q.key)
        );
    });

    it("coerces v2 to v1 execution shape using filters_compat_v1 and case_status mapping", () => {
        const def = coerceQueueDefinitionForExecution(V2_ENROLLMENT_FIXTURE);
        expect(def.version).toBe(1);
        expect(def.queues.find((q) => q.key === "new_leads")?.filters).toEqual([
            { type: "status", operator: "in", values: ["new_inquiry", "open"] },
        ]);
        expect(def.queues.find((q) => q.key === "waitlist")?.filters).toEqual([
            { type: "status", operator: "in", values: ["waitlisted"] },
        ]);
        expect(def.queues.find((q) => q.key === "enrollment_offers")?.filters).toEqual([
            { type: "status", operator: "in", values: ["enrolling", "ready_to_enroll"] },
        ]);
    });

    it("loadQueueDefinitionBundle returns def + normalized", () => {
        const bundle = loadQueueDefinitionBundle(V2_ENROLLMENT_FIXTURE);
        expect(bundle.def.version).toBe(1);
        expect(bundle.normalized.isV2).toBe(true);
        expect(bundle.normalized.queues.some((q) => q.grain === "candidate")).toBe(true);
    });
});

describe("parseQueueFilterStub", () => {
    it("accepts known v1 status filters as executable", () => {
        const parsed = parseQueueFilterStub({ type: "status", operator: "in", values: ["new_inquiry"] });
        expect(parsed.recognized).toBe(true);
        expect(parsed.executable).toBe(true);
    });

    it("accepts v2 case_status as recognized but maps separately for execution", () => {
        const parsed = parseQueueFilterStub({ type: "case_status", operator: "in", values: ["open"] });
        expect(parsed.recognized).toBe(true);
        expect(parsed.executable).toBe(false);
    });

    it("accepts child/candidate filters as recognized but not executable", () => {
        const child = parseQueueFilterStub({
            type: "child_lifecycle_status",
            operator: "in",
            values: ["waitlisted"],
        });
        expect(child.recognized).toBe(true);
        expect(child.executable).toBe(false);

        const candidate = parseQueueFilterStub({
            type: "candidate_status",
            operator: "in",
            values: ["active"],
        });
        expect(candidate.recognized).toBe(true);
        expect(candidate.executable).toBe(false);
    });

    it("marks unknown filter types safely", () => {
        const parsed = parseQueueFilterStub({ type: "bogus_filter", operator: "in", values: ["x"] });
        expect(parsed.recognized).toBe(false);
        expect(parsed.executable).toBe(false);
    });
});
