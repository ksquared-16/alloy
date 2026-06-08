import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueueRowPlacementPriorityV2Panel } from "@/app/adminV2/components/workspace/blocks/QueueRowPlacementPriorityV2Panel";
import type { QueueRowPlacementPriorityV2Vm } from "@/lib/ui-v2/workspace-types";

function baseVm(over: Partial<QueueRowPlacementPriorityV2Vm>): QueueRowPlacementPriorityV2Vm {
    return {
        evaluated: true,
        shadowMode: true,
        fallbackToV1: false,
        primaryCohortLabel: "Preschool (3–4 years)",
        primaryCohortSectionTitle: "Preschool (3–4 years) Waitlist",
        waitlistProgramShortLabel: "Preschool (3–4 years) waitlist",
        familyBucketLabel: "Standard family",
        childCountLabel: "2 children waitlisted",
        candidateCount: 2,
        candidates: [
            {
                placementCandidateId: "c1",
                childDisplayName: "Alex",
                cohortLabel: "Preschool (3–4 years)",
                cohortKey: "preschool",
                bucketLabel: "Standard family",
                waitSinceLabel: "Jan 1, 2024",
                linkMode: "independent",
                linkModeLabel: null,
                hasActiveOverride: false,
                activeOverrideKinds: [],
                isSyntheticFallback: false,
                detailLine: "Alex — Preschool (3–4 years) · Standard family · Waiting since Jan 1, 2024",
            },
            {
                placementCandidateId: "c2",
                childDisplayName: "Sam",
                cohortLabel: "Toddler (2 years)",
                cohortKey: "toddler",
                bucketLabel: "Staff / community priority",
                waitSinceLabel: "Feb 12, 2024",
                linkMode: "strictly_together",
                linkModeLabel: "Must enroll together",
                hasActiveOverride: true,
                activeOverrideKinds: ["pin"],
                isSyntheticFallback: false,
                detailLine:
                    "Sam — Toddler (2 years) · Staff / community priority · Waiting since Feb 12, 2024 · Must enroll together · Override active",
            },
        ],
        blockedByStrictLink: false,
        strictLinkCrossOpportunityIncomplete: false,
        showPlacementV2Badge: true,
        ...over,
    };
}

describe("QueueRowPlacementPriorityV2Panel", () => {
    it("renders family summary and Placement V2 badge", () => {
        const html = renderToStaticMarkup(<QueueRowPlacementPriorityV2Panel preview={baseVm({})} />);
        expect(html).toContain("Placement V2");
        expect(html).toContain("2 children waitlisted");
        expect(html).toContain("Preschool (3–4 years)");
        expect(html).toContain("Standard family");
        expect(html).not.toContain("#1");
        expect(html).not.toContain("scoped_waitlist_position");
    });

    it("candidate detail collapsed by default", () => {
        const html = renderToStaticMarkup(<QueueRowPlacementPriorityV2Panel preview={baseVm({})} />);
        expect(html).toContain("Show child placement detail");
        expect(html).not.toContain("Alex — Preschool");
    });

    it("shows link mode and override in detail lines when expanded would render list", () => {
        const html = renderToStaticMarkup(<QueueRowPlacementPriorityV2Panel preview={baseVm({})} />);
        expect(html).toContain('aria-expanded="false"');
    });

    it("synthetic and strict notes when set", () => {
        const html = renderToStaticMarkup(
            <QueueRowPlacementPriorityV2Panel
                preview={baseVm({
                    blockedByStrictLink: true,
                    candidates: [
                        {
                            ...baseVm({}).candidates[0]!,
                            isSyntheticFallback: true,
                            detailLine: "Family — Unknown · Standard family · No child on file",
                        },
                    ],
                    candidateCount: 1,
                    childCountLabel: "1 child waitlisted",
                })}
            />
        );
        expect(html).toContain("Sibling link");
    });
});
