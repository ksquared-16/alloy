import { describe, expect, it, vi, afterEach } from "vitest";
import { resolutionRowFromSubject } from "@/lib/pos/processingIdentity/processingResolutionsDb";
import { IDENTITY_RESOLVER_VERSION } from "@/lib/identity";

vi.mock("@/lib/identity", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/identity")>();
    return {
        ...actual,
        generateHouseholdGraphCandidates: vi.fn(async () => ({
            parents: [
                {
                    subjectRef: "parent-1",
                    entityType: "person" as const,
                    recordId: "p1",
                    confidenceBand: "confirmed" as const,
                    signals: [],
                    blockingConflicts: [],
                    explanation: "",
                    resolverVersion: IDENTITY_RESOLVER_VERSION,
                },
            ],
            children: [],
            household: [],
            leads: [],
            graph: { orgId: "org-1", householdRef: "hh-1", parentCandidates: [], childCandidates: [] },
        })),
    };
});

vi.mock("@/lib/intake/resolve/resolveIntakeRecordResolution", () => ({
    resolveIntakeRecordResolution: vi.fn(async () => ({
        source_kind: "form_submission",
        candidates: [],
        proposals: [],
        summary: { auto_link_count: 0, review_required_count: 0, create_new_count: 0, conflict_count: 0 },
    })),
}));

describe("B3 resolution row contract", () => {
    it("builds governed resolution payload with resolver version", () => {
        const row = resolutionRowFromSubject({
            orgId: "org-1",
            caseId: "case-1",
            generationId: "gen-1",
            inputFactsHash: "abc",
            subjectRef: "parent-1",
            subjectRole: "parent",
            candidates: [],
            decisionAction: "link_existing",
            selectedCandidateId: "p1",
        });
        expect(row.resolver_version).toBe(IDENTITY_RESOLVER_VERSION);
        expect(row.decided_by).toBe("engine");
        expect(row.input_facts_hash).toBe("abc");
    });
});

describe("B3 canonical resolution persistence", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("persists resolution rows through the canonical engine", async () => {
        const { runCanonicalIdentityResolution } = await import(
            "@/lib/pos/processingIdentity/canonicalResolutionEngine"
        );
        const resolutionInserts: unknown[] = [];
        const supabase = {
            from: vi.fn((table: string) => {
                if (table === "processing_facts") {
                    return {
                        insert: vi.fn(() => ({
                            select: vi.fn(async () => ({ data: [], error: null })),
                        })),
                        select: vi.fn(() => ({
                            eq: vi.fn(() => ({
                                eq: vi.fn(() => ({
                                    order: vi.fn(async () => ({ data: [], error: null })),
                                })),
                            })),
                        })),
                    };
                }
                if (table === "processing_resolutions") {
                    return {
                        select: vi.fn(() => ({
                            eq: vi.fn(() => ({
                                eq: vi.fn(() => ({
                                    eq: vi.fn(() => ({
                                        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                                    })),
                                })),
                            })),
                        })),
                        insert: vi.fn((row: unknown) => {
                            resolutionInserts.push(row);
                            return {
                                select: vi.fn(() => ({
                                    single: vi.fn(async () => ({
                                        data: { id: "res-1", ...(row as object) },
                                        error: null,
                                    })),
                                })),
                            };
                        }),
                    };
                }
                if (table === "processing_cases") {
                    return {
                        update: vi.fn(() => ({
                            eq: vi.fn(() => ({
                                eq: vi.fn(async () => ({ error: null })),
                            })),
                        })),
                    };
                }
                throw new Error(`unexpected table ${table}`);
            }),
        };

        const result = await runCanonicalIdentityResolution({
            supabase: supabase as never,
            orgId: "org-1",
            caseId: "case-1",
            sourceKind: "form_submission",
            sourceRefId: "sub-1",
            household: {
                household_id: "hh-1",
                parents_guardians: [],
                parents: [],
                children: [],
                household_contacts: [],
                address: null,
                location: null,
                source: null,
                notes: null,
                program_interest: null,
                start_date: null,
                relationships: [],
                unassigned_fact_ids: [],
                unmapped_facts: [],
                review_warnings: [],
            },
            generationId: "00000000-0000-4000-8000-000000000001",
        });

        expect(result.resolutionsPersisted).toBe(true);
        expect(resolutionInserts.length).toBeGreaterThan(0);
    });
});
