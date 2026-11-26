/** @vitest-environment jsdom */

import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import IdentityReviewPanel from "@/app/adminV2/processing/IdentityReviewPanel";

const cleanReview = {
    caseId: "case-1",
    facts: [
        {
            id: "f1",
            fact_type: "person_name",
            raw_value: "Kelly",
            normalized_value: "Kelly",
            corrected_from: null,
        },
    ],
    resolutions: [
        {
            id: "r1",
            subject_ref: "person-1",
            subject_role: "parent",
            decision_action: "create_new",
            selected_candidate_id: null,
            candidates: [],
            provisional: { first_name: "Kelly", last_name: "Kurzman" },
        },
        {
            id: "r2",
            subject_ref: "person-2",
            subject_role: "child",
            decision_action: "create_new",
            selected_candidate_id: null,
            candidates: [],
            provisional: {
                first_name: "Wrigley",
                last_name: "Kurzman",
                display_name: "Wrigley Kurzman",
            },
        },
        {
            id: "r3",
            subject_ref: "household:create_lead:person-1",
            subject_role: "household",
            decision_action: "create_new",
            selected_candidate_id: null,
            candidates: [],
            provisional: { household_name: "Kurzman Family" },
        },
        {
            id: "r4",
            subject_ref: "lead:1",
            subject_role: "lead",
            decision_action: "create_new",
            selected_candidate_id: null,
            candidates: [],
            provisional: { name: "Kurzman Family" },
        },
    ],
    plan: null,
    planDiff: null,
    approval: null,
    latestAttempt: null,
    readiness: "needs_plan_review",
    blockingConflictCount: 0,
    subjectEligibility: [
        {
            subjectRef: "person-1",
            subjectRole: "parent",
            state: "confirmed_new",
            eligibleForPlan: true,
            blockingReasons: [],
            recommendationSummary: null,
        },
        {
            subjectRef: "person-2",
            subjectRole: "child",
            state: "confirmed_new",
            eligibleForPlan: true,
            blockingReasons: [],
            recommendationSummary: null,
        },
        {
            subjectRef: "household:create_lead:person-1",
            subjectRole: "household",
            state: "confirmed_new",
            eligibleForPlan: true,
            blockingReasons: [],
            recommendationSummary: null,
        },
        {
            subjectRef: "lead:1",
            subjectRole: "lead",
            state: "confirmed_new",
            eligibleForPlan: true,
            blockingReasons: [],
            recommendationSummary: null,
        },
    ],
    planEligible: true,
    identityBlockers: [],
};

let container: HTMLElement | null = null;
function render(node: ReactNode): HTMLElement {
    container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(node));
    return container;
}

afterEach(() => {
    if (container) {
        container.remove();
        container = null;
    }
    vi.unstubAllGlobals();
});

describe("IdentityReviewPanel Create Lead operator surface", () => {
    beforeEach(() => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: RequestInfo) => {
                const href = String(url);
                if (href.includes("/identity/review")) {
                    return {
                        ok: true,
                        json: async () => ({ data: cleanReview }),
                    } as Response;
                }
                if (href.includes("/identity/plan")) {
                    return {
                        ok: true,
                        json: async () => ({
                            data: {
                                plan: {
                                    planId: "plan-1",
                                    contentHash: "hash-1",
                                    version: 1,
                                    supersededBy: null,
                                },
                            },
                        }),
                    } as Response;
                }
                return { ok: true, json: async () => ({}) } as Response;
            }),
        );
    });

    it("shows concise Ready to create review without raw Processing vocabulary", async () => {
        const el = render(<IdentityReviewPanel caseId="case-1" />);
        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });
        expect(el.textContent).toContain("Ready to create");
        expect(el.textContent).toContain("No possible duplicates were found.");
        expect(el.textContent).toContain("Kelly Kurzman");
        expect(el.textContent).toContain("Wrigley Kurzman");
        expect(el.textContent).toContain("Confirm and create");
        expect(el.textContent).not.toMatch(/\bconfirmed_new\b/);
        expect(el.textContent).not.toMatch(/\bperson-1\b/);
        expect(el.textContent).not.toMatch(/household:create_lead/);
        expect(el.textContent).not.toContain("Create new anyway");
    });

    it("keeps decision controls collapsed until Review for ambiguous subjects", async () => {
        const ambiguous = {
            ...cleanReview,
            resolutions: [
                {
                    id: "r1",
                    subject_ref: "person-1",
                    subject_role: "parent",
                    decision_action: "review_required",
                    selected_candidate_id: null,
                    candidates: [
                        {
                            recordId: "existing-1",
                            displayName: "Kristi Existing",
                            confidenceBand: "possible",
                            entityType: "person",
                            explanation: "Similar email",
                        },
                    ],
                    provisional: { first_name: "Kristi", last_name: "Kurzman" },
                },
                cleanReview.resolutions[1],
            ],
            subjectEligibility: [
                {
                    subjectRef: "person-1",
                    subjectRole: "parent",
                    state: "needs_review",
                    eligibleForPlan: false,
                    blockingReasons: [],
                    recommendationSummary: "Possible match needs a decision.",
                },
                cleanReview.subjectEligibility[1],
            ],
            planEligible: false,
            identityBlockers: ["plausible_match_needs_review: A plausible existing match exists"],
        };
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({ ok: true, json: async () => ({ data: ambiguous }) }) as Response),
        );

        const el = render(<IdentityReviewPanel caseId="case-2" />);
        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });
        expect(el.textContent).toContain("1 possible match needs review");
        expect(el.textContent).toContain("Kristi Kurzman");
        expect(el.textContent).toContain("Possible match");
        expect(el.textContent).not.toContain("Create new anyway");
        expect(el.querySelector("button")?.textContent).toMatch(/Review|Edit|Confirm/);
        const confirm = Array.from(el.querySelectorAll("button")).find((b) =>
            (b.textContent ?? "").includes("Confirm and create"),
        ) as HTMLButtonElement | undefined;
        expect(confirm?.disabled).toBe(true);
    });
});
