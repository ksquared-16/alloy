import { describe, expect, it, vi } from "vitest";

import {
    classifyEligibleEnrollmentChildren,
    resolveEligibleEnrollmentChildrenForOpportunity,
} from "@/lib/lifecycle/resolveEligibleEnrollmentChildrenForOpportunity";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("resolveEligibleEnrollmentChildrenForOpportunity", () => {
    it("classifies zero / one / many without picking first of many", () => {
        expect(classifyEligibleEnrollmentChildren([]).status).toBe("none");
        const one = classifyEligibleEnrollmentChildren([
            { id: "ocm-1", label: "Ava", grain: "opportunity_customer_member", customerMemberId: "cm-1" },
        ]);
        expect(one.status).toBe("single");
        if (one.status === "single") expect(one.subject.id).toBe("ocm-1");

        const many = classifyEligibleEnrollmentChildren([
            { id: "ocm-1", label: "Ava", grain: "opportunity_customer_member", customerMemberId: "cm-1" },
            { id: "ocm-2", label: "Ben", grain: "opportunity_customer_member", customerMemberId: "cm-2" },
        ]);
        expect(many.status).toBe("multiple");
        if (many.status === "multiple") {
            expect(many.message).toMatch(/more than one child/i);
        }
    });

    it("auto-resolves exactly one OCM from opportunity", async () => {
        const supabase = {
            from: vi.fn(() => ({
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        eq: vi.fn(async () => ({
                            data: [
                                {
                                    id: "ocm-1",
                                    customer_member_id: "cm-1",
                                    customer_members: { first_name: "Ava", last_name: "Lee", display_name: null },
                                },
                            ],
                            error: null,
                        })),
                    })),
                })),
            })),
        } as unknown as SupabaseClient;

        const result = await resolveEligibleEnrollmentChildrenForOpportunity({
            supabase,
            orgId: "org-1",
            opportunityId: "opp-1",
        });
        expect(result.status).toBe("single");
        if (result.status === "single") {
            expect(result.subject.id).toBe("ocm-1");
            expect(result.subject.label).toBe("Ava Lee");
        }
    });

    it("fails closed when multiple OCMs exist", async () => {
        const supabase = {
            from: vi.fn(() => ({
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        eq: vi.fn(async () => ({
                            data: [
                                { id: "ocm-1", customer_member_id: "cm-1", customer_members: { display_name: "Ava" } },
                                { id: "ocm-2", customer_member_id: "cm-2", customer_members: { display_name: "Ben" } },
                            ],
                            error: null,
                        })),
                    })),
                })),
            })),
        } as unknown as SupabaseClient;

        const result = await resolveEligibleEnrollmentChildrenForOpportunity({
            supabase,
            orgId: "org-1",
            opportunityId: "opp-1",
        });
        expect(result.status).toBe("multiple");
        expect(result.subjects.map((s) => s.id)).toEqual(["ocm-1", "ocm-2"]);
    });

    it("includes enrollment context in operator labels when present", async () => {
        const supabase = {
            from: vi.fn(() => ({
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        eq: vi.fn(async () => ({
                            data: [
                                {
                                    id: "ocm-1",
                                    customer_member_id: "cm-1",
                                    stage_key: "enrolling",
                                    outcome_status_key: "active",
                                    customer_members: { display_name: "Ava Lee" },
                                },
                            ],
                            error: null,
                        })),
                    })),
                })),
            })),
        } as unknown as SupabaseClient;

        const result = await resolveEligibleEnrollmentChildrenForOpportunity({
            supabase,
            orgId: "org-1",
            opportunityId: "opp-1",
        });
        expect(result.status).toBe("single");
        if (result.status === "single") {
            expect(result.subject.label).toBe("Ava Lee · Enrolling · Active");
        }
    });
});
