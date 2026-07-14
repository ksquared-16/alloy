import { describe, expect, it, vi } from "vitest";
import { maybeRunFormIdentityShadowSafe } from "@/lib/pos/processingIdentity/formIdentityShadow";
import { buildShadowComparisonRecord } from "@/lib/pos/processingIdentity/shadowComparison";
import type { FormIntakeMeta } from "@/lib/forms/intake/formLeadCaptureTypes";

const intakeMeta: FormIntakeMeta = {
    vertical_id: "vert-1",
    guardian: {
        email: "sarah@example.com",
        phone: "5551234567",
        first_name: "Sarah",
        last_name: "Emerson",
    },
    child: {
        first_name: "Mia",
        last_name: "Emerson",
        dob: "2020-03-15",
    },
};

describe("C1 shadow comparison", () => {
    it("classifies equivalent when legacy and canonical agree on person", () => {
        const comparison = buildShadowComparisonRecord({
            legacy: {
                person_id: "p1",
                customer_id: "c1",
                customer_member_id: null,
                opportunity_id: null,
                outcomeMeta: {},
            },
            resolution: {
                generationId: "gen-1",
                inputFactsHash: "hash",
                intakeResult: {
                    source_kind: "form_submission",
                    candidates: [],
                    proposals: [],
                    summary: { auto_link_count: 0, review_required_count: 0, create_new_count: 0, conflict_count: 0 },
                },
                graph: {
                    parents: [
                        {
                            subjectRef: "parent-1",
                            entityType: "person",
                            recordId: "p1",
                            confidenceBand: "confirmed",
                            signals: [],
                            blockingConflicts: [],
                            explanation: "",
                            resolverVersion: "v1",
                        },
                    ],
                    children: [],
                    household: [],
                    leads: [],
                    graph: { orgId: "org-1", householdRef: "hh", parentCandidates: [], childCandidates: [] },
                },
                resolutionRows: [],
                factsPersisted: true,
                resolutionsPersisted: true,
            },
            durationMs: 12,
        });
        expect(comparison.outcome).toBe("equivalent");
    });

    it("classifies duplicate risk when legacy created but canonical found existing", () => {
        const comparison = buildShadowComparisonRecord({
            legacy: {
                person_id: "new-p1",
                customer_id: null,
                customer_member_id: null,
                opportunity_id: null,
                outcomeMeta: {},
            },
            resolution: {
                generationId: "gen-1",
                inputFactsHash: "hash",
                intakeResult: {
                    source_kind: "form_submission",
                    candidates: [],
                    proposals: [],
                    summary: { auto_link_count: 0, review_required_count: 0, create_new_count: 0, conflict_count: 0 },
                },
                graph: {
                    parents: [
                        {
                            subjectRef: "parent-1",
                            entityType: "person",
                            recordId: "existing-p1",
                            confidenceBand: "confirmed",
                            signals: [],
                            blockingConflicts: [],
                            explanation: "",
                            resolverVersion: "v1",
                        },
                    ],
                    children: [],
                    household: [],
                    leads: [],
                    graph: { orgId: "org-1", householdRef: "hh", parentCandidates: [], childCandidates: [] },
                },
                resolutionRows: [],
                factsPersisted: true,
                resolutionsPersisted: true,
            },
            durationMs: 8,
        });
        expect(comparison.outcome).toBe("legacy_created_duplicate_risk");
    });
});

describe("C1 maybeRunFormIdentityShadowSafe", () => {
    it("does not throw on resolver failure and records canonical_error", async () => {
        const supabase = {
            from: vi.fn(() => {
                throw new Error("db unavailable");
            }),
        };
        const result = await maybeRunFormIdentityShadowSafe(supabase as never, {
            orgId: "org-1",
            submissionId: "sub-1",
            intakeMeta,
            legacyResult: {
                person_id: null,
                customer_id: null,
                customer_member_id: null,
                opportunity_id: null,
                outcomeMeta: {},
            },
        });
        expect(result.comparison?.outcome).toBe("canonical_error");
    });
});
