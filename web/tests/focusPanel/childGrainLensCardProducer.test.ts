import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { overlayChildMissionOntoSettledFocusModel } from "@/lib/adminV2/runtime/focusPanel/overlayChildMissionOntoSettledFocusModel";
import { deriveChildIdentityCard } from "@/lib/adminV2/runtime/focusPanel/durableSubject/deriveChildFocusPanelCards";
import { focusPanelDefaultCompositionForGrain } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelSummaryDefaultComposition";
import type { DurableChildSubject } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableChildSubjectModel";

/**
 * R-017 — a child-grain LENS subject must have a producer for the card its composition asks for.
 *
 * The grid composes a non-case subject from `focusPanelSummaryDefaultDocForGrain`, whose child
 * composition asks for `child_identity`. That key was derived only on the subject-first durable
 * path, which `subjectGrain.ts` documents as arriving "subject-first and never through a lens". So
 * on Firefly's Waitlist the cell composed correctly, found no model, and resolved `visible: false`
 * → `not_applicable`: an authored cell reading as inapplicable purely because nothing could fill it.
 *
 * Browser-measured after the bridge, both real Firefly children, writes blocked:
 *   Wrigley  header "Wrigley Kurzman", DOB Mar 15 2026, age 5 mo    cards=1, notApplicable=[]
 *   Lennon   header "Lennon Kurzman",  DOB Apr 2 2024,  age 2 yr 4 mo
 *   subject switches per row, latest-click-wins holds, 0 render loops
 */

const settled = (over: Record<string, unknown> = {}) =>
    ({
        source: "drawer_vm",
        phase: "settled",
        mode: "summary",
        subject: { id: "opp-1", type: "opportunity", label: "Kurzman Family" },
        context: {
            grain: "case",
            subject: { type: "opportunity", id: "opp-1", label: "Kurzman Family" },
            businessProcess: { key: "enrollment", label: "Enrollment", stageKey: "waitlist" },
            signals: { work: {} },
            truth: {
                _inquiry_children: [
                    { customer_member_id: "member-lennon", dob: "2024-04-02", display_name: "Lennon Kurzman" },
                    { customer_member_id: "member-wrigley", dob: "2026-03-15", display_name: "Wrigley Kurzman" },
                ],
            },
        },
        cardModels: new Map(),
        cardReadiness: new Map(),
        commands: [],
        title: "Kurzman Family",
        statusLabel: null,
        canMutate: true,
        perspective: null,
        ...over,
    }) as never;

const commitCritical = (over: Record<string, unknown> = {}) =>
    ({
        subjectId: "participation-1",
        subjectGrain: { grain: "child", subjectType: "child" },
        subjectIdentityTruth: {
            "child.display_name": "Lennon Kurzman",
            "child.customer_member_id": "member-lennon",
            "child.family_name": "Kurzman household",
        },
        stageWorkRuntime: null,
        publishedStageInputs: null,
        situation: { stageKey: "waitlist", stageLabel: "Waitlist" },
        primaryAction: null,
        ...over,
    }) as never;

describe("the lens path produces the card the child composition asks for", () => {
    it("emits child_identity, ready, for a child-grain subject", () => {
        const model = overlayChildMissionOntoSettledFocusModel(settled(), commitCritical());
        expect(model.cardModels.has("child_identity")).toBe(true);
        expect(model.cardReadiness.get("child_identity")).toBe("ready");
    });

    it("produces the SAME canonical model as the subject-first durable path", () => {
        const now = new Date("2026-08-16T00:00:00.000Z");
        const subject: DurableChildSubject = {
            memberId: "member-lennon",
            personId: null,
            householdId: null,
            label: "Lennon Kurzman",
            dateOfBirth: "2024-04-02",
            householdName: "Kurzman household",
            isActive: true,
            truth: {},
        };
        const durable = deriveChildIdentityCard(subject, now);
        const lens = overlayChildMissionOntoSettledFocusModel(settled(), commitCritical())
            .cardModels.get("child_identity")!;
        // One child card, two entry paths — not a second implementation.
        expect(lens.key).toBe(durable.key);
        expect(lens.archetype).toBe(durable.archetype);
        expect(lens.title).toBe(durable.title);
        expect(lens.insight).toBe(durable.insight);
        expect(JSON.stringify(lens.payload)).toBe(JSON.stringify(durable.payload));
    });

    it("reads the focused child's own DOB from the settled family collection", () => {
        const wrigley = overlayChildMissionOntoSettledFocusModel(
            settled(),
            commitCritical({
                subjectIdentityTruth: {
                    "child.display_name": "Wrigley Kurzman",
                    "child.customer_member_id": "member-wrigley",
                },
            }),
        ).cardModels.get("child_identity")!;
        // Matched on the member id — the identity of record — not on position or name.
        expect(JSON.stringify(wrigley.payload)).toContain("Mar 15, 2026");
        expect(JSON.stringify(wrigley.payload)).not.toContain("Apr 2, 2024");
    });

    it("states an unknown DOB rather than omitting the card", () => {
        const model = overlayChildMissionOntoSettledFocusModel(
            settled(),
            commitCritical({
                subjectIdentityTruth: { "child.display_name": "Unknown Child", "child.customer_member_id": "member-absent" },
            }),
        );
        expect(model.cardReadiness.get("child_identity")).toBe("ready");
        expect(model.cardModels.get("child_identity")!.insight).toMatch(/not recorded/i);
    });
});

describe("the grain guard is not weakened", () => {
    it("leaves a non-child subject completely untouched", () => {
        const base = settled();
        const out = overlayChildMissionOntoSettledFocusModel(
            base,
            commitCritical({ subjectGrain: { grain: "case", subjectType: "opportunity" } }),
        );
        // Same object — a case subject must not acquire a child card by passing through here.
        expect(out).toBe(base);
        expect(out.cardModels.has("child_identity")).toBe(false);
    });

    const grid = readFileSync(
        join(process.cwd(), "components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx"),
        "utf8",
    );

    it("still consults the publication for the CASE grain only", () => {
        expect(grid).toContain('const isCaseGrain = subjectGrain === "opportunity"');
        expect(grid).toContain("usePublishedFocusPanelSummaryDoc(isSummary && isCaseGrain)");
        expect(grid).toContain("(isCaseGrain ? publishedDoc : null) ?? focusPanelSummaryDefaultDocForGrain(subjectGrain)");
    });

    it("keeps a non-case subject on its own code-owned composition", () => {
        // Staff/person must not inherit the enrollment cards. The published doc is addressed by
        // entity_type="opportunities", so applying it to a person would put household/children on
        // a staff member — the failure the guard exists to prevent.
        const person = focusPanelDefaultCompositionForGrain("person").map((e) => e.key);
        const child = focusPanelDefaultCompositionForGrain("child").map((e) => e.key);
        const family = focusPanelDefaultCompositionForGrain("opportunity").map((e) => e.key);
        for (const familyOnly of ["household", "children", "billing_preview"]) {
            expect(family).toContain(familyOnly);
            expect(person).not.toContain(familyOnly);
        }
        expect(child).toContain("child_identity");
        expect(person).not.toContain("child_identity");
    });
});
