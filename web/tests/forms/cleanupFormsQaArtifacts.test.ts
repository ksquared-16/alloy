import { describe, expect, it, vi } from "vitest";
import { planFormsQaArtifactCleanup } from "@/lib/forms/cleanupFormsQaArtifacts";

describe("cleanupFormsQaArtifacts", () => {
    it("dry-run plan matches QA submission fingerprints only", async () => {
        const orgId = "93667019-bd28-49b5-a688-acc9bb1e0a19";
        const qaSubmissionId = "11111111-1111-4111-8111-111111111111";
        const qaOppId = "22222222-2222-4222-8222-222222222222";

        const from = vi.fn((table: string) => {
            if (table === "form_submissions") {
                return {
                    select: () => ({
                        eq: () => ({
                            order: () => ({
                                range: async () => ({
                                    data: [
                                        {
                                            id: qaSubmissionId,
                                            status: "submitted",
                                            opportunity_id: qaOppId,
                                            person_id: null,
                                            customer_id: null,
                                            payload: {
                                                values: {
                                                    guardian_full_name: "Jordan Enrollment Lead",
                                                    guardian_email: "ic56-lead-proof-1@example.com",
                                                },
                                            },
                                        },
                                        {
                                            id: "33333333-3333-4333-8333-333333333333",
                                            status: "submitted",
                                            opportunity_id: "44444444-4444-4444-8444-444444444444",
                                            person_id: null,
                                            customer_id: null,
                                            payload: {
                                                values: {
                                                    guardian_full_name: "Real Family",
                                                    guardian_email: "real@fireflyschool.com",
                                                },
                                            },
                                        },
                                    ],
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                };
            }
            if (table === "opportunities") {
                return {
                    select: () => ({
                        eq: () => ({
                            in: async (_col: string, values: string[]) => {
                                if (values.includes("new_inquiry")) {
                                    return { data: [], error: null };
                                }
                                return {
                                    data: [{ id: qaOppId, name: "Jordan Enrollment Lead", status_key: "new_inquiry" }],
                                    error: null,
                                };
                            },
                        }),
                    }),
                };
            }
            if (table === "workflow_events") {
                return {
                    select: () => ({
                        eq: () => ({
                            in: async () => ({ data: [], error: null }),
                            order: () => ({
                                limit: async () => ({ data: [], error: null }),
                            }),
                        }),
                    }),
                };
            }
            throw new Error(`unexpected table ${table}`);
        });

        const supabase = { from } as never;
        const plan = await planFormsQaArtifactCleanup(supabase, { orgId });

        expect(plan.submissionIds).toEqual([qaSubmissionId]);
        expect(plan.opportunityIds).toContain(qaOppId);
        expect(plan.submissions).toHaveLength(1);
    });
});
